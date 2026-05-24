using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using SpinTrackerBackend;
using SpinTrackerBackend.Data;
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
            whereClauses.Add($"EXISTS (SELECT 1 FROM player_hands ph WHERE ph.hand_id = h.id AND ph.player_name IN {DatabaseUtils.GetHeroResolutionSql("@heroName")})");
            parameters.Add(new SqliteParameter("@heroName", options.HeroName));
        }

        if (!string.IsNullOrEmpty(options.DateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
            var dFrom = options.DateFrom.Contains(" ") ? options.DateFrom : options.DateFrom + " 00:00:00";
            parameters.Add(new SqliteParameter("@dateFrom", dFrom));
        }

        if (!string.IsNullOrEmpty(options.DateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
            var dTo = options.DateTo.Contains(" ") ? options.DateTo : options.DateTo + " 23:59:59";
            parameters.Add(new SqliteParameter("@dateTo", dTo));
        }

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        // Main Query: Group by game_id and calculate all stats in one go for performance
        var profitCol = "ph.net_profit";
        var joinHero = "";

        if (!string.IsNullOrEmpty(options.HeroName))
        {
            joinHero = $"JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name IN {DatabaseUtils.GetHeroResolutionSql("@heroName")}";
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
                MAX(h.multiplier) as multiplier,
                MAX(h.position) as position,
                MAX(COALESCE(h.rake_per_player, 0)) as rake_per_player
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
                    AvgCev = reader.IsDBNull(7) ? 0 : reader.GetDouble(7),
                    Multiplier = reader.IsDBNull(9) ? 0 : reader.GetInt32(9),
                    Position = reader.IsDBNull(10) ? 0 : reader.GetInt32(10)
                };

                int lastPlayerCount = reader.IsDBNull(8) ? 3 : reader.GetInt32(8);
                var rakePerPlayer = reader.IsDBNull(11) ? 0 : reader.GetDouble(11);
                var totalBuyInCost = t.BuyIn + rakePerPlayer;

                // Tournament Profit Logic (Prize Sharing handling)
                if (t.PrizePool > 0 || t.Multiplier > 0)
                {
                    bool hasSharing = (totalBuyInCost > 0 && (t.PrizePool / totalBuyInCost) >= 19.5) || t.Multiplier >= 20;
                    double totalPrize = (t.PrizePool > (t.Multiplier * totalBuyInCost * 0.5)) ? t.PrizePool : (totalBuyInCost * t.Multiplier);
                    
                    // Determine finish position: use explicit position if available, otherwise fallback to ChipProfit
                    int finishPos = t.Position;
                    if (finishPos == 0)
                    {
                        finishPos = (t.ChipProfit > 0) ? 1 : (lastPlayerCount == 2 ? 2 : 3);
                    }

                    double winAmount = 0;
                    if (finishPos == 1)
                    {
                        winAmount = hasSharing ? (totalPrize * 0.75) : totalPrize;
                    }
                    else if (hasSharing)
                    {
                        if (finishPos == 2) winAmount = totalPrize * 0.15;
                        else if (finishPos == 3) winAmount = totalPrize * 0.10;
                    }

                    t.NetProfit = winAmount - totalBuyInCost;
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
