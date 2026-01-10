using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Text.Json;

namespace SpinTrackerBackend;

public class Database
{
    private readonly string _connectionString;
    private readonly ILogger<Database> _logger;

    public Database(ILogger<Database> logger, string? dbPath = null)
    {
        _logger = logger;

        if (string.IsNullOrEmpty(dbPath))
        {
            // Use database at project root (one level up from backend folder)
            var backendDir = Directory.GetCurrentDirectory();
            var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
            dbPath = Path.Combine(projectRoot, "poker_tracker.db");
        }

        _connectionString = $"Data Source={dbPath}";
        _logger.LogInformation($"Using database at: {dbPath}");
        
        // Enable WAL mode and Foreign Keys
        using (var connection = new SqliteConnection(_connectionString))
        {
            connection.Open();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA temp_store = MEMORY;
                PRAGMA foreign_keys = ON;
            ";
            cmd.ExecuteNonQuery();
        }

        InitializeTables();
    }

    // --- HUD Profiles CRUD ---

    public async Task<List<Dictionary<string, object>>> GetHudProfilesAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var profiles = new List<Dictionary<string, object>>();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT id, name, layout, is_active, created_at, updated_at FROM hud_profiles ORDER BY name";

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var profile = new Dictionary<string, object>
            {
                ["id"] = reader.GetString(0),
                ["name"] = reader.GetString(1),
                ["layout"] = JsonSerializer.Deserialize<object>(reader.GetString(2)),
                ["isActive"] = reader.GetBoolean(3),
                ["createdAt"] = reader.GetDateTime(4),
                ["updatedAt"] = reader.GetDateTime(5)
            };
            profiles.Add(profile);
        }
        return profiles;
    }

    public async Task SaveHudProfileAsync(string id, string name, object layout, bool isActive)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        try
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;

            if (isActive)
            {
                // Deactivate others
                cmd.CommandText = "UPDATE hud_profiles SET is_active = 0";
                await cmd.ExecuteNonQueryAsync();
            }

            cmd.Parameters.Clear();
            cmd.CommandText = @"
                INSERT INTO hud_profiles (id, name, layout, is_active, updated_at)
                VALUES (@id, @name, @layout, @isActive, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    layout = excluded.layout,
                    is_active = excluded.is_active,
                    updated_at = excluded.updated_at
            ";

            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@name", name);
            cmd.Parameters.AddWithValue("@layout", JsonSerializer.Serialize(layout));
            cmd.Parameters.AddWithValue("@isActive", isActive ? 1 : 0);

            await cmd.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task DeleteHudProfileAsync(string id)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM hud_profiles WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await cmd.ExecuteNonQueryAsync();
    }

    private void InitializeTables(bool forceRefresh = false)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();

        using var cmd = connection.CreateCommand();
        
        if (forceRefresh) {
            _logger.LogInformation("Forced refresh: Dropping all database tables...");
            cmd.CommandText = "DROP TABLE IF EXISTS hands_analytics"; 
            cmd.ExecuteNonQuery();
            cmd.CommandText = "DROP TABLE IF EXISTS player_hands";
            cmd.ExecuteNonQuery();
            cmd.CommandText = "DROP TABLE IF EXISTS hands";
            cmd.ExecuteNonQuery();
            cmd.CommandText = "DROP TABLE IF EXISTS players";
            cmd.ExecuteNonQuery();
            cmd.CommandText = "DROP TABLE IF EXISTS sessions";
            cmd.ExecuteNonQuery();
            _logger.LogInformation("Database tables dropped.");
        }

        // Config table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )";
        cmd.ExecuteNonQuery();

        // Hands table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS hands (
                id TEXT PRIMARY KEY,
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
                preflop_action TEXT,
                flop TEXT,
                flop_action TEXT,
                turn TEXT,
                turn_action TEXT,
                river TEXT,
                river_action TEXT,
                showdown TEXT,
                result TEXT,
                all_in_street TEXT,
                went_to_showdown BOOLEAN DEFAULT 0,
                player_count INTEGER DEFAULT 2,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )";
        cmd.ExecuteNonQuery();

        // Player Hands table (New)
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS player_hands (
                hand_id TEXT,
                player_name TEXT,
                position TEXT,
                stack INTEGER,
                cards TEXT,
                investment REAL DEFAULT 0,
                chips_won REAL DEFAULT 0,
                net_profit REAL DEFAULT 0,
                is_all_in BOOLEAN DEFAULT 0,
                went_to_showdown BOOLEAN DEFAULT 0,
                ev_chips REAL,
                net_won_adjusted REAL,
                showdown_winning REAL,
                non_showdown_winning REAL,
                equity_preflop REAL,
                equity_flop REAL,
                equity_turn REAL,
                equity_river REAL,
                cev_contribution REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (hand_id, player_name),
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )";
        cmd.ExecuteNonQuery();

        // Indexes
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_hands_game_id ON hands(game_id)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_player_hands_hand ON player_hands(hand_id)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_player_hands_player ON player_hands(player_name)";
        cmd.ExecuteNonQuery();

        // Custom Stats table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS custom_stats (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                definition TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )";
        cmd.ExecuteNonQuery();

        // HUD Profiles table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS hud_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                layout TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )";
        cmd.ExecuteNonQuery();

        // Load default stats and profiles on first launch
        LoadDefaultDataIfNeeded();
    }

    private void LoadDefaultDataIfNeeded()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();

        using var cmd = connection.CreateCommand();
        
        // Check if stats table is empty
        cmd.CommandText = "SELECT COUNT(*) FROM custom_stats";
        var statsCount = Convert.ToInt32(cmd.ExecuteScalar());
        
        // Check if profiles table is empty
        cmd.CommandText = "SELECT COUNT(*) FROM hud_profiles";
        var profilesCount = Convert.ToInt32(cmd.ExecuteScalar());

        // Load default stats if empty
        if (statsCount == 0)
        {
            LoadDefaultStats();
        }

        // Load default profiles if empty
        if (profilesCount == 0)
        {
            LoadDefaultHudProfiles();
        }
    }

    private void LoadDefaultStats()
    {
        try
        {
            var backendDir = Directory.GetCurrentDirectory();
            var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
            var statsFilePath = Path.Combine(projectRoot, "custom_stats_import.json");

            if (!File.Exists(statsFilePath))
            {
                _logger.LogWarning($"Default stats file not found: {statsFilePath}");
                return;
            }

            var jsonContent = File.ReadAllText(statsFilePath);
            var stats = JsonSerializer.Deserialize<List<Dictionary<string, object>>>(jsonContent);

            if (stats == null || stats.Count == 0)
            {
                _logger.LogWarning("No stats found in default stats file");
                return;
            }

            var tasks = new List<Task>();
            foreach (var stat in stats)
            {
                try
                {
                    var id = stat.ContainsKey("Id") ? stat["Id"]?.ToString() : 
                             stat.ContainsKey("id") ? stat["id"]?.ToString() : null;
                    var name = stat.ContainsKey("Name") ? stat["Name"]?.ToString() : 
                               stat.ContainsKey("name") ? stat["name"]?.ToString() : "";
                    var description = stat.ContainsKey("Description") ? stat["Description"]?.ToString() : 
                                      stat.ContainsKey("description") ? stat["description"]?.ToString() : "";
                    var definition = stat.ContainsKey("Definition") ? stat["Definition"] : 
                                     stat.ContainsKey("definition") ? stat["definition"] : null;

                    if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(name) || definition == null)
                    {
                        continue;
                    }

                    // Save the stat with its definition
                    tasks.Add(SaveCustomStatAsync(id, name, description ?? "", definition));
                }
                catch (Exception ex)
                {
                    _logger.LogError($"Error loading default stat: {ex.Message}");
                }
            }

            Task.WaitAll(tasks.ToArray());
            _logger.LogInformation($"Loaded {stats.Count} default stats");
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error loading default stats: {ex.Message}");
        }
    }

    private void LoadDefaultHudProfiles()
    {
        try
        {
            var backendDir = Directory.GetCurrentDirectory();
            var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
            var profileFilePath = Path.Combine(projectRoot, "Minimalist_SpinAndGo_HUD.json");

            if (!File.Exists(profileFilePath))
            {
                _logger.LogWarning($"Default HUD profile file not found: {profileFilePath}");
                return;
            }

            var jsonContent = File.ReadAllText(profileFilePath);
            var profileData = JsonSerializer.Deserialize<Dictionary<string, object>>(jsonContent);

            if (profileData == null)
            {
                _logger.LogWarning("Invalid default HUD profile file");
                return;
            }

            var name = profileData.ContainsKey("name") ? profileData["name"]?.ToString() : "Minimalist Spin HUD";
            var layout = profileData.ContainsKey("layout") ? profileData["layout"] : null;

            if (layout == null)
            {
                _logger.LogWarning("No layout found in default HUD profile");
                return;
            }

            var id = Guid.NewGuid().ToString();
            SaveHudProfileAsync(id, name ?? "Minimalist Spin HUD", layout, true).Wait();

            _logger.LogInformation($"Loaded default HUD profile: {name}");
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error loading default HUD profile: {ex.Message}");
        }
    }

    public async Task ResetDefaultStatsAndProfilesAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        try
        {
            // Delete all existing stats
            using var cmd1 = connection.CreateCommand();
            cmd1.CommandText = "DELETE FROM custom_stats";
            await cmd1.ExecuteNonQueryAsync();

            // Delete all existing profiles
            using var cmd2 = connection.CreateCommand();
            cmd2.CommandText = "DELETE FROM hud_profiles";
            await cmd2.ExecuteNonQueryAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        // Reload defaults (outside transaction)
        LoadDefaultStats();
        LoadDefaultHudProfiles();
    }

    public async Task UpdatePlayerStatsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT OR REPLACE INTO players (name, total_hands, total_profit, total_ev_profit, updated_at)
            SELECT 
                player_name,
                COUNT(*) as total_hands,
                SUM(net_profit) as total_profit,
                SUM(COALESCE(ev_chips, 0)) as total_ev_profit,
                CURRENT_TIMESTAMP
            FROM player_hands
            GROUP BY player_name";
        
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<int> InsertHandsBatchAsync(List<ParsedHand> hands)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;
        
        // Dictionary to aggregate player stats
        var playerStats = new Dictionary<string, (int Hands, double Profit)>();

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;
            cmd.CommandText = @"
                INSERT OR REPLACE INTO hands (
                    id, game_id, hand_id, room, game_mode, game_type, game_name,
                    prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                    total_pot, rake, preflop_action,
                    flop, flop_action, turn, turn_action, river, river_action,
                    showdown, result, all_in_street, went_to_showdown, player_count
                ) VALUES (
                    @id, @game_id, @hand_id, @room, @game_mode, @game_type, @game_name,
                    @prize_pool, @multiplier, @buy_in, @date_time, @table_id, @blinds,
                    @total_pot, @rake, @preflop_action,
                    @flop, @flop_action, @turn, @turn_action, @river, @river_action,
                    @showdown, @result, @all_in_street, @went_to_showdown, @player_count
                )";
            
            // Re-use command for player hands
            using var cmdPlayers = connection.CreateCommand();
            cmdPlayers.Transaction = transaction;
            cmdPlayers.CommandText = @"
                INSERT OR REPLACE INTO player_hands (
                    hand_id, player_name, position, stack, cards, investment, 
                    chips_won, net_profit, is_all_in, went_to_showdown,
                    ev_chips, net_won_adjusted, showdown_winning, non_showdown_winning,
                    equity_preflop, equity_flop, equity_turn, equity_river, cev_contribution
                ) VALUES (
                    @hand_id, @player_name, @position, @stack, @cards, @investment,
                    @chips_won, @net_profit, @is_all_in, @went_to_showdown,
                    @ev_chips, @net_won_adjusted, @showdown_winning, @non_showdown_winning,
                    @equity_preflop, @equity_flop, @equity_turn, @equity_river, @cev_contribution
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
                    cmd.Parameters.AddWithValue("@preflop_action", hand.PreflopAction ?? "");
                    cmd.Parameters.AddWithValue("@flop", hand.Flop ?? "");
                    cmd.Parameters.AddWithValue("@flop_action", hand.FlopAction ?? "");
                    cmd.Parameters.AddWithValue("@turn", hand.Turn ?? "");
                    cmd.Parameters.AddWithValue("@turn_action", hand.TurnAction ?? "");
                    cmd.Parameters.AddWithValue("@river", hand.River ?? "");
                    cmd.Parameters.AddWithValue("@river_action", hand.RiverAction ?? "");
                    cmd.Parameters.AddWithValue("@showdown", hand.Showdown ?? "");
                    cmd.Parameters.AddWithValue("@result", hand.Result ?? "");
                    cmd.Parameters.AddWithValue("@all_in_street", hand.AllInStreet ?? "");
                    cmd.Parameters.AddWithValue("@went_to_showdown", hand.WentToShowdown ? 1 : 0);
                    cmd.Parameters.AddWithValue("@player_count", hand.PlayerCount);

                    await cmd.ExecuteNonQueryAsync();
                    inserted++;

                    foreach(var p in hand.Players)
                    {
                        cmdPlayers.Parameters.Clear();
                        cmdPlayers.Parameters.AddWithValue("@hand_id", hand.Id);
                        cmdPlayers.Parameters.AddWithValue("@player_name", p.Name);
                        cmdPlayers.Parameters.AddWithValue("@position", p.Position ?? "");
                        cmdPlayers.Parameters.AddWithValue("@stack", p.Stack);
                        cmdPlayers.Parameters.AddWithValue("@cards", p.Cards ?? "");
                        cmdPlayers.Parameters.AddWithValue("@investment", p.Investment);
                        cmdPlayers.Parameters.AddWithValue("@chips_won", p.ChipsWon);
                        cmdPlayers.Parameters.AddWithValue("@net_profit", p.NetProfit);
                        cmdPlayers.Parameters.AddWithValue("@is_all_in", p.IsAllIn ? 1 : 0);
                        cmdPlayers.Parameters.AddWithValue("@went_to_showdown", p.WentToShowdown ? 1 : 0);
                        
                        // Default analytics to null/0 since they are calculated separately
                        cmdPlayers.Parameters.AddWithValue("@ev_chips", DBNull.Value);
                        cmdPlayers.Parameters.AddWithValue("@net_won_adjusted", p.NetProfit);
                        cmdPlayers.Parameters.AddWithValue("@showdown_winning", p.WentToShowdown ? p.NetProfit : 0);
                        cmdPlayers.Parameters.AddWithValue("@non_showdown_winning", !p.WentToShowdown ? p.NetProfit : 0);
                        cmdPlayers.Parameters.AddWithValue("@equity_preflop", DBNull.Value);
                        cmdPlayers.Parameters.AddWithValue("@equity_flop", DBNull.Value);
                        cmdPlayers.Parameters.AddWithValue("@equity_turn", DBNull.Value);
                        cmdPlayers.Parameters.AddWithValue("@equity_river", DBNull.Value);
                        cmdPlayers.Parameters.AddWithValue("@cev_contribution", 0);

                        await cmdPlayers.ExecuteNonQueryAsync();

                        // Aggregate stats
                        if (!playerStats.ContainsKey(p.Name))
                        {
                            playerStats[p.Name] = (0, 0);
                        }
                        var (h, pr) = playerStats[p.Name];
                        playerStats[p.Name] = (h + 1, pr + p.NetProfit);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Failed to insert hand {hand.Id}: {ex.Message}");
                    throw;
                }
            }

            await transaction.CommitAsync();
            
            // Recalculate player stats correctly from DB state
            await UpdatePlayerStatsAsync();
            
            return inserted;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<int> InsertHandsAndAnalyticsBatchAsync(List<ParsedHand> hands, List<HandAnalytics> analytics)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;
        
        var playerStats = new Dictionary<string, (int Hands, double Profit, double EvProfit)>();

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;
            cmd.CommandText = @"
                INSERT OR REPLACE INTO hands (
                    id, game_id, hand_id, room, game_mode, game_type, game_name,
                    prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                    total_pot, rake, preflop_action,
                    flop, flop_action, turn, turn_action, river, river_action,
                    showdown, result, all_in_street, went_to_showdown, player_count
                ) VALUES (
                    @id, @game_id, @hand_id, @room, @game_mode, @game_type, @game_name,
                    @prize_pool, @multiplier, @buy_in, @date_time, @table_id, @blinds,
                    @total_pot, @rake, @preflop_action,
                    @flop, @flop_action, @turn, @turn_action, @river, @river_action,
                    @showdown, @result, @all_in_street, @went_to_showdown, @player_count
                )";

            using var cmdPlayers = connection.CreateCommand();
            cmdPlayers.Transaction = transaction;
            cmdPlayers.CommandText = @"
                INSERT OR REPLACE INTO player_hands (
                    hand_id, player_name, position, stack, cards, investment, 
                    chips_won, net_profit, is_all_in, went_to_showdown,
                    ev_chips, net_won_adjusted, showdown_winning, non_showdown_winning,
                    equity_preflop, equity_flop, equity_turn, equity_river, cev_contribution
                ) VALUES (
                    @hand_id, @player_name, @position, @stack, @cards, @investment,
                    @chips_won, @net_profit, @is_all_in, @went_to_showdown,
                    @ev_chips, @net_won_adjusted, @showdown_winning, @non_showdown_winning,
                    @equity_preflop, @equity_flop, @equity_turn, @equity_river, @cev_contribution
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
                    cmd.Parameters.AddWithValue("@preflop_action", hand.PreflopAction ?? "");
                    cmd.Parameters.AddWithValue("@flop", hand.Flop ?? "");
                    cmd.Parameters.AddWithValue("@flop_action", hand.FlopAction ?? "");
                    cmd.Parameters.AddWithValue("@turn", hand.Turn ?? "");
                    cmd.Parameters.AddWithValue("@turn_action", hand.TurnAction ?? "");
                    cmd.Parameters.AddWithValue("@river", hand.River ?? "");
                    cmd.Parameters.AddWithValue("@river_action", hand.RiverAction ?? "");
                    cmd.Parameters.AddWithValue("@showdown", hand.Showdown ?? "");
                    cmd.Parameters.AddWithValue("@result", hand.Result ?? "");
                    cmd.Parameters.AddWithValue("@all_in_street", hand.AllInStreet ?? "");
                    cmd.Parameters.AddWithValue("@went_to_showdown", hand.WentToShowdown ? 1 : 0);
                    cmd.Parameters.AddWithValue("@player_count", hand.PlayerCount);
                    int rows = await cmd.ExecuteNonQueryAsync();
                    
                    if (rows == 0) {
                        _logger.LogWarning($"Hand {hand.Id} was NOT inserted (0 rows affected)");
                    }

                    var handAnalytics = analytics.FirstOrDefault(a => a.HandId == hand.Id);

                    if (hand.Players.Count == 0) {
                        _logger.LogWarning($"Hand {hand.Id} has 0 players parsed!");
                    }

                    foreach (var p in hand.Players)
                    {
                        cmdPlayers.Parameters.Clear();
                        cmdPlayers.Parameters.AddWithValue("@hand_id", hand.Id);
                        cmdPlayers.Parameters.AddWithValue("@player_name", p.Name);
                        cmdPlayers.Parameters.AddWithValue("@position", p.Position ?? "");
                        cmdPlayers.Parameters.AddWithValue("@stack", (int)p.Stack);
                        cmdPlayers.Parameters.AddWithValue("@cards", p.Cards ?? "");
                        cmdPlayers.Parameters.AddWithValue("@investment", p.Investment);
                        cmdPlayers.Parameters.AddWithValue("@chips_won", p.ChipsWon);
                        cmdPlayers.Parameters.AddWithValue("@net_profit", p.NetProfit);
                        cmdPlayers.Parameters.AddWithValue("@is_all_in", p.IsAllIn ? 1 : 0);
                        cmdPlayers.Parameters.AddWithValue("@went_to_showdown", p.WentToShowdown ? 1 : 0);
                        
                        if (p.IsHero && handAnalytics != null)
                        {
                            cmdPlayers.Parameters.AddWithValue("@ev_chips", (object)handAnalytics.EvChips ?? DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@net_won_adjusted", (object)handAnalytics.NetWonAdjusted ?? p.NetProfit);
                            cmdPlayers.Parameters.AddWithValue("@showdown_winning", (object)handAnalytics.ChipsWonShowdown ?? (p.WentToShowdown ? p.NetProfit : 0));
                            cmdPlayers.Parameters.AddWithValue("@non_showdown_winning", (object)handAnalytics.ChipsWonNoShowdown ?? (!p.WentToShowdown ? p.NetProfit : 0));
                            cmdPlayers.Parameters.AddWithValue("@equity_preflop", (object)handAnalytics.EquityPreflop ?? DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@equity_flop", (object)handAnalytics.EquityFlop ?? DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@equity_turn", (object)handAnalytics.EquityTurn ?? DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@equity_river", (object)handAnalytics.EquityRiver ?? DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@cev_contribution", (object)handAnalytics.CevContribution ?? 0);
                        }
                        else
                        {
                            cmdPlayers.Parameters.AddWithValue("@ev_chips", DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@net_won_adjusted", p.NetProfit);
                            cmdPlayers.Parameters.AddWithValue("@showdown_winning", p.WentToShowdown ? p.NetProfit : 0);
                            cmdPlayers.Parameters.AddWithValue("@non_showdown_winning", !p.WentToShowdown ? p.NetProfit : 0);
                            cmdPlayers.Parameters.AddWithValue("@equity_preflop", DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@equity_flop", DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@equity_turn", DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@equity_river", DBNull.Value);
                            cmdPlayers.Parameters.AddWithValue("@cev_contribution", 0);
                        }

                        int pRows = await cmdPlayers.ExecuteNonQueryAsync();
                        if (pRows == 0) {
                            _logger.LogWarning($"Player {p.Name} in hand {hand.Id} was NOT inserted (0 rows affected)");
                        }

                        if (!playerStats.ContainsKey(p.Name)) playerStats[p.Name] = (0, 0, 0);
                        var (h, pr, ev) = playerStats[p.Name];
                        var playerEvVal = (p.IsHero && handAnalytics != null) ? (handAnalytics.EvChips ?? 0) : 0;
                        playerStats[p.Name] = (h + 1, pr + p.NetProfit, ev + playerEvVal);
                    }
                    inserted++;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Failed to insert hand {hand.Id}: {ex.Message}");
                }
            }

            await transaction.CommitAsync();

            // Recalculate player stats correctly from DB state
            await UpdatePlayerStatsAsync();

            return inserted;
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError($"Transaction failed: {ex.Message}");
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
                UPDATE player_hands 
                SET ev_chips = @ev_chips, 
                    net_won_adjusted = @net_won_adjusted, 
                    equity_preflop = @equity_preflop, 
                    equity_flop = @equity_flop,
                    equity_turn = @equity_turn, 
                    equity_river = @equity_river, 
                    showdown_winning = @chips_won_showdown, 
                    non_showdown_winning = @chips_won_no_showdown, 
                    cev_contribution = @cev_contribution
                WHERE hand_id = @hand_id AND player_name = @player_name";

            foreach (var analytic in analytics)
            {
                cmd.Parameters.Clear();
                cmd.Parameters.AddWithValue("@hand_id", analytic.HandId ?? "");
                cmd.Parameters.AddWithValue("@player_name", analytic.PlayerName ?? "");
                cmd.Parameters.AddWithValue("@ev_chips", (object)analytic.EvChips ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@net_won_adjusted", (object)analytic.NetWonAdjusted ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_preflop", (object)analytic.EquityPreflop ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_flop", (object)analytic.EquityFlop ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_turn", (object)analytic.EquityTurn ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@equity_river", (object)analytic.EquityRiver ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@chips_won_showdown", (object)analytic.ChipsWonShowdown ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@chips_won_no_showdown", (object)analytic.ChipsWonNoShowdown ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cev_contribution", (object)analytic.CevContribution ?? DBNull.Value);

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

    public async Task<List<AnalysisHandData>> GetHandsForAnalysisAsync(AnalysisFilters filters)
    {
        _logger.LogInformation($"GetHandsForAnalysisAsync called for hero={filters.HeroName}");
        try
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            var whereClauses = new List<string>();
            var parameters = new List<SqliteParameter>();
            var joinClause = "";
            
            // If HeroName is provided, join specific player.
            // If NOT provided (Field analysis), join ALL players who have cards so we can analyze the pool's range.
            if (!string.IsNullOrEmpty(filters.HeroName))
            {
                joinClause += " JOIN player_hands ph ON h.id = ph.hand_id";
                whereClauses.Add("ph.player_name = @heroName");
                parameters.Add(new SqliteParameter("@heroName", filters.HeroName));
            }
            else
            {
                // Field Analysis: Get all players with known cards
                joinClause += " JOIN player_hands ph ON h.id = ph.hand_id";
                whereClauses.Add("(ph.cards IS NOT NULL AND ph.cards != '')");
            }

            if (!string.IsNullOrEmpty(filters.DateFrom))
            {
                whereClauses.Add("h.date_time >= @dateFrom");
                parameters.Add(new SqliteParameter("@dateFrom", filters.DateFrom));
            }

            if (!string.IsNullOrEmpty(filters.DateTo))
            {
                whereClauses.Add("h.date_time <= @dateTo");
                parameters.Add(new SqliteParameter("@dateTo", filters.DateTo));
            }

            if (filters.Positions != null && filters.Positions.Length > 0)
            {
                var posClauses = new List<string>();
                for (int i = 0; i < filters.Positions.Length; i++)
                {
                    var pParam = $"@pos{i}";
                    var pParamLike = $"@posLike{i}";
                    
                    string baseClause;
                    if (!string.IsNullOrEmpty(filters.HeroName))
                    {
                        baseClause = $"(ph.position = {pParam} OR ph.position LIKE {pParamLike})";
                    }
                    else
                    {
                        // For field analysis, we still filter by the position of the player we are currently looking at (ph.position)
                        baseClause = $"(ph.position = {pParam} OR ph.position LIKE {pParamLike})";
                    }
                    
                    parameters.Add(new SqliteParameter(pParam, filters.Positions[i]));
                    parameters.Add(new SqliteParameter(pParamLike, $"%({filters.Positions[i]})%"));

                    // Special Handling for Heads Up: SB includes BTN and BTN SB
                    if (filters.PlayerCount == 2 && filters.Positions[i] == "SB")
                    {
                        var btnParam = $"@posBtn{i}";
                        var btnSbParam = $"@posBtnSb{i}";
                        
                        string extraClause = $" OR ph.position = {btnParam} OR ph.position = {btnSbParam}";
                        
                        baseClause = $"({baseClause}{extraClause})";
                        parameters.Add(new SqliteParameter(btnParam, "BTN"));
                        parameters.Add(new SqliteParameter(btnSbParam, "BTN SB"));
                    }

                    posClauses.Add(baseClause);
                }
                whereClauses.Add($"({string.Join(" OR ", posClauses)})");
            }

            if (filters.PlayerCount.HasValue)
            {
                whereClauses.Add("h.player_count = @playerCount");
                parameters.Add(new SqliteParameter("@playerCount", filters.PlayerCount.Value));
            }

            var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

            using var cmd = connection.CreateCommand();
            
            _logger.LogInformation($"GetHandsForAnalysisAsync: whereClauses count = {whereClauses.Count}");
            _logger.LogInformation($"PlayerCount filter: {filters.PlayerCount}");
            if (whereClauses.Count > 0) _logger.LogInformation($"Where: {whereClause}");

            // Select necessary columns
            var profitCol = "ph.net_profit";
            var stackCol = "ph.stack";
            var posCol = "ph.position";
            var investCol = "ph.investment";
            var cardsCol = "ph.cards";
            var showdownCol = "ph.went_to_showdown";

            // Subquery to get all players and positions for each hand
            var playerPositionsSubquery = @"
                (SELECT GROUP_CONCAT(player_name || ':' || position, '|') 
                 FROM player_hands ph_inner 
                 WHERE ph_inner.hand_id = h.id) as player_positions_map";

            cmd.CommandText = $@"
                SELECT 
                    h.id, 
                    h.date_time, 
                    {profitCol}, 
                    h.preflop_action, 
                    h.flop_action, 
                    h.turn_action, 
                    h.river_action, 
                    {posCol}, 
                    {stackCol}, 
                    h.blinds,
                    {showdownCol},
                    h.total_pot,
                    {investCol},
                    ph.player_name,
                    h.flop,
                    h.turn,
                    h.river,
                    ph.ev_chips,
                    {playerPositionsSubquery},
                    {cardsCol}
                FROM hands h
                {joinClause}
                {whereClause}
                ORDER BY h.date_time ASC"; // ASC for graph

            foreach (var param in parameters)
            {
                cmd.Parameters.Add(param);
            }
            
            _logger.LogInformation($"SQL: {cmd.CommandText}");

            var results = new List<AnalysisHandData>();
            using var reader = await cmd.ExecuteReaderAsync();
            int rowCount = 0;
            while (await reader.ReadAsync())
            {
                rowCount++;
                var dateStr = reader.IsDBNull(1) ? "" : reader.GetString(1);
                DateTime dateVal;
                if (!DateTime.TryParse(dateStr, out dateVal))
                {
                    dateVal = DateTime.MinValue;
                }

                results.Add(new AnalysisHandData
                {
                    HandId = reader.GetString(0),
                    Date = dateVal,
                    Profit = reader.IsDBNull(2) ? 0.0 : reader.GetDouble(2),
                    PreflopAction = reader.IsDBNull(3) ? "" : reader.GetString(3),
                    FlopAction = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    TurnAction = reader.IsDBNull(5) ? "" : reader.GetString(5),
                    RiverAction = reader.IsDBNull(6) ? "" : reader.GetString(6),
                    HeroPosition = reader.IsDBNull(7) ? "" : reader.GetString(7),
                    HeroStack = reader.IsDBNull(8) ? 0.0 : reader.GetDouble(8),
                    Blinds = reader.IsDBNull(9) ? "" : reader.GetString(9),
                    WentToShowdown = !reader.IsDBNull(10) && (reader.GetFieldType(10) == typeof(long) ? reader.GetInt64(10) == 1 : reader.GetBoolean(10)),
                    TotalPot = reader.IsDBNull(11) ? 0.0 : reader.GetDouble(11),
                    Investment = reader.IsDBNull(12) ? 0.0 : reader.GetDouble(12),
                    HeroName = reader.IsDBNull(13) ? null : reader.GetString(13),
                    Flop = reader.IsDBNull(14) ? null : reader.GetString(14),
                    Turn = reader.IsDBNull(15) ? null : reader.GetString(15),
                    River = reader.IsDBNull(16) ? null : reader.GetString(16),
                    EvChips = reader.IsDBNull(17) ? null : reader.GetDouble(17),
                    PlayerPositionsMap = reader.IsDBNull(18) ? "" : reader.GetString(18),
                    HeroCards = reader.IsDBNull(19) ? null : reader.GetString(19)
                });
            }
            
            _logger.LogInformation($"GetHandsForAnalysisAsync: Read {rowCount} rows");

            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error in GetHandsForAnalysisAsync: {ex.Message}");
            throw;
        }
    }

    public async Task<object> GetHandsAsync(HandsQueryOptions options)
    {
        _logger.LogInformation($"GetHandsAsync called with limit={options.Limit}, page={options.Page}, hero={options.HeroName}");
        try
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            var whereClauses = new List<string>();
            var parameters = new List<SqliteParameter>();
            var joinClause = "";
            
            if (!string.IsNullOrEmpty(options.HeroName))
            {
                joinClause += " JOIN player_hands ph ON h.id = ph.hand_id";
                whereClauses.Add("ph.player_name = @heroName");
                parameters.Add(new SqliteParameter("@heroName", options.HeroName));
            }
            else
            {
                joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
            }

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

            if (!string.IsNullOrEmpty(options.Position))
            {
                if (options.Position.Contains("HU"))
                {
                    whereClauses.Add("player_count = 2");
                }
                else if (options.Position.Contains("3W"))
                {
                    whereClauses.Add("player_count >= 3");
                }

                var parts = options.Position.Split(' ');
                var pos = parts.Last(); 
                
                if (pos == "SB" || pos == "BB" || pos == "BTN")
                {
                    // ph.position stores "SB", "BTN", "BTN SB" etc.
                    whereClauses.Add("(ph.position = @position OR ph.position LIKE @posLike)");
                    parameters.Add(new SqliteParameter("@position", pos));
                    parameters.Add(new SqliteParameter("@posLike", $"%({pos})%"));
                }
            }

            if (!string.IsNullOrEmpty(options.GameType))
            {
                whereClauses.Add("game_type = @gameType");
                parameters.Add(new SqliteParameter("@gameType", options.GameType));
            }

            if (options.MinPot.HasValue)
            {
                whereClauses.Add("total_pot >= @minPot");
                parameters.Add(new SqliteParameter("@minPot", options.MinPot.Value));
            }

            if (options.MaxPot.HasValue)
            {
                whereClauses.Add("total_pot <= @maxPot");
                parameters.Add(new SqliteParameter("@maxPot", options.MaxPot.Value));
            }

            if (!string.IsNullOrEmpty(options.Result))
            {
                var profitCol = "ph.net_profit";
                if (options.Result.ToLower() == "won")
                {
                    whereClauses.Add($"{profitCol} > 0");
                }
                else if (options.Result.ToLower() == "lost")
                {
                    whereClauses.Add($"{profitCol} < 0");
                }
            }

            var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

            // Get total count
            using var countCmd = connection.CreateCommand();
            countCmd.CommandText = $"SELECT COUNT(*) FROM hands h {joinClause} {whereClause}";
            foreach (var param in parameters)
            {
                countCmd.Parameters.Add(new SqliteParameter(param.ParameterName, param.Value));
            }
            var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

            // Get paginated hands
            var offset = (options.Page - 1) * options.Limit;
            using var cmd = connection.CreateCommand();
            
            var selectFields = "h.*, ph.ev_chips, ph.equity_preflop, ph.equity_flop, ph.equity_turn, ph.equity_river";
            selectFields += ", ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.player_name as dyn_hero_name";

            cmd.CommandText = $@"
                SELECT {selectFields}
                FROM hands h
                {joinClause}
                {whereClause}
                ORDER BY h.date_time DESC
                LIMIT @limit OFFSET @offset";

            foreach (var param in parameters)
            {
                cmd.Parameters.Add(new SqliteParameter(param.ParameterName, param.Value));
            }
            cmd.Parameters.AddWithValue("@limit", options.Limit);
            cmd.Parameters.AddWithValue("@offset", offset);

            var hands = new List<object>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                hands.Add(ReadHandFromReader(reader));
            }

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

        object? handData = null;

        // 1. Get Hand Basic Info
        using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = @"
                SELECT h.*, ph.ev_chips, ph.equity_preflop, ph.equity_flop, ph.equity_turn, ph.equity_river,
                       ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, 
                       ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.player_name as dyn_hero_name,
                       ph.stack as dyn_hero_stack
                FROM hands h
                LEFT JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)
                WHERE h.id = @handId";
            cmd.Parameters.AddWithValue("@handId", handId);

            using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                handData = ReadHandFromReader(reader);
            }
        }

        if (handData == null) return null;

        // 2. Get Players
        var players = new List<object>();
        using (var cmdPlayers = connection.CreateCommand())
        {
            cmdPlayers.CommandText = @"
                SELECT player_name, position, stack, cards, investment, chips_won, net_profit, is_all_in, went_to_showdown,
                       ev_chips, equity_preflop, equity_flop, equity_turn, equity_river
                FROM player_hands
                WHERE hand_id = @handId";
            cmdPlayers.Parameters.AddWithValue("@handId", handId);

            using (var reader = await cmdPlayers.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    players.Add(new {
                        Name = reader.GetString(0),
                        Position = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        Stack = reader.GetInt32(2),
                        Cards = reader.IsDBNull(3) ? null : reader.GetString(3),
                        Investment = reader.GetDouble(4),
                        ChipsWon = reader.GetDouble(5),
                        NetProfit = reader.GetDouble(6),
                        IsAllIn = reader.GetBoolean(7),
                        WentToShowdown = reader.GetBoolean(8),
                        EvChips = reader.IsDBNull(9) ? null : (double?)reader.GetDouble(9),
                        EquityPreflop = reader.IsDBNull(10) ? null : (double?)reader.GetDouble(10),
                        EquityFlop = reader.IsDBNull(11) ? null : (double?)reader.GetDouble(11),
                        EquityTurn = reader.IsDBNull(12) ? null : (double?)reader.GetDouble(12),
                        EquityRiver = reader.IsDBNull(13) ? null : (double?)reader.GetDouble(13)
                    });
                }
            }
        }

        // Combine into a dictionary to return merged result
        var json = JsonSerializer.Serialize(handData);
        var result = JsonSerializer.Deserialize<Dictionary<string, object>>(json);
        if (result != null)
        {
            result["players"] = players;
            return result;
        }

        return handData;
    }

    public async Task<TournamentsResult> GetTournamentsAsync(HandsQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
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
                MAX(h.player_count) as max_players
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

                // Tournament Profit Logic (Prize Sharing handling)
                if (t.PrizePool > 0)
                {
                    bool hasSharing = (t.BuyIn > 0 && (t.PrizePool / t.BuyIn) >= 20);
                    if (t.ChipProfit > 0) 
                    {
                        double winAmount = hasSharing ? (t.PrizePool * 0.75) : t.PrizePool;
                        t.NetProfit = winAmount - t.BuyIn;
                    }
                    else
                    {
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

    public async Task<List<object>> GetTournamentHandsAsync(string gameId, string? heroName = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var joinClause = "";
        
        if (!string.IsNullOrEmpty(heroName))
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
        }
        else
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        var selectFields = "h.*, ph.ev_chips, ph.equity_preflop, ph.equity_flop, ph.equity_turn, ph.equity_river";
        selectFields += ", ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.player_name as dyn_hero_name";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT {selectFields}
            FROM hands h
            {joinClause}
            WHERE h.game_id = @gameId
            ORDER BY h.date_time ASC";

        cmd.Parameters.AddWithValue("@gameId", gameId);
        if (!string.IsNullOrEmpty(heroName)) cmd.Parameters.AddWithValue("@heroName", heroName);

        var hands = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            hands.Add(ReadHandFromReader(reader));
        }

        return hands;
    }

    public async Task<List<object>> GetHandsByIdsAsync(List<string> handIds, string? heroName = null)
    {
        if (handIds == null || handIds.Count == 0) return new List<object>();

        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var joinClause = "";
        
        if (!string.IsNullOrEmpty(heroName))
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
        }
        else
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        var selectFields = "h.*, ph.ev_chips, ph.equity_preflop, ph.equity_flop, ph.equity_turn, ph.equity_river";
        selectFields += ", ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.player_name as dyn_hero_name";

        // Generate parameter names
        var parameters = new List<SqliteParameter>();
        var idParams = new List<string>();
        for (int i = 0; i < handIds.Count; i++)
        {
            var pName = $"@id{i}";
            idParams.Add(pName);
            parameters.Add(new SqliteParameter(pName, handIds[i]));
        }

        if (!string.IsNullOrEmpty(heroName))
        {
            parameters.Add(new SqliteParameter("@heroName", heroName));
        }

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT {selectFields}
            FROM hands h
            {joinClause}
            WHERE h.id IN ({string.Join(",", idParams)})
            ORDER BY h.date_time DESC"; // Default sort, though caller might re-sort

        foreach (var p in parameters) cmd.Parameters.Add(p);
        
        _logger.LogInformation($"GetHandsByIdsAsync: Fetching {handIds.Count} hands. SQL: {cmd.CommandText.Substring(0, Math.Min(200, cmd.CommandText.Length))}...");

        var hands = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        int rowCount = 0;
        while (await reader.ReadAsync())
        {
            rowCount++;
            hands.Add(ReadHandFromReader(reader));
        }
        _logger.LogInformation($"GetHandsByIdsAsync: Read {rowCount} rows");

        return hands;
    }

    public async Task<object> GetDashboardStatsAsync(string? heroName = null, string? dateFrom = null, string? dateTo = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

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
        if (!string.IsNullOrEmpty(dateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
        }
        if (!string.IsNullOrEmpty(dateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
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

        // 2. Calculate Euro Profit and Sessions using the session logic
        var sessions = await GetSessionsInternalAsync(null, heroName, dateFrom, dateTo); 
        
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
            total_profit = totalProfitEuro,
            total_ev = totalEv,
            total_tournaments = totalTournaments,
            avg_chips_ev = avgChipsEv,
            sessions_this_month = sessionsThisMonth,
            total_sessions = sessions.Count,
            avg_multiplier = 0.0,
            best_win = 0.0
        };
    }

    public async Task<List<object>> GetSessionHistoryAsync(int limit, string? heroName = null, string? dateFrom = null, string? dateTo = null)
    {
        var sessions = await GetSessionsInternalAsync(null, heroName, dateFrom, dateTo); 
        
        return sessions.Take(limit).Select(s => (object)new {
            room = s.Room,
            tournaments = s.Tournaments,
            hands_played = s.Hands,
            profit = s.Profit,
            session_date = s.StartTime.ToString("yyyy-MM-dd HH:mm")
        }).ToList();
    }

    private record SessionInfo(DateTime StartTime, string Room, int Tournaments, int Hands, double Profit);

    private async Task<List<SessionInfo>> GetSessionsInternalAsync(int? limit, string? heroName = null, string? dateFrom = null, string? dateTo = null)
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
                    reader.IsDBNull(6) ? 0 : reader.GetInt32(6)
                 ));
            }
        }
        
        if (rawHands.Count == 0) return new List<SessionInfo>();
        
        var sessionList = new List<SessionInfo>();
        int i = 0;
        while(i < rawHands.Count)
        {
            var sessionStart = rawHands[i].t;
            var sessionRoom = rawHands[i].r;
            var sessionHands = new List<(string g, double b, double p, double h_p, int pc)>();
            
            // Collect hands for this session (break > 30 mins)
            while(i < rawHands.Count)
            {
                var h = rawHands[i];
                if (sessionHands.Count > 0)
                {
                    var last = rawHands[i-1].t;
                    if ((h.t - last).TotalMinutes > 30) break; 
                }
                sessionHands.Add((h.g, h.b, h.p, h.h_p, h.pc));
                i++;
            }
            
            // Calculate stats
            var uniqueGames = sessionHands.Select(x => x.g).Distinct().Where(g => !string.IsNullOrEmpty(g)).ToList();
            
            // If no game_ids, treat as one block?
            // Assuming game_id exists for tournaments.
            
            double sessionProfit = 0;
            
            if (uniqueGames.Count > 0)
            {
                var games = sessionHands.GroupBy(x => x.g);
                foreach(var g in games)
                {
                    if (string.IsNullOrEmpty(g.Key)) continue;

                    var first = g.First();
                    var buyIn = first.b;
                    var prize = first.p;
                    var chipProfit = g.Sum(x => x.h_p);
                    
                    // Tournament logic
                    if (prize > 0)
                    {
                        var lastHand = g.Last();
                        int lastPlayerCount = lastHand.pc;
                        
                        // Check for big multiplier (>= x20) for prize sharing
                        // Based on user input:
                        // x1000, x100, x20: 75% / 15% / 10%
                        // x10, x5, x4, x3, x2: 100%
                        
                        bool hasSharing = (buyIn > 0 && (prize / buyIn) >= 20);
                        
                        if (chipProfit > 0) 
                        {
                            // Won the tournament (1st)
                            double winAmount = hasSharing ? (prize * 0.75) : prize;
                            sessionProfit += (winAmount - buyIn);
                        }
                        else
                        {
                            // Lost the tournament
                            if (hasSharing)
                            {
                                // Determine position based on player count in last hand
                                // If last hand was HU (2 players) and I lost -> 2nd Place (15%)
                                // If last hand was 3-way (3 players) and I lost -> 3rd Place (10%)
                                
                                double consolation = 0;
                                if (lastPlayerCount == 2)
                                {
                                    // 2nd Place
                                    consolation = prize * 0.15;
                                }
                                else
                                {
                                    // 3rd Place (or unknown/default for loser in sharing pool)
                                    consolation = prize * 0.10;
                                }
                                sessionProfit += (consolation - buyIn);
                            }
                            else
                            {
                                // Winner takes all, so I lost buyIn
                                sessionProfit -= buyIn;
                            }
                        }
                    }
                    else
                    {
                        // Cash game logic: Profit is sum of hero_profit (assuming it's money)
                        // Or if hero_profit is chips and 1 chip = 1 eur
                        sessionProfit += chipProfit;
                    }
                }
            }
            else
            {
                // No game IDs, just sum profit
                sessionProfit = sessionHands.Sum(x => x.h_p);
            }
            
            sessionList.Add(new SessionInfo(sessionStart, sessionRoom, uniqueGames.Count, sessionHands.Count, sessionProfit));
        }
        
        sessionList.Reverse(); // Newest first
        return sessionList;
    }

    public async Task<object> GetWinrateChartDataAsync(ChartQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
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

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                h.date_time,
                SUM({profitCol}) OVER (ORDER BY h.date_time) as cumulative_profit,
                SUM(
                    COALESCE(
                        CASE 
                            WHEN {showdownCondition}
                            THEN {profitCol} 
                            ELSE 0 
                        END, 0
                    )
                ) OVER (ORDER BY h.date_time) as cumulative_showdown,
                SUM(
                    COALESCE(
                        CASE 
                            WHEN NOT ({showdownCondition})
                            THEN {profitCol} 
                            ELSE 0 
                        END, 0
                    )
                ) OVER (ORDER BY h.date_time) as cumulative_no_showdown,
                SUM({evCol}) OVER (ORDER BY h.date_time) as cumulative_ev,
                ROW_NUMBER() OVER (ORDER BY h.date_time) as hand_number
            FROM hands h
            {joinClause}
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
        cmd.CommandText = @"
            SELECT COALESCE(SUM(ph.net_profit), 0) as total_profit, COUNT(*) as total_hands 
            FROM hands h
            JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";

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

    public async Task<object> GetRangeHeatmapAsync(RangeHeatmapFilters filters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        
        var cardsCol = "ph.cards";
        var profitCol = "ph.net_profit";
        var joinClause = "";
        
        if (!string.IsNullOrEmpty(filters.HeroName))
        {
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = @heroName";
            cmd.Parameters.AddWithValue("@heroName", filters.HeroName);
        }
        else
        {
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = hands.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        // Fetch raw cards and profit, process in C# to normalize
        cmd.CommandText = $@"
            SELECT 
                {cardsCol},
                {profitCol}
            FROM hands
            {joinClause}
            WHERE {cardsCol} IS NOT NULL AND {cardsCol} != ''";

        var heatmapData = new Dictionary<string, HeatmapEntry>();

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var cardsRaw = reader.GetString(0);
            var profit = reader.GetDouble(1);
            
            var normalized = NormalizeCards(cardsRaw);
            if (normalized == null) continue;

            if (!heatmapData.ContainsKey(normalized))
            {
                heatmapData[normalized] = new HeatmapEntry();
            }

            var entry = heatmapData[normalized];
            entry.Count++;
            entry.TotalProfit += profit;
        }

        // Convert to response format
        var result = new Dictionary<string, object>();
        foreach (var kvp in heatmapData)
        {
            result[kvp.Key] = new
            {
                count = kvp.Value.Count,
                total_profit = kvp.Value.TotalProfit,
                avg_profit = kvp.Value.TotalProfit / kvp.Value.Count
            };
        }

        return result;
    }

    private class HeatmapEntry
    {
        public int Count { get; set; }
        public double TotalProfit { get; set; }
    }

    private string? NormalizeCards(string cardsRaw)
    {
        // Expected format: "As Kh" or "Ad Ac" etc.
        var parts = cardsRaw.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2) return null;

        var c1 = parts[0];
        var c2 = parts[1];

        if (c1.Length < 2 || c2.Length < 2) return null;

        var r1 = c1[0]; // Rank
        var s1 = c1[1]; // Suit
        var r2 = c2[0];
        var s2 = c2[1];

        var rankOrder = "AKQJT98765432";
        var i1 = rankOrder.IndexOf(r1);
        var i2 = rankOrder.IndexOf(r2);

        if (i1 == -1 || i2 == -1) return null;

        // Ensure c1 is higher rank
        if (i1 > i2) 
        {
            (r1, r2) = (r2, r1);
            (s1, s2) = (s2, s1);
        }

        if (r1 == r2)
        {
            return $"{r1}{r2}"; // Pair: AA
        }
        else if (s1 == s2)
        {
            return $"{r1}{r2}s"; // Suited: AKs
        }
        else
        {
            return $"{r1}{r2}o"; // Offsuit: AKo
        }
    }

    public async Task<object> GetPlayersOverviewAsync(PlayersQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClause = options.MinHands.HasValue ? $"WHERE total_hands >= {options.MinHands.Value}" : "";
        var limitClause = options.Limit.HasValue ? $"LIMIT {options.Limit.Value}" : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT id, name, total_hands, total_profit FROM players
            {whereClause}
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

    public async Task<object> GetAnalysisStatsAsync(AnalysisFilters filters)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
        var parameters = new List<SqliteParameter>();

        // Base join
        var joinClause = "";
        var profitCol = "ph.net_profit";
        
        if (!string.IsNullOrEmpty(filters.HeroName))
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
            parameters.Add(new SqliteParameter("@heroName", filters.HeroName));
        }
        else
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = h.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }

        // Date Filters
        if (!string.IsNullOrEmpty(filters.DateFrom))
        {
            whereClauses.Add("h.date_time >= @dateFrom");
            parameters.Add(new SqliteParameter("@dateFrom", filters.DateFrom));
        }
        if (!string.IsNullOrEmpty(filters.DateTo))
        {
            whereClauses.Add("h.date_time <= @dateTo");
            parameters.Add(new SqliteParameter("@dateTo", filters.DateTo));
        }

        // Position Filter
        if (filters.Positions != null && filters.Positions.Length > 0)
        {
            var posConditions = new List<string>();
            for (int i = 0; i < filters.Positions.Length; i++)
            {
                var p = filters.Positions[i];
                var paramName = $"@pos{i}";
                // Handle different position formats if needed, or strict match
                posConditions.Add($"(ph.position = {paramName} OR ph.position LIKE {paramName} || ' %' OR ph.position LIKE '% ' || {paramName})");
                parameters.Add(new SqliteParameter(paramName, p));
            }
            whereClauses.Add($"({string.Join(" OR ", posConditions)})");
        }

        // Situation & Action Filters
            if (!string.IsNullOrEmpty(filters.Situation))
            {
                var col = filters.Situation.ToLower() switch
                {
                    "preflop" => "preflop_action",
                    "flop" => "flop_action",
                    "turn" => "turn_action",
                    "river" => "river_action",
                    _ => null
                };

                if (col != null)
                {
                    if (!string.IsNullOrEmpty(filters.Action))
                    {
                        var action = filters.Action.ToLower();
                        // Basic text matching for actions
                        var verb = action switch {
                            "check" => "checks",
                            "bet" => "bets",
                            "raise" => "raises",
                            "call" => "calls",
                            "fold" => "folds",
                            "allin" => "all-in",
                            "all-in" => "all-in",
                            _ => action
                        };
                        whereClauses.Add($"h.{col} LIKE @actionLike");
                        parameters.Add(new SqliteParameter("@actionLike", $"%{verb}%"));
                    }
                }
            }
            else if (!string.IsNullOrEmpty(filters.Action))
            {
                // Action anywhere
                var action = filters.Action.ToLower();
                var verb = action switch {
                    "check" => "checks",
                    "bet" => "bets",
                    "raise" => "raises",
                    "call" => "calls",
                    "fold" => "folds",
                    "allin" => "all-in",
                    "all-in" => "all-in",
                    _ => action
                };
                whereClauses.Add($"(h.preflop_action LIKE @actionGlobal OR h.flop_action LIKE @actionGlobal OR h.turn_action LIKE @actionGlobal OR h.river_action LIKE @actionGlobal)");
                parameters.Add(new SqliteParameter("@actionGlobal", $"%{verb}%"));
            }

            // Per-street Action Filters (Done in memory for detailed Hero/Villain logic)
            // SQL filtering for specific actions is removed to avoid complexity with Hero identification in SQL.
            // If needed, we can add basic LIKE filters if the user wants "Any Check" etc. but current UI splits Hero/Villain.

            // Stack Filter (Approximate in SQL)
            if (filters.MinStackBB.HasValue || filters.MaxStackBB.HasValue)
            {
                // Try to parse BB from blinds string "100/200" -> 200
                // SQL: CAST(substr(blinds, instr(blinds, '/') + 1) AS INTEGER)
                // Stack BB = stack / BB
                var stackCol = "ph.stack";
                
                if (filters.MinStackBB.HasValue)
                {
                    whereClauses.Add($"({stackCol} * 1.0 / CAST(substr(h.blinds, instr(h.blinds, '/') + 1) AS INTEGER)) >= @minStack");
                    parameters.Add(new SqliteParameter("@minStack", filters.MinStackBB.Value));
                }
                if (filters.MaxStackBB.HasValue)
                {
                    whereClauses.Add($"({stackCol} * 1.0 / CAST(substr(h.blinds, instr(h.blinds, '/') + 1) AS INTEGER)) <= @maxStack");
                    parameters.Add(new SqliteParameter("@maxStack", filters.MaxStackBB.Value));
                }
            }

            // Player Count Filter
            if (filters.PlayerCount.HasValue)
            {
                whereClauses.Add("h.player_count = @playerCount");
                parameters.Add(new SqliteParameter("@playerCount", filters.PlayerCount.Value));
            }

            var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        // Main Query
        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                COUNT(*) as count,
                SUM(CASE WHEN {profitCol} > 0 THEN 1 ELSE 0 END) as won_hands,
                SUM({profitCol}) as total_profit,
                AVG({profitCol}) as avg_profit,
                SUM(CASE WHEN h.preflop_action LIKE '%raises%' OR h.preflop_action LIKE '%bets%' OR h.preflop_action LIKE '%calls%' THEN 1 ELSE 0 END) as vpip_count,
                SUM(CASE WHEN h.preflop_action LIKE '%raises%' THEN 1 ELSE 0 END) as pfr_count,
                SUM(CASE WHEN h.preflop_action LIKE '%raises%' AND h.preflop_action LIKE '%raises%' THEN 1 ELSE 0 END) as three_bet_count, -- Approximate
                SUM(CASE WHEN h.went_to_showdown = 1 THEN 1 ELSE 0 END) as wtsd_count,
                SUM(CASE WHEN h.went_to_showdown = 1 AND {profitCol} > 0 THEN 1 ELSE 0 END) as wsd_count,
                SUM(CASE WHEN h.preflop_action LIKE '%bets%' OR h.preflop_action LIKE '%raises%' OR h.flop_action LIKE '%bets%' OR h.flop_action LIKE '%raises%' OR h.turn_action LIKE '%bets%' OR h.turn_action LIKE '%raises%' OR h.river_action LIKE '%bets%' OR h.river_action LIKE '%raises%' THEN 1 ELSE 0 END) as agg_count,
                SUM(CASE WHEN h.preflop_action LIKE '%calls%' OR h.flop_action LIKE '%calls%' OR h.turn_action LIKE '%calls%' OR h.river_action LIKE '%calls%' THEN 1 ELSE 0 END) as passive_count
            FROM hands h
            {joinClause}
            {whereClause}";

        foreach (var p in parameters) cmd.Parameters.Add(p);

        var stats = new AnalysisStats();
        
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                stats.TotalHands = reader.IsDBNull(0) ? 0 : reader.GetInt32(0);
                stats.WonHands = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
                stats.TotalProfit = reader.IsDBNull(2) ? 0.0 : reader.GetDouble(2);
                
                if (stats.TotalHands > 0)
                {
                    var vpipCount = reader.IsDBNull(4) ? 0 : reader.GetInt32(4);
                    var pfrCount = reader.IsDBNull(5) ? 0 : reader.GetInt32(5);
                    var wtsdCount = reader.IsDBNull(7) ? 0 : reader.GetInt32(7);
                    var wsdCount = reader.IsDBNull(8) ? 0 : reader.GetInt32(8);
                    
                    stats.Vpip = (double)vpipCount / stats.TotalHands * 100;
                    stats.Pfr = (double)pfrCount / stats.TotalHands * 100;
                    stats.Wtsd = (double)wtsdCount / stats.TotalHands * 100;
                    stats.Wsd = wtsdCount > 0 ? (double)wsdCount / wtsdCount * 100 : 0;
                    
                    // Aggression Frequency: (Bet + Raise) / (Bet + Raise + Call + Fold) 
                    // Simplified here: (Bet + Raise) / (Bet + Raise + Call)
                    var aggCount = reader.IsDBNull(9) ? 0 : reader.GetInt32(9);
                    var passiveCount = reader.IsDBNull(10) ? 0 : reader.GetInt32(10);
                    stats.AggressionFreq = (aggCount + passiveCount) > 0 ? (double)aggCount / (aggCount + passiveCount) * 100 : 0;
                }
            }
        }

        // Get Graph Data (Group by Date)
        // Simplified to top 100 data points for performance if needed, or all points
        using var cmdGraph = connection.CreateCommand();
        cmdGraph.CommandText = $@"
            SELECT 
                h.date_time, 
                SUM({profitCol}) as profit
            FROM hands h
            {joinClause}
            {whereClause}
            GROUP BY date(h.date_time)
            ORDER BY h.date_time";
        foreach (var p in parameters) cmdGraph.Parameters.Add(p);

        using (var reader = await cmdGraph.ExecuteReaderAsync())
        {
            double cumProfit = 0;
            while (await reader.ReadAsync())
            {
                var profit = reader.IsDBNull(1) ? 0.0 : reader.GetDouble(1);
                cumProfit += profit;
                stats.GraphData.Add(new AnalysisGraphPoint 
                { 
                    Date = reader.GetString(0), 
                    Profit = profit,
                    CumulativeProfit = cumProfit 
                });
            }
        }

        return stats;
    }

    public class AnalysisStats
    {
        public int TotalHands { get; set; }
        public int WonHands { get; set; }
        public double TotalProfit { get; set; }
        public double Vpip { get; set; }
        public double Pfr { get; set; }
        public double ThreeBet { get; set; }
        public double Wtsd { get; set; }
        public double Wsd { get; set; }
        public double AggressionFreq { get; set; }
        public List<AnalysisGraphPoint> GraphData { get; set; } = new();
    }

    public class AnalysisGraphPoint
    {
        public string Date { get; set; } = "";
        public double Profit { get; set; }
        public double CumulativeProfit { get; set; }
    }

    public async Task<List<ParsedHand>> GetAllHandsForAnalysisAsync(string? heroName = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        
        var selectFields = "*";
        var joinClause = "";
        
        if (!string.IsNullOrEmpty(heroName))
        {
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = @heroName";
            selectFields = "hands.*, ph.player_name as dyn_hero_name, ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown";
            cmd.Parameters.AddWithValue("@heroName", heroName);
        }
        else
        {
            // Field Analysis: Get ALL players for each hand, treating each as a potential hero
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id";
            selectFields = "hands.*, ph.player_name as dyn_hero_name, ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown";
        }

        cmd.CommandText = $"SELECT {selectFields} FROM hands {joinClause} ORDER BY date_time";

        var hands = new List<ParsedHand>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            hands.Add(ReadParsedHandFromReader(reader));
        }

        return hands;
    }

    public async Task<List<ParsedHand>> GetFilteredHandsForStatsAsync(AnalysisFilters filters)
    {
        _logger.LogInformation($"GetFilteredHandsForStatsAsync: Starting with HeroName='{filters.HeroName}', PlayerCount={filters.PlayerCount}");
        
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
        var parameters = new List<SqliteParameter>();

        var selectFields = "*";
        var joinClause = "";
        
        if (!string.IsNullOrEmpty(filters.HeroName))
        {
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = @heroName";
        }
        else
        {
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = (SELECT player_name FROM player_hands ph2 WHERE ph2.hand_id = hands.id AND ph2.cards IS NOT NULL AND ph2.cards != '' LIMIT 1)";
        }
        selectFields = "hands.*, ph.player_name as dyn_hero_name, ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown, ph.stack as dyn_hero_stack";

        // Date Filters
        if (!string.IsNullOrEmpty(filters.DateFrom))
        {
            whereClauses.Add("hands.date_time >= @dateFrom");
            parameters.Add(new SqliteParameter("@dateFrom", filters.DateFrom));
        }
        if (!string.IsNullOrEmpty(filters.DateTo))
        {
            whereClauses.Add("hands.date_time <= @dateTo");
            parameters.Add(new SqliteParameter("@dateTo", filters.DateTo));
        }

        // Position Filter
        if (filters.Positions != null && filters.Positions.Length > 0)
        {
            var posConditions = new List<string>();
            for (int i = 0; i < filters.Positions.Length; i++)
            {
                var p = filters.Positions[i];
                var paramName = $"@pos{i}";
                // Handle different position formats if needed, or strict match
                posConditions.Add($"(ph.position = {paramName} OR ph.position LIKE {paramName} || ' %' OR ph.position LIKE '% ' || {paramName})");
                parameters.Add(new SqliteParameter(paramName, p));
            }
            whereClauses.Add($"({string.Join(" OR ", posConditions)})");
        }

        // Situation & Action Filters
        if (!string.IsNullOrEmpty(filters.Situation))
        {
            var col = filters.Situation.ToLower() switch
            {
                "preflop" => "preflop_action",
                "flop" => "flop_action",
                "turn" => "turn_action",
                "river" => "river_action",
                _ => null
            };

            if (col != null)
            {
                if (!string.IsNullOrEmpty(filters.Action))
                {
                    var action = filters.Action.ToLower();
                    var verb = action switch {
                        "check" => "checks",
                        "bet" => "bets",
                        "raise" => "raises",
                        "call" => "calls",
                        "fold" => "folds",
                        "allin" => "all-in",
                        "all-in" => "all-in",
                        _ => action
                    };
                    whereClauses.Add($"hands.{col} LIKE @actionLike");
                    parameters.Add(new SqliteParameter("@actionLike", $"%{verb}%"));
                }
            }
        }
        else if (!string.IsNullOrEmpty(filters.Action))
        {
            var action = filters.Action.ToLower();
            var verb = action switch {
                "check" => "checks",
                "bet" => "bets",
                "raise" => "raises",
                "call" => "calls",
                "fold" => "folds",
                "allin" => "all-in",
                "all-in" => "all-in",
                _ => action
            };
            whereClauses.Add($"(hands.preflop_action LIKE @actionGlobal OR hands.flop_action LIKE @actionGlobal OR hands.turn_action LIKE @actionGlobal OR hands.river_action LIKE @actionGlobal)");
            parameters.Add(new SqliteParameter("@actionGlobal", $"%{verb}%"));
        }

        // Stack Filter
        if (filters.MinStackBB.HasValue || filters.MaxStackBB.HasValue)
        {
            var stackCol = "ph.stack";
            
            if (filters.MinStackBB.HasValue)
            {
                whereClauses.Add($"({stackCol} * 1.0 / CAST(substr(hands.blinds, instr(hands.blinds, '/') + 1) AS INTEGER)) >= @minStack");
                parameters.Add(new SqliteParameter("@minStack", filters.MinStackBB.Value));
            }
            if (filters.MaxStackBB.HasValue)
            {
                whereClauses.Add($"({stackCol} * 1.0 / CAST(substr(hands.blinds, instr(hands.blinds, '/') + 1) AS INTEGER)) <= @maxStack");
                parameters.Add(new SqliteParameter("@maxStack", filters.MaxStackBB.Value));
            }
        }

        // Player Count Filter
        if (filters.PlayerCount.HasValue)
        {
            whereClauses.Add("hands.player_count = @playerCount");
            parameters.Add(new SqliteParameter("@playerCount", filters.PlayerCount.Value));
        }

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT {selectFields} FROM hands {joinClause} {whereClause} ORDER BY date_time";
        
        _logger.LogInformation($"GetFilteredHandsForStatsAsync: SQL Query: {cmd.CommandText}");
        _logger.LogInformation($"GetFilteredHandsForStatsAsync: Where clauses count: {whereClauses.Count}");
        
        foreach (var p in parameters) cmd.Parameters.Add(p);

        var handsDict = new Dictionary<string, ParsedHand>();
        using var reader = await cmd.ExecuteReaderAsync();
        int rowCount = 0;
        while (await reader.ReadAsync())
        {
            var handId = reader.GetString(reader.GetOrdinal("id"));
            if (!handsDict.ContainsKey(handId))
            {
                handsDict[handId] = ReadParsedHandFromReader(reader);
                handsDict[handId].Players = new List<PlayerInfo>();
            }
            
            // Add player from current row
            var playerName = GetStringOrNull(reader, "dyn_hero_name");
            if (!string.IsNullOrEmpty(playerName))
            {
                var existingPlayer = handsDict[handId].Players.FirstOrDefault(p => p.Name == playerName);
                if (existingPlayer == null)
                {
                    handsDict[handId].Players.Add(new PlayerInfo
                    {
                        Name = playerName,
                        Stack = GetInt32OrNull(reader, "dyn_hero_stack") ?? 0,
                        Cards = GetStringOrNull(reader, "dyn_hero_cards") ?? "",
                        Position = GetStringOrNull(reader, "dyn_hero_position") ?? "",
                        IsHero = true, // We're evaluating from this player's perspective
                        NetProfit = GetDoubleOrNull(reader, "dyn_hero_profit") ?? 0,
                        IsAllIn = GetBoolOrNull(reader, "dyn_hero_all_in") ?? false,
                        WentToShowdown = GetBoolOrNull(reader, "dyn_went_to_showdown") ?? false
                    });
                }
            }
            rowCount++;
        }

        var hands = handsDict.Values.ToList();
        
        // Now load all players for each hand
        foreach (var hand in hands)
        {
            await LoadPlayersForHand(hand);
        }

        _logger.LogInformation($"GetFilteredHandsForStatsAsync: Retrieved {hands.Count} hands from database");
        return hands;
    }

    public async Task DeleteAllAnalyticsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE player_hands 
            SET ev_chips = NULL, 
                net_won_adjusted = net_profit, 
                equity_preflop = NULL, 
                equity_flop = NULL, 
                equity_turn = NULL, 
                equity_river = NULL, 
                cev_contribution = 0";
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<object> DeleteAllHandsAsync()
    {
        try
        {
            InitializeTables(forceRefresh: true);
            return new { success = true, message = "All data cleared and schema refreshed" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete all hands");
            return new { success = false, message = $"Failed to delete data: {ex.Message}" };
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
                game_id = GetStringOrNull(reader, "game_id"),
                hand_id = GetStringOrNull(reader, "hand_id"),
                room = GetStringOrNull(reader, "room"),
                game_mode = GetStringOrNull(reader, "game_mode"),
                game_type = GetStringOrNull(reader, "game_type"),
                game_name = GetStringOrNull(reader, "game_name"),
                prize_pool = GetDoubleOrNull(reader, "prize_pool"),
                multiplier = GetInt32OrNull(reader, "multiplier"),
                buy_in = GetDoubleOrNull(reader, "buy_in"),
                date_time = GetStringOrNull(reader, "date_time"),
                table_id = GetStringOrNull(reader, "table_id"),
                blinds = GetStringOrNull(reader, "blinds"),
                total_pot = GetDoubleOrNull(reader, "total_pot"),
                rake = GetDoubleOrNull(reader, "rake"),
                hero_position = GetStringOrNull(reader, "dyn_hero_position"),
                hero_stack = GetInt32OrNull(reader, "dyn_hero_stack"),
                hero_cards = GetStringOrNull(reader, "dyn_hero_cards"),
                preflop_action = GetStringOrNull(reader, "preflop_action"),
                flop = GetStringOrNull(reader, "flop"),
                flop_action = GetStringOrNull(reader, "flop_action"),
                turn = GetStringOrNull(reader, "turn"),
                turn_action = GetStringOrNull(reader, "turn_action"),
                river = GetStringOrNull(reader, "river"),
                river_action = GetStringOrNull(reader, "river_action"),
                showdown = GetStringOrNull(reader, "showdown"),
                result = GetStringOrNull(reader, "result"),
                hero_profit = GetDoubleOrNull(reader, "dyn_hero_profit"),
                hero_all_in = GetBoolOrNull(reader, "dyn_hero_all_in"),
                went_to_showdown = GetBoolOrNull(reader, "dyn_went_to_showdown") ?? GetBoolOrNull(reader, "went_to_showdown"),
                player_count = GetInt32OrNull(reader, "player_count"),
                ev_chips = GetDoubleOrNull(reader, "ev_chips"),
                equity_preflop = GetDoubleOrNull(reader, "equity_preflop"),
                equity_flop = GetDoubleOrNull(reader, "equity_flop"),
                equity_turn = GetDoubleOrNull(reader, "equity_turn"),
                equity_river = GetDoubleOrNull(reader, "equity_river")
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
            PreflopAction = GetStringOrNull(reader, "preflop_action") ?? "",
            Flop = GetStringOrNull(reader, "flop"),
            FlopAction = GetStringOrNull(reader, "flop_action") ?? "",
            Turn = GetStringOrNull(reader, "turn"),
            TurnAction = GetStringOrNull(reader, "turn_action") ?? "",
            River = GetStringOrNull(reader, "river"),
            RiverAction = GetStringOrNull(reader, "river_action") ?? "",
            Showdown = GetStringOrNull(reader, "showdown") ?? "",
            Result = GetStringOrNull(reader, "result") ?? "",
            AllInStreet = GetStringOrNull(reader, "all_in_street"),
            WentToShowdown = GetBoolOrNull(reader, "dyn_went_to_showdown") ?? GetBoolOrNull(reader, "went_to_showdown") ?? false
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

    private async Task LoadPlayersForHand(ParsedHand hand)
    {
        if (string.IsNullOrEmpty(hand.Id)) return;
        
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT player_name, position, stack, cards, investment, chips_won, net_profit, is_all_in, went_to_showdown
            FROM player_hands
            WHERE hand_id = @handId";
        cmd.Parameters.AddWithValue("@handId", hand.Id);
        
        hand.Players.Clear();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var cards = reader.IsDBNull(3) ? "" : reader.GetString(3);
            hand.Players.Add(new PlayerInfo
            {
                Name = reader.GetString(0),
                Position = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Stack = reader.IsDBNull(2) ? 0 : reader.GetDouble(2),
                Cards = cards,
                Investment = reader.IsDBNull(4) ? 0 : reader.GetDouble(4),
                ChipsWon = reader.IsDBNull(5) ? 0 : reader.GetDouble(5),
                NetProfit = reader.IsDBNull(6) ? 0 : reader.GetDouble(6),
                IsHero = !string.IsNullOrEmpty(cards), // Heuristic: if they have cards, we treat as hero (might need refinement for showdown)
                IsAllIn = reader.IsDBNull(7) ? false : reader.GetInt32(7) == 1,
                WentToShowdown = reader.IsDBNull(8) ? false : reader.GetInt32(8) == 1
            });
        }
        
        // Set PlayerCount
        hand.PlayerCount = hand.Players.Count;
    }

    // --- Custom Stats CRUD ---

    public async Task<List<Dictionary<string, object>>> GetCustomStatsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var stats = new List<Dictionary<string, object>>();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT id, name, description, definition, created_at, updated_at FROM custom_stats ORDER BY name";

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var stat = new Dictionary<string, object>
            {
                ["id"] = reader.GetString(0),
                ["name"] = reader.GetString(1),
                ["description"] = reader.IsDBNull(2) ? "" : reader.GetString(2),
                ["definition"] = JsonSerializer.Deserialize<object>(reader.GetString(3)),
                ["createdAt"] = reader.GetDateTime(4),
                ["updatedAt"] = reader.GetDateTime(5)
            };
            stats.Add(stat);
        }
        return stats;
    }

    public async Task<Dictionary<string, object>?> GetCustomStatAsync(string id)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT id, name, description, definition, created_at, updated_at FROM custom_stats WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new Dictionary<string, object>
            {
                ["id"] = reader.GetString(0),
                ["name"] = reader.GetString(1),
                ["description"] = reader.IsDBNull(2) ? "" : reader.GetString(2),
                ["definition"] = JsonSerializer.Deserialize<object>(reader.GetString(3)),
                ["createdAt"] = reader.GetDateTime(4),
                ["updatedAt"] = reader.GetDateTime(5)
            };
        }
        return null;
    }

    public async Task SaveCustomStatAsync(string id, string name, string description, object definition)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO custom_stats (id, name, description, definition, updated_at)
            VALUES (@id, @name, @description, @definition, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                definition = excluded.definition,
                updated_at = excluded.updated_at
        ";

        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@name", name);
        cmd.Parameters.AddWithValue("@description", description ?? "");
        cmd.Parameters.AddWithValue("@definition", JsonSerializer.Serialize(definition));

        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeleteCustomStatAsync(string id)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM custom_stats WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await cmd.ExecuteNonQueryAsync();
    }
}
