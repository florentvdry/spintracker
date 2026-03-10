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

    public Database(
        ILogger<Database> logger, 
        string? dbPath = null, 
        HudProfileRepository? hudProfileRepo = null, 
        CustomStatsRepository? customStatsRepo = null, 
        StatsRepository? statsRepo = null, 
        PlayerRepository? playerRepo = null)
    {
        _logger = logger;
        _hudProfileRepo = hudProfileRepo!;
        _customStatsRepo = customStatsRepo!;
        _statsRepo = statsRepo!;
        _playerRepo = playerRepo!;

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
            cmd.CommandText = @"
                DELETE FROM player_hands;
                DELETE FROM hands;
                DELETE FROM players;
            ";
            cmd.ExecuteNonQuery();

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

    public async Task<HashSet<string>> GetExistingHandIdsAsync()
    {
        var ids = new HashSet<string>();
        using (var connection = new SqliteConnection(_connectionString))
        {
            await connection.OpenAsync();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT id FROM hands";
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                ids.Add(reader.GetString(0));
            }
        }
        return ids;
    }

    public async Task<int> InsertHandsAndAnalyticsBatchAsync(List<ParsedHand> hands, List<HandAnalytics> analytics)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;

        try
        {
            var analyticsDict = analytics.ToDictionary(a => a.HandId);

            // Prepare Hands Insert Command
            using var handCmd = connection.CreateCommand();
            handCmd.Transaction = transaction;
            handCmd.CommandText = @"INSERT OR REPLACE INTO hands (
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

            var hParams = handCmd.Parameters;
            hParams.Add("@id", SqliteType.Text);
            hParams.Add("@game_id", SqliteType.Text);
            hParams.Add("@hand_id", SqliteType.Text);
            hParams.Add("@room", SqliteType.Text);
            hParams.Add("@game_mode", SqliteType.Text);
            hParams.Add("@game_type", SqliteType.Text);
            hParams.Add("@game_name", SqliteType.Text);
            hParams.Add("@prize_pool", SqliteType.Real);
            hParams.Add("@multiplier", SqliteType.Integer);
            hParams.Add("@buy_in", SqliteType.Real);
            hParams.Add("@date_time", SqliteType.Text);
            hParams.Add("@table_id", SqliteType.Text);
            hParams.Add("@blinds", SqliteType.Text);
            hParams.Add("@total_pot", SqliteType.Real);
            hParams.Add("@rake", SqliteType.Real);
            hParams.Add("@preflop_action", SqliteType.Text);
            hParams.Add("@flop", SqliteType.Text);
            hParams.Add("@flop_action", SqliteType.Text);
            hParams.Add("@turn", SqliteType.Text);
            hParams.Add("@turn_action", SqliteType.Text);
            hParams.Add("@river", SqliteType.Text);
            hParams.Add("@river_action", SqliteType.Text);
            hParams.Add("@showdown", SqliteType.Text);
            hParams.Add("@result", SqliteType.Text);
            hParams.Add("@all_in_street", SqliteType.Text);
            hParams.Add("@went_to_showdown", SqliteType.Integer);
            hParams.Add("@player_count", SqliteType.Integer);

            // Prepare Player Hands Insert Command
            using var playerCmd = connection.CreateCommand();
            playerCmd.Transaction = transaction;
            playerCmd.CommandText = @"INSERT OR REPLACE INTO player_hands (
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

            var pParams = playerCmd.Parameters;
            pParams.Add("@hand_id", SqliteType.Text);
            pParams.Add("@player_name", SqliteType.Text);
            pParams.Add("@position", SqliteType.Text);
            pParams.Add("@stack", SqliteType.Integer);
            pParams.Add("@cards", SqliteType.Text);
            pParams.Add("@investment", SqliteType.Real);
            pParams.Add("@chips_won", SqliteType.Real);
            pParams.Add("@net_profit", SqliteType.Real);
            pParams.Add("@is_all_in", SqliteType.Integer);
            pParams.Add("@went_to_showdown", SqliteType.Integer);
            pParams.Add("@ev_chips", SqliteType.Real);
            pParams.Add("@net_won_adjusted", SqliteType.Real);
            pParams.Add("@showdown_winning", SqliteType.Real);
            pParams.Add("@non_showdown_winning", SqliteType.Real);
            pParams.Add("@equity_preflop", SqliteType.Real);
            pParams.Add("@equity_flop", SqliteType.Real);
            pParams.Add("@equity_turn", SqliteType.Real);
            pParams.Add("@equity_river", SqliteType.Real);
            pParams.Add("@cev_contribution", SqliteType.Real);

            foreach (var hand in hands)
            {
                // Set Hand Parameters
                hParams["@id"].Value = hand.Id ?? "";
                hParams["@game_id"].Value = hand.GameId ?? "";
                hParams["@hand_id"].Value = hand.HandId ?? "";
                hParams["@room"].Value = hand.Room ?? "";
                hParams["@game_mode"].Value = hand.GameMode ?? "";
                hParams["@game_type"].Value = hand.GameType ?? "";
                hParams["@game_name"].Value = hand.GameName ?? "";
                hParams["@prize_pool"].Value = hand.PrizePool;
                hParams["@multiplier"].Value = hand.Multiplier;
                hParams["@buy_in"].Value = hand.BuyIn;
                hParams["@date_time"].Value = hand.DateTime ?? "";
                hParams["@table_id"].Value = hand.TableId ?? "";
                hParams["@blinds"].Value = hand.Blinds ?? "";
                hParams["@total_pot"].Value = hand.TotalPot;
                hParams["@rake"].Value = hand.Rake;
                hParams["@preflop_action"].Value = hand.PreflopAction ?? "";
                hParams["@flop"].Value = hand.Flop ?? "";
                hParams["@flop_action"].Value = hand.FlopAction ?? "";
                hParams["@turn"].Value = hand.Turn ?? "";
                hParams["@turn_action"].Value = hand.TurnAction ?? "";
                hParams["@river"].Value = hand.River ?? "";
                hParams["@river_action"].Value = hand.RiverAction ?? "";
                hParams["@showdown"].Value = hand.Showdown ?? "";
                hParams["@result"].Value = hand.Result ?? "";
                hParams["@all_in_street"].Value = hand.AllInStreet ?? "";
                hParams["@went_to_showdown"].Value = hand.WentToShowdown ? 1 : 0;
                hParams["@player_count"].Value = hand.PlayerCount;

                await handCmd.ExecuteNonQueryAsync();

                var handAnalytics = analyticsDict.GetValueOrDefault(hand.Id);

                foreach (var p in hand.Players)
                {
                    pParams["@hand_id"].Value = hand.Id;
                    pParams["@player_name"].Value = p.Name;
                    pParams["@position"].Value = p.Position ?? "";
                    pParams["@stack"].Value = (int)p.Stack;
                    pParams["@cards"].Value = p.Cards ?? "";
                    pParams["@investment"].Value = p.Investment;
                    pParams["@chips_won"].Value = p.ChipsWon;
                    pParams["@net_profit"].Value = p.NetProfit;
                    pParams["@is_all_in"].Value = p.IsAllIn ? 1 : 0;
                    pParams["@went_to_showdown"].Value = p.WentToShowdown ? 1 : 0;

                    if (p.IsHero && handAnalytics != null)
                    {
                        pParams["@ev_chips"].Value = (object)handAnalytics.EvChips ?? DBNull.Value;
                        pParams["@net_won_adjusted"].Value = (object)handAnalytics.NetWonAdjusted ?? p.NetProfit;
                        pParams["@showdown_winning"].Value = (object)handAnalytics.ChipsWonShowdown ?? (p.WentToShowdown ? p.NetProfit : 0);
                        pParams["@non_showdown_winning"].Value = (object)handAnalytics.ChipsWonNoShowdown ?? (!p.WentToShowdown ? p.NetProfit : 0);
                        pParams["@equity_preflop"].Value = (object)handAnalytics.EquityPreflop ?? DBNull.Value;
                        pParams["@equity_flop"].Value = (object)handAnalytics.EquityFlop ?? DBNull.Value;
                        pParams["@equity_turn"].Value = (object)handAnalytics.EquityTurn ?? DBNull.Value;
                        pParams["@equity_river"].Value = (object)handAnalytics.EquityRiver ?? DBNull.Value;
                        pParams["@cev_contribution"].Value = (object)handAnalytics.CevContribution ?? 0;
                    }
                    else
                    {
                        pParams["@ev_chips"].Value = DBNull.Value;
                        pParams["@net_won_adjusted"].Value = p.NetProfit;
                        pParams["@showdown_winning"].Value = p.WentToShowdown ? p.NetProfit : 0;
                        pParams["@non_showdown_winning"].Value = !p.WentToShowdown ? p.NetProfit : 0;
                        pParams["@equity_preflop"].Value = DBNull.Value;
                        pParams["@equity_flop"].Value = DBNull.Value;
                        pParams["@equity_turn"].Value = DBNull.Value;
                        pParams["@equity_river"].Value = DBNull.Value;
                        pParams["@cev_contribution"].Value = 0;
                    }

                    await playerCmd.ExecuteNonQueryAsync();
                }
                inserted++;
            }

            await transaction.CommitAsync();
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
