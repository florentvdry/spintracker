using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Text.Json;
using SpinTrackerBackend;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public class Database
{
    private readonly string _connectionString;
    private readonly ILogger<Database> _logger;
    private readonly HudProfileRepository _hudProfileRepo;
    private readonly CustomStatsRepository _customStatsRepo;
    private readonly StatsRepository _statsRepo;
    private readonly PlayerRepository _playerRepo;

    public Database(ILogger<Database> logger, string? dbPath = null, HudProfileRepository? hudProfileRepo = null, CustomStatsRepository? customStatsRepo = null, StatsRepository? statsRepo = null, PlayerRepository? playerRepo = null)
    {
        _logger = logger;
        _hudProfileRepo = hudProfileRepo;
        _customStatsRepo = customStatsRepo;
        _statsRepo = statsRepo;
        _playerRepo = playerRepo;

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

        // Schema is now managed by FluentMigrator migrations run at startup.
        // Load default data if needed (migrations should have created the tables).
        LoadDefaultDataIfNeeded();
    }

    private void InitializeTables(bool forceRefresh = false)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();

        using var cmd = connection.CreateCommand();

        if (forceRefresh)
        {
            _logger.LogInformation("Forced refresh: clearing all data from database tables...");

            // Clear known application tables but keep schema intact (migrations manage schema)
            var tablesToClear = new[] { "player_hands", "hands", "players", "custom_stats", "hud_profiles", "config" };

            foreach (var table in tablesToClear)
            {
                cmd.CommandText = $"DELETE FROM {table};";
                try
                {
                    cmd.ExecuteNonQuery();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Could not clear table '{table}': {ex.Message}");
                }
            }

            // Reset AUTOINCREMENT counters where applicable
            try
            {
                cmd.CommandText = "DELETE FROM sqlite_sequence;";
                cmd.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Could not reset sqlite_sequence: {ex.Message}");
            }

            _logger.LogInformation("Database data cleared.");

            // Reload default records
            LoadDefaultDataIfNeeded();
        }
        else
        {
            _logger.LogInformation("InitializeTables: schema is managed by migrations; skipping table creation.");
        }
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
            _statsRepo.LoadDefaultStats();
        }

        // Load default profiles if empty
        if (profilesCount == 0)
        {
            _statsRepo.LoadDefaultHudProfiles();
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
            await _playerRepo.UpdatePlayerStatsAsync();

            return inserted;
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError($"Transaction failed: {ex.Message}");
            throw;
        }
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
}
