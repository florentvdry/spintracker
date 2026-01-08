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
        
        // Enable WAL mode and Foreign Keys
        using (var connection = new SqliteConnection(_connectionString))
        {
            connection.Open();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;
            ";
            cmd.ExecuteNonQuery();
        }

        InitializeTables();
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
                player_count INTEGER DEFAULT 2,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
                is_hero BOOLEAN DEFAULT 0,
                is_all_in BOOLEAN DEFAULT 0,
                went_to_showdown BOOLEAN DEFAULT 0,
                ev_chips REAL,
                showdown_winning REAL,
                non_showdown_winning REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (hand_id, player_name),
                FOREIGN KEY (hand_id) REFERENCES hands(id)
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
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_player_hands_hand ON player_hands(hand_id)";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS idx_player_hands_player ON player_hands(player_name)";
        cmd.ExecuteNonQuery();
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
                    total_pot, rake, hero_position, hero_stack, hero_cards,
                    villain_position, villain_stack, villain_cards, preflop_action,
                    flop, flop_action, turn, turn_action, river, river_action,
                    showdown, result, hero_investment, hero_profit, hero_net_profit, hero_all_in, villain_all_in, all_in_street, went_to_showdown, player_count
                ) VALUES (
                    @id, @game_id, @hand_id, @room, @game_mode, @game_type, @game_name,
                    @prize_pool, @multiplier, @buy_in, @date_time, @table_id, @blinds,
                    @total_pot, @rake, @hero_position, @hero_stack, @hero_cards,
                    @villain_position, @villain_stack, @villain_cards, @preflop_action,
                    @flop, @flop_action, @turn, @turn_action, @river, @river_action,
                    @showdown, @result, @hero_investment, @hero_profit, @hero_net_profit, @hero_all_in, @villain_all_in, @all_in_street, @went_to_showdown, @player_count
                )";
            
            // Re-use command for player hands
            using var cmdPlayers = connection.CreateCommand();
            cmdPlayers.Transaction = transaction;
            cmdPlayers.CommandText = @"
                INSERT OR REPLACE INTO player_hands (
                    hand_id, player_name, position, stack, cards, investment, 
                    chips_won, net_profit, is_hero, is_all_in, went_to_showdown
                ) VALUES (
                    @hand_id, @player_name, @position, @stack, @cards, @investment,
                    @chips_won, @net_profit, @is_hero, @is_all_in, @went_to_showdown
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
                        cmdPlayers.Parameters.AddWithValue("@is_hero", p.IsHero ? 1 : 0);
                        cmdPlayers.Parameters.AddWithValue("@is_all_in", p.IsAllIn ? 1 : 0);
                        cmdPlayers.Parameters.AddWithValue("@went_to_showdown", p.WentToShowdown ? 1 : 0);
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

            // Batch update players
            using var cmdUpdatePlayers = connection.CreateCommand();
            cmdUpdatePlayers.Transaction = transaction;
            cmdUpdatePlayers.CommandText = @"
                INSERT OR IGNORE INTO players (name, created_at, updated_at) VALUES (@name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
                UPDATE players 
                SET total_hands = total_hands + @hands, 
                    total_profit = total_profit + @profit,
                    updated_at = CURRENT_TIMESTAMP
                WHERE name = @name;
            ";

            foreach(var kvp in playerStats)
            {
                cmdUpdatePlayers.Parameters.Clear();
                cmdUpdatePlayers.Parameters.AddWithValue("@name", kvp.Key);
                cmdUpdatePlayers.Parameters.AddWithValue("@hands", kvp.Value.Hands);
                cmdUpdatePlayers.Parameters.AddWithValue("@profit", kvp.Value.Profit);
                await cmdUpdatePlayers.ExecuteNonQueryAsync();
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

    public async Task<int> InsertHandsAndAnalyticsBatchAsync(List<ParsedHand> hands, List<HandAnalytics> analytics)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;
        
        // Dictionary to aggregate player stats
        var playerStats = new Dictionary<string, (int Hands, double Profit)>();

        try
        {
            // 1. Insert Hands
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;
            cmd.CommandText = @"
                INSERT OR REPLACE INTO hands (
                    id, game_id, hand_id, room, game_mode, game_type, game_name,
                    prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                    total_pot, rake, hero_position, hero_stack, hero_cards,
                    villain_position, villain_stack, villain_cards, preflop_action,
                    flop, flop_action, turn, turn_action, river, river_action,
                    showdown, result, hero_investment, hero_profit, hero_net_profit, hero_all_in, villain_all_in, all_in_street, went_to_showdown, player_count
                ) VALUES (
                    @id, @game_id, @hand_id, @room, @game_mode, @game_type, @game_name,
                    @prize_pool, @multiplier, @buy_in, @date_time, @table_id, @blinds,
                    @total_pot, @rake, @hero_position, @hero_stack, @hero_cards,
                    @villain_position, @villain_stack, @villain_cards, @preflop_action,
                    @flop, @flop_action, @turn, @turn_action, @river, @river_action,
                    @showdown, @result, @hero_investment, @hero_profit, @hero_net_profit, @hero_all_in, @villain_all_in, @all_in_street, @went_to_showdown, @player_count
                )";
            
            // 2. Insert Player Hands
            using var cmdPlayers = connection.CreateCommand();
            cmdPlayers.Transaction = transaction;
            cmdPlayers.CommandText = @"
                INSERT OR REPLACE INTO player_hands (
                    hand_id, player_name, position, stack, cards, investment, 
                    chips_won, net_profit, is_hero, is_all_in, went_to_showdown
                ) VALUES (
                    @hand_id, @player_name, @position, @stack, @cards, @investment,
                    @chips_won, @net_profit, @is_hero, @is_all_in, @went_to_showdown
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
                        cmdPlayers.Parameters.AddWithValue("@is_hero", p.IsHero ? 1 : 0);
                        cmdPlayers.Parameters.AddWithValue("@is_all_in", p.IsAllIn ? 1 : 0);
                        cmdPlayers.Parameters.AddWithValue("@went_to_showdown", p.WentToShowdown ? 1 : 0);
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

            // 3. Insert Analytics
            using var cmdAnalytics = connection.CreateCommand();
            cmdAnalytics.Transaction = transaction;
            cmdAnalytics.CommandText = @"
                INSERT OR REPLACE INTO hands_analytics (
                    hand_id, ev_chips, net_won_adjusted, equity_preflop, equity_flop,
                    equity_turn, equity_river, chips_won_showdown, chips_won_no_showdown, cev_contribution
                ) VALUES (
                    @hand_id, @ev_chips, @net_won_adjusted, @equity_preflop, @equity_flop,
                    @equity_turn, @equity_river, @chips_won_showdown, @chips_won_no_showdown, @cev_contribution
                )";

            foreach (var analytic in analytics)
            {
                cmdAnalytics.Parameters.Clear();
                cmdAnalytics.Parameters.AddWithValue("@hand_id", analytic.HandId ?? "");
                cmdAnalytics.Parameters.AddWithValue("@ev_chips", analytic.EvChips.HasValue ? (object)analytic.EvChips.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@net_won_adjusted", analytic.NetWonAdjusted.HasValue ? (object)analytic.NetWonAdjusted.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@equity_preflop", analytic.EquityPreflop.HasValue ? (object)analytic.EquityPreflop.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@equity_flop", analytic.EquityFlop.HasValue ? (object)analytic.EquityFlop.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@equity_turn", analytic.EquityTurn.HasValue ? (object)analytic.EquityTurn.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@equity_river", analytic.EquityRiver.HasValue ? (object)analytic.EquityRiver.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@chips_won_showdown", analytic.ChipsWonShowdown.HasValue ? (object)analytic.ChipsWonShowdown.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@chips_won_no_showdown", analytic.ChipsWonNoShowdown.HasValue ? (object)analytic.ChipsWonNoShowdown.Value : DBNull.Value);
                cmdAnalytics.Parameters.AddWithValue("@cev_contribution", analytic.CevContribution.HasValue ? (object)analytic.CevContribution.Value : DBNull.Value);

                await cmdAnalytics.ExecuteNonQueryAsync();
            }

            // 4. Batch update players
            using var cmdUpdatePlayers = connection.CreateCommand();
            cmdUpdatePlayers.Transaction = transaction;
            cmdUpdatePlayers.CommandText = @"
                INSERT OR IGNORE INTO players (name, created_at, updated_at) VALUES (@name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
                UPDATE players 
                SET total_hands = total_hands + @hands, 
                    total_profit = total_profit + @profit,
                    updated_at = CURRENT_TIMESTAMP
                WHERE name = @name;
            ";

            foreach(var kvp in playerStats)
            {
                cmdUpdatePlayers.Parameters.Clear();
                cmdUpdatePlayers.Parameters.AddWithValue("@name", kvp.Key);
                cmdUpdatePlayers.Parameters.AddWithValue("@hands", kvp.Value.Hands);
                cmdUpdatePlayers.Parameters.AddWithValue("@profit", kvp.Value.Profit);
                await cmdUpdatePlayers.ExecuteNonQueryAsync();
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
        _logger.LogInformation($"GetHandsAsync called with limit={options.Limit}, page={options.Page}, hero={options.HeroName}");
        try
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            var whereClauses = new List<string>();
            var parameters = new List<SqliteParameter>();
            var joinClause = "LEFT JOIN hands_analytics a ON h.id = a.hand_id";
            
            if (!string.IsNullOrEmpty(options.HeroName))
            {
                joinClause += " JOIN player_hands ph ON h.id = ph.hand_id";
                whereClauses.Add("ph.player_name = @heroName");
                parameters.Add(new SqliteParameter("@heroName", options.HeroName));
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
                    if (!string.IsNullOrEmpty(options.HeroName))
                    {
                        // ph.position stores "SB", "BTN", "BTN SB" etc.
                        whereClauses.Add("(ph.position = @position OR ph.position LIKE @posLike)");
                    }
                    else
                    {
                        whereClauses.Add("(hero_position = @position OR hero_position LIKE @posLike)");
                    }
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
                var profitCol = !string.IsNullOrEmpty(options.HeroName) ? "ph.net_profit" : "hero_profit";
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
            
            var selectFields = "h.*, a.ev_chips, a.equity_preflop, a.equity_flop, a.equity_turn, a.equity_river";
            if (!string.IsNullOrEmpty(options.HeroName))
            {
                selectFields += ", ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown";
            }

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

    public async Task<object> GetDashboardStatsAsync(string? heroName = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var joinClause = "LEFT JOIN hands_analytics a ON h.id = a.hand_id";
        var profitCol = "hero_profit";
        
        if (!string.IsNullOrEmpty(heroName))
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
            profitCol = "ph.net_profit";
        }

        // 1. Basic stats from SQL (Hands Won, Total EV)
        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                COUNT(*) as total_hands,
                SUM(CASE WHEN {profitCol} > 0 THEN 1 ELSE 0 END) as hands_won,
                COALESCE(SUM(a.ev_chips), 0) as total_ev
            FROM hands h
            {joinClause}";

        if (!string.IsNullOrEmpty(heroName))
        {
            cmd.Parameters.AddWithValue("@heroName", heroName);
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
        var sessions = await GetSessionsInternalAsync(null, heroName); 
        
        double totalProfitEuro = sessions.Sum(s => s.Profit);
        
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
            sessions_this_month = sessionsThisMonth,
            avg_multiplier = 0.0,
            best_win = 0.0
        };
    }

    public async Task<List<object>> GetSessionHistoryAsync(int limit, string? heroName = null)
    {
        var sessions = await GetSessionsInternalAsync(null, heroName); 
        
        return sessions.Take(limit).Select(s => (object)new {
            room = s.Room,
            tournaments = s.Tournaments,
            hands_played = s.Hands,
            profit = s.Profit,
            session_date = s.StartTime.ToString("yyyy-MM-dd HH:mm")
        }).ToList();
    }

    private record SessionInfo(DateTime StartTime, string Room, int Tournaments, int Hands, double Profit);

    private async Task<List<SessionInfo>> GetSessionsInternalAsync(int? limit, string? heroName = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var cmd = connection.CreateCommand();
        
        var joinClause = "";
        var profitCol = "hero_profit";
        
        if (!string.IsNullOrEmpty(heroName))
        {
            joinClause = "JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
            profitCol = "ph.net_profit";
            cmd.Parameters.AddWithValue("@heroName", heroName);
        }

        // Fetch necessary columns to group sessions and calculate profit
        cmd.CommandText = $@"
            SELECT h.date_time, h.room, h.game_id, h.buy_in, h.prize_pool, {profitCol}, h.player_count 
            FROM hands h 
            {joinClause}
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

        var joinClause = "LEFT JOIN hands_analytics a ON h.id = a.hand_id";
        var profitCol = "h.hero_profit";
        var evCol = "COALESCE(a.net_won_adjusted, h.hero_profit)";
        var showdownCondition = @"(COALESCE(h.showdown,'') != '' 
                                  OR h.result LIKE '%*** SHOWDOWN ***%' 
                                  OR h.result LIKE '%shows [%' 
                                  OR h.result LIKE '%: [%'
                                  OR (h.hero_all_in = 1 AND h.villain_all_in = 1))";

        if (!string.IsNullOrEmpty(options.HeroName))
        {
            joinClause += " JOIN player_hands ph ON h.id = ph.hand_id AND ph.player_name = @heroName";
            profitCol = "ph.net_profit";
            // Use analytics (NetWonAdjusted) only if the selected player is the Hero of the hand.
            // Otherwise (for villains), fallback to NetProfit.
            evCol = "CASE WHEN ph.is_hero = 1 THEN COALESCE(a.net_won_adjusted, ph.net_profit) ELSE ph.net_profit END";
            showdownCondition = "ph.went_to_showdown = 1";
            parameters.Add(new SqliteParameter("@heroName", options.HeroName));
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
        
        var cardsCol = "hero_cards";
        var profitCol = "hero_profit";
        var joinClause = "";
        
        if (!string.IsNullOrEmpty(filters.HeroName))
        {
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = @heroName";
            cardsCol = "ph.cards";
            profitCol = "ph.net_profit";
            cmd.Parameters.AddWithValue("@heroName", filters.HeroName);
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
            SELECT * FROM players
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
            selectFields = "hands.*, ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown";
            cmd.Parameters.AddWithValue("@heroName", heroName);
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
        try
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            // Disable foreign keys to ensure we can delete everything without constraint issues
            using (var cmdPragma = connection.CreateCommand())
            {
                cmdPragma.CommandText = "PRAGMA foreign_keys = OFF;";
                await cmdPragma.ExecuteNonQueryAsync();
            }

            using var transaction = connection.BeginTransaction();

            try
            {
                using var cmd = connection.CreateCommand();
                cmd.Transaction = transaction;

                cmd.CommandText = "DELETE FROM hands_analytics";
                await cmd.ExecuteNonQueryAsync();

                cmd.CommandText = "DELETE FROM player_hands";
                await cmd.ExecuteNonQueryAsync();

                cmd.CommandText = "DELETE FROM leaks";
                await cmd.ExecuteNonQueryAsync();

                cmd.CommandText = "DELETE FROM hands";
                await cmd.ExecuteNonQueryAsync();

                cmd.CommandText = "DELETE FROM sessions";
                await cmd.ExecuteNonQueryAsync();

                cmd.CommandText = "DELETE FROM players";
                await cmd.ExecuteNonQueryAsync();

                // Reset auto-increment counters
                cmd.CommandText = "DELETE FROM sqlite_sequence";
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
                hero_position = GetStringOrNull(reader, "dyn_hero_position") ?? GetStringOrNull(reader, "hero_position"),
                hero_stack = GetInt32OrNull(reader, "hero_stack"),
                hero_cards = GetStringOrNull(reader, "dyn_hero_cards") ?? GetStringOrNull(reader, "hero_cards"),
                villain_position = GetStringOrNull(reader, "villain_position"),
                villain_stack = GetInt32OrNull(reader, "villain_stack"),
                villain_cards = GetStringOrNull(reader, "villain_cards"),
                preflop_action = GetStringOrNull(reader, "preflop_action"),
                flop = GetStringOrNull(reader, "flop"),
                flop_action = GetStringOrNull(reader, "flop_action"),
                turn = GetStringOrNull(reader, "turn"),
                turn_action = GetStringOrNull(reader, "turn_action"),
                river = GetStringOrNull(reader, "river"),
                river_action = GetStringOrNull(reader, "river_action"),
                showdown = GetStringOrNull(reader, "showdown"),
                result = GetStringOrNull(reader, "result"),
                hero_profit = GetDoubleOrNull(reader, "dyn_hero_profit") ?? GetDoubleOrNull(reader, "hero_profit"),
                hero_all_in = GetBoolOrNull(reader, "dyn_hero_all_in") ?? GetBoolOrNull(reader, "hero_all_in"),
                villain_all_in = GetBoolOrNull(reader, "villain_all_in"),
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
            HeroPosition = GetStringOrNull(reader, "dyn_hero_position") ?? GetStringOrNull(reader, "hero_position"),
            HeroStack = GetInt32OrNull(reader, "hero_stack") ?? 0,
            HeroCards = GetStringOrNull(reader, "dyn_hero_cards") ?? GetStringOrNull(reader, "hero_cards"),
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
            HeroProfit = GetDoubleOrNull(reader, "dyn_hero_profit") ?? GetDoubleOrNull(reader, "hero_profit") ?? 0,
            HeroNetProfit = GetDoubleOrNull(reader, "hero_net_profit") ?? 0,
            HeroAllIn = GetBoolOrNull(reader, "dyn_hero_all_in") ?? GetBoolOrNull(reader, "hero_all_in") ?? false,
            VillainAllIn = GetBoolOrNull(reader, "villain_all_in") ?? false,
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
}
