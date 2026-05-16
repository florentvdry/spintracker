using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using SpinTrackerBackend;
using SpinTrackerBackend.Data;
using System;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SpinTrackerBackend.Data.Repositories;

public class StatsRepository
{
    private readonly string _connectionString;
    private readonly ILogger<StatsRepository> _logger;

    public StatsRepository(string connectionString, ILogger<StatsRepository> logger)
    {
        _connectionString = connectionString;
        _logger = logger;
    }

    // Placeholder: extract GetDashboardStatsAsync, GetSessionHistoryAsync, etc.

    public async Task<object> GetDashboardStatsAsync(string? heroName = null, string? dateFrom = null, string? dateTo = null, double? buyIn = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var profitCol = "ph.net_profit";
        var joinClause = "";
        
        if (!string.IsNullOrEmpty(heroName))
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
        }
        else
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        var whereClauses = new List<string>();
        whereClauses.Add("h.player_count <= 3");
        if (!string.IsNullOrEmpty(dateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
        }
        if (!string.IsNullOrEmpty(dateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
        }
        if (buyIn.HasValue)
        {
            whereClauses.Add("h.buy_in = @buyIn");
        }
        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        // 1. Basic stats from SQL (Hands Won, Total EV)
        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                COUNT(*) as total_hands,
                SUM(CASE WHEN ph.net_profit > 0 THEN 1 ELSE 0 END) as hands_won,
                COALESCE(SUM(ph.net_won_adjusted), 0) as total_ev
            FROM hands h
            {joinClause}
            {whereClause}";

        if (!string.IsNullOrEmpty(heroName))
        {
            cmd.Parameters.AddWithValue("@heroName", heroName);
        }
        if (!string.IsNullOrEmpty(dateFrom))
        {
            cmd.Parameters.AddWithValue("@dateFrom", dateFrom);
        }
        if (!string.IsNullOrEmpty(dateTo))
        {
            cmd.Parameters.AddWithValue("@dateTo", dateTo);
        }
        if (buyIn.HasValue)
        {
            cmd.Parameters.AddWithValue("@buyIn", buyIn.Value);
        }

        int totalHands = 0;
        int handsWon = 0;
        double totalEv = 0;

        using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                totalHands = reader.GetInt32(0);
                handsWon = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
                totalEv = reader.IsDBNull(2) ? 0.0 : reader.GetDouble(2);
            }
        }

        // 1.1 Calculate Tournaments Won (ITM) based on financial result
        int tournamentsWon = 0;
        try
        {
            using var cmdItm = connection.CreateCommand();
            // Fetch necessary data to determine financial outcome per tournament
            cmdItm.CommandText = $@"
                SELECT 
                    h.buy_in, 
                    h.prize_pool, 
                    SUM({profitCol}) as chip_profit,
                    MAX(h.player_count) as max_players,
                    MAX(h.multiplier) as multiplier,
                    MAX(h.position) as position,
                    MAX(COALESCE(h.rake_per_player, 0)) as rake_per_player
                FROM hands h
                {joinClause}
                {whereClause}
                GROUP BY h.game_id";
            
            if (!string.IsNullOrEmpty(heroName)) cmdItm.Parameters.AddWithValue("@heroName", heroName);
            if (!string.IsNullOrEmpty(dateFrom)) cmdItm.Parameters.AddWithValue("@dateFrom", dateFrom);
            if (!string.IsNullOrEmpty(dateTo)) cmdItm.Parameters.AddWithValue("@dateTo", dateTo);
            if (buyIn.HasValue) cmdItm.Parameters.AddWithValue("@buyIn", buyIn.Value);

            using var reader = await cmdItm.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                double b = reader.IsDBNull(0) ? 0 : reader.GetDouble(0);
                double p = reader.IsDBNull(1) ? 0 : reader.GetDouble(1);
                double cp = reader.IsDBNull(2) ? 0 : reader.GetDouble(2);
                int pc = reader.IsDBNull(3) ? 3 : reader.GetInt32(3);
                int m = reader.IsDBNull(4) ? 0 : reader.GetInt32(4);
                int pos = reader.IsDBNull(5) ? 0 : reader.GetInt32(5);
                double r = reader.IsDBNull(6) ? 0 : reader.GetDouble(6);
                double totalCost = b + r;

                bool isITM = false;
                if (p > 0 || m > 0)
                {
                    bool hasSharing = (totalCost > 0 && (p / totalCost) >= 19.5) || m >= 20;
                    int finishPos = pos != 0 ? pos : (cp > 0 ? 1 : (pc == 2 ? 2 : 3));

                    if (finishPos == 1 || (hasSharing && (finishPos == 2 || finishPos == 3)))
                    {
                        isITM = true;
                    }
                }
                else if (cp > 0)
                {
                    isITM = true;
                }

                if (isITM) tournamentsWon++;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error calculating ITM: {ex.Message}");
        }

        // 1.2 Position-based EV calculation
        var cevByPosition = new Dictionary<string, double>();
        var countByPosition = new Dictionary<string, int>();
        var tournamentsByPosition = new Dictionary<string, int>();
        try
        {
            using (var cmdPos = connection.CreateCommand())
            {
                cmdPos.CommandText = $@"
                    SELECT 
                        ph.position,
                        COALESCE(SUM(ph.net_won_adjusted), 0) as pos_ev,
                        h.player_count,
                        COUNT(*) as hand_count,
                        COUNT(DISTINCT h.game_id) as tour_count
                    FROM hands h
                    {joinClause}
                    {whereClause}
                    GROUP BY ph.position, h.player_count";

                if (!string.IsNullOrEmpty(heroName)) cmdPos.Parameters.AddWithValue("@heroName", heroName);
                if (!string.IsNullOrEmpty(dateFrom)) cmdPos.Parameters.AddWithValue("@dateFrom", dateFrom);
                if (!string.IsNullOrEmpty(dateTo)) cmdPos.Parameters.AddWithValue("@dateTo", dateTo);
                if (buyIn.HasValue) cmdPos.Parameters.AddWithValue("@buyIn", buyIn.Value);

                using var reader = await cmdPos.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var pos = reader.IsDBNull(0) ? "Unknown" : reader.GetString(0);
                    var ev = reader.GetDouble(1);
                    var playerCount = reader.GetInt32(2);
                    var handsCount = reader.GetInt32(3);
                    var tourCount = reader.GetInt32(4);
                    
                    var key = (playerCount == 2 ? "HU_" : "3W_") + pos;
                    cevByPosition[key] = ev;
                    countByPosition[key] = handsCount;
                    tournamentsByPosition[key] = tourCount;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error calculating position stats: {ex.Message}");
        }

        // 2. Calculate Euro Profit and Sessions using the session logic
        var sessions = await GetSessionsInternalAsync(null, heroName, dateFrom, dateTo, buyIn); 
        
        // Accurate total profit calculation by tournament to match TournamentsRepository
        double totalProfitEuro = 0;
        try
        {
            using var cmdProfit = connection.CreateCommand();
            cmdProfit.CommandText = $@"
                SELECT 
                    h.buy_in, 
                    h.prize_pool, 
                    SUM({profitCol}) as chip_profit,
                    MAX(h.player_count) as max_players,
                    MAX(h.multiplier) as multiplier,
                    MAX(h.position) as position,
                    MAX(COALESCE(h.rake_per_player, 0)) as rake_per_player
                FROM hands h
                {joinClause}
                {whereClause}
                GROUP BY h.game_id";
            
            if (!string.IsNullOrEmpty(heroName)) cmdProfit.Parameters.AddWithValue("@heroName", heroName);
            if (!string.IsNullOrEmpty(dateFrom)) cmdProfit.Parameters.AddWithValue("@dateFrom", dateFrom);
            if (!string.IsNullOrEmpty(dateTo)) cmdProfit.Parameters.AddWithValue("@dateTo", dateTo);
            if (buyIn.HasValue) cmdProfit.Parameters.AddWithValue("@buyIn", buyIn.Value);

            using var reader = await cmdProfit.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                double b = reader.IsDBNull(0) ? 0 : reader.GetDouble(0);
                double p = reader.IsDBNull(1) ? 0 : reader.GetDouble(1);
                double cp = reader.IsDBNull(2) ? 0 : reader.GetDouble(2);
                int pc = reader.IsDBNull(3) ? 3 : reader.GetInt32(3);
                int m = reader.IsDBNull(4) ? 0 : reader.GetInt32(4);
                int pos = reader.IsDBNull(5) ? 0 : reader.GetInt32(5);
                double r = reader.IsDBNull(6) ? 0 : reader.GetDouble(6);
                double totalCost = b + r;

                if (p > 0 || m > 0)
                {
                    bool hasSharing = (totalCost > 0 && (p / totalCost) >= 19.5) || m >= 20;
                    double totalPrize = (p > (m * totalCost * 0.5)) ? p : (totalCost * m);
                    int finishPos = pos != 0 ? pos : (cp > 0 ? 1 : (pc == 2 ? 2 : 3));

                    double winAmount = 0;
                    if (finishPos == 1) winAmount = hasSharing ? (totalPrize * 0.75) : totalPrize;
                    else if (hasSharing) winAmount = (finishPos == 2) ? (totalPrize * 0.15) : (totalPrize * 0.10);

                    totalProfitEuro += (winAmount - totalCost);
                }
                else
                {
                    totalProfitEuro += cp;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error calculating accurate total profit: {ex.Message}");
            totalProfitEuro = sessions.Sum(s => s.Profit); // Fallback
        }

        int totalTournaments = sessions.Sum(s => s.Tournaments);
        double avgChipsEv = totalTournaments > 0 ? Math.Round(totalEv / totalTournaments, 2) : 0;
        
        // Sessions this month
        var now = DateTime.Now;
        var startOfMonth = new DateTime(now.Year, now.Month, 1);
        int sessionsThisMonth = sessions.Count(s => s.StartTime >= startOfMonth);

        return new
        {
            total_hands = totalHands,
            hands_won = handsWon,
            tournaments_won = tournamentsWon,
            total_profit = totalProfitEuro,
            total_ev = totalEv,
            total_tournaments = totalTournaments,
            avg_chips_ev = avgChipsEv,
            cev_by_position = cevByPosition,
            count_by_position = countByPosition,
            tournaments_by_position = tournamentsByPosition,
            sessions_this_month = sessionsThisMonth,
            total_sessions = sessions.Count,
            avg_multiplier = 0.0,
            best_win = 0.0
        };
    }

    public async Task<List<object>> GetSessionHistoryAsync(int limit, string? heroName = null, string? dateFrom = null, string? dateTo = null, double? buyIn = null)
    {
        var sessions = await GetSessionsInternalAsync(null, heroName, dateFrom, dateTo, buyIn); 
        
        return sessions.OrderByDescending(s => s.StartTime).Take(limit).Select(s => (object)new {
            room = s.Room,
            tournaments = s.Tournaments,
            hands_played = s.Hands,
            profit = s.Profit,
            session_date = s.StartTime.ToString("yyyy-MM-dd HH:mm:ss"),
            session_end = s.EndTime.ToString("yyyy-MM-dd HH:mm:ss")
        }).ToList();
    }

    private record SessionInfo(DateTime StartTime, DateTime EndTime, string Room, int Tournaments, int Hands, double Profit);

    private async Task<List<SessionInfo>> GetSessionsInternalAsync(int? limit, string? heroName = null, string? dateFrom = null, string? dateTo = null, double? buyIn = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var cmd = connection.CreateCommand();
        
        var joinClause = "";
        var profitCol = "ph.net_profit";
        
        if (!string.IsNullOrEmpty(heroName))
        {
            joinClause = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
            cmd.Parameters.AddWithValue("@heroName", heroName);
        }
        else
        {
            joinClause = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        var whereClauses = new List<string>();
        whereClauses.Add("h.player_count <= 3");
        if (!string.IsNullOrEmpty(dateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
            cmd.Parameters.AddWithValue("@dateFrom", dateFrom);
        }
        if (!string.IsNullOrEmpty(dateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
            cmd.Parameters.AddWithValue("@dateTo", dateTo);
        }
        if (buyIn.HasValue)
        {
            whereClauses.Add("h.buy_in = @buyIn");
            cmd.Parameters.AddWithValue("@buyIn", buyIn.Value);
        }

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        // Fetch necessary columns to group sessions and calculate profit
        cmd.CommandText = $@"
            SELECT h.date_time, h.room, h.game_id, h.buy_in, h.prize_pool, {profitCol}, h.player_count, h.multiplier, h.position, COALESCE(h.rake_per_player, 0)
            FROM hands h 
            {joinClause}
            {whereClause}
            ORDER BY h.date_time ASC";
        
        var rawHands = new List<(DateTime t, string r, string g, double b, double p, double h_p, int pc, int m, int pos, double rake)>();
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            while(await reader.ReadAsync())
            {
                 var dtStr = reader.IsDBNull(0) ? "" : reader.GetString(0);
                 // Clean up date string if it contains (UTC) or other non-standard suffixes
                 dtStr = dtStr.Replace("(UTC)", "").Trim();
                 if(!DateTime.TryParse(dtStr, out var dt)) continue;
                 
                 rawHands.Add((
                    dt,
                    reader.IsDBNull(1) ? "Unknown" : reader.GetString(1),
                    reader.IsDBNull(2) ? "" : reader.GetString(2),
                    reader.IsDBNull(3) ? 0.0 : reader.GetDouble(3),
                    reader.IsDBNull(4) ? 0.0 : reader.GetDouble(4),
                    reader.IsDBNull(5) ? 0.0 : reader.GetDouble(5),
                    reader.IsDBNull(6) ? 3 : reader.GetInt32(6),
                    reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
                    reader.IsDBNull(8) ? 0 : reader.GetInt32(8),
                    reader.IsDBNull(9) ? 0.0 : reader.GetDouble(9)
                 ));
            }
        }

        // Group by sessions (hands within 2 hours are same session)
        var sessions = new List<SessionInfo>();
        var currentSession = new List<(DateTime t, string r, string g, double b, double p, double h_p, int pc, int m, int pos, double rake)>();
        DateTime? lastTime = null;

        foreach (var hand in rawHands.OrderBy(h => h.t))
        {
            if (lastTime.HasValue && (hand.t - lastTime.Value).TotalHours > 2)
            {
                // New session
                if (currentSession.Count > 0)
                {
                    sessions.Add(CreateSessionInfo(currentSession));
                    currentSession.Clear();
                }
            }
            currentSession.Add(hand);
            lastTime = hand.t;
        }
        if (currentSession.Count > 0)
        {
            sessions.Add(CreateSessionInfo(currentSession));
        }

        return limit.HasValue ? sessions.Take(limit.Value).ToList() : sessions;
    }

    private SessionInfo CreateSessionInfo(List<(DateTime t, string r, string g, double b, double p, double h_p, int pc, int m, int pos, double rake)> hands)
    {
        var startTime = hands.Min(h => h.t);
        var endTime = hands.Max(h => h.t);
        var room = hands.First().r;
        var uniqueTournaments = hands.Select(h => h.g).Distinct().Count();
        var totalHands = hands.Count;
        
        // Calculate euro profit per game
        double totalProfitEuro = 0;
        var games = hands.GroupBy(h => h.g);
        foreach (var game in games)
        {
            var first = game.First();
            // Use MAX(multiplier) and MAX(position) for the tournament
            int multiplier = game.Max(h => h.m);
            int position = game.Max(h => h.pos);
            int lastPlayerCount = game.Max(h => h.pc);
            double chipProfit = game.Sum(h => h.h_p);

            double profit = 0;
            if (first.p > 0 || multiplier > 0)
            {
                var totalCost = first.b + first.rake;
                bool hasSharing = (totalCost > 0 && (first.p / totalCost) >= 19.5) || multiplier >= 20;
                double totalPrize = (first.p > (multiplier * totalCost * 0.5)) ? first.p : (totalCost * multiplier);
                
                int finishPos = position;
                if (finishPos == 0)
                {
                    finishPos = (chipProfit > 0) ? 1 : (lastPlayerCount == 2 ? 2 : 3);
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

                profit = winAmount - totalCost;
            }
            else
            {
                profit = chipProfit; 
            }
            totalProfitEuro += profit;
        }
        
        return new SessionInfo(startTime, endTime, room, uniqueTournaments, totalHands, totalProfitEuro);
    }

    public async Task<object> GetWinrateChartDataAsync(ChartQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
        whereClauses.Add("h.player_count <= 3");
        var parameters = new List<SqliteParameter>();

        var joinClause = "";
        var profitCol = "ph.net_profit";
        var evCol = "COALESCE(ph.net_won_adjusted, ph.net_profit)";
        var showdownCondition = "ph.went_to_showdown = 1";

        if (!string.IsNullOrEmpty(options.HeroName))
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
            parameters.Add(new SqliteParameter("@heroName", options.HeroName));
        }
        else
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
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

        if (options.BuyIn.HasValue)
        {
            whereClauses.Add("h.buy_in = @buyIn");
            parameters.Add(new SqliteParameter("@buyIn", options.BuyIn.Value));
        }

        if (!string.IsNullOrEmpty(options.Position))
        {
            if (options.Position.StartsWith("HU_"))
            {
                whereClauses.Add("h.player_count = 2");
                whereClauses.Add("ph.position = @pos");
                parameters.Add(new SqliteParameter("@pos", options.Position.Substring(3)));
            }
            else if (options.Position.StartsWith("3W_"))
            {
                whereClauses.Add("h.player_count = 3");
                whereClauses.Add("ph.position = @pos");
                parameters.Add(new SqliteParameter("@pos", options.Position.Substring(3)));
            }
        }

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                h.date_time,
                SUM({profitCol}) OVER (ORDER BY h.date_time, h.id) as cumulative_profit,
                SUM(
                    COALESCE(
                        CASE 
                            WHEN {showdownCondition}
                            THEN {profitCol} 
                            ELSE 0 
                        END, 0
                    )
                ) OVER (ORDER BY h.date_time, h.id) as cumulative_showdown,
                SUM(
                    COALESCE(
                        CASE 
                            WHEN NOT ({showdownCondition})
                            THEN {profitCol} 
                            ELSE 0 
                        END, 0
                    )
                ) OVER (ORDER BY h.date_time, h.id) as cumulative_no_showdown,
                SUM({evCol}) OVER (ORDER BY h.date_time, h.id) as cumulative_ev,
                h.game_id,
                h.buy_in,
                h.prize_pool,
                h.player_count,
                {profitCol} as hand_profit,
                h.multiplier,
                h.position,
                COALESCE(h.rake_per_player, 0) as rake_per_player
            FROM hands h
            {joinClause}
            {whereClause}
            ORDER BY h.date_time ASC, h.id ASC";

        foreach (var param in parameters)
        {
            cmd.Parameters.Add(param);
        }

        var rawData = new List<HandData>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rawData.Add(new HandData {
                date = reader.GetString(0),
                profit = reader.GetDouble(1),
                chips_won_showdown = reader.GetDouble(2),
                chips_won_no_showdown = reader.GetDouble(3),
                cumulative = reader.GetDouble(4),
                game_id = reader.IsDBNull(5) ? null : reader.GetString(5),
                buy_in = reader.IsDBNull(6) ? 0.0 : reader.GetDouble(6),
                prize_pool = reader.IsDBNull(7) ? 0.0 : reader.GetDouble(7),
                player_count = reader.IsDBNull(8) ? 0 : reader.GetInt32(8),
                hand_profit = reader.GetDouble(9),
                multiplier = reader.IsDBNull(10) ? 0 : reader.GetInt32(10),
                position = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
                rake_per_player = reader.IsDBNull(12) ? 0.0 : reader.GetDouble(12)
            });
        }

        _logger.LogInformation($"WinrateChart: Fetched {rawData.Count} hands.");

        // Second pass: calculate Euro profit
        // We need to know which hands are the last ones for each game_id
        var lastHandsMap = new Dictionary<string, int>();
        for (int i = 0; i < rawData.Count; i++)
        {
            if (!string.IsNullOrEmpty(rawData[i].game_id))
            {
                lastHandsMap[rawData[i].game_id!] = i;
            }
        }

        // Calculate profit per game
        var gameProfitEuro = new Dictionary<string, double>();
        var games = rawData.Where(x => !string.IsNullOrEmpty(x.game_id)).GroupBy(x => x.game_id!);
        foreach (var game in games)
        {
            var first = game.First();
            var last = game.Last();
            int multiplier = game.Max(h => h.multiplier);
            int position = game.Max(h => h.position);
            int lastPlayerCount = game.Max(h => h.player_count);
            double chipProfit = game.Sum(h => h.hand_profit);

            double profit = 0;
            if (first.prize_pool > 0 || multiplier > 0)
            {
                var totalCost = first.buy_in + first.rake_per_player;
                bool hasSharing = (totalCost > 0 && (first.prize_pool / totalCost) >= 19.5) || multiplier >= 20;
                double totalPrize = (first.prize_pool > (multiplier * totalCost * 0.5)) ? first.prize_pool : (totalCost * multiplier);
                
                int finishPos = position;
                if (finishPos == 0)
                {
                    finishPos = (chipProfit > 0) ? 1 : (lastPlayerCount == 2 ? 2 : 3);
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

                profit = winAmount - totalCost;
            }
            else
            {
                profit = chipProfit; 
            }
            gameProfitEuro[game.Key] = profit;
        }

        _logger.LogInformation($"WinrateChart: Calculated profit for {gameProfitEuro.Count} games.");

        var finalData = new List<object>();
        double currentCumulativeEuro = 0;
        for (int i = 0; i < rawData.Count; i++)
        {
            var h = rawData[i];
            if (!string.IsNullOrEmpty(h.game_id) && lastHandsMap.ContainsKey(h.game_id!) && lastHandsMap[h.game_id!] == i)
            {
                currentCumulativeEuro += gameProfitEuro[h.game_id!];
            }

            finalData.Add(new {
                date = h.date,
                profit = h.profit,
                cumulative = h.cumulative,
                chips_won_showdown = h.chips_won_showdown,
                chips_won_no_showdown = h.chips_won_no_showdown,
                euro_profit = currentCumulativeEuro
            });
        }

        if (finalData.Count > 0)
        {
            _logger.LogInformation($"WinrateChart: Final cumulative Euro profit: {currentCumulativeEuro:F2}€");
        }

        return finalData;
    }

    public async Task<List<MultiplierStats>> GetMultiplierStatsAsync(StatsFilters filters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var joinHero = "";
        if (!string.IsNullOrEmpty(filters.HeroName))
        {
            joinHero = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
        }
        else
        {
            joinHero = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        var whereClauses = new List<string>();
        whereClauses.Add("h.player_count <= 3");
        if (!string.IsNullOrEmpty(filters.DateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
        }
        if (!string.IsNullOrEmpty(filters.DateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
        }
        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        using var cmd = connection.CreateCommand();
        // Accurate multiplier/win grouping
        cmd.CommandText = $@"
            SELECT 
                multiplier,
                COUNT(*) as total,
                SUM(CASE WHEN is_won THEN 1 ELSE 0 END) as wins
            FROM (
                SELECT 
                    h.game_id,
                    MAX(h.multiplier) as multiplier,
                    (MAX(h.position) = 1 OR (MAX(h.position) = 0 AND SUM(ph.net_profit) > 0)) as is_won
                FROM hands h
                {joinHero}
                {whereClause}
                GROUP BY h.game_id
            )
            GROUP BY multiplier
            ORDER BY multiplier ASC";

        if (!string.IsNullOrEmpty(filters.HeroName)) cmd.Parameters.AddWithValue("@heroName", filters.HeroName);
        if (!string.IsNullOrEmpty(filters.DateFrom)) cmd.Parameters.AddWithValue("@dateFrom", filters.DateFrom + (filters.DateFrom.Contains(" ") ? "" : " 00:00:00"));
        if (!string.IsNullOrEmpty(filters.DateTo)) cmd.Parameters.AddWithValue("@dateTo", filters.DateTo + (filters.DateTo.Contains(" ") ? "" : " 23:59:59"));

        var statsList = new List<MultiplierStats>();
        int grandTotal = 0;

        using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var s = new MultiplierStats
                {
                    Multiplier = reader.IsDBNull(0) ? 0 : reader.GetInt32(0),
                    TotalCount = reader.GetInt32(1),
                    WinCount = reader.GetInt32(2)
                };
                s.LossCount = s.TotalCount - s.WinCount;
                s.WinPercentage = s.TotalCount > 0 ? Math.Round((double)s.WinCount / s.TotalCount * 100.0, 2) : 0;
                
                grandTotal += s.TotalCount;
                statsList.Add(s);
            }
        }

        foreach (var s in statsList)
        {
            s.PercentageOfTotal = grandTotal > 0 ? Math.Round((double)s.TotalCount / grandTotal * 100.0, 2) : 0;
        }

        return statsList;
    }

    public async Task<object> GetDetailedStatsAsync(
        string? heroName,
        string? dateFrom = null,
        string? dateTo = null,
        double? buyIn = null,
        string? statsScope = null,
        string? opponentName = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var where = new List<string> { "h.player_count IN (2, 3)" };
        if (!string.IsNullOrEmpty(dateFrom)) where.Add("h.date_time >= @dateFrom");
        if (!string.IsNullOrEmpty(dateTo)) where.Add("h.date_time <= @dateTo");
        if (buyIn.HasValue) where.Add("h.buy_in = @buyIn");
        var scope = (statsScope ?? "population").Trim().ToLowerInvariant();

        if (scope == "player" && !string.IsNullOrWhiteSpace(opponentName))
        {
            where.Add("ph.player_name = @opponentName");
        }
        else if (scope == "reg")
        {
            where.Add("COALESCE(p.is_reg, 0) = 1");
        }
        else if (scope == "fish")
        {
            where.Add("COALESCE(p.is_reg, 0) = 0");
        }

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT h.id, h.hand_id, h.room, h.buy_in, h.date_time, h.flop, h.turn, h.river,
                   h.player_count, ph.player_name, ph.position, ph.stack, h.blinds,
                   h.preflop_action, h.flop_action, h.turn_action, h.river_action,
                   ph.went_to_showdown, ph.net_profit, ph.cards
            FROM hands h
            JOIN player_hands ph ON ph.hand_id = h.id
            LEFT JOIN players p ON p.name = ph.player_name
            WHERE {string.Join(" AND ", where)}
            ORDER BY h.date_time, h.id, ph.player_name";
        if (scope == "player" && !string.IsNullOrWhiteSpace(opponentName))
        {
            cmd.Parameters.AddWithValue("@opponentName", opponentName.Trim());
        }
        if (!string.IsNullOrEmpty(dateFrom)) cmd.Parameters.AddWithValue("@dateFrom", dateFrom);
        if (!string.IsNullOrEmpty(dateTo)) cmd.Parameters.AddWithValue("@dateTo", dateTo);
        if (buyIn.HasValue) cmd.Parameters.AddWithValue("@buyIn", buyIn.Value);

        var calc = new DetailedStatsAccumulator();
        var stackCalcs = new Dictionary<string, DetailedStatsAccumulator>(StringComparer.OrdinalIgnoreCase);

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var hand = new DetailedHandRow
            {
                Id = reader.IsDBNull(0) ? "" : reader.GetString(0),
                HandId = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Room = reader.IsDBNull(2) ? "" : reader.GetString(2),
                BuyIn = reader.IsDBNull(3) ? 0 : reader.GetDouble(3),
                DateTime = reader.IsDBNull(4) ? "" : reader.GetString(4),
                FlopCards = reader.IsDBNull(5) ? "" : reader.GetString(5),
                TurnCard = reader.IsDBNull(6) ? "" : reader.GetString(6),
                RiverCard = reader.IsDBNull(7) ? "" : reader.GetString(7),
                PlayerCount = reader.IsDBNull(8) ? 0 : reader.GetInt32(8),
                PlayerName = reader.IsDBNull(9) ? "" : reader.GetString(9),
                Position = NormalizePosition(reader.IsDBNull(10) ? "" : reader.GetString(10)),
                Stack = reader.IsDBNull(11) ? 0 : reader.GetInt32(11),
                Blinds = reader.IsDBNull(12) ? "" : reader.GetString(12),
                Preflop = reader.IsDBNull(13) ? "" : reader.GetString(13),
                Flop = reader.IsDBNull(14) ? "" : reader.GetString(14),
                Turn = reader.IsDBNull(15) ? "" : reader.GetString(15),
                River = reader.IsDBNull(16) ? "" : reader.GetString(16),
                WentToShowdown = !reader.IsDBNull(17) && reader.GetInt32(17) == 1,
                NetProfit = reader.IsDBNull(18) ? 0 : reader.GetDouble(18),
                Cards = reader.IsDBNull(19) ? "" : reader.GetString(19)
            };

            calc.Consume(hand);
            var stackBucket = DetailedStatsAccumulator.StackBucket(hand.Stack, hand.Blinds);
            if (!stackCalcs.TryGetValue(stackBucket, out var stackCalc))
            {
                stackCalc = new DetailedStatsAccumulator();
                stackCalcs[stackBucket] = stackCalc;
            }
            stackCalc.Consume(hand);
        }

        var stackDepths = stackCalcs
            .OrderBy(kvp => DetailedStatsAccumulator.StackOrder(kvp.Key))
            .Select(kvp => new
            {
                stack = kvp.Key,
                data = kvp.Value.ToResponse()
            })
            .ToArray();

        return calc.ToResponse(stackDepths);
    }

    private static string NormalizePosition(string pos)
    {
        pos = (pos ?? "").Trim().ToUpperInvariant();
        return pos switch
        {
            "UTG" => "EP",
            "HJ" => "MP",
            _ => pos
        };
    }

    private sealed class DetailedHandRow
    {
        public string Id { get; set; } = "";
        public string HandId { get; set; } = "";
        public string Room { get; set; } = "";
        public double BuyIn { get; set; }
        public string DateTime { get; set; } = "";
        public string FlopCards { get; set; } = "";
        public string TurnCard { get; set; } = "";
        public string RiverCard { get; set; } = "";
        public int PlayerCount { get; set; }
        public string PlayerName { get; set; } = "";
        public string Position { get; set; } = "";
        public int Stack { get; set; }
        public string Blinds { get; set; } = "";
        public string Preflop { get; set; } = "";
        public string Flop { get; set; } = "";
        public string Turn { get; set; } = "";
        public string River { get; set; } = "";
        public bool WentToShowdown { get; set; }
        public double NetProfit { get; set; }
        public string Cards { get; set; } = "";
    }

    private sealed class DetailedStatsAccumulator
    {
        private string _hero = "";
        private readonly HashSet<string> _players = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, Counter> _byPos = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, Counter> _bySeg = new(StringComparer.OrdinalIgnoreCase);
        private readonly Counter _tot = new();
        private readonly Dictionary<string, List<StatHandSample>> _samples = new(StringComparer.OrdinalIgnoreCase);
        private const int MaxSampleHands = 20;

        private int _wtsdDenom;
        private int _wtsdNum;
        private int _wsdNum;
        private int _wwsfDenom;
        private int _wwsfNum;

        private int _squeezeOpp, _squeezeNum, _fiveBetOpp, _fiveBetNum, _call4BetOpp, _call4BetNum;
        private int _limpFoldOpp, _limpFoldNum, _fourBetFoldOpp, _fourBetFoldNum;

        private int _stealOppTot, _stealNumTot, _stealOppBtn, _stealNumBtn, _stealOppSb, _stealNumSb;
        private int _stealFold3OppTot, _stealFold3NumTot, _stealFold3OppBtn, _stealFold3NumBtn, _stealFold3OppSb, _stealFold3NumSb;
        private int _steal4BetOppTot, _steal4BetNumTot, _steal4BetOppBtn, _steal4BetNumBtn, _steal4BetOppSb, _steal4BetNumSb;
        private int _steal4BetFoldOpp, _steal4BetFoldNum;

        private int _vsStealSbFold, _vsStealSbCall, _vsStealSb3Bet, _vsStealSbOpp;
        private int _vsStealBbFold, _vsStealBbCall, _vsStealBb3Bet, _vsStealBbOpp;

        private int _huSbOpp, _huSbLimp, _huSbRaise, _huSbLimpFold, _huSbLimpCall, _huSbLimpRaise;
        private int _huBbVsLimpOpp, _huBbVsLimpCheck, _huBbVsLimpRaise;
        private int _huBbVsRaiseOpp, _huBbVsRaiseFold, _huBbVsRaiseCall, _huBbVsRaise3Bet;
        private int _threeWBtnOpp, _threeWBtnRfi, _threeWSbOpp, _threeWSbRfi, _threeWSbComplete;
        private int _threeWBbVsStealOpp, _threeWBbVsStealFold, _threeWBbVsStealCall, _threeWBbVsSteal3Bet;
        private readonly Dictionary<string, StackBucketCounter> _pushFoldByStackAndPosition = new(StringComparer.OrdinalIgnoreCase);

        private StreetCounter _flop = new(), _turn = new(), _river = new();
        private StreetCounter _flopIp = new(), _turnIp = new(), _riverIp = new();
        private StreetCounter _flopOop = new(), _turnOop = new(), _riverOop = new();
        private int _cbetFlopOpp, _cbetFlopNum, _cbetTurnOpp, _cbetTurnNum, _cbetRiverOpp, _cbetRiverNum;
        private int _cbetFoldFlopOpp, _cbetFoldFlopNum, _cbetFoldTurnOpp, _cbetFoldTurnNum, _cbetFoldRiverOpp, _cbetFoldRiverNum;
        private int _foldToCbetFlopOpp, _foldToCbetFlopNum, _foldToCbetTurnOpp, _foldToCbetTurnNum, _foldToCbetRiverOpp, _foldToCbetRiverNum;
        private int _donkFlopOpp, _donkFlopNum, _donkTurnOpp, _donkTurnNum, _donkRiverOpp, _donkRiverNum;
        private int _donkFoldFlopOpp, _donkFoldFlopNum, _donkFoldTurnOpp, _donkFoldTurnNum, _donkFoldRiverOpp, _donkFoldRiverNum;
        private int _foldVsDonkFlopOpp, _foldVsDonkFlopNum, _raiseVsDonkFlopNum, _foldVsDonkTurnOpp, _foldVsDonkTurnNum, _raiseVsDonkTurnNum;

        private int _riverBetOpp, _riverBetNum, _riverBetShowdown, _riverBetWonShowdown;
        private int _riverBetIpOpp, _riverBetIpNum, _riverBetIpShowdown, _riverBetIpWonShowdown;
        private int _riverBetOopOpp, _riverBetOopNum, _riverBetOopShowdown, _riverBetOopWonShowdown;
        private int _riverBetHuSbOpp, _riverBetHuSbNum, _riverBetHuSbShowdown, _riverBetHuSbWonShowdown;
        private int _riverBetHuBbOpp, _riverBetHuBbNum, _riverBetHuBbShowdown, _riverBetHuBbWonShowdown;
        private int _vsRiverBetCallOpp, _vsRiverBetCallNum, _vsRiverBetFoldNum;
        private int _vsRiverBetIpOpp, _vsRiverBetIpCall, _vsRiverBetIpFold;
        private int _vsRiverBetOopOpp, _vsRiverBetOopCall, _vsRiverBetOopFold;
        private int _vsRiverBetHuSbOpp, _vsRiverBetHuSbCall, _vsRiverBetHuSbFold;
        private int _vsRiverBetHuBbOpp, _vsRiverBetHuBbCall, _vsRiverBetHuBbFold;

        private int _vsCbetRaisedFold, _vsCbetRaisedCall, _vsCbetRaisedRaise;
        private int _vsCbet3BetFold, _vsCbet3BetCall, _vsCbet3BetRaise;

        private int _missedCbetOpp, _missedCbetNum, _missedCbetIpOpp, _missedCbetIpNum, _missedCbetIpFoldOpp, _missedCbetIpFoldNum;
        private int _missedCbetOopOpp, _missedCbetOopNum, _missedCbetOopFoldOpp, _missedCbetOopFoldNum;
        private int _vsMissedCbetOpp, _vsMissedCbetNum, _vsMissedCbetBetIpOpp, _vsMissedCbetBetIpNum, _vsMissedCbetCheckFoldIpOpp, _vsMissedCbetCheckFoldIpNum;
        private int _vsMissedCbetBetOopTurnOpp, _vsMissedCbetBetOopTurnNum, _vsMissedCbetCheckFoldOopOpp, _vsMissedCbetCheckFoldOopNum;

        private static readonly Regex ActionRegex = new(@"^(?<name>[^:\n]+?)\s*:?\s+(?<act>posts|calls|bets|raises|folds|checks)\b(?<tail>.*)$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex NumberRegex = new(@"(?<![\w.])(?<n>\d+(?:[.,]\d+)?)", RegexOptions.Compiled);
        private static readonly Regex RaiseToRegex = new(@"\bto\s+(?<n>\d+(?:[.,]\d+)?)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private void Record(Counter c, Counter s, string stat, DetailedHandRow h)
        {
            c.Record(stat, h);
            s.Record(stat, h);
            _tot.Record(stat, h);
        }

        private void RecordSample(string key, DetailedHandRow h)
        {
            if (!_samples.TryGetValue(key, out var hands))
            {
                hands = new List<StatHandSample>();
                _samples[key] = hands;
            }

            if (hands.Count < MaxSampleHands)
            {
                hands.Add(StatHandSample.From(h));
            }
        }

        private IReadOnlyList<StatHandSample> SampleHands(string key) =>
            _samples.TryGetValue(key, out var hands) ? hands : Array.Empty<StatHandSample>();

        public void Consume(DetailedHandRow h)
        {
            if (string.IsNullOrWhiteSpace(h.PlayerName)) return;
            _hero = h.PlayerName;
            _players.Add(h.PlayerName);

            var c = GetCounter(h.Position);
            var s = GetSegmentCounter(SegmentKey(h.Position, h.PlayerCount));
            c.Hands++;
            s.Hands++;
            _tot.Hands++;

            var pre = ParseActions(h.Preflop);
            var heroActs = pre.Where(a => IsHero(a.Name)).ToList();
            var heroVpip = heroActs.Any(a => a.Act is "calls" or "bets" or "raises");
            var heroPfr = heroActs.Any(a => a.Act is "bets" or "raises");
            if (heroVpip) { c.VpipNum++; s.VpipNum++; _tot.VpipNum++; Record(c, s, "VPIP", h); }
            if (heroPfr) { c.PfrNum++; s.PfrNum++; _tot.PfrNum++; Record(c, s, "PFR", h); }

            var limpsBeforeHero = 0;
            var heroOpenRaise = false;
            var heroLimp = false;
            var heroCallOpen = false;
            var hero3Bet = false;
            var hero4Bet = false;
            var hero5Bet = false;
            var heroCall4Bet = false;
            var heroFoldTo3Bet = false;
            var heroFoldTo4Bet = false;
            var hero4BetFold = false;
            var heroLimpFold = false;
            var heroFoldedPreflop = false;
            var heroOpenShove = false;
            var heroIsoShove = false;
            var heroCallShove = false;
            var heroRejam = false;
            var heroFoldVsShove = false;
            var faced3BetAfterHeroOpen = false;
            var faced3BetAfterHeroOpenAllIn = false;
            var faced4BetAfterHero3Bet = false;
            var faced4BetAfterHero4Bet = false;
            var facedRaiseAfterHeroLimp = false;
            var facedRaiseAfterHeroLimpAllIn = false;
            var openShoveOpp = false;
            var isoShoveOpp = false;
            var rejamOpp = false;
            double? lastRaiseSizeBb = null;
            var lastRaiseAllIn = false;
            double? heroOpenRaiseSizeBb = null;
            var hero3BetAllIn = false;
            var heroFirstDecisionWasFold = false;
            var heroFirstDecisionWasCall = false;
            var heroFirstDecisionWasRaise = false;

            var heroHasLimped = false;
            var heroOpenedOrRaised = false;
            var heroDecisionSeen = false;
            var heroRaisedLevel = 0;
            var facingAllInShove = false;
            int raisesSeen = 0;

            foreach (var a in pre)
            {
                if (!IsHero(a.Name))
                {
                    if (a.Act == "raises" || a.Act == "bets")
                    {
                        raisesSeen++;
                        lastRaiseSizeBb = RaiseSizeBb(a, h);
                        lastRaiseAllIn = a.IsAllIn;
                    }
                    else if (a.Act == "calls" && raisesSeen == 0) limpsBeforeHero++;

                    if (heroOpenedOrRaised && heroRaisedLevel == 1 && (a.Act == "raises" || a.Act == "bets"))
                    {
                        faced3BetAfterHeroOpen = true;
                        faced3BetAfterHeroOpenAllIn = a.IsAllIn;
                    }
                    if (a.IsAllIn && (a.Act == "raises" || a.Act == "bets")) facingAllInShove = true;
                    if (heroOpenedOrRaised && heroRaisedLevel == 2 && (a.Act == "raises" || a.Act == "bets"))
                    {
                        faced4BetAfterHero3Bet = true;
                    }
                    if (heroOpenedOrRaised && heroRaisedLevel >= 3 && (a.Act == "raises" || a.Act == "bets"))
                    {
                        faced4BetAfterHero4Bet = true;
                    }
                    if (heroHasLimped && (a.Act == "raises" || a.Act == "bets"))
                    {
                        facedRaiseAfterHeroLimp = true;
                        facedRaiseAfterHeroLimpAllIn = a.IsAllIn;
                    }
                    continue;
                }

                if (a.Act != "posts" && !heroDecisionSeen)
                {
                    heroDecisionSeen = true;
                    heroFirstDecisionWasFold = a.Act == "folds";
                    heroFirstDecisionWasCall = a.Act == "calls" || a.Act == "checks";
                    heroFirstDecisionWasRaise = a.Act == "raises" || a.Act == "bets";
                    if (raisesSeen == 0 && limpsBeforeHero == 0)
                    {
                        c.OpenRaiseOpp++; s.OpenRaiseOpp++; _tot.OpenRaiseOpp++;
                        c.LimpOpp++; s.LimpOpp++; _tot.LimpOpp++;
                        openShoveOpp = true;
                    }
                    else if (raisesSeen == 0 && limpsBeforeHero > 0)
                    {
                        c.FacingLimpOpp++; s.FacingLimpOpp++; _tot.FacingLimpOpp++;
                        Record(c, s, "Hands vs Limp", h);
                        isoShoveOpp = true;
                    }

                    if (raisesSeen >= 1)
                    {
                        CountFacingRaise(c, s, h, lastRaiseSizeBb, lastRaiseAllIn, a.Act);
                        c.CallOpenOpp++; s.CallOpenOpp++; _tot.CallOpenOpp++;
                        rejamOpp = true;
                    }
                    if (raisesSeen == 1)
                    {
                        c.ThreeBetOpp++; s.ThreeBetOpp++; _tot.ThreeBetOpp++;
                    }
                }

                if (a.Act == "calls")
                {
                    if (raisesSeen == 0) { heroLimp = true; heroHasLimped = true; }
                    else if (raisesSeen >= 1) heroCallOpen = true;
                    if (raisesSeen >= 3) heroCall4Bet = true;
                    if (facingAllInShove || a.IsAllIn) heroCallShove = true;
                }
                else if (a.Act == "raises" || a.Act == "bets")
                {
                    heroOpenedOrRaised = true;
                    if (raisesSeen == 0 && limpsBeforeHero == 0) heroOpenRaise = true;
                    if (raisesSeen == 0 && limpsBeforeHero == 0) heroOpenRaiseSizeBb = RaiseSizeBb(a, h);
                    if (raisesSeen == 1) { hero3Bet = true; hero3BetAllIn = a.IsAllIn; }
                    if (raisesSeen == 2) hero4Bet = true;
                    if (raisesSeen >= 3) hero5Bet = true;
                    heroRaisedLevel = raisesSeen + 1;
                    if (a.IsAllIn && raisesSeen == 0 && limpsBeforeHero == 0) heroOpenShove = true;
                    if (a.IsAllIn && raisesSeen == 0 && limpsBeforeHero > 0) heroIsoShove = true;
                    if (a.IsAllIn && raisesSeen >= 1) heroRejam = true;
                }
                else if (a.Act == "folds")
                {
                    heroFoldedPreflop = true;
                    if (heroHasLimped) heroLimpFold = true;
                    if (faced3BetAfterHeroOpen) heroFoldTo3Bet = true;
                    if (faced4BetAfterHero3Bet) heroFoldTo4Bet = true;
                    if (faced4BetAfterHero4Bet) hero4BetFold = true;
                    if (facingAllInShove) heroFoldVsShove = true;
                }
            }

            if (heroOpenRaise) { c.OpenRaiseNum++; s.OpenRaiseNum++; _tot.OpenRaiseNum++; Record(c, s, "Raise First In", h); }
            if (heroOpenRaise && heroOpenRaiseSizeBb.HasValue) CountOpenRaiseSizing(c, s, h, heroOpenRaiseSizeBb.Value);
            if (heroLimp) { c.LimpNum++; s.LimpNum++; _tot.LimpNum++; Record(c, s, "Open Limp", h); }
            if (heroCallOpen) { c.CallOpenNum++; s.CallOpenNum++; _tot.CallOpenNum++; Record(c, s, "Call Open", h); }
            if (hero3Bet) { c.ThreeBetNum++; s.ThreeBetNum++; _tot.ThreeBetNum++; Record(c, s, "3-Bet", h); }
            if (hero3Bet)
            {
                if (hero3BetAllIn) { c.ThreeBetShoveNum++; s.ThreeBetShoveNum++; _tot.ThreeBetShoveNum++; Record(c, s, "3-Bet Shove", h); }
                else { c.ThreeBetNonAllInNum++; s.ThreeBetNonAllInNum++; _tot.ThreeBetNonAllInNum++; Record(c, s, "3-Bet Non-All-In", h); }
            }
            if (hero4Bet) { c.FourBetNum++; s.FourBetNum++; _tot.FourBetNum++; Record(c, s, "4-Bet", h); }
            if (hero5Bet) { _fiveBetNum++; c.FiveBetNum++; s.FiveBetNum++; _tot.FiveBetNum++; Record(c, s, "5-Bet", h); }
            if (heroCall4Bet) { _call4BetNum++; c.Call4BetNum++; s.Call4BetNum++; _tot.Call4BetNum++; Record(c, s, "Call 4-Bet", h); }
            if (heroLimpFold) { _limpFoldNum++; c.LimpFoldNum++; s.LimpFoldNum++; _tot.LimpFoldNum++; Record(c, s, "Limp-Fold", h); }
            if (hero4BetFold) { _fourBetFoldNum++; c.FourBetFoldNum++; s.FourBetFoldNum++; _tot.FourBetFoldNum++; Record(c, s, "4-Bet-Fold", h); }

            if (faced3BetAfterHeroOpen)
            {
                c.FoldTo3BetOpp++; s.FoldTo3BetOpp++; _tot.FoldTo3BetOpp++;
                c.FourBetOpp++; s.FourBetOpp++; _tot.FourBetOpp++;
                if (faced3BetAfterHeroOpenAllIn) { c.FoldTo3BetShoveOpp++; s.FoldTo3BetShoveOpp++; _tot.FoldTo3BetShoveOpp++; }
                else { c.FoldTo3BetNonAllInOpp++; s.FoldTo3BetNonAllInOpp++; _tot.FoldTo3BetNonAllInOpp++; }
                if (heroFoldTo3Bet) { c.FoldTo3BetNum++; s.FoldTo3BetNum++; _tot.FoldTo3BetNum++; Record(c, s, "Fold to 3-Bet", h); }
                if (heroFoldTo3Bet && faced3BetAfterHeroOpenAllIn) { c.FoldTo3BetShoveNum++; s.FoldTo3BetShoveNum++; _tot.FoldTo3BetShoveNum++; Record(c, s, "Fold to 3-Bet Shove", h); }
                if (heroFoldTo3Bet && !faced3BetAfterHeroOpenAllIn) { c.FoldTo3BetNonAllInNum++; s.FoldTo3BetNonAllInNum++; _tot.FoldTo3BetNonAllInNum++; Record(c, s, "Fold to 3-Bet Non-All-In", h); }
            }
            if (faced4BetAfterHero3Bet) { c.FoldTo4BetOpp++; s.FoldTo4BetOpp++; _tot.FoldTo4BetOpp++; if (heroFoldTo4Bet) { c.FoldTo4BetNum++; s.FoldTo4BetNum++; _tot.FoldTo4BetNum++; Record(c, s, "Fold to 4-Bet", h); } }
            if (hero4Bet) { _fourBetFoldOpp++; c.FourBetFoldOpp++; s.FourBetFoldOpp++; _tot.FourBetFoldOpp++; }
            if (heroLimp) { _limpFoldOpp++; c.LimpFoldOpp++; s.LimpFoldOpp++; _tot.LimpFoldOpp++; }
            if (facedRaiseAfterHeroLimp)
            {
                c.LimpFacedRaiseOpp++; s.LimpFacedRaiseOpp++; _tot.LimpFacedRaiseOpp++;
                if (facedRaiseAfterHeroLimpAllIn) { c.LimpFoldVsAllInOpp++; s.LimpFoldVsAllInOpp++; _tot.LimpFoldVsAllInOpp++; }
                else { c.LimpFoldVsNonAllInOpp++; s.LimpFoldVsNonAllInOpp++; _tot.LimpFoldVsNonAllInOpp++; }
                if (heroLimpFold && facedRaiseAfterHeroLimpAllIn) { c.LimpFoldVsAllInNum++; s.LimpFoldVsAllInNum++; _tot.LimpFoldVsAllInNum++; Record(c, s, "Limp-Fold vs All-In", h); }
                if (heroLimpFold && !facedRaiseAfterHeroLimpAllIn) { c.LimpFoldVsNonAllInNum++; s.LimpFoldVsNonAllInNum++; _tot.LimpFoldVsNonAllInNum++; Record(c, s, "Limp-Fold vs Non-All-In", h); }
                if (heroOpenedOrRaised && heroHasLimped)
                {
                    c.LimpRaiseNum++; s.LimpRaiseNum++; _tot.LimpRaiseNum++;
                    Record(c, s, "Limp-Raise", h);
                }
            }
            if (limpsBeforeHero > 0 && raisesSeen == 0 && heroFirstDecisionWasRaise)
            {
                c.IsoRaiseNum++; s.IsoRaiseNum++; _tot.IsoRaiseNum++;
                Record(c, s, "Iso Raise", h);
                if (heroOpenShove || heroIsoShove) { c.IsoAllInNum++; s.IsoAllInNum++; _tot.IsoAllInNum++; Record(c, s, "Iso All-In", h); }
                else { c.IsoNonAllInNum++; s.IsoNonAllInNum++; _tot.IsoNonAllInNum++; Record(c, s, "Iso Non-All-In", h); }
            }
            if (hero3Bet) { _fiveBetOpp++; c.FiveBetOpp++; s.FiveBetOpp++; _tot.FiveBetOpp++; }
            if (hero4Bet || hero5Bet) { _call4BetOpp++; c.Call4BetOpp++; s.Call4BetOpp++; _tot.Call4BetOpp++; }
            if (hero3Bet && raisesSeen >= 2 && limpsBeforeHero > 0) { _squeezeNum++; c.SqueezeNum++; s.SqueezeNum++; _tot.SqueezeNum++; }
            if (raisesSeen >= 1 && limpsBeforeHero > 0) { _squeezeOpp++; c.SqueezeOpp++; s.SqueezeOpp++; _tot.SqueezeOpp++; }

            var isStealPos = h.Position is "BTN" or "SB";
            if (isStealPos)
            {
                _stealOppTot++;
                if (h.Position == "BTN") _stealOppBtn++; else _stealOppSb++;
                if (heroOpenRaise)
                {
                    _stealNumTot++;
                    if (h.Position == "BTN") _stealNumBtn++; else _stealNumSb++;
                    if (faced3BetAfterHeroOpen)
                    {
                        _stealFold3OppTot++; if (heroFoldTo3Bet) _stealFold3NumTot++;
                        if (h.Position == "BTN") { _stealFold3OppBtn++; if (heroFoldTo3Bet) _stealFold3NumBtn++; }
                        else { _stealFold3OppSb++; if (heroFoldTo3Bet) _stealFold3NumSb++; }
                    }
                    if (hero4Bet)
                    {
                        _steal4BetOppTot++; _steal4BetNumTot++;
                        if (h.Position == "BTN") { _steal4BetOppBtn++; _steal4BetNumBtn++; }
                        else { _steal4BetOppSb++; _steal4BetNumSb++; }
                        _steal4BetFoldOpp++; if (hero4BetFold) _steal4BetFoldNum++;
                    }
                }
            }

            if (h.Position is "SB" or "BB")
            {
                bool facedSteal = raisesSeen >= 1;
                if (facedSteal)
                {
                    if (h.Position == "SB")
                    {
                        _vsStealSbOpp++;
                        if (hero3Bet) _vsStealSb3Bet++;
                        else if (heroCallOpen) _vsStealSbCall++;
                        else if (heroActs.Any(a => a.Act == "folds")) _vsStealSbFold++;
                    }
                    else
                    {
                        _vsStealBbOpp++;
                        if (hero3Bet) _vsStealBb3Bet++;
                        else if (heroCallOpen) _vsStealBbCall++;
                        else if (heroActs.Any(a => a.Act == "folds")) _vsStealBbFold++;
                    }
                }
            }

            ConsumeSpinPreflop(h, pre, heroLimp, heroOpenRaise, heroCallOpen, hero3Bet);
            ConsumePushFold(h, openShoveOpp, isoShoveOpp, rejamOpp, heroOpenShove, heroIsoShove, heroCallShove, heroRejam, heroFoldVsShove);

            ConsumeStreet(h, h.Flop, "Agg Freq:flop", ref _flop);
            ConsumeStreet(h, h.Turn, "Agg Freq:turn", ref _turn);
            ConsumeStreet(h, h.River, "Agg Freq:river", ref _river);
            if (IsLikelyIp(h))
            {
                ConsumeStreet(h, h.Flop, "Agg Freq IP:flop", ref _flopIp);
                ConsumeStreet(h, h.Turn, "Agg Freq IP:turn", ref _turnIp);
                ConsumeStreet(h, h.River, "Agg Freq IP:river", ref _riverIp);
            }
            else
            {
                ConsumeStreet(h, h.Flop, "Agg Freq OOP:flop", ref _flopOop);
                ConsumeStreet(h, h.Turn, "Agg Freq OOP:turn", ref _turnOop);
                ConsumeStreet(h, h.River, "Agg Freq OOP:river", ref _riverOop);
            }

            bool heroWasPfr = heroPfr && !heroFoldedPreflop;
            var flopActs = ParseActions(h.Flop);
            var turnActs = ParseActions(h.Turn);
            var riverActs = ParseActions(h.River);
            var sawFlop = !heroFoldedPreflop && (!string.IsNullOrWhiteSpace(h.FlopCards) || flopActs.Count > 0);

            if (heroWasPfr && flopActs.Count > 0)
            {
                _cbetFlopOpp++;
                var didCbet = flopActs.Any(a => IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"));
                if (didCbet) { _cbetFlopNum++; RecordSample("C-Bet:flop", h); }
                else
                {
                    _missedCbetOpp++;
                    _missedCbetNum++;
                    RecordSample("missedCbet:missed_cbet", h);
                    var ip = h.Position is "BTN" or "CO";
                    var foldedAfterMiss = turnActs.Any(a => IsHero(a.Name) && a.Act == "folds")
                        || riverActs.Any(a => IsHero(a.Name) && a.Act == "folds");

                    if (ip)
                    {
                        _missedCbetIpOpp++;
                        _missedCbetIpNum++;
                        RecordSample("missedCbet:ip", h);
                        _missedCbetIpFoldOpp++;
                        if (foldedAfterMiss) { _missedCbetIpFoldNum++; RecordSample("missedCbet:ip_fold", h); }
                    }
                    else
                    {
                        _missedCbetOopOpp++;
                        _missedCbetOopNum++;
                        RecordSample("missedCbet:oop", h);
                        _missedCbetOopFoldOpp++;
                        if (foldedAfterMiss) { _missedCbetOopFoldNum++; RecordSample("missedCbet:oop_fold", h); }
                    }
                }
            }
            if (heroWasPfr && turnActs.Count > 0) { _cbetTurnOpp++; if (turnActs.Any(a => IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"))) { _cbetTurnNum++; RecordSample("C-Bet:turn", h); } }
            if (heroWasPfr && riverActs.Count > 0) { _cbetRiverOpp++; if (riverActs.Any(a => IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"))) { _cbetRiverNum++; RecordSample("C-Bet:river", h); } }
            if (heroWasPfr)
            {
                ConsumeCbetFold(h, flopActs, "flop", ref _cbetFoldFlopOpp, ref _cbetFoldFlopNum);
                ConsumeCbetFold(h, turnActs, "turn", ref _cbetFoldTurnOpp, ref _cbetFoldTurnNum);
                ConsumeCbetFold(h, riverActs, "river", ref _cbetFoldRiverOpp, ref _cbetFoldRiverNum);
            }

            // Fold vs cbet on each street (simplified: first aggressor is villain and hero folds)
            ConsumeFoldVsCbet(h, flopActs, "Fold to CBet:flop", ref _foldToCbetFlopOpp, ref _foldToCbetFlopNum);
            ConsumeFoldVsCbet(h, turnActs, "Fold to CBet:turn", ref _foldToCbetTurnOpp, ref _foldToCbetTurnNum);
            ConsumeFoldVsCbet(h, riverActs, "Fold to CBet:river", ref _foldToCbetRiverOpp, ref _foldToCbetRiverNum);

            if (!heroWasPfr && flopActs.Count > 0)
            {
                _donkFlopOpp++;
                if (flopActs.Any(a => IsHero(a.Name) && a.Act == "bets")) { _donkFlopNum++; RecordSample("Donk Bet:flop", h); }
            }
            if (!heroWasPfr && turnActs.Count > 0) { _donkTurnOpp++; if (turnActs.Any(a => IsHero(a.Name) && a.Act == "bets")) { _donkTurnNum++; RecordSample("Donk Bet:turn", h); } }
            if (!heroWasPfr && riverActs.Count > 0) { _donkRiverOpp++; if (riverActs.Any(a => IsHero(a.Name) && a.Act == "bets")) { _donkRiverNum++; RecordSample("Donk Bet:river", h); } }
            ConsumeDonkFold(h, flopActs, "flop", ref _donkFoldFlopOpp, ref _donkFoldFlopNum);
            ConsumeDonkFold(h, turnActs, "turn", ref _donkFoldTurnOpp, ref _donkFoldTurnNum);
            ConsumeDonkFold(h, riverActs, "river", ref _donkFoldRiverOpp, ref _donkFoldRiverNum);
            ConsumeVsDonk(h, flopActs, "flop", ref _foldVsDonkFlopOpp, ref _foldVsDonkFlopNum, ref _raiseVsDonkFlopNum);
            ConsumeVsDonk(h, turnActs, "turn", ref _foldVsDonkTurnOpp, ref _foldVsDonkTurnNum, ref _raiseVsDonkTurnNum);
            ConsumeRiverStats(h, riverActs);

            // vs flop cbet response buckets
            ClassifyVsCbet(h, pre, flopActs);

            // vs missed cbet
            ClassifyVsMissedCbet(h, pre, flopActs, turnActs, h.Position);

            if (sawFlop)
            {
                _wtsdDenom++;
                _wwsfDenom++;
                if (h.WentToShowdown)
                {
                    _wtsdNum++;
                    RecordSample("showdown:wtsd", h);
                    if (h.NetProfit > 0)
                    {
                        _wsdNum++;
                        RecordSample("showdown:wsd", h);
                    }
                }
                if (h.NetProfit > 0)
                {
                    _wwsfNum++;
                    RecordSample("showdown:wwsf", h);
                }
            }
        }

        private void ConsumeStreet(DetailedHandRow h, string txt, string sampleKey, ref StreetCounter s)
        {
            foreach (var a in ParseActions(txt))
            {
                if (!IsHero(a.Name)) continue;
                if (a.Act == "bets")
                {
                    s.Bets++;
                    RecordSample(sampleKey, h);
                }
                else if (a.Act == "raises")
                {
                    s.Raises++;
                    RecordSample(sampleKey, h);
                }
                else if (a.Act == "calls") s.Calls++;
                else if (a.Act == "folds") s.Folds++;
                else if (a.Act == "checks") s.Checks++;
            }
        }

        private void ConsumeSpinPreflop(DetailedHandRow h, List<ActionRow> pre, bool heroLimp, bool heroOpenRaise, bool heroCallOpen, bool hero3Bet)
        {
            var heroActs = pre.Where(a => IsHero(a.Name)).ToList();
            var firstNonPost = pre.FirstOrDefault(a => a.Act != "posts");
            var firstVillainAggression = pre.FirstOrDefault(a => !IsHero(a.Name) && (a.Act == "raises" || a.Act == "bets"));
            var heroFolded = heroActs.Any(a => a.Act == "folds");

            if (h.PlayerCount == 2 && h.Position == "SB")
            {
                _huSbOpp++;
                if (heroLimp) { _huSbLimp++; RecordSample("huSb:Open Limp", h); }
                if (heroOpenRaise) { _huSbRaise++; RecordSample("huSb:Raise First In", h); }

                if (heroLimp)
                {
                    var facedRaiseAfterLimp = false;
                    var sawHeroLimp = false;
                    foreach (var a in pre)
                    {
                        if (IsHero(a.Name) && a.Act == "calls" && !sawHeroLimp)
                        {
                            sawHeroLimp = true;
                            continue;
                        }

                        if (!sawHeroLimp) continue;
                        if (!IsHero(a.Name) && (a.Act == "raises" || a.Act == "bets")) facedRaiseAfterLimp = true;
                        if (!IsHero(a.Name) || !facedRaiseAfterLimp) continue;
                        if (a.Act == "folds") { _huSbLimpFold++; RecordSample("huSb:Limp-Fold vs Raise", h); }
                        else if (a.Act == "calls") { _huSbLimpCall++; RecordSample("huSb:Limp-Call vs Raise", h); }
                        else if (a.Act == "raises" || a.Act == "bets") { _huSbLimpRaise++; RecordSample("huSb:Limp-Raise vs Raise", h); }
                    }
                }
            }

            if (h.PlayerCount == 2 && h.Position == "BB")
            {
                if (firstNonPost != null && !IsHero(firstNonPost.Name) && firstNonPost.Act == "calls")
                {
                    _huBbVsLimpOpp++;
                    if (heroActs.Any(a => a.Act == "checks")) { _huBbVsLimpCheck++; RecordSample("huBb:vs Limp Check", h); }
                    if (heroActs.Any(a => a.Act == "raises" || a.Act == "bets")) { _huBbVsLimpRaise++; RecordSample("huBb:vs Limp Raise", h); }
                }
                else if (firstVillainAggression != null)
                {
                    _huBbVsRaiseOpp++;
                    if (heroFolded) { _huBbVsRaiseFold++; RecordSample("huBb:vs Raise Fold", h); }
                    else if (heroCallOpen) { _huBbVsRaiseCall++; RecordSample("huBb:vs Raise Call", h); }
                    else if (hero3Bet) { _huBbVsRaise3Bet++; RecordSample("huBb:vs Raise 3-Bet", h); }
                }
            }

            if (h.PlayerCount == 3 && h.Position == "BTN")
            {
                _threeWBtnOpp++;
                if (heroOpenRaise) { _threeWBtnRfi++; RecordSample("threeWayPreflop:BTN RFI", h); }
            }

            if (h.PlayerCount == 3 && h.Position == "SB")
            {
                _threeWSbOpp++;
                if (heroOpenRaise) { _threeWSbRfi++; RecordSample("threeWayPreflop:SB RFI", h); }
                if (heroLimp) { _threeWSbComplete++; RecordSample("threeWayPreflop:SB Complete", h); }
            }

            if (h.PlayerCount == 3 && h.Position == "BB" && firstVillainAggression != null)
            {
                _threeWBbVsStealOpp++;
                if (heroFolded) { _threeWBbVsStealFold++; RecordSample("threeWayPreflop:BB vs Steal Fold", h); }
                else if (heroCallOpen) { _threeWBbVsStealCall++; RecordSample("threeWayPreflop:BB vs Steal Call", h); }
                else if (hero3Bet) { _threeWBbVsSteal3Bet++; RecordSample("threeWayPreflop:BB vs Steal 3-Bet", h); }
            }
        }

        private void ConsumePushFold(DetailedHandRow h, bool openShoveOpp, bool isoShoveOpp, bool rejamOpp, bool openShove, bool isoShove, bool callShove, bool rejam, bool foldVsShove)
        {
            var bucket = StackBucket(h.Stack, h.Blinds);
            var position = PushFoldPosition(h.Position, h.PlayerCount);
            var key = $"{bucket}|{position}";
            var c = _pushFoldByStackAndPosition.TryGetValue(key, out var existing) ? existing : new StackBucketCounter { Stack = bucket, Position = position };
            _pushFoldByStackAndPosition[key] = c;
            c.Opp++;
            if (openShoveOpp) c.OpenShoveOpp++;
            if (isoShoveOpp) c.IsoShoveOpp++;
            if (rejamOpp) c.RejamOpp++;
            if (openShove) { c.OpenShove++; c.Record("open_shove", h); }
            if (isoShove) { c.IsoShove++; c.Record("iso_shove", h); }
            if (callShove) c.CallShove++;
            if (rejam) { c.Rejam++; c.Record("rejam", h); }
            if (callShove || foldVsShove) c.FacingShove++;
            if (callShove) c.Record("call_shove", h);
            if (foldVsShove) { c.FoldVsShove++; c.Record("fold_vs_shove", h); }
        }

        private void ConsumeFoldVsCbet(DetailedHandRow h, List<ActionRow> street, string sampleKey, ref int opp, ref int num)
        {
            if (street.Count == 0) return;
            var firstBet = street.FirstOrDefault(a => !IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"));
            if (firstBet == null) return;
            var heroReaction = street.FirstOrDefault(a => IsHero(a.Name));
            if (heroReaction == null) return;
            opp++;
            if (heroReaction.Act == "folds")
            {
                num++;
                RecordSample(sampleKey, h);
            }
        }

        private void ConsumeCbetFold(DetailedHandRow h, List<ActionRow> street, string streetKey, ref int opp, ref int num)
        {
            var heroBetIndex = street.FindIndex(a => IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"));
            if (heroBetIndex < 0) return;
            var facedRaise = street.Skip(heroBetIndex + 1).Any(a => !IsHero(a.Name) && (a.Act == "raises" || a.Act == "bets"));
            if (!facedRaise) return;
            opp++;
            if (street.Skip(heroBetIndex + 1).Any(a => IsHero(a.Name) && a.Act == "folds"))
            {
                num++;
                RecordSample($"CBet-Fold:{streetKey}", h);
            }
        }

        private void ConsumeDonkFold(DetailedHandRow h, List<ActionRow> street, string streetKey, ref int opp, ref int num)
        {
            var heroDonkIndex = street.FindIndex(a => IsHero(a.Name) && a.Act == "bets");
            if (heroDonkIndex < 0) return;
            var facedRaise = street.Skip(heroDonkIndex + 1).Any(a => !IsHero(a.Name) && (a.Act == "raises" || a.Act == "bets"));
            if (!facedRaise) return;
            opp++;
            if (street.Skip(heroDonkIndex + 1).Any(a => IsHero(a.Name) && a.Act == "folds"))
            {
                num++;
                RecordSample($"Donk/Fold:{streetKey}", h);
            }
        }

        private void ConsumeVsDonk(DetailedHandRow h, List<ActionRow> street, string streetKey, ref int opp, ref int foldNum, ref int raiseNum)
        {
            if (street.Count == 0) return;
            var firstAggressive = street.FirstOrDefault(a => a.Act == "bets" || a.Act == "raises");
            if (firstAggressive == null || IsHero(firstAggressive.Name)) return;
            var heroReaction = street.SkipWhile(a => !ReferenceEquals(a, firstAggressive)).Skip(1).FirstOrDefault(a => IsHero(a.Name));
            if (heroReaction == null) return;
            opp++;
            if (heroReaction.Act == "folds")
            {
                foldNum++;
                RecordSample($"Fold vs Donk:{streetKey}", h);
            }
            else if (heroReaction.Act == "raises" || heroReaction.Act == "bets")
            {
                raiseNum++;
                RecordSample($"Raise vs Donk:{streetKey}", h);
            }
        }

        private void ConsumeRiverStats(DetailedHandRow h, List<ActionRow> riverActs)
        {
            var heroRiverAction = riverActs.FirstOrDefault(a => IsHero(a.Name) && a.Act != "posts");
            if (heroRiverAction != null)
            {
                var heroBetRiver = heroRiverAction.Act == "bets" || heroRiverAction.Act == "raises";
                var ip = IsLikelyIp(h);
                _riverBetOpp++;
                if (ip) _riverBetIpOpp++; else _riverBetOopOpp++;
                if (h.PlayerCount == 2 && h.Position == "SB") _riverBetHuSbOpp++;
                if (h.PlayerCount == 2 && h.Position == "BB") _riverBetHuBbOpp++;

                if (heroBetRiver)
                {
                    _riverBetNum++;
                    RecordSample("Bet River:total", h);
                    if (ip) { _riverBetIpNum++; RecordSample("Bet River:ip", h); }
                    else { _riverBetOopNum++; RecordSample("Bet River:oop", h); }
                    if (h.PlayerCount == 2 && h.Position == "SB") { _riverBetHuSbNum++; RecordSample("Bet River:hu_sb", h); }
                    if (h.PlayerCount == 2 && h.Position == "BB") { _riverBetHuBbNum++; RecordSample("Bet River:hu_bb", h); }

                    if (h.WentToShowdown)
                    {
                        _riverBetShowdown++;
                        if (h.NetProfit > 0) _riverBetWonShowdown++;
                        if (ip) { _riverBetIpShowdown++; if (h.NetProfit > 0) _riverBetIpWonShowdown++; }
                        else { _riverBetOopShowdown++; if (h.NetProfit > 0) _riverBetOopWonShowdown++; }
                        if (h.PlayerCount == 2 && h.Position == "SB") { _riverBetHuSbShowdown++; if (h.NetProfit > 0) _riverBetHuSbWonShowdown++; }
                        if (h.PlayerCount == 2 && h.Position == "BB") { _riverBetHuBbShowdown++; if (h.NetProfit > 0) _riverBetHuBbWonShowdown++; }
                    }
                }
            }

            var villainBetIndex = riverActs.FindIndex(a => !IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"));
            if (villainBetIndex < 0) return;
            var reaction = riverActs.Skip(villainBetIndex + 1).FirstOrDefault(a => IsHero(a.Name));
            if (reaction == null) return;
            var isCall = reaction.Act == "calls";
            var isFold = reaction.Act == "folds";
            if (!isCall && !isFold) return;

            var isIp = IsLikelyIp(h);
            _vsRiverBetCallOpp++;
            if (isIp) _vsRiverBetIpOpp++; else _vsRiverBetOopOpp++;
            if (h.PlayerCount == 2 && h.Position == "SB") _vsRiverBetHuSbOpp++;
            if (h.PlayerCount == 2 && h.Position == "BB") _vsRiverBetHuBbOpp++;

            if (isCall)
            {
                _vsRiverBetCallNum++;
                RecordSample("vs Bet River:call", h);
                if (isIp) { _vsRiverBetIpCall++; RecordSample("vs Bet River:ip_call", h); } else { _vsRiverBetOopCall++; RecordSample("vs Bet River:oop_call", h); }
                if (h.PlayerCount == 2 && h.Position == "SB") { _vsRiverBetHuSbCall++; RecordSample("vs Bet River:hu_sb_call", h); }
                if (h.PlayerCount == 2 && h.Position == "BB") { _vsRiverBetHuBbCall++; RecordSample("vs Bet River:hu_bb_call", h); }
            }
            else
            {
                _vsRiverBetFoldNum++;
                RecordSample("vs Bet River:fold", h);
                if (isIp) { _vsRiverBetIpFold++; RecordSample("vs Bet River:ip_fold", h); } else { _vsRiverBetOopFold++; RecordSample("vs Bet River:oop_fold", h); }
                if (h.PlayerCount == 2 && h.Position == "SB") { _vsRiverBetHuSbFold++; RecordSample("vs Bet River:hu_sb_fold", h); }
                if (h.PlayerCount == 2 && h.Position == "BB") { _vsRiverBetHuBbFold++; RecordSample("vs Bet River:hu_bb_fold", h); }
            }
        }

        private static bool IsLikelyIp(DetailedHandRow h) =>
            h.Position == "BTN" || (h.PlayerCount == 2 && h.Position == "SB");

        private void ClassifyVsCbet(DetailedHandRow h, List<ActionRow> pre, List<ActionRow> flop)
        {
            if (flop.Count == 0) return;
            var preRaiseCount = pre.Count(a => a.Act is "raises" or "bets");
            if (preRaiseCount <= 0) return;
            var villainCbet = flop.FirstOrDefault(a => !IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"));
            if (villainCbet == null) return;
            var heroAct = flop.FirstOrDefault(a => IsHero(a.Name));
            if (heroAct == null) return;

            var threeBetPot = preRaiseCount >= 2;
            if (threeBetPot)
            {
                if (heroAct.Act == "folds") { _vsCbet3BetFold++; RecordSample("vsCbetFlop:3-Bet Pot:fold", h); }
                else if (heroAct.Act == "calls" || heroAct.Act == "checks") { _vsCbet3BetCall++; RecordSample("vsCbetFlop:3-Bet Pot:call", h); }
                else if (heroAct.Act == "raises" || heroAct.Act == "bets") { _vsCbet3BetRaise++; RecordSample("vsCbetFlop:3-Bet Pot:raise", h); }
            }
            else
            {
                if (heroAct.Act == "folds") { _vsCbetRaisedFold++; RecordSample("vsCbetFlop:Raised Pot:fold", h); }
                else if (heroAct.Act == "calls" || heroAct.Act == "checks") { _vsCbetRaisedCall++; RecordSample("vsCbetFlop:Raised Pot:call", h); }
                else if (heroAct.Act == "raises" || heroAct.Act == "bets") { _vsCbetRaisedRaise++; RecordSample("vsCbetFlop:Raised Pot:raise", h); }
            }
        }

        private void ClassifyVsMissedCbet(DetailedHandRow h, List<ActionRow> pre, List<ActionRow> flop, List<ActionRow> turn, string pos)
        {
            var prePfr = pre.FirstOrDefault(a => a.Act is "raises" or "bets");
            if (prePfr == null || IsHero(prePfr.Name)) return;
            var villainCbet = flop.Any(a => a.Name.Equals(prePfr.Name, StringComparison.OrdinalIgnoreCase) && (a.Act == "bets" || a.Act == "raises"));
            if (villainCbet) return;

            var heroFlopAct = flop.FirstOrDefault(a => IsHero(a.Name));
            if (heroFlopAct == null) return;

            _vsMissedCbetOpp++;
            if (heroFlopAct.Act is "bets" or "raises") { _vsMissedCbetNum++; RecordSample("vsMissedCbet:total", h); }

            var ip = pos is "BTN" or "CO";
            if (ip)
            {
                _vsMissedCbetBetIpOpp++;
                if (heroFlopAct.Act is "bets" or "raises") { _vsMissedCbetBetIpNum++; RecordSample("vsMissedCbet:bet_ip", h); }
                _vsMissedCbetCheckFoldIpOpp++;
                if (heroFlopAct.Act == "checks" && turn.Any(a => IsHero(a.Name) && a.Act == "folds")) { _vsMissedCbetCheckFoldIpNum++; RecordSample("vsMissedCbet:check_fold_ip", h); }
            }
            else
            {
                _vsMissedCbetBetOopTurnOpp++;
                if (turn.Any(a => IsHero(a.Name) && (a.Act == "bets" || a.Act == "raises"))) { _vsMissedCbetBetOopTurnNum++; RecordSample("vsMissedCbet:bet_oop_turn", h); }
                _vsMissedCbetCheckFoldOopOpp++;
                if (heroFlopAct.Act == "checks" && turn.Any(a => IsHero(a.Name) && a.Act == "folds")) { _vsMissedCbetCheckFoldOopNum++; RecordSample("vsMissedCbet:check_fold_oop", h); }
            }
        }

        private Counter GetCounter(string pos)
        {
            if (!_byPos.TryGetValue(pos, out var c))
            {
                c = new Counter();
                _byPos[pos] = c;
            }
            return c;
        }

        private Counter GetSegmentCounter(string key)
        {
            if (!_bySeg.TryGetValue(key, out var c))
            {
                c = new Counter();
                _bySeg[key] = c;
            }
            return c;
        }

        private static string SegmentKey(string pos, int playerCount)
        {
            if (pos == "SB") return playerCount == 2 ? "SB_HU" : "SB_3W";
            if (pos == "BB") return playerCount == 2 ? "BB_HU" : "BB_3W";
            if (pos == "BTN") return "BTN";
            return pos;
        }

        private bool IsHero(string name) => name.Equals(_hero, StringComparison.OrdinalIgnoreCase) || name.Equals("Hero", StringComparison.OrdinalIgnoreCase);

        private void CountOpenRaiseSizing(Counter c, Counter s, DetailedHandRow h, double sizeBb)
        {
            if (sizeBb <= 2.25) { c.OpenRaise2xNum++; s.OpenRaise2xNum++; _tot.OpenRaise2xNum++; Record(c, s, "Open Raise 2x", h); }
            else { c.OpenRaise2xPlusNum++; s.OpenRaise2xPlusNum++; _tot.OpenRaise2xPlusNum++; Record(c, s, "Open Raise 2x+", h); }

            if (sizeBb <= 2.25) { c.OpenRaise2xExactNum++; s.OpenRaise2xExactNum++; _tot.OpenRaise2xExactNum++; Record(c, s, "Open Raise 2x Exact", h); }
            else if (sizeBb <= 2.75) { c.OpenRaise25xNum++; s.OpenRaise25xNum++; _tot.OpenRaise25xNum++; Record(c, s, "Open Raise 2.5x", h); }
            else if (sizeBb <= 3.25) { c.OpenRaise3xNum++; s.OpenRaise3xNum++; _tot.OpenRaise3xNum++; Record(c, s, "Open Raise 3x", h); }
            else { c.OpenRaise35xPlusNum++; s.OpenRaise35xPlusNum++; _tot.OpenRaise35xPlusNum++; Record(c, s, "Open Raise 3.5x+", h); }
        }

        private void CountFacingRaise(Counter c, Counter s, DetailedHandRow h, double? sizeBb, bool isAllIn, string heroAct)
        {
            c.FacingRaiseOpp++; s.FacingRaiseOpp++; _tot.FacingRaiseOpp++;
            Record(c, s, "Hands vs Raise", h);

            if (isAllIn)
            {
                c.FacingOpenShoveOpp++; s.FacingOpenShoveOpp++; _tot.FacingOpenShoveOpp++;
                Record(c, s, "Hands vs Open Shove", h);
            }

            var folded = heroAct == "folds";
            var called = heroAct == "calls";
            if (folded) { c.FoldVsRaiseNum++; s.FoldVsRaiseNum++; _tot.FoldVsRaiseNum++; Record(c, s, "Fold vs Raise", h); }
            if (called) { c.CallVsRaiseNum++; s.CallVsRaiseNum++; _tot.CallVsRaiseNum++; Record(c, s, "Call vs Raise", h); }

            if (!sizeBb.HasValue) return;
            if (sizeBb.Value <= 2.25)
            {
                c.Facing2xOpp++; s.Facing2xOpp++; _tot.Facing2xOpp++;
                if (folded) { c.FoldVs2xNum++; s.FoldVs2xNum++; _tot.FoldVs2xNum++; Record(c, s, "Fold vs 2x", h); }
                if (called) { c.CallVs2xNum++; s.CallVs2xNum++; _tot.CallVs2xNum++; Record(c, s, "Call vs 2x", h); }
            }
            else
            {
                c.Facing2xPlusOpp++; s.Facing2xPlusOpp++; _tot.Facing2xPlusOpp++;
                if (folded) { c.FoldVs2xPlusNum++; s.FoldVs2xPlusNum++; _tot.FoldVs2xPlusNum++; Record(c, s, "Fold vs 2x+", h); }
                if (called) { c.CallVs2xPlusNum++; s.CallVs2xPlusNum++; _tot.CallVs2xPlusNum++; Record(c, s, "Call vs 2x+", h); }
            }

            if (sizeBb.Value <= 2.25)
            {
                c.Facing2xExactOpp++; s.Facing2xExactOpp++; _tot.Facing2xExactOpp++;
            }
            else if (sizeBb.Value <= 2.75)
            {
                c.Facing25xOpp++; s.Facing25xOpp++; _tot.Facing25xOpp++;
                if (folded) { c.FoldVs25xNum++; s.FoldVs25xNum++; _tot.FoldVs25xNum++; Record(c, s, "Fold vs 2.5x", h); }
                if (called) { c.CallVs25xNum++; s.CallVs25xNum++; _tot.CallVs25xNum++; Record(c, s, "Call vs 2.5x", h); }
            }
            else if (sizeBb.Value <= 3.25)
            {
                c.Facing3xOpp++; s.Facing3xOpp++; _tot.Facing3xOpp++;
                if (folded) { c.FoldVs3xNum++; s.FoldVs3xNum++; _tot.FoldVs3xNum++; Record(c, s, "Fold vs 3x", h); }
                if (called) { c.CallVs3xNum++; s.CallVs3xNum++; _tot.CallVs3xNum++; Record(c, s, "Call vs 3x", h); }
            }
            else
            {
                c.Facing35xPlusOpp++; s.Facing35xPlusOpp++; _tot.Facing35xPlusOpp++;
                if (folded) { c.FoldVs35xPlusNum++; s.FoldVs35xPlusNum++; _tot.FoldVs35xPlusNum++; Record(c, s, "Fold vs 3.5x+", h); }
                if (called) { c.CallVs35xPlusNum++; s.CallVs35xPlusNum++; _tot.CallVs35xPlusNum++; Record(c, s, "Call vs 3.5x+", h); }
            }
        }

        private static double? RaiseSizeBb(ActionRow action, DetailedHandRow h)
        {
            var bb = BigBlind(h.Blinds);
            if (bb <= 0 || !action.AmountTo.HasValue) return null;
            return action.AmountTo.Value / bb;
        }

        private static int BigBlind(string blinds)
        {
            var matches = Regex.Matches(blinds ?? "", @"\d+");
            return matches.Count > 0 && int.TryParse(matches[^1].Value, out var bb) ? bb : 0;
        }

        private static List<ActionRow> ParseActions(string text)
        {
            var rows = new List<ActionRow>();
            foreach (var raw in (text ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var m = ActionRegex.Match(raw.Trim());
                if (!m.Success) continue;
                var tail = m.Groups["tail"].Value;
                rows.Add(new ActionRow(
                    m.Groups["name"].Value.Trim(),
                    m.Groups["act"].Value.Trim().ToLowerInvariant(),
                    raw.Contains("all-in", StringComparison.OrdinalIgnoreCase),
                    ParseActionAmount(tail),
                    ParseRaiseTo(tail)));
            }
            return rows;
        }

        private static double? ParseActionAmount(string tail)
        {
            var m = NumberRegex.Match(tail ?? "");
            return m.Success && double.TryParse(m.Groups["n"].Value.Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var value)
                ? value
                : null;
        }

        private static double? ParseRaiseTo(string tail)
        {
            var m = RaiseToRegex.Match(tail ?? "");
            if (m.Success && double.TryParse(m.Groups["n"].Value.Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var value))
            {
                return value;
            }
            return ParseActionAmount(tail);
        }

        public static string StackBucket(int stack, string blinds)
        {
            var bb = 0;
            var matches = Regex.Matches(blinds ?? "", @"\d+");
            if (matches.Count > 0) int.TryParse(matches[^1].Value, out bb);
            if (bb <= 0 || stack <= 0) return "Unknown";

            var stackBb = (double)stack / bb;
            if (stackBb <= 8) return "0-8bb";
            if (stackBb <= 12) return "8-12bb";
            if (stackBb <= 18) return "12-18bb";
            return "18bb+";
        }

        public static int StackOrder(string bucket) => bucket switch
        {
            "0-8bb" => 0,
            "8-12bb" => 1,
            "12-18bb" => 2,
            "18bb+" => 3,
            _ => 4
        };

        private static int PositionOrder(string position) => position switch
        {
            "HU SB" => 0,
            "HU BB" => 1,
            "3W BTN" => 2,
            "3W SB" => 3,
            "3W BB" => 4,
            _ => 5
        };

        private static string PushFoldPosition(string pos, int playerCount)
        {
            if (playerCount == 2 && pos == "SB") return "HU SB";
            if (playerCount == 2 && pos == "BB") return "HU BB";
            if (playerCount == 3 && pos == "BTN") return "3W BTN";
            if (playerCount == 3 && pos == "SB") return "3W SB";
            if (playerCount == 3 && pos == "BB") return "3W BB";
            return string.IsNullOrWhiteSpace(pos) ? "Unknown" : pos;
        }

        public object ToResponse(object? stackDepths = null)
        {
            Counter Merge(params Counter[] counters)
            {
                var r = new Counter();
                foreach (var c in counters)
                {
                    r.Hands += c.Hands;
                    r.OpenRaiseOpp += c.OpenRaiseOpp; r.LimpOpp += c.LimpOpp; r.CallOpenOpp += c.CallOpenOpp; r.ThreeBetOpp += c.ThreeBetOpp; r.FourBetOpp += c.FourBetOpp;
                    r.VpipNum += c.VpipNum; r.PfrNum += c.PfrNum; r.OpenRaiseNum += c.OpenRaiseNum; r.LimpNum += c.LimpNum; r.CallOpenNum += c.CallOpenNum; r.ThreeBetNum += c.ThreeBetNum; r.FourBetNum += c.FourBetNum;
                    r.OpenRaise2xNum += c.OpenRaise2xNum; r.OpenRaise2xPlusNum += c.OpenRaise2xPlusNum; r.OpenRaise2xExactNum += c.OpenRaise2xExactNum; r.OpenRaise25xNum += c.OpenRaise25xNum; r.OpenRaise3xNum += c.OpenRaise3xNum; r.OpenRaise35xPlusNum += c.OpenRaise35xPlusNum;
                    r.FacingRaiseOpp += c.FacingRaiseOpp; r.FacingLimpOpp += c.FacingLimpOpp; r.FoldVsRaiseNum += c.FoldVsRaiseNum; r.CallVsRaiseNum += c.CallVsRaiseNum; r.FacingOpenShoveOpp += c.FacingOpenShoveOpp;
                    r.Facing2xOpp += c.Facing2xOpp; r.Facing2xPlusOpp += c.Facing2xPlusOpp; r.Facing2xExactOpp += c.Facing2xExactOpp; r.Facing25xOpp += c.Facing25xOpp; r.Facing3xOpp += c.Facing3xOpp; r.Facing35xPlusOpp += c.Facing35xPlusOpp;
                    r.FoldVs2xNum += c.FoldVs2xNum; r.FoldVs2xPlusNum += c.FoldVs2xPlusNum; r.FoldVs25xNum += c.FoldVs25xNum; r.FoldVs3xNum += c.FoldVs3xNum; r.FoldVs35xPlusNum += c.FoldVs35xPlusNum;
                    r.CallVs2xNum += c.CallVs2xNum; r.CallVs2xPlusNum += c.CallVs2xPlusNum; r.CallVs25xNum += c.CallVs25xNum; r.CallVs3xNum += c.CallVs3xNum; r.CallVs35xPlusNum += c.CallVs35xPlusNum;
                    r.ThreeBetNonAllInNum += c.ThreeBetNonAllInNum; r.ThreeBetShoveNum += c.ThreeBetShoveNum;
                    r.FoldTo3BetNum += c.FoldTo3BetNum; r.FoldTo3BetOpp += c.FoldTo3BetOpp; r.FoldTo4BetNum += c.FoldTo4BetNum; r.FoldTo4BetOpp += c.FoldTo4BetOpp;
                    r.FoldTo3BetNonAllInNum += c.FoldTo3BetNonAllInNum; r.FoldTo3BetNonAllInOpp += c.FoldTo3BetNonAllInOpp; r.FoldTo3BetShoveNum += c.FoldTo3BetShoveNum; r.FoldTo3BetShoveOpp += c.FoldTo3BetShoveOpp;
                    r.SqueezeNum += c.SqueezeNum; r.SqueezeOpp += c.SqueezeOpp; r.FiveBetNum += c.FiveBetNum; r.FiveBetOpp += c.FiveBetOpp; r.Call4BetNum += c.Call4BetNum; r.Call4BetOpp += c.Call4BetOpp; r.LimpFoldNum += c.LimpFoldNum; r.LimpFoldOpp += c.LimpFoldOpp; r.FourBetFoldNum += c.FourBetFoldNum; r.FourBetFoldOpp += c.FourBetFoldOpp;
                    r.LimpFacedRaiseOpp += c.LimpFacedRaiseOpp; r.LimpFoldVsNonAllInNum += c.LimpFoldVsNonAllInNum; r.LimpFoldVsNonAllInOpp += c.LimpFoldVsNonAllInOpp; r.LimpFoldVsAllInNum += c.LimpFoldVsAllInNum; r.LimpFoldVsAllInOpp += c.LimpFoldVsAllInOpp; r.LimpRaiseNum += c.LimpRaiseNum;
                    r.IsoRaiseNum += c.IsoRaiseNum; r.IsoNonAllInNum += c.IsoNonAllInNum; r.IsoAllInNum += c.IsoAllInNum;
                    r.MergeSamples(c);
                }
                return r;
            }

            object Sample(int num, int den, IReadOnlyList<StatHandSample>? hands = null) => new
            {
                num,
                den,
                hands = (hands ?? Array.Empty<StatHandSample>()).Take(MaxSampleHands).ToArray()
            };

            (int num, int den, IReadOnlyList<StatHandSample> hands) CounterSample(string stat, Counter c, int handDenom) => stat switch
            {
                "VPIP" => (c.VpipNum, handDenom, c.SampleHands(stat)),
                "PFR" => (c.PfrNum, handDenom, c.SampleHands(stat)),
                "Raise First In" => (c.OpenRaiseNum, c.OpenRaiseOpp, c.SampleHands(stat)),
                "Open Raise 2x" => (c.OpenRaise2xNum, c.OpenRaiseOpp, c.SampleHands(stat)),
                "Open Raise 2x+" => (c.OpenRaise2xPlusNum, c.OpenRaiseOpp, c.SampleHands(stat)),
                "Open Raise 2x Exact" => (c.OpenRaise2xExactNum, c.OpenRaiseOpp, c.SampleHands(stat)),
                "Open Raise 2.5x" => (c.OpenRaise25xNum, c.OpenRaiseOpp, c.SampleHands(stat)),
                "Open Raise 3x" => (c.OpenRaise3xNum, c.OpenRaiseOpp, c.SampleHands(stat)),
                "Open Raise 3.5x+" => (c.OpenRaise35xPlusNum, c.OpenRaiseOpp, c.SampleHands(stat)),
                "Open Limp" => (c.LimpNum, c.LimpOpp, c.SampleHands(stat)),
                "Call Open" => (c.CallOpenNum, c.CallOpenOpp, c.SampleHands(stat)),
                "3-Bet" => (c.ThreeBetNum, c.ThreeBetOpp, c.SampleHands(stat)),
                "3-Bet Non-All-In" => (c.ThreeBetNonAllInNum, c.ThreeBetOpp, c.SampleHands(stat)),
                "3-Bet Shove" => (c.ThreeBetShoveNum, c.ThreeBetOpp, c.SampleHands(stat)),
                "Fold to 3-Bet" => (c.FoldTo3BetNum, c.FoldTo3BetOpp, c.SampleHands(stat)),
                "Fold to 3-Bet Non-All-In" => (c.FoldTo3BetNonAllInNum, c.FoldTo3BetNonAllInOpp, c.SampleHands(stat)),
                "Fold to 3-Bet Shove" => (c.FoldTo3BetShoveNum, c.FoldTo3BetShoveOpp, c.SampleHands(stat)),
                "4-Bet" => (c.FourBetNum, c.FourBetOpp, c.SampleHands(stat)),
                "Fold to 4-Bet" => (c.FoldTo4BetNum, c.FoldTo4BetOpp, c.SampleHands(stat)),
                "Limp-Fold" => (c.LimpFoldNum, c.LimpFoldOpp, c.SampleHands(stat)),
                "Limp-Fold vs Non-All-In" => (c.LimpFoldVsNonAllInNum, c.LimpFoldVsNonAllInOpp, c.SampleHands(stat)),
                "Limp-Fold vs All-In" => (c.LimpFoldVsAllInNum, c.LimpFoldVsAllInOpp, c.SampleHands(stat)),
                "Limp-Raise" => (c.LimpRaiseNum, c.LimpFacedRaiseOpp, c.SampleHands(stat)),
                "Hands vs Raise" => (c.FacingRaiseOpp, c.FacingRaiseOpp, c.SampleHands(stat)),
                "Fold vs Raise" => (c.FoldVsRaiseNum, c.FacingRaiseOpp, c.SampleHands(stat)),
                "Call vs Raise" => (c.CallVsRaiseNum, c.FacingRaiseOpp, c.SampleHands(stat)),
                "Fold vs 2x" => (c.FoldVs2xNum, c.Facing2xOpp, c.SampleHands(stat)),
                "Fold vs 2x+" => (c.FoldVs2xPlusNum, c.Facing2xPlusOpp, c.SampleHands(stat)),
                "Fold vs 2.5x" => (c.FoldVs25xNum, c.Facing25xOpp, c.SampleHands(stat)),
                "Fold vs 3x" => (c.FoldVs3xNum, c.Facing3xOpp, c.SampleHands(stat)),
                "Fold vs 3.5x+" => (c.FoldVs35xPlusNum, c.Facing35xPlusOpp, c.SampleHands(stat)),
                "Call vs 2x" => (c.CallVs2xNum, c.Facing2xOpp, c.SampleHands(stat)),
                "Call vs 2x+" => (c.CallVs2xPlusNum, c.Facing2xPlusOpp, c.SampleHands(stat)),
                "Call vs 2.5x" => (c.CallVs25xNum, c.Facing25xOpp, c.SampleHands(stat)),
                "Call vs 3x" => (c.CallVs3xNum, c.Facing3xOpp, c.SampleHands(stat)),
                "Call vs 3.5x+" => (c.CallVs35xPlusNum, c.Facing35xPlusOpp, c.SampleHands(stat)),
                "Hands vs Limp" => (c.FacingLimpOpp, c.FacingLimpOpp, c.SampleHands(stat)),
                "Iso Raise" => (c.IsoRaiseNum, c.FacingLimpOpp, c.SampleHands(stat)),
                "Iso Non-All-In" => (c.IsoNonAllInNum, c.FacingLimpOpp, c.SampleHands(stat)),
                "Iso All-In" => (c.IsoAllInNum, c.FacingLimpOpp, c.SampleHands(stat)),
                "Hands vs Open Shove" => (c.FacingOpenShoveOpp, c.FacingOpenShoveOpp, c.SampleHands(stat)),
                _ => (0, 0, Array.Empty<StatHandSample>())
            };
            object CounterSampleObject(string stat, Counter c, int handDenom)
            {
                var sample = CounterSample(stat, c, handDenom);
                return Sample(sample.num, sample.den, sample.hands);
            }

            object Row(string stat, Func<Counter, int, object> fn)
            {
                var btn = _bySeg.TryGetValue("BTN", out var btnC) ? btnC : new Counter();
                var sbHu = _bySeg.TryGetValue("SB_HU", out var sbHuC) ? sbHuC : new Counter();
                var sb3w = _bySeg.TryGetValue("SB_3W", out var sb3wC) ? sb3wC : new Counter();
                var bbHu = _bySeg.TryGetValue("BB_HU", out var bbHuC) ? bbHuC : new Counter();
                var bb3w = _bySeg.TryGetValue("BB_3W", out var bb3wC) ? bb3wC : new Counter();
                var hu = Merge(sbHu, bbHu);
                var threeWay = Merge(btn, sb3w, bb3w);

                var values = new Dictionary<string, object>
                {
                    ["stat"] = stat,
                    ["tot"] = fn(_tot, _tot.Hands),
                    ["hu"] = fn(hu, hu.Hands),
                    ["three_way"] = fn(threeWay, threeWay.Hands),
                    ["btn"] = fn(btn, btn.Hands),
                    ["sb_hu"] = fn(sbHu, sbHu.Hands),
                    ["sb_3w"] = fn(sb3w, sb3w.Hands),
                    ["bb_hu"] = fn(bbHu, bbHu.Hands),
                    ["bb_3w"] = fn(bb3w, bb3w.Hands)
                };
                values["samples"] = new Dictionary<string, object>
                {
                    ["tot"] = CounterSampleObject(stat, _tot, _tot.Hands),
                    ["hu"] = CounterSampleObject(stat, hu, hu.Hands),
                    ["three_way"] = CounterSampleObject(stat, threeWay, threeWay.Hands),
                    ["btn"] = CounterSampleObject(stat, btn, btn.Hands),
                    ["sb_hu"] = CounterSampleObject(stat, sbHu, sbHu.Hands),
                    ["sb_3w"] = CounterSampleObject(stat, sb3w, sb3w.Hands),
                    ["bb_hu"] = CounterSampleObject(stat, bbHu, bbHu.Hands),
                    ["bb_3w"] = CounterSampleObject(stat, bb3w, bb3w.Hands)
                };
                return values;
            }
            double Pct(int num, int den) => den <= 0 ? 0 : Math.Round(100.0 * num / den, 1);
            int StreetDen(StreetCounter street) => street.Bets + street.Raises + street.Calls + street.Checks + street.Folds;
            int StreetAgg(StreetCounter street) => street.Bets + street.Raises;
            var metaBtn = _bySeg.TryGetValue("BTN", out var metaBtnC) ? metaBtnC : new Counter();
            var metaSbHu = _bySeg.TryGetValue("SB_HU", out var metaSbHuC) ? metaSbHuC : new Counter();
            var metaSb3w = _bySeg.TryGetValue("SB_3W", out var metaSb3wC) ? metaSb3wC : new Counter();
            var metaBbHu = _bySeg.TryGetValue("BB_HU", out var metaBbHuC) ? metaBbHuC : new Counter();
            var metaBb3w = _bySeg.TryGetValue("BB_3W", out var metaBb3wC) ? metaBb3wC : new Counter();

            return new
            {
                meta = new
                {
                    player_hands = _tot.Hands,
                    players = _players.Count,
                    hands_3max = metaBtn.Hands + metaSb3w.Hands + metaBb3w.Hands,
                    hands_hu = metaSbHu.Hands + metaBbHu.Hands
                },
                stackDepths,
                preflop = new object[]
                {
                    Row("VPIP", (c,d)=>Pct(c.VpipNum,d)),
                    Row("PFR", (c,d)=>Pct(c.PfrNum,d)),
                    Row("Raise First In", (c,d)=>Pct(c.OpenRaiseNum,c.OpenRaiseOpp)),
                    Row("Open Raise 2x", (c,d)=>Pct(c.OpenRaise2xNum,c.OpenRaiseOpp)),
                    Row("Open Raise 2x+", (c,d)=>Pct(c.OpenRaise2xPlusNum,c.OpenRaiseOpp)),
                    Row("Open Raise 2x Exact", (c,d)=>Pct(c.OpenRaise2xExactNum,c.OpenRaiseOpp)),
                    Row("Open Raise 2.5x", (c,d)=>Pct(c.OpenRaise25xNum,c.OpenRaiseOpp)),
                    Row("Open Raise 3x", (c,d)=>Pct(c.OpenRaise3xNum,c.OpenRaiseOpp)),
                    Row("Open Raise 3.5x+", (c,d)=>Pct(c.OpenRaise35xPlusNum,c.OpenRaiseOpp)),
                    Row("Open Limp", (c,d)=>Pct(c.LimpNum,c.LimpOpp)),
                    Row("Call Open", (c,d)=>Pct(c.CallOpenNum,c.CallOpenOpp)),
                    Row("3-Bet", (c,d)=>Pct(c.ThreeBetNum,c.ThreeBetOpp)),
                    Row("3-Bet Non-All-In", (c,d)=>Pct(c.ThreeBetNonAllInNum,c.ThreeBetOpp)),
                    Row("3-Bet Shove", (c,d)=>Pct(c.ThreeBetShoveNum,c.ThreeBetOpp)),
                    Row("Fold to 3-Bet", (c,d)=>Pct(c.FoldTo3BetNum,c.FoldTo3BetOpp)),
                    Row("Fold to 3-Bet Non-All-In", (c,d)=>Pct(c.FoldTo3BetNonAllInNum,c.FoldTo3BetNonAllInOpp)),
                    Row("Fold to 3-Bet Shove", (c,d)=>Pct(c.FoldTo3BetShoveNum,c.FoldTo3BetShoveOpp)),
                    Row("4-Bet", (c,d)=>Pct(c.FourBetNum,c.FourBetOpp)),
                    Row("Fold to 4-Bet", (c,d)=>Pct(c.FoldTo4BetNum,c.FoldTo4BetOpp)),
                    Row("Limp-Fold", (c,d)=>Pct(c.LimpFoldNum,c.LimpFoldOpp)),
                    Row("Limp-Fold vs Non-All-In", (c,d)=>Pct(c.LimpFoldVsNonAllInNum,c.LimpFoldVsNonAllInOpp)),
                    Row("Limp-Fold vs All-In", (c,d)=>Pct(c.LimpFoldVsAllInNum,c.LimpFoldVsAllInOpp)),
                    Row("Limp-Raise", (c,d)=>Pct(c.LimpRaiseNum,c.LimpFacedRaiseOpp)),
                    Row("Hands vs Raise", (c,d)=>c.FacingRaiseOpp),
                    Row("Fold vs Raise", (c,d)=>Pct(c.FoldVsRaiseNum,c.FacingRaiseOpp)),
                    Row("Call vs Raise", (c,d)=>Pct(c.CallVsRaiseNum,c.FacingRaiseOpp)),
                    Row("Fold vs 2x", (c,d)=>Pct(c.FoldVs2xNum,c.Facing2xOpp)),
                    Row("Fold vs 2x+", (c,d)=>Pct(c.FoldVs2xPlusNum,c.Facing2xPlusOpp)),
                    Row("Fold vs 2.5x", (c,d)=>Pct(c.FoldVs25xNum,c.Facing25xOpp)),
                    Row("Fold vs 3x", (c,d)=>Pct(c.FoldVs3xNum,c.Facing3xOpp)),
                    Row("Fold vs 3.5x+", (c,d)=>Pct(c.FoldVs35xPlusNum,c.Facing35xPlusOpp)),
                    Row("Call vs 2x", (c,d)=>Pct(c.CallVs2xNum,c.Facing2xOpp)),
                    Row("Call vs 2x+", (c,d)=>Pct(c.CallVs2xPlusNum,c.Facing2xPlusOpp)),
                    Row("Call vs 2.5x", (c,d)=>Pct(c.CallVs25xNum,c.Facing25xOpp)),
                    Row("Call vs 3x", (c,d)=>Pct(c.CallVs3xNum,c.Facing3xOpp)),
                    Row("Call vs 3.5x+", (c,d)=>Pct(c.CallVs35xPlusNum,c.Facing35xPlusOpp)),
                    Row("Hands vs Limp", (c,d)=>c.FacingLimpOpp),
                    Row("Iso Raise", (c,d)=>Pct(c.IsoRaiseNum,c.FacingLimpOpp)),
                    Row("Iso Non-All-In", (c,d)=>Pct(c.IsoNonAllInNum,c.FacingLimpOpp)),
                    Row("Iso All-In", (c,d)=>Pct(c.IsoAllInNum,c.FacingLimpOpp)),
                    Row("Hands vs Open Shove", (c,d)=>c.FacingOpenShoveOpp)
                },
                huSb = new object[]
                {
                    new { stat = "Open Limp", value = Pct(_huSbLimp, _huSbOpp), sample = Sample(_huSbLimp, _huSbOpp, SampleHands("huSb:Open Limp")) },
                    new { stat = "Raise First In", value = Pct(_huSbRaise, _huSbOpp), sample = Sample(_huSbRaise, _huSbOpp, SampleHands("huSb:Raise First In")) },
                    new { stat = "Limp-Fold vs Raise", value = Pct(_huSbLimpFold, _huSbLimp), sample = Sample(_huSbLimpFold, _huSbLimp, SampleHands("huSb:Limp-Fold vs Raise")) },
                    new { stat = "Limp-Call vs Raise", value = Pct(_huSbLimpCall, _huSbLimp), sample = Sample(_huSbLimpCall, _huSbLimp, SampleHands("huSb:Limp-Call vs Raise")) },
                    new { stat = "Limp-Raise vs Raise", value = Pct(_huSbLimpRaise, _huSbLimp), sample = Sample(_huSbLimpRaise, _huSbLimp, SampleHands("huSb:Limp-Raise vs Raise")) }
                },
                huBb = new object[]
                {
                    new { stat = "vs Limp Check", value = Pct(_huBbVsLimpCheck, _huBbVsLimpOpp), sample = Sample(_huBbVsLimpCheck, _huBbVsLimpOpp, SampleHands("huBb:vs Limp Check")) },
                    new { stat = "vs Limp Raise", value = Pct(_huBbVsLimpRaise, _huBbVsLimpOpp), sample = Sample(_huBbVsLimpRaise, _huBbVsLimpOpp, SampleHands("huBb:vs Limp Raise")) },
                    new { stat = "vs Raise Fold", value = Pct(_huBbVsRaiseFold, _huBbVsRaiseOpp), sample = Sample(_huBbVsRaiseFold, _huBbVsRaiseOpp, SampleHands("huBb:vs Raise Fold")) },
                    new { stat = "vs Raise Call", value = Pct(_huBbVsRaiseCall, _huBbVsRaiseOpp), sample = Sample(_huBbVsRaiseCall, _huBbVsRaiseOpp, SampleHands("huBb:vs Raise Call")) },
                    new { stat = "vs Raise 3-Bet", value = Pct(_huBbVsRaise3Bet, _huBbVsRaiseOpp), sample = Sample(_huBbVsRaise3Bet, _huBbVsRaiseOpp, SampleHands("huBb:vs Raise 3-Bet")) }
                },
                threeWayPreflop = new object[]
                {
                    new { stat = "BTN RFI", value = Pct(_threeWBtnRfi, _threeWBtnOpp), sample = Sample(_threeWBtnRfi, _threeWBtnOpp, SampleHands("threeWayPreflop:BTN RFI")) },
                    new { stat = "SB RFI", value = Pct(_threeWSbRfi, _threeWSbOpp), sample = Sample(_threeWSbRfi, _threeWSbOpp, SampleHands("threeWayPreflop:SB RFI")) },
                    new { stat = "SB Complete", value = Pct(_threeWSbComplete, _threeWSbOpp), sample = Sample(_threeWSbComplete, _threeWSbOpp, SampleHands("threeWayPreflop:SB Complete")) },
                    new { stat = "BB vs Steal Fold", value = Pct(_threeWBbVsStealFold, _threeWBbVsStealOpp), sample = Sample(_threeWBbVsStealFold, _threeWBbVsStealOpp, SampleHands("threeWayPreflop:BB vs Steal Fold")) },
                    new { stat = "BB vs Steal Call", value = Pct(_threeWBbVsStealCall, _threeWBbVsStealOpp), sample = Sample(_threeWBbVsStealCall, _threeWBbVsStealOpp, SampleHands("threeWayPreflop:BB vs Steal Call")) },
                    new { stat = "BB vs Steal 3-Bet", value = Pct(_threeWBbVsSteal3Bet, _threeWBbVsStealOpp), sample = Sample(_threeWBbVsSteal3Bet, _threeWBbVsStealOpp, SampleHands("threeWayPreflop:BB vs Steal 3-Bet")) }
                },
                pushFold = _pushFoldByStackAndPosition.Values
                    .OrderBy(c => StackOrder(c.Stack))
                    .ThenBy(c => PositionOrder(c.Position))
                    .Select(c => new
                    {
                        stack = c.Stack,
                        position = c.Position,
                        spots = c.Opp,
                        facing_shove = c.FacingShove,
                        open_shove = Pct(c.OpenShove, c.OpenShoveOpp),
                        open_shove_sample = Sample(c.OpenShove, c.OpenShoveOpp, c.SampleHands("open_shove")),
                        iso_shove = Pct(c.IsoShove, c.IsoShoveOpp),
                        iso_shove_sample = Sample(c.IsoShove, c.IsoShoveOpp, c.SampleHands("iso_shove")),
                        rejam = Pct(c.Rejam, c.RejamOpp),
                        rejam_sample = Sample(c.Rejam, c.RejamOpp, c.SampleHands("rejam")),
                        call_shove = Pct(c.CallShove, c.FacingShove),
                        call_shove_sample = Sample(c.CallShove, c.FacingShove, c.SampleHands("call_shove")),
                        fold_vs_shove = Pct(c.FoldVsShove, c.FacingShove),
                        fold_vs_shove_sample = Sample(c.FoldVsShove, c.FacingShove, c.SampleHands("fold_vs_shove"))
                    })
                    .ToArray(),
                performance = new
                {
                    showdown_chips = 0,
                    non_showdown_chips = 0
                },
                steal = new object[]
                {
                    new { stat = "Steal", tot = Pct(_stealNumTot,_stealOppTot), btn = Pct(_stealNumBtn,_stealOppBtn), sb = Pct(_stealNumSb,_stealOppSb), samples = new { tot = Sample(_stealNumTot,_stealOppTot), btn = Sample(_stealNumBtn,_stealOppBtn), sb = Sample(_stealNumSb,_stealOppSb) } },
                    new { stat = "Fold to 3Bet", tot = Pct(_stealFold3NumTot,_stealFold3OppTot), btn = Pct(_stealFold3NumBtn,_stealFold3OppBtn), sb = Pct(_stealFold3NumSb,_stealFold3OppSb), samples = new { tot = Sample(_stealFold3NumTot,_stealFold3OppTot), btn = Sample(_stealFold3NumBtn,_stealFold3OppBtn), sb = Sample(_stealFold3NumSb,_stealFold3OppSb) } },
                    new { stat = "4-Bet", tot = Pct(_steal4BetNumTot,_steal4BetOppTot), btn = Pct(_steal4BetNumBtn,_steal4BetOppBtn), sb = Pct(_steal4BetNumSb,_steal4BetOppSb), samples = new { tot = Sample(_steal4BetNumTot,_steal4BetOppTot), btn = Sample(_steal4BetNumBtn,_steal4BetOppBtn), sb = Sample(_steal4BetNumSb,_steal4BetOppSb) } },
                    new { stat = "4-Bet-Fold", tot = Pct(_steal4BetFoldNum,_steal4BetFoldOpp), btn = (object)"--", sb = (object)"--", samples = new { tot = Sample(_steal4BetFoldNum,_steal4BetFoldOpp), btn = Sample(0,0), sb = Sample(0,0) } }
                },
                vsSteal = new object[]
                {
                    new { stat = "Fold", sb = Pct(_vsStealSbFold,_vsStealSbOpp), bb = Pct(_vsStealBbFold,_vsStealBbOpp), samples = new { sb = Sample(_vsStealSbFold,_vsStealSbOpp), bb = Sample(_vsStealBbFold,_vsStealBbOpp) } },
                    new { stat = "Call", sb = Pct(_vsStealSbCall,_vsStealSbOpp), bb = Pct(_vsStealBbCall,_vsStealBbOpp), samples = new { sb = Sample(_vsStealSbCall,_vsStealSbOpp), bb = Sample(_vsStealBbCall,_vsStealBbOpp) } },
                    new { stat = "3-Bet", sb = Pct(_vsStealSb3Bet,_vsStealSbOpp), bb = Pct(_vsStealBb3Bet,_vsStealBbOpp), samples = new { sb = Sample(_vsStealSb3Bet,_vsStealSbOpp), bb = Sample(_vsStealBb3Bet,_vsStealBbOpp) } }
                },
                postflop = new object[]
                {
                    new { stat = "C-Bet", flop = Pct(_cbetFlopNum,_cbetFlopOpp), turn = Pct(_cbetTurnNum,_cbetTurnOpp), river = Pct(_cbetRiverNum,_cbetRiverOpp), samples = new { flop = Sample(_cbetFlopNum,_cbetFlopOpp, SampleHands("C-Bet:flop")), turn = Sample(_cbetTurnNum,_cbetTurnOpp, SampleHands("C-Bet:turn")), river = Sample(_cbetRiverNum,_cbetRiverOpp, SampleHands("C-Bet:river")) } },
                    new { stat = "CBet-Fold", flop = Pct(_cbetFoldFlopNum,_cbetFoldFlopOpp), turn = Pct(_cbetFoldTurnNum,_cbetFoldTurnOpp), river = Pct(_cbetFoldRiverNum,_cbetFoldRiverOpp), samples = new { flop = Sample(_cbetFoldFlopNum,_cbetFoldFlopOpp, SampleHands("CBet-Fold:flop")), turn = Sample(_cbetFoldTurnNum,_cbetFoldTurnOpp, SampleHands("CBet-Fold:turn")), river = Sample(_cbetFoldRiverNum,_cbetFoldRiverOpp, SampleHands("CBet-Fold:river")) } },
                    new { stat = "Fold to CBet", flop = Pct(_foldToCbetFlopNum,_foldToCbetFlopOpp), turn = Pct(_foldToCbetTurnNum,_foldToCbetTurnOpp), river = Pct(_foldToCbetRiverNum,_foldToCbetRiverOpp), samples = new { flop = Sample(_foldToCbetFlopNum,_foldToCbetFlopOpp, SampleHands("Fold to CBet:flop")), turn = Sample(_foldToCbetTurnNum,_foldToCbetTurnOpp, SampleHands("Fold to CBet:turn")), river = Sample(_foldToCbetRiverNum,_foldToCbetRiverOpp, SampleHands("Fold to CBet:river")) } },
                    new { stat = "Agg Freq", flop = Pct(StreetAgg(_flop), StreetDen(_flop)), turn = Pct(StreetAgg(_turn), StreetDen(_turn)), river = Pct(StreetAgg(_river), StreetDen(_river)), samples = new { flop = Sample(StreetAgg(_flop), StreetDen(_flop), SampleHands("Agg Freq:flop")), turn = Sample(StreetAgg(_turn), StreetDen(_turn), SampleHands("Agg Freq:turn")), river = Sample(StreetAgg(_river), StreetDen(_river), SampleHands("Agg Freq:river")) } },
                    new { stat = "Agg Freq IP", flop = Pct(StreetAgg(_flopIp), StreetDen(_flopIp)), turn = Pct(StreetAgg(_turnIp), StreetDen(_turnIp)), river = Pct(StreetAgg(_riverIp), StreetDen(_riverIp)), samples = new { flop = Sample(StreetAgg(_flopIp), StreetDen(_flopIp), SampleHands("Agg Freq IP:flop")), turn = Sample(StreetAgg(_turnIp), StreetDen(_turnIp), SampleHands("Agg Freq IP:turn")), river = Sample(StreetAgg(_riverIp), StreetDen(_riverIp), SampleHands("Agg Freq IP:river")) } },
                    new { stat = "Agg Freq OOP", flop = Pct(StreetAgg(_flopOop), StreetDen(_flopOop)), turn = Pct(StreetAgg(_turnOop), StreetDen(_turnOop)), river = Pct(StreetAgg(_riverOop), StreetDen(_riverOop)), samples = new { flop = Sample(StreetAgg(_flopOop), StreetDen(_flopOop), SampleHands("Agg Freq OOP:flop")), turn = Sample(StreetAgg(_turnOop), StreetDen(_turnOop), SampleHands("Agg Freq OOP:turn")), river = Sample(StreetAgg(_riverOop), StreetDen(_riverOop), SampleHands("Agg Freq OOP:river")) } },
                    new { stat = "Donk Bet", flop = Pct(_donkFlopNum,_donkFlopOpp), turn = Pct(_donkTurnNum,_donkTurnOpp), river = Pct(_donkRiverNum,_donkRiverOpp), samples = new { flop = Sample(_donkFlopNum,_donkFlopOpp, SampleHands("Donk Bet:flop")), turn = Sample(_donkTurnNum,_donkTurnOpp, SampleHands("Donk Bet:turn")), river = Sample(_donkRiverNum,_donkRiverOpp, SampleHands("Donk Bet:river")) } },
                    new { stat = "Donk/Fold", flop = Pct(_donkFoldFlopNum,_donkFoldFlopOpp), turn = Pct(_donkFoldTurnNum,_donkFoldTurnOpp), river = Pct(_donkFoldRiverNum,_donkFoldRiverOpp), samples = new { flop = Sample(_donkFoldFlopNum,_donkFoldFlopOpp, SampleHands("Donk/Fold:flop")), turn = Sample(_donkFoldTurnNum,_donkFoldTurnOpp, SampleHands("Donk/Fold:turn")), river = Sample(_donkFoldRiverNum,_donkFoldRiverOpp, SampleHands("Donk/Fold:river")) } },
                    new { stat = "Fold vs Donk", flop = Pct(_foldVsDonkFlopNum,_foldVsDonkFlopOpp), turn = Pct(_foldVsDonkTurnNum,_foldVsDonkTurnOpp), river = 0, samples = new { flop = Sample(_foldVsDonkFlopNum,_foldVsDonkFlopOpp, SampleHands("Fold vs Donk:flop")), turn = Sample(_foldVsDonkTurnNum,_foldVsDonkTurnOpp, SampleHands("Fold vs Donk:turn")), river = Sample(0,0) } },
                    new { stat = "Raise vs Donk", flop = Pct(_raiseVsDonkFlopNum,_foldVsDonkFlopOpp), turn = Pct(_raiseVsDonkTurnNum,_foldVsDonkTurnOpp), river = 0, samples = new { flop = Sample(_raiseVsDonkFlopNum,_foldVsDonkFlopOpp, SampleHands("Raise vs Donk:flop")), turn = Sample(_raiseVsDonkTurnNum,_foldVsDonkTurnOpp, SampleHands("Raise vs Donk:turn")), river = Sample(0,0) } }
                },
                vsCbetFlop = new object[]
                {
                    new
                    {
                        stat = "Raised Pot",
                        fold = Pct(_vsCbetRaisedFold,_vsCbetRaisedFold + _vsCbetRaisedCall + _vsCbetRaisedRaise),
                        call = Pct(_vsCbetRaisedCall,_vsCbetRaisedFold + _vsCbetRaisedCall + _vsCbetRaisedRaise),
                        raise = Pct(_vsCbetRaisedRaise,_vsCbetRaisedFold + _vsCbetRaisedCall + _vsCbetRaisedRaise),
                        samples = new
                        {
                            fold = Sample(_vsCbetRaisedFold,_vsCbetRaisedFold + _vsCbetRaisedCall + _vsCbetRaisedRaise, SampleHands("vsCbetFlop:Raised Pot:fold")),
                            call = Sample(_vsCbetRaisedCall,_vsCbetRaisedFold + _vsCbetRaisedCall + _vsCbetRaisedRaise, SampleHands("vsCbetFlop:Raised Pot:call")),
                            raise = Sample(_vsCbetRaisedRaise,_vsCbetRaisedFold + _vsCbetRaisedCall + _vsCbetRaisedRaise, SampleHands("vsCbetFlop:Raised Pot:raise"))
                        }
                    },
                    new
                    {
                        stat = "3-Bet Pot",
                        fold = Pct(_vsCbet3BetFold,_vsCbet3BetFold + _vsCbet3BetCall + _vsCbet3BetRaise),
                        call = Pct(_vsCbet3BetCall,_vsCbet3BetFold + _vsCbet3BetCall + _vsCbet3BetRaise),
                        raise = Pct(_vsCbet3BetRaise,_vsCbet3BetFold + _vsCbet3BetCall + _vsCbet3BetRaise),
                        samples = new
                        {
                            fold = Sample(_vsCbet3BetFold,_vsCbet3BetFold + _vsCbet3BetCall + _vsCbet3BetRaise, SampleHands("vsCbetFlop:3-Bet Pot:fold")),
                            call = Sample(_vsCbet3BetCall,_vsCbet3BetFold + _vsCbet3BetCall + _vsCbet3BetRaise, SampleHands("vsCbetFlop:3-Bet Pot:call")),
                            raise = Sample(_vsCbet3BetRaise,_vsCbet3BetFold + _vsCbet3BetCall + _vsCbet3BetRaise, SampleHands("vsCbetFlop:3-Bet Pot:raise"))
                        }
                    }
                },
                missedCbet = new
                {
                    missed_cbet = Pct(_missedCbetNum,_missedCbetOpp),
                    ip = Pct(_missedCbetIpNum,_missedCbetIpOpp),
                    ip_fold = Pct(_missedCbetIpFoldNum,_missedCbetIpFoldOpp),
                    oop = Pct(_missedCbetOopNum,_missedCbetOopOpp),
                    oop_fold = Pct(_missedCbetOopFoldNum,_missedCbetOopFoldOpp),
                    samples = new
                    {
                        missed_cbet = Sample(_missedCbetNum,_missedCbetOpp, SampleHands("missedCbet:missed_cbet")),
                        ip = Sample(_missedCbetIpNum,_missedCbetIpOpp, SampleHands("missedCbet:ip")),
                        ip_fold = Sample(_missedCbetIpFoldNum,_missedCbetIpFoldOpp, SampleHands("missedCbet:ip_fold")),
                        oop = Sample(_missedCbetOopNum,_missedCbetOopOpp, SampleHands("missedCbet:oop")),
                        oop_fold = Sample(_missedCbetOopFoldNum,_missedCbetOopFoldOpp, SampleHands("missedCbet:oop_fold"))
                    }
                },
                vsMissedCbet = new
                {
                    total = Pct(_vsMissedCbetNum,_vsMissedCbetOpp),
                    bet_ip = Pct(_vsMissedCbetBetIpNum,_vsMissedCbetBetIpOpp),
                    check_fold_ip = Pct(_vsMissedCbetCheckFoldIpNum,_vsMissedCbetCheckFoldIpOpp),
                    bet_oop_turn = Pct(_vsMissedCbetBetOopTurnNum,_vsMissedCbetBetOopTurnOpp),
                    check_fold_oop = Pct(_vsMissedCbetCheckFoldOopNum,_vsMissedCbetCheckFoldOopOpp),
                    samples = new
                    {
                        total = Sample(_vsMissedCbetNum,_vsMissedCbetOpp, SampleHands("vsMissedCbet:total")),
                        bet_ip = Sample(_vsMissedCbetBetIpNum,_vsMissedCbetBetIpOpp, SampleHands("vsMissedCbet:bet_ip")),
                        check_fold_ip = Sample(_vsMissedCbetCheckFoldIpNum,_vsMissedCbetCheckFoldIpOpp, SampleHands("vsMissedCbet:check_fold_ip")),
                        bet_oop_turn = Sample(_vsMissedCbetBetOopTurnNum,_vsMissedCbetBetOopTurnOpp, SampleHands("vsMissedCbet:bet_oop_turn")),
                        check_fold_oop = Sample(_vsMissedCbetCheckFoldOopNum,_vsMissedCbetCheckFoldOopOpp, SampleHands("vsMissedCbet:check_fold_oop"))
                    }
                },
                river = new
                {
                    bet_total = Pct(_riverBetNum,_riverBetOpp),
                    bet_ip = Pct(_riverBetIpNum,_riverBetIpOpp),
                    bet_oop = Pct(_riverBetOopNum,_riverBetOopOpp),
                    bet_hu_sb = Pct(_riverBetHuSbNum,_riverBetHuSbOpp),
                    bet_hu_bb = Pct(_riverBetHuBbNum,_riverBetHuBbOpp),
                    bet_wsd_total = Pct(_riverBetWonShowdown,_riverBetShowdown),
                    bet_wsd_ip = Pct(_riverBetIpWonShowdown,_riverBetIpShowdown),
                    bet_wsd_oop = Pct(_riverBetOopWonShowdown,_riverBetOopShowdown),
                    bet_wsd_hu_sb = Pct(_riverBetHuSbWonShowdown,_riverBetHuSbShowdown),
                    bet_wsd_hu_bb = Pct(_riverBetHuBbWonShowdown,_riverBetHuBbShowdown),
                    vs_bet_call_total = Pct(_vsRiverBetCallNum,_vsRiverBetCallOpp),
                    vs_bet_fold_total = Pct(_vsRiverBetFoldNum,_vsRiverBetCallOpp),
                    vs_bet_call_ip = Pct(_vsRiverBetIpCall,_vsRiverBetIpOpp),
                    vs_bet_fold_ip = Pct(_vsRiverBetIpFold,_vsRiverBetIpOpp),
                    vs_bet_call_oop = Pct(_vsRiverBetOopCall,_vsRiverBetOopOpp),
                    vs_bet_fold_oop = Pct(_vsRiverBetOopFold,_vsRiverBetOopOpp),
                    vs_bet_call_hu_sb = Pct(_vsRiverBetHuSbCall,_vsRiverBetHuSbOpp),
                    vs_bet_fold_hu_sb = Pct(_vsRiverBetHuSbFold,_vsRiverBetHuSbOpp),
                    vs_bet_call_hu_bb = Pct(_vsRiverBetHuBbCall,_vsRiverBetHuBbOpp),
                    vs_bet_fold_hu_bb = Pct(_vsRiverBetHuBbFold,_vsRiverBetHuBbOpp),
                    samples = new
                    {
                        bet_total = Sample(_riverBetNum,_riverBetOpp, SampleHands("Bet River:total")),
                        bet_ip = Sample(_riverBetIpNum,_riverBetIpOpp, SampleHands("Bet River:ip")),
                        bet_oop = Sample(_riverBetOopNum,_riverBetOopOpp, SampleHands("Bet River:oop")),
                        bet_hu_sb = Sample(_riverBetHuSbNum,_riverBetHuSbOpp, SampleHands("Bet River:hu_sb")),
                        bet_hu_bb = Sample(_riverBetHuBbNum,_riverBetHuBbOpp, SampleHands("Bet River:hu_bb")),
                        bet_wsd_total = Sample(_riverBetWonShowdown,_riverBetShowdown, SampleHands("Bet River:total")),
                        bet_wsd_ip = Sample(_riverBetIpWonShowdown,_riverBetIpShowdown, SampleHands("Bet River:ip")),
                        bet_wsd_oop = Sample(_riverBetOopWonShowdown,_riverBetOopShowdown, SampleHands("Bet River:oop")),
                        bet_wsd_hu_sb = Sample(_riverBetHuSbWonShowdown,_riverBetHuSbShowdown, SampleHands("Bet River:hu_sb")),
                        bet_wsd_hu_bb = Sample(_riverBetHuBbWonShowdown,_riverBetHuBbShowdown, SampleHands("Bet River:hu_bb")),
                        vs_bet_call_total = Sample(_vsRiverBetCallNum,_vsRiverBetCallOpp, SampleHands("vs Bet River:call")),
                        vs_bet_fold_total = Sample(_vsRiverBetFoldNum,_vsRiverBetCallOpp, SampleHands("vs Bet River:fold")),
                        vs_bet_call_ip = Sample(_vsRiverBetIpCall,_vsRiverBetIpOpp, SampleHands("vs Bet River:ip_call")),
                        vs_bet_fold_ip = Sample(_vsRiverBetIpFold,_vsRiverBetIpOpp, SampleHands("vs Bet River:ip_fold")),
                        vs_bet_call_oop = Sample(_vsRiverBetOopCall,_vsRiverBetOopOpp, SampleHands("vs Bet River:oop_call")),
                        vs_bet_fold_oop = Sample(_vsRiverBetOopFold,_vsRiverBetOopOpp, SampleHands("vs Bet River:oop_fold")),
                        vs_bet_call_hu_sb = Sample(_vsRiverBetHuSbCall,_vsRiverBetHuSbOpp, SampleHands("vs Bet River:hu_sb_call")),
                        vs_bet_fold_hu_sb = Sample(_vsRiverBetHuSbFold,_vsRiverBetHuSbOpp, SampleHands("vs Bet River:hu_sb_fold")),
                        vs_bet_call_hu_bb = Sample(_vsRiverBetHuBbCall,_vsRiverBetHuBbOpp, SampleHands("vs Bet River:hu_bb_call")),
                        vs_bet_fold_hu_bb = Sample(_vsRiverBetHuBbFold,_vsRiverBetHuBbOpp, SampleHands("vs Bet River:hu_bb_fold"))
                    }
                },
                showdown = new
                {
                    wtsd = Pct(_wtsdNum,_wtsdDenom),
                    wsd = Pct(_wsdNum,_wtsdNum),
                    wwsf = Pct(_wwsfNum,_wwsfDenom),
                    samples = new
                    {
                        wtsd = Sample(_wtsdNum,_wtsdDenom, SampleHands("showdown:wtsd")),
                        wsd = Sample(_wsdNum,_wtsdNum, SampleHands("showdown:wsd")),
                        wwsf = Sample(_wwsfNum,_wwsfDenom, SampleHands("showdown:wwsf"))
                    }
                }
            };
        }

        private sealed class Counter
        {
            public int Hands;
            public int OpenRaiseOpp, LimpOpp, CallOpenOpp, ThreeBetOpp, FourBetOpp;
            public int VpipNum, PfrNum, OpenRaiseNum, LimpNum, CallOpenNum, ThreeBetNum, FourBetNum;
            public int OpenRaise2xNum, OpenRaise2xPlusNum, OpenRaise2xExactNum, OpenRaise25xNum, OpenRaise3xNum, OpenRaise35xPlusNum;
            public int FacingRaiseOpp, FacingLimpOpp, FoldVsRaiseNum, CallVsRaiseNum, FacingOpenShoveOpp;
            public int Facing2xOpp, Facing2xPlusOpp, Facing2xExactOpp, Facing25xOpp, Facing3xOpp, Facing35xPlusOpp;
            public int FoldVs2xNum, FoldVs2xPlusNum, FoldVs25xNum, FoldVs3xNum, FoldVs35xPlusNum;
            public int CallVs2xNum, CallVs2xPlusNum, CallVs25xNum, CallVs3xNum, CallVs35xPlusNum;
            public int ThreeBetNonAllInNum, ThreeBetShoveNum;
            public int FoldTo3BetNum, FoldTo3BetOpp, FoldTo4BetNum, FoldTo4BetOpp;
            public int FoldTo3BetNonAllInNum, FoldTo3BetNonAllInOpp, FoldTo3BetShoveNum, FoldTo3BetShoveOpp;
            public int SqueezeNum, SqueezeOpp, FiveBetNum, FiveBetOpp, Call4BetNum, Call4BetOpp, LimpFoldNum, LimpFoldOpp, FourBetFoldNum, FourBetFoldOpp;
            public int LimpFacedRaiseOpp, LimpFoldVsNonAllInNum, LimpFoldVsNonAllInOpp, LimpFoldVsAllInNum, LimpFoldVsAllInOpp, LimpRaiseNum;
            public int IsoRaiseNum, IsoNonAllInNum, IsoAllInNum;
            private readonly Dictionary<string, List<StatHandSample>> _sampleHands = new(StringComparer.OrdinalIgnoreCase);

            public void Record(string stat, DetailedHandRow h)
            {
                if (!_sampleHands.TryGetValue(stat, out var hands))
                {
                    hands = new List<StatHandSample>();
                    _sampleHands[stat] = hands;
                }

                if (hands.Count < MaxSampleHands)
                {
                    hands.Add(StatHandSample.From(h));
                }
            }

            public IReadOnlyList<StatHandSample> SampleHands(string stat) =>
                _sampleHands.TryGetValue(stat, out var hands) ? hands : Array.Empty<StatHandSample>();

            public void MergeSamples(Counter other)
            {
                foreach (var (stat, sourceHands) in other._sampleHands)
                {
                    if (!_sampleHands.TryGetValue(stat, out var hands))
                    {
                        hands = new List<StatHandSample>();
                        _sampleHands[stat] = hands;
                    }

                    foreach (var hand in sourceHands)
                    {
                        if (hands.Count >= MaxSampleHands) break;
                        hands.Add(hand);
                    }
                }
            }
        }
        private sealed class StackBucketCounter
        {
            public string Stack { get; set; } = "";
            public string Position { get; set; } = "";
            public int Opp, FacingShove, OpenShoveOpp, IsoShoveOpp, RejamOpp, OpenShove, IsoShove, CallShove, Rejam, FoldVsShove;
            private readonly Dictionary<string, List<StatHandSample>> _sampleHands = new(StringComparer.OrdinalIgnoreCase);

            public void Record(string stat, DetailedHandRow h)
            {
                if (!_sampleHands.TryGetValue(stat, out var hands))
                {
                    hands = new List<StatHandSample>();
                    _sampleHands[stat] = hands;
                }

                if (hands.Count < MaxSampleHands)
                {
                    hands.Add(StatHandSample.From(h));
                }
            }

            public IReadOnlyList<StatHandSample> SampleHands(string stat) =>
                _sampleHands.TryGetValue(stat, out var hands) ? hands : Array.Empty<StatHandSample>();
        }
        private sealed class StreetCounter { public int Bets, Raises, Calls, Folds, Checks; }
        private sealed record ActionRow(string Name, string Act, bool IsAllIn, double? Amount, double? AmountTo);

        private sealed class StatHandSample
        {
            public string Id { get; set; } = "";
            public string HandId { get; set; } = "";
            public string PlayerName { get; set; } = "";
            public string Position { get; set; } = "";
            public string Cards { get; set; } = "";
            public string FlopCards { get; set; } = "";
            public string TurnCard { get; set; } = "";
            public string RiverCard { get; set; } = "";
            public string Preflop { get; set; } = "";
            public string Flop { get; set; } = "";
            public string Turn { get; set; } = "";
            public string River { get; set; } = "";
            public string DateTime { get; set; } = "";
            public string Room { get; set; } = "";
            public double BuyIn { get; set; }
            public double NetProfit { get; set; }

            public static StatHandSample From(DetailedHandRow h) => new()
            {
                Id = h.Id,
                HandId = h.HandId,
                PlayerName = h.PlayerName,
                Position = h.Position,
                Cards = h.Cards,
                FlopCards = h.FlopCards,
                TurnCard = h.TurnCard,
                RiverCard = h.RiverCard,
                Preflop = h.Preflop,
                Flop = h.Flop,
                Turn = h.Turn,
                River = h.River,
                DateTime = h.DateTime,
                Room = h.Room,
                BuyIn = h.BuyIn,
                NetProfit = h.NetProfit
            };
        }
    }

    private class HandData
    {
        public string date { get; set; } = "";
        public double profit { get; set; }
        public double chips_won_showdown { get; set; }
        public double chips_won_no_showdown { get; set; }
        public double cumulative { get; set; }
        public string? game_id { get; set; }
        public double buy_in { get; set; }
        public double prize_pool { get; set; }
        public int player_count { get; set; }
        public double hand_profit { get; set; }
        public int multiplier { get; set; }
        public int position { get; set; }
        public double rake_per_player { get; set; }
    }

    public async Task<List<double>> GetUniqueBuyInsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT DISTINCT buy_in FROM hands WHERE buy_in > 0 AND player_count <= 3 ORDER BY buy_in ASC";
        var buyIns = new List<double>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            buyIns.Add(reader.GetDouble(0));
        }
        return buyIns;
    }

    public async Task<object> GetDashboardRawAsync(int sampleLimit = 50)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var joinClause = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        var profitCol = "ph.net_profit";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                h.buy_in, 
                h.prize_pool, 
                SUM({profitCol}) as chip_profit,
                MAX(h.player_count) as max_players,
                MAX(h.multiplier) as multiplier,
                MAX(h.position) as position,
                MAX(COALESCE(h.rake_per_player, 0)) as rake_per_player
            FROM hands h
            {joinClause}
            WHERE h.player_count <= 3
            GROUP BY h.game_id";

        double totalProfit = 0;
        int totalTournaments = 0;
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                double b = reader.IsDBNull(0) ? 0 : reader.GetDouble(0);
                double p = reader.IsDBNull(1) ? 0 : reader.GetDouble(1);
                double cp = reader.IsDBNull(2) ? 0 : reader.GetDouble(2);
                int pc = reader.IsDBNull(3) ? 3 : reader.GetInt32(3);
                int m = reader.IsDBNull(4) ? 0 : reader.GetInt32(4);
                int pos = reader.IsDBNull(5) ? 0 : reader.GetInt32(5);
                double r = reader.IsDBNull(6) ? 0 : reader.GetDouble(6);
                double totalCost = b + r;

                if (p > 0 || m > 0)
                {
                    bool hasSharing = (totalCost > 0 && (p / totalCost) >= 19.5) || m >= 20;
                    double totalPrize = (p > (m * totalCost * 0.5)) ? p : (totalCost * m);
                    int finishPos = pos != 0 ? pos : (cp > 0 ? 1 : (pc == 2 ? 2 : 3));

                    double winAmount = 0;
                    if (finishPos == 1) winAmount = hasSharing ? (totalPrize * 0.75) : totalPrize;
                    else if (hasSharing) winAmount = (finishPos == 2) ? (totalPrize * 0.15) : (totalPrize * 0.10);

                    totalProfit += (winAmount - totalCost);
                }
                else
                {
                    totalProfit += cp;
                }
                totalTournaments++;
            }
        }

        using var countHandsCmd = connection.CreateCommand();
        countHandsCmd.CommandText = "SELECT COUNT(*) FROM hands WHERE player_count <= 3";
        int totalHands = Convert.ToInt32(await countHandsCmd.ExecuteScalarAsync());

        using var sampleCmd = connection.CreateCommand();
        sampleCmd.CommandText = $@"
            SELECT h.id, h.date_time, ph.net_profit, h.buy_in, h.prize_pool, h.total_pot, h.result 
            FROM hands h
            JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)
            WHERE h.player_count <= 3
            ORDER BY h.date_time DESC 
            LIMIT {sampleLimit}";

        var samples = new List<object>();
        using (var sReader = await sampleCmd.ExecuteReaderAsync())
        {
            while (await sReader.ReadAsync())
            {
                samples.Add(new
                {
                    id = sReader.IsDBNull(0) ? null : sReader.GetString(0),
                    date_time = sReader.IsDBNull(1) ? null : sReader.GetString(1),
                    hero_profit = sReader.IsDBNull(2) ? 0.0 : sReader.GetDouble(2),
                    buy_in = sReader.IsDBNull(3) ? 0.0 : sReader.GetDouble(3),
                    prize_pool = sReader.IsDBNull(4) ? 0.0 : sReader.GetDouble(4),
                    total_pot = sReader.IsDBNull(5) ? 0.0 : sReader.GetDouble(5),
                    result = sReader.IsDBNull(6) ? null : sReader.GetString(6)
                });
            }
        }

        return new { totalProfit, totalHands, samples };
    }
}
