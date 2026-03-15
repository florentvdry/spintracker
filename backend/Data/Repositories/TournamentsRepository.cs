using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using SpinTrackerBackend;
using System.Collections.Generic;

namespace SpinTrackerBackend.Data.Repositories;

public class TournamentsRepository
{
    private readonly string _connectionString;
    private readonly ILogger<TournamentsRepository> _logger;

    public TournamentsRepository(string connectionString, ILogger<TournamentsRepository> logger)
    {
        _connectionString = connectionString;
        _logger = logger;
    }

    public async Task<TournamentsResult> GetTournamentsAsync(HandsQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
        whereClauses.Add("h.player_count <= 3");
        var parameters = new List<SqliteParameter>();

        if (!string.IsNullOrEmpty(options.HeroName))
        {
            whereClauses.Add("EXISTS (SELECT 1 FROM player_hands ph WHERE ph.hand_id = h.id AND ph.player_name = @heroName)");
            parameters.Add(new SqliteParameter("@heroName", options.HeroName));
        }

        if (!string.IsNullOrEmpty(options.DateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
            parameters.Add(new SqliteParameter("@dateFrom", options.DateFrom + " 00:00:00"));
        }

        if (!string.IsNullOrEmpty(options.DateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
            parameters.Add(new SqliteParameter("@dateTo", options.DateTo + " 23:59:59"));
        }

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        // Main Query: Group by game_id and calculate all stats in one go for performance
        var profitCol = "ph.net_profit";
        var joinHero = "";

        if (!string.IsNullOrEmpty(options.HeroName))
        {
            joinHero = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
        }
        else
        {
            joinHero = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT
                h.game_id,
                h.room,
                MIN(h.date_time) as start_time,
                h.buy_in,
                h.prize_pool,
                COUNT(*) as hand_count,
                SUM({profitCol}) as chip_profit,
                AVG(ph.ev_chips) as avg_cev,
                MAX(h.player_count) as max_players,
                MAX(ph.tournament_position) as tournament_position
            FROM hands h
            {joinHero}
            {whereClause}
            GROUP BY h.game_id";

        foreach (var param in parameters) cmd.Parameters.Add(new SqliteParameter(param.ParameterName, param.Value));

        var allTournaments = new List<TournamentSummary>();
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var t = new TournamentSummary
                {
                    GameId = reader.GetString(0),
                    Room = reader.IsDBNull(1) ? "Unknown" : reader.GetString(1),
                    DateTime = DateTime.TryParse(reader.GetString(2), out var dt) ? dt : DateTime.MinValue,
                    BuyIn = reader.IsDBNull(3) ? 0 : reader.GetDouble(3),
                    PrizePool = reader.IsDBNull(4) ? 0 : reader.GetDouble(4),
                    HandCount = reader.GetInt32(5),
                    ChipProfit = reader.IsDBNull(6) ? 0 : reader.GetDouble(6),
                    AvgCev = reader.IsDBNull(7) ? 0 : reader.GetDouble(7)
                };

                int lastPlayerCount = reader.IsDBNull(8) ? 3 : reader.GetInt32(8);
                int? tournamentPosition = reader.IsDBNull(9) ? null : reader.GetInt32(9);

                // Tournament Profit Logic (Prize Sharing handling)
                if (t.PrizePool > 0)
                {
                    // Use actual tournament position if available, otherwise fallback to chip profit logic
                    if (tournamentPosition.HasValue)
                    {
                        // All prize pools use the same percentages: 1st=75%, 2nd=15%(HU)/10%(3-way), 3rd=10%
                        if (tournamentPosition.Value == 1)
                        {
                            t.NetProfit = (t.PrizePool * 0.75) - t.BuyIn;
                        }
                        else if (tournamentPosition.Value == 2)
                        {
                            double consolation = (lastPlayerCount == 2) ? (t.PrizePool * 0.15) : (t.PrizePool * 0.10);
                            t.NetProfit = consolation - t.BuyIn;
                        }
                        else if (tournamentPosition.Value == 3)
                        {
                            t.NetProfit = (t.PrizePool * 0.10) - t.BuyIn;
                        }
                        else
                        {
                            t.NetProfit = -t.BuyIn;
                        }
                    }
                    else if (t.ChipProfit > 0)
                    {
                        // Fallback: assume 1st place if chip profit is positive
                        t.NetProfit = (t.PrizePool * 0.75) - t.BuyIn;
                    }
                    else
                    {
                        // Fallback: assume 2nd place (consolation prize) for x20+, otherwise lost
                        bool hasSharing = (t.BuyIn > 0 && (t.PrizePool / t.BuyIn) >= 20);
                        if (hasSharing)
                        {
                            double consolation = (lastPlayerCount == 2) ? (t.PrizePool * 0.15) : (t.PrizePool * 0.10);
                            t.NetProfit = consolation - t.BuyIn;
                        }
                        else
                        {
                            t.NetProfit = -t.BuyIn;
                        }
                    }
                }
                else
                {
                    t.NetProfit = t.ChipProfit;
                }

                allTournaments.Add(t);
            }
        }


        if (!string.IsNullOrEmpty(options.Result))
        {
            if (options.Result.ToLower() == "won")
            {
                allTournaments = allTournaments.Where(t => t.NetProfit > 0).ToList();
            }
            else if (options.Result.ToLower() == "lost")
            {
                allTournaments = allTournaments.Where(t => t.NetProfit <= 0).ToList();
            }
        }


        // 4. Global Sorting
        var sortedTournaments = allTournaments.AsEnumerable();
        if (!string.IsNullOrEmpty(options.SortBy))
        {
            sortedTournaments = options.SortBy.ToLower() switch
            {
                "date_asc" => sortedTournaments.OrderBy(t => t.DateTime),
                "date_desc" => sortedTournaments.OrderByDescending(t => t.DateTime),
                "room_asc" => sortedTournaments.OrderBy(t => t.Room),
                "room_desc" => sortedTournaments.OrderByDescending(t => t.Room),
                "buyin_asc" => sortedTournaments.OrderBy(t => t.BuyIn),
                "buyin_desc" => sortedTournaments.OrderByDescending(t => t.BuyIn),
                "hands_asc" => sortedTournaments.OrderBy(t => t.HandCount),
                "hands_desc" => sortedTournaments.OrderByDescending(t => t.HandCount),
                "profit_asc" => sortedTournaments.OrderBy(t => t.NetProfit),
                "profit_desc" => sortedTournaments.OrderByDescending(t => t.NetProfit),
                "cev_asc" => sortedTournaments.OrderBy(t => t.AvgCev),
                "cev_desc" => sortedTournaments.OrderByDescending(t => t.AvgCev),
                _ => sortedTournaments.OrderByDescending(t => t.DateTime)
            };
        }
        else
        {
            sortedTournaments = sortedTournaments.OrderByDescending(t => t.DateTime);
        }

        // 5. Pagination
        var total = allTournaments.Count;
        var page = options.Page < 1 ? 1 : options.Page;
        var limit = options.Limit < 1 ? 50 : options.Limit;
        var offset = (page - 1) * limit;

        var pagedTournaments = sortedTournaments.Skip(offset).Take(limit).ToList();

        return new TournamentsResult
        {
            Tournaments = pagedTournaments,
            Total = total,
            Page = page,
            Limit = limit,
            Pages = (int)Math.Ceiling(total / (double)limit)
        };
    }
}