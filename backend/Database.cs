using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Text.Json;

namespace PokerTrackerBackend;

public class Database
{
    private readonly string _connectionString;
    private readonly ILogger<Database> _logger;

    public Database(ILogger<Database> logger)
    {
        _logger = logger;
        // Use database at project root (one level up from backend folder)
        var backendDir = Directory.GetCurrentDirectory();
        var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
        var dbPath = Path.Combine(projectRoot, "poker_tracker.db");
        _connectionString = $"Data Source={dbPath}";
        _logger.LogInformation($"Using database at: {dbPath}");
        InitializeTables();
        UpdateSchema();
    }

    private void UpdateSchema()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();

        var columnsToAdd = new Dictionary<string, string>
        {
            { "hero_investment", "REAL DEFAULT 0" },
            { "hero_profit", "REAL DEFAULT 0" },
            { "hero_net_profit", "REAL DEFAULT 0" },
            { "hero_all_in", "BOOLEAN DEFAULT 0" },
            { "villain_all_in", "BOOLEAN DEFAULT 0" },
            { "all_in_street", "TEXT" },
            { "went_to_showdown", "BOOLEAN DEFAULT 0" }
        };

        foreach (var col in columnsToAdd)
        {
            try
            {
                using var cmd = connection.CreateCommand();
                cmd.CommandText = $"ALTER TABLE hands ADD COLUMN {col.Key} {col.Value}";
                cmd.ExecuteNonQuery();
                _logger.LogInformation($"Added missing column: {col.Key}");
            }
            catch (SqliteException ex) when (ex.Message.Contains("duplicate column name"))
            {
                // Column already exists, ignore
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Failed to add column {col.Key}: {ex.Message}");
            }
        }
    }

    private void InitializeTables()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();

        using var cmd = connection.CreateCommand();
        
        // Config table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )";
        cmd.ExecuteNonQuery();

        // Sessions table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                room TEXT NOT NULL,
                game_type TEXT NOT NULL,
                hands_played INTEGER DEFAULT 0,
                profit REAL DEFAULT 0,
                ev_profit REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )";
        cmd.ExecuteNonQuery();

        // Hands table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS hands (
                id TEXT PRIMARY KEY,
                session_id INTEGER,
                game_id TEXT,
                hand_id TEXT,
                room TEXT,
                game_mode TEXT,
                game_type TEXT,
                game_name TEXT,
                prize_pool REAL,
                multiplier INTEGER,
                buy_in REAL,
                date_time TEXT,
                table_id TEXT,
                blinds TEXT,
                total_pot REAL,
                rake REAL,
                hero_position TEXT,
                hero_stack INTEGER,
                hero_cards TEXT,
                villain_position TEXT,
                villain_stack INTEGER,
                villain_cards TEXT,
                preflop_action TEXT,
                flop TEXT,
                flop_action TEXT,
                turn TEXT,
                turn_action TEXT,
                river TEXT,
                river_action TEXT,
                showdown TEXT,
                result TEXT,
                hero_investment REAL DEFAULT 0,
                hero_profit REAL DEFAULT 0,
                hero_net_profit REAL DEFAULT 0,
                hero_all_in BOOLEAN DEFAULT 0,
                villain_all_in BOOLEAN DEFAULT 0,
                all_in_street TEXT,
                went_to_showdown BOOLEAN DEFAULT 0,
                leak_detected TEXT,
                error_type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )";
        cmd.ExecuteNonQuery();

        // Hands analytics table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS hands_analytics (
                hand_id TEXT PRIMARY KEY,
                ev_chips REAL,
                net_won_adjusted REAL,
                equity_preflop REAL,
                equity_flop REAL,
                equity_turn REAL,
                equity_river REAL,
                chips_won_showdown REAL,
                chips_won_no_showdown REAL,
                cev_contribution REAL,
                calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hand_id) REFERENCES hands(id)
            )";
        cmd.ExecuteNonQuery();

        // Players table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                total_hands INTEGER DEFAULT 0,
                total_profit REAL DEFAULT 0,
                total_ev_profit REAL DEFAULT 0,
                vpip REAL DEFAULT 0,
                pfr REAL DEFAULT 0,
                three_bet REAL DEFAULT 0,
                cbet REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )";
        cmd.ExecuteNonQuery();

        // Leaks table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS leaks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hand_id TEXT,
                player_id INTEGER,
                leak_type TEXT,
                severity TEXT,
                description TEXT,
                expected_action TEXT,
                actual_action TEXT,
                ev_loss REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hand_id) REFERENCES hands(id),
                FOREIGN KEY (player_id) REFERENCES players(id)
            )";
        cmd.ExecuteNonQuery();

        // Indexes
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_hands_session ON hands(session_id)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_hands_hero_position ON hands(hero_position)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_hands_game_id ON hands(game_id)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_leaks_hand ON leaks(hand_id)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_leaks_player ON leaks(player_id)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_analytics_hand ON hands_analytics(hand_id)";
        cmd.ExecuteNonQuery();
    }

    public async Task<int> InsertHandsBatchAsync(List<ParsedHand> hands)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;
            cmd.CommandText = @"
                INSERT OR REPLACE INTO hands (
                    id, game_id, hand_id, room, game_mode, game_type, game_name,
                    prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                    total_pot, rake, hero_position, hero_stack, hero_cards,
                    villain_position, villain_stack, villain_cards, preflop_action,
                    flop, flop_action, turn, turn_action, river, river_action,
                    showdown, result, hero_investment, hero_profit, hero_net_profit, hero_all_in, villain_all_in, all_in_street, went_to_showdown
                ) VALUES (
                    @id, @game_id, @hand_id, @room, @game_mode, @game_type, @game_name,
                    @prize_pool, @multiplier, @buy_in, @date_time, @table_id, @blinds,
                    @total_pot, @rake, @hero_position, @hero_stack, @hero_cards,
                    @villain_position, @villain_stack, @villain_cards, @preflop_action,
                    @flop, @flop_action, @turn, @turn_action, @river, @river_action,
                    @showdown, @result, @hero_investment, @hero_profit, @hero_net_profit, @hero_all_in, @villain_all_in, @all_in_street, @went_to_showdown
                )";

            foreach (var hand in hands)
            {
                try 
                {
                    cmd.Parameters.Clear();
                    cmd.Parameters.AddWithValue("@id", hand.Id ?? "");
                    cmd.Parameters.AddWithValue("@game_id", hand.GameId ?? "");
                    cmd.Parameters.AddWithValue("@hand_id", hand.HandId ?? "");
                    cmd.Parameters.AddWithValue("@room", hand.Room ?? "");
                    cmd.Parameters.AddWithValue("@game_mode", hand.GameMode ?? "");
                    cmd.Parameters.AddWithValue("@game_type", hand.GameType ?? "");
                    cmd.Parameters.AddWithValue("@game_name", hand.GameName ?? "");
                    cmd.Parameters.AddWithValue("@prize_pool", hand.PrizePool);
                    cmd.Parameters.AddWithValue("@multiplier", hand.Multiplier);
                    cmd.Parameters.AddWithValue("@buy_in", hand.BuyIn);
                    cmd.Parameters.AddWithValue("@date_time", hand.DateTime ?? "");
                    cmd.Parameters.AddWithValue("@table_id", hand.TableId ?? "");
                    cmd.Parameters.AddWithValue("@blinds", hand.Blinds ?? "");
                    cmd.Parameters.AddWithValue("@total_pot", hand.TotalPot);
                    cmd.Parameters.AddWithValue("@rake", hand.Rake);
                    cmd.Parameters.AddWithValue("@hero_position", hand.HeroPosition ?? "");
                    cmd.Parameters.AddWithValue("@hero_stack", hand.HeroStack);
                    cmd.Parameters.AddWithValue("@hero_cards", hand.HeroCards ?? "");
                    cmd.Parameters.AddWithValue("@villain_position", hand.VillainPosition ?? "");
                    cmd.Parameters.AddWithValue("@villain_stack", hand.VillainStack);
                    cmd.Parameters.AddWithValue("@villain_cards", hand.VillainCards ?? "");
                    cmd.Parameters.AddWithValue("@preflop_action", hand.PreflopAction ?? "");
                    cmd.Parameters.AddWithValue("@flop", hand.Flop ?? "");
                    cmd.Parameters.AddWithValue("@flop_action", hand.FlopAction ?? "");
                    cmd.Parameters.AddWithValue("@turn", hand.Turn ?? "");
                    cmd.Parameters.AddWithValue("@turn_action", hand.TurnAction ?? "");
                    cmd.Parameters.AddWithValue("@river", hand.River ?? "");
                    cmd.Parameters.AddWithValue("@river_action", hand.RiverAction ?? "");
                    cmd.Parameters.AddWithValue("@showdown", hand.Showdown ?? "");
                    cmd.Parameters.AddWithValue("@result", hand.Result ?? "");
                    cmd.Parameters.AddWithValue("@hero_investment", hand.HeroInvestment);
                    cmd.Parameters.AddWithValue("@hero_profit", hand.HeroProfit);
                    cmd.Parameters.AddWithValue("@hero_net_profit", hand.HeroNetProfit);
                    cmd.Parameters.AddWithValue("@hero_all_in", hand.HeroAllIn ? 1 : 0);
                    cmd.Parameters.AddWithValue("@villain_all_in", hand.VillainAllIn ? 1 : 0);
                    cmd.Parameters.AddWithValue("@all_in_street", hand.AllInStreet ?? "");
                    cmd.Parameters.AddWithValue("@went_to_showdown", hand.WentToShowdown ? 1 : 0);

                    await cmd.ExecuteNonQueryAsync();
                    inserted++;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Failed to insert hand {hand.Id}: {ex.Message}");
                    throw;
                }
            }

            await transaction.CommitAsync();
            return inserted;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<int> InsertAnalyticsBatchAsync(HandAnalytics[] analytics)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;
            cmd.CommandText = @"
                INSERT OR REPLACE INTO hands_analytics (
                    hand_id, ev_chips, net_won_adjusted, equity_preflop, equity_flop,
                    equity_turn, equity_river, chips_won_showdown, chips_won_no_showdown, cev_contribution
                ) VALUES (
                    @hand_id, @ev_chips, @net_won_adjusted, @equity_preflop, @equity_flop,
                    @equity_turn, @equity_river, @chips_won_showdown, @chips_won_no_showdown, @cev_contribution
                )";

            foreach (var analytic in analytics)
            {
                cmd.Parameters.Clear();
                cmd.Parameters.AddWithValue("@hand_id", analytic.HandId ?? "");
                cmd.Parameters.AddWithValue("@ev_chips", analytic.EvChips.HasValue ? (object)analytic.EvChips.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@net_won_adjusted", analytic.NetWonAdjusted.HasValue ? (object)analytic.NetWonAdjusted.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_preflop", analytic.EquityPreflop.HasValue ? (object)analytic.EquityPreflop.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_flop", analytic.EquityFlop.HasValue ? (object)analytic.EquityFlop.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_turn", analytic.EquityTurn.HasValue ? (object)analytic.EquityTurn.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_river", analytic.EquityRiver.HasValue ? (object)analytic.EquityRiver.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@chips_won_showdown", analytic.ChipsWonShowdown.HasValue ? (object)analytic.ChipsWonShowdown.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@chips_won_no_showdown", analytic.ChipsWonNoShowdown.HasValue ? (object)analytic.ChipsWonNoShowdown.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@cev_contribution", analytic.CevContribution.HasValue ? (object)analytic.CevContribution.Value : DBNull.Value);

                await cmd.ExecuteNonQueryAsync();
                inserted++;
            }

            await transaction.CommitAsync();
            return inserted;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<object> GetHandsAsync(HandsQueryOptions options)
    {
        _logger.LogInformation($"GetHandsAsync called with limit={options.Limit}, page={options.Page}");
        try
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();
            _logger.LogInformation("Database connection opened successfully");

            var whereClauses = new List<string>();
            var parameters = new List<SqliteParameter>();

            if (!string.IsNullOrEmpty(options.DateFrom))
            {
                whereClauses.Add("date_time >= @dateFrom");
                parameters.Add(new SqliteParameter("@dateFrom", options.DateFrom));
            }

            if (!string.IsNullOrEmpty(options.DateTo))
            {
                whereClauses.Add("date_time <= @dateTo");
                parameters.Add(new SqliteParameter("@dateTo", options.DateTo));
            }

            var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";
            _logger.LogInformation($"Built where clause: {whereClause}");

            // Get total count
            using var countCmd = connection.CreateCommand();
            countCmd.CommandText = $"SELECT COUNT(*) FROM hands {whereClause}";
            foreach (var param in parameters)
            {
                countCmd.Parameters.Add(new SqliteParameter(param.ParameterName, param.Value));
            }
            var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
            _logger.LogInformation($"Total hands count: {total}");

        // Get paginated hands
        var offset = (options.Page - 1) * options.Limit;
        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT h.*, a.ev_chips, a.equity_preflop, a.equity_flop, a.equity_turn, a.equity_river
            FROM hands h
            LEFT JOIN hands_analytics a ON h.id = a.hand_id
            {whereClause}
            ORDER BY h.date_time DESC
            LIMIT @limit OFFSET @offset";

        foreach (var param in parameters)
        {
            cmd.Parameters.Add(new SqliteParameter(param.ParameterName, param.Value));
        }
        cmd.Parameters.AddWithValue("@limit", options.Limit);
        cmd.Parameters.AddWithValue("@offset", offset);
        
        _logger.LogInformation($"Executing query to fetch {options.Limit} hands at offset {offset}");

        var hands = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        _logger.LogInformation("Query executed, reading results...");
        while (await reader.ReadAsync())
        {
            _logger.LogInformation("Reading hand from reader...");
            hands.Add(ReadHandFromReader(reader));
        }
        _logger.LogInformation($"Successfully read {hands.Count} hands");

        return new
        {
            hands,
            total,
            page = options.Page,
            limit = options.Limit,
            pages = (int)Math.Ceiling(total / (double)options.Limit)
        };
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error in GetHandsAsync: {ex.Message}\nStackTrace: {ex.StackTrace}");
            throw;
        }
    }

    public async Task<object?> GetHandByIdAsync(string handId)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT h.*, a.ev_chips, a.equity_preflop, a.equity_flop, a.equity_turn, a.equity_river
            FROM hands h
            LEFT JOIN hands_analytics a ON h.id = a.hand_id
            WHERE h.id = @handId";
        cmd.Parameters.AddWithValue("@handId", handId);

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return ReadHandFromReader(reader);
        }

        return null;
    }

    public async Task<object> GetDashboardStatsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT 
                COUNT(*) as total_hands,
                COALESCE(SUM(hero_profit), 0) as total_profit,
                COALESCE(AVG(hero_profit), 0) as avg_profit,
                COALESCE(SUM(a.ev_chips), 0) as total_ev
            FROM hands h
            LEFT JOIN hands_analytics a ON h.id = a.hand_id";

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new
            {
                total_hands = reader.GetInt32(0),
                total_profit = reader.GetDouble(1),
                avg_profit = reader.GetDouble(2),
                total_ev = reader.IsDBNull(3) ? 0.0 : reader.GetDouble(3)
            };
        }

        return new { total_hands = 0, total_profit = 0.0, avg_profit = 0.0, total_ev = 0.0 };
    }

    public async Task<List<object>> GetSessionHistoryAsync(int limit)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT 
                DATE(date_time) as session_date,
                COUNT(*) as hands_played,
                SUM(hero_profit) as profit
            FROM hands
            GROUP BY DATE(date_time)
            ORDER BY session_date DESC
            LIMIT @limit";
        cmd.Parameters.AddWithValue("@limit", limit);

        var sessions = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            sessions.Add(new
            {
                date = reader.GetString(0),
                hands_played = reader.GetInt32(1),
                profit = reader.GetDouble(2)
            });
        }

        return sessions;
    }

    public async Task<object> GetWinrateChartDataAsync(ChartQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
        var parameters = new List<SqliteParameter>();

        if (!string.IsNullOrEmpty(options.DateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
            parameters.Add(new SqliteParameter("@dateFrom", options.DateFrom));
        }

        if (!string.IsNullOrEmpty(options.DateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
            parameters.Add(new SqliteParameter("@dateTo", options.DateTo));
        }

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                h.date_time,
                SUM(h.hero_profit) OVER (ORDER BY h.date_time) as cumulative_profit,
                SUM(
                    COALESCE(
                        a.chips_won_showdown,
                        CASE 
                            WHEN (COALESCE(h.showdown,'') != '' 
                                  OR h.result LIKE '%*** SHOWDOWN ***%' 
                                  OR h.result LIKE '%shows [%' 
                                  OR h.result LIKE '%: [%'
                                  OR (h.hero_all_in = 1 AND h.villain_all_in = 1))
                            THEN h.hero_profit 
                            ELSE 0 
                        END
                    )
                ) OVER (ORDER BY h.date_time) as cumulative_showdown,
                SUM(
                    COALESCE(
                        a.chips_won_no_showdown,
                        CASE 
                            WHEN NOT (COALESCE(h.showdown,'') != '' 
                                      OR h.result LIKE '%*** SHOWDOWN ***%' 
                                      OR h.result LIKE '%shows [%' 
                                      OR h.result LIKE '%: [%'
                                      OR (h.hero_all_in = 1 AND h.villain_all_in = 1))
                            THEN h.hero_profit 
                            ELSE 0 
                        END
                    )
                ) OVER (ORDER BY h.date_time) as cumulative_no_showdown,
                SUM(COALESCE(a.net_won_adjusted, h.hero_profit)) OVER (ORDER BY h.date_time) as cumulative_ev,
                ROW_NUMBER() OVER (ORDER BY h.date_time) as hand_number
            FROM hands h
            LEFT JOIN hands_analytics a ON h.id = a.hand_id
            {whereClause}
            ORDER BY h.date_time";

        foreach (var param in parameters)
        {
            cmd.Parameters.Add(param);
        }

        var data = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            data.Add(new
            {
                date = reader.GetString(0),
                profit = reader.GetDouble(1), // cumulative_profit
                cumulative = reader.GetDouble(4), // cumulative_ev
                chips_won_showdown = reader.GetDouble(2), // cumulative_showdown
                chips_won_no_showdown = reader.GetDouble(3) // cumulative_no_showdown
            });
        }

        return data;
    }

    // Debug helper: return raw total profit and recent hands for inspection
    public async Task<object> GetDashboardRawAsync(int sampleLimit = 50)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"SELECT COALESCE(SUM(hero_profit), 0) as total_profit, COUNT(*) as total_hands FROM hands";

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
        sampleCmd.CommandText = $@"SELECT id, date_time, hero_profit, buy_in, prize_pool, total_pot, result FROM hands ORDER BY date_time DESC LIMIT {sampleLimit}";

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

    public async Task<object> GetRangeHeatmapAsync(RangeHeatmapFilters filters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT 
                hero_cards,
                COUNT(*) as count,
                SUM(hero_profit) as total_profit,
                AVG(hero_profit) as avg_profit
            FROM hands
            WHERE hero_cards IS NOT NULL AND hero_cards != ''
            GROUP BY hero_cards";

        var heatmapData = new Dictionary<string, object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var cards = reader.GetString(0);
            heatmapData[cards] = new
            {
                count = reader.GetInt32(1),
                total_profit = reader.GetDouble(2),
                avg_profit = reader.GetDouble(3)
            };
        }

        return heatmapData;
    }

    public async Task<object> GetPlayersOverviewAsync(PlayersQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var limitClause = options.Limit.HasValue ? $"LIMIT {options.Limit.Value}" : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT * FROM players
            ORDER BY total_hands DESC
            {limitClause}";

        var players = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            players.Add(new
            {
                id = reader.GetInt32(0),
                name = reader.GetString(1),
                total_hands = reader.GetInt32(2),
                total_profit = reader.GetDouble(3)
            });
        }

        return players;
    }

    public async Task<List<ParsedHand>> GetAllHandsForAnalysisAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT * FROM hands ORDER BY date_time";

        var hands = new List<ParsedHand>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            hands.Add(ReadParsedHandFromReader(reader));
        }

        return hands;
    }

    public async Task DeleteAllAnalyticsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM hands_analytics";
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<object> DeleteAllHandsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;

            cmd.CommandText = "DELETE FROM hands_analytics";
            await cmd.ExecuteNonQueryAsync();

            cmd.CommandText = "DELETE FROM hands";
            await cmd.ExecuteNonQueryAsync();

            cmd.CommandText = "DELETE FROM sessions";
            await cmd.ExecuteNonQueryAsync();

            await transaction.CommitAsync();
            return new { success = true, message = "All hands deleted" };
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private object ReadHandFromReader(SqliteDataReader reader)
    {
        try
        {
            _logger.LogInformation("Reading hand from reader...");
            var hand = new
            {
                id = reader.GetString(reader.GetOrdinal("id")),
                gameId = GetStringOrNull(reader, "game_id"),
                handId = GetStringOrNull(reader, "hand_id"),
                room = GetStringOrNull(reader, "room"),
                gameMode = GetStringOrNull(reader, "game_mode"),
                gameType = GetStringOrNull(reader, "game_type"),
                gameName = GetStringOrNull(reader, "game_name"),
                prizePool = GetDoubleOrNull(reader, "prize_pool"),
                multiplier = GetInt32OrNull(reader, "multiplier"),
                buyIn = GetDoubleOrNull(reader, "buy_in"),
                dateTime = GetStringOrNull(reader, "date_time"),
                tableId = GetStringOrNull(reader, "table_id"),
                blinds = GetStringOrNull(reader, "blinds"),
                totalPot = GetDoubleOrNull(reader, "total_pot"),
                rake = GetDoubleOrNull(reader, "rake"),
                heroPosition = GetStringOrNull(reader, "hero_position"),
                heroStack = GetInt32OrNull(reader, "hero_stack"),
                heroCards = GetStringOrNull(reader, "hero_cards"),
                villainPosition = GetStringOrNull(reader, "villain_position"),
                villainStack = GetInt32OrNull(reader, "villain_stack"),
                villainCards = GetStringOrNull(reader, "villain_cards"),
                preflopAction = GetStringOrNull(reader, "preflop_action"),
                flop = GetStringOrNull(reader, "flop"),
                flopAction = GetStringOrNull(reader, "flop_action"),
                turn = GetStringOrNull(reader, "turn"),
                turnAction = GetStringOrNull(reader, "turn_action"),
                river = GetStringOrNull(reader, "river"),
                riverAction = GetStringOrNull(reader, "river_action"),
                showdown = GetStringOrNull(reader, "showdown"),
                result = GetStringOrNull(reader, "result"),
                heroProfit = GetDoubleOrNull(reader, "hero_profit"),
                heroAllIn = GetBoolOrNull(reader, "hero_all_in"),
                villainAllIn = GetBoolOrNull(reader, "villain_all_in"),
                wentToShowdown = GetBoolOrNull(reader, "went_to_showdown"),
                evChips = GetDoubleOrNull(reader, "ev_chips"),
                equityPreflop = GetDoubleOrNull(reader, "equity_preflop"),
                equityFlop = GetDoubleOrNull(reader, "equity_flop"),
                equityTurn = GetDoubleOrNull(reader, "equity_turn"),
                equityRiver = GetDoubleOrNull(reader, "equity_river")
            };
            _logger.LogInformation($"Successfully read hand: {hand.id}");
            return hand;
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error in ReadHandFromReader: {ex.Message}\nStackTrace: {ex.StackTrace}");
            throw;
        }
    }

    private ParsedHand ReadParsedHandFromReader(SqliteDataReader reader)
    {
        return new ParsedHand
        {
            Id = reader.GetString(reader.GetOrdinal("id")),
            GameId = GetStringOrNull(reader, "game_id"),
            HandId = GetStringOrNull(reader, "hand_id"),
            Room = GetStringOrNull(reader, "room"),
            GameMode = GetStringOrNull(reader, "game_mode"),
            GameType = GetStringOrNull(reader, "game_type"),
            GameName = GetStringOrNull(reader, "game_name"),
            PrizePool = GetDoubleOrNull(reader, "prize_pool") ?? 0,
            Multiplier = GetInt32OrNull(reader, "multiplier") ?? 1,
            BuyIn = GetDoubleOrNull(reader, "buy_in") ?? 0,
            DateTime = GetStringOrNull(reader, "date_time"),
            TableId = GetStringOrNull(reader, "table_id"),
            Blinds = GetStringOrNull(reader, "blinds"),
            TotalPot = GetDoubleOrNull(reader, "total_pot") ?? 0,
            Rake = GetDoubleOrNull(reader, "rake") ?? 0,
            HeroPosition = GetStringOrNull(reader, "hero_position"),
            HeroStack = GetInt32OrNull(reader, "hero_stack") ?? 0,
            HeroCards = GetStringOrNull(reader, "hero_cards"),
            VillainPosition = GetStringOrNull(reader, "villain_position"),
            VillainStack = GetInt32OrNull(reader, "villain_stack") ?? 0,
            VillainCards = GetStringOrNull(reader, "villain_cards"),
            PreflopAction = GetStringOrNull(reader, "preflop_action") ?? "",
            Flop = GetStringOrNull(reader, "flop"),
            FlopAction = GetStringOrNull(reader, "flop_action") ?? "",
            Turn = GetStringOrNull(reader, "turn"),
            TurnAction = GetStringOrNull(reader, "turn_action") ?? "",
            River = GetStringOrNull(reader, "river"),
            RiverAction = GetStringOrNull(reader, "river_action") ?? "",
            Showdown = GetStringOrNull(reader, "showdown") ?? "",
            Result = GetStringOrNull(reader, "result") ?? "",
            HeroInvestment = GetDoubleOrNull(reader, "hero_investment") ?? 0,
            HeroProfit = GetDoubleOrNull(reader, "hero_profit") ?? 0,
            HeroNetProfit = GetDoubleOrNull(reader, "hero_net_profit") ?? 0,
            HeroAllIn = GetBoolOrNull(reader, "hero_all_in") ?? false,
            VillainAllIn = GetBoolOrNull(reader, "villain_all_in") ?? false,
            AllInStreet = GetStringOrNull(reader, "all_in_street"),
            WentToShowdown = GetBoolOrNull(reader, "went_to_showdown") ?? false
        };
    }

    private string? GetStringOrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Column '{columnName}' not found or error reading: {ex.Message}");
            return null;
        }
    }

    private double? GetDoubleOrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetDouble(ordinal);
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Column '{columnName}' not found or error reading: {ex.Message}");
            return null;
        }
    }

    private int? GetInt32OrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Column '{columnName}' not found or error reading: {ex.Message}");
            return null;
        }
    }

    private bool? GetBoolOrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal) == 1;
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Column '{columnName}' not found or error reading: {ex.Message}");
            return null;
        }
    }
}
