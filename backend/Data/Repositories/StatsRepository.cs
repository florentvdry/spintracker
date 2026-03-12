using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using SpinTrackerBackend;
using System;
using System.IO;
using System.Text.Json;

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
                    MAX(h.player_count) as max_players
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
                double tBuyIn = reader.IsDBNull(0) ? 0 : reader.GetDouble(0);
                double tPrizePool = reader.IsDBNull(1) ? 0 : reader.GetDouble(1);
                double tChipProfit = reader.IsDBNull(2) ? 0 : reader.GetDouble(2);
                int tLastPlayerCount = reader.IsDBNull(3) ? 3 : reader.GetInt32(3); // Approximation if null

                bool isITM = false;

                if (tPrizePool > 0)
                {
                    // Winner always ITM
                    if (tChipProfit > 0) 
                    {
                        isITM = true;
                    }
                    else
                    {
                        // Check for shared prize (Multiplier >= 20x typically)
                        // If pool/buyin >= 20, losers get a share
                        bool hasSharing = (tBuyIn > 0 && (tPrizePool / tBuyIn) >= 20);
                        if (hasSharing)
                        {
                            // In shared prize tournaments, 2nd and 3rd place get money.
                            // Since standard Spin is 3-handed:
                            // If I lost (chip profit <= 0), I am either 2nd or 3rd.
                            // Both get a prize in high multipliers.
                            isITM = true;
                        }
                    }
                }
                else
                {
                    // Fallback for non-tournament or unknown
                    if (tChipProfit > 0) isITM = true;
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
        try
        {
            using (var cmdPos = connection.CreateCommand())
            {
                cmdPos.CommandText = $@"
                    SELECT 
                        ph.position,
                        COALESCE(SUM(ph.net_won_adjusted), 0) as pos_ev,
                        h.player_count,
                        COUNT(*) as hand_count
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
                    var count = reader.GetInt32(3);
                    
                    var key = (playerCount == 2 ? "HU_" : "3W_") + pos;
                    cevByPosition[key] = ev;
                    countByPosition[key] = count;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error calculating position stats: {ex.Message}");
        }

        // 2. Calculate Euro Profit and Sessions using the session logic
        var sessions = await GetSessionsInternalAsync(null, heroName, dateFrom, dateTo, buyIn); 
        
        double totalProfitEuro = sessions.Sum(s => s.Profit);
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
            session_date = s.StartTime.ToString("yyyy-MM-dd HH:mm")
        }).ToList();
    }

    private record SessionInfo(DateTime StartTime, string Room, int Tournaments, int Hands, double Profit);

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
            SELECT h.date_time, h.room, h.game_id, h.buy_in, h.prize_pool, {profitCol}, h.player_count 
            FROM hands h 
            {joinClause}
            {whereClause}
            ORDER BY h.date_time ASC";
        
        var rawHands = new List<(DateTime t, string r, string g, double b, double p, double h_p, int pc)>();
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
                    reader.IsDBNull(6) ? 3 : reader.GetInt32(6)
                 ));
            }
        }

        // Group by sessions (hands within 2 hours are same session)
        var sessions = new List<SessionInfo>();
        var currentSession = new List<(DateTime t, string r, string g, double b, double p, double h_p, int pc)>();
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

    private SessionInfo CreateSessionInfo(List<(DateTime t, string r, string g, double b, double p, double h_p, int pc)> hands)
    {
        var startTime = hands.Min(h => h.t);
        var room = hands.First().r;
        var uniqueTournaments = hands.Select(h => h.g).Distinct().Count();
        var totalHands = hands.Count;
        
        // Calculate euro profit per game
        double totalProfitEuro = 0;
        var games = hands.GroupBy(h => h.g);
        foreach (var game in games)
        {
            var first = game.First();
            double chipProfit = game.Sum(h => h.h_p);
            double profit = 0;
            if (first.p > 0)
            {
                bool hasSharing = (first.b > 0 && (first.p / first.b) >= 20);
                if (chipProfit > 0)
                {
                    double winAmount = hasSharing ? (first.p * 0.75) : first.p;
                    profit = winAmount - first.b;
                }
                else
                {
                    if (hasSharing)
                    {
                        double consolation = (first.pc == 2) ? (first.p * 0.15) : (first.p * 0.10);
                        profit = consolation - first.b;
                    }
                    else
                    {
                        profit = -first.b;
                    }
                }
            }
            else
            {
                profit = chipProfit; // Fallback
            }
            totalProfitEuro += profit;
        }
        
        return new SessionInfo(startTime, room, uniqueTournaments, totalHands, totalProfitEuro);
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
            parameters.Add(new SqliteParameter("@dateFrom", options.DateFrom + " 00:00:00"));
        }

        if (!string.IsNullOrEmpty(options.DateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
            parameters.Add(new SqliteParameter("@dateTo", options.DateTo + " 23:59:59"));
        }

        if (options.BuyIn.HasValue)
        {
            whereClauses.Add("h.buy_in = @buyIn");
            parameters.Add(new SqliteParameter("@buyIn", options.BuyIn.Value));
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
                {profitCol} as hand_profit
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
                hand_profit = reader.GetDouble(9)
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
            double chipProfit = 0;
            foreach (var h in game) chipProfit += h.hand_profit;

            double profit = 0;
            if (first.prize_pool > 0)
            {
                bool hasSharing = (first.buy_in > 0 && (first.prize_pool / first.buy_in) >= 20);
                if (chipProfit > 0)
                {
                    double winAmount = hasSharing ? (first.prize_pool * 0.75) : first.prize_pool;
                    profit = winAmount - first.buy_in;
                }
                else
                {
                    if (hasSharing)
                    {
                        double consolation = (last.player_count == 2) ? (first.prize_pool * 0.15) : (first.prize_pool * 0.10);
                        profit = consolation - first.buy_in;
                    }
                    else
                    {
                        profit = -first.buy_in;
                    }
                }
            }
            else
            {
                // If prize_pool is 0, it might be a cash game or missing data
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

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT COALESCE(SUM(ph.net_profit), 0) as total_profit, COUNT(*) as total_hands 
            FROM hands h
            JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)
            WHERE h.player_count <= 3";

        double totalProfit = 0;
        int totalHands = 0;
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                totalProfit = reader.IsDBNull(0) ? 0.0 : reader.GetDouble(0);
                totalHands = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
            }
        }

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