using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text.Json;
using SpinTrackerBackend;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public class Database
{
    private readonly string _connectionString;
    private readonly ILogger<Database> _logger;
    private readonly StatsRepository _statsRepo;
    private readonly PlayerRepository _playerRepo;

    public Database(
        ILogger<Database> logger, 
        string? dbPath = null, 
        StatsRepository? statsRepo = null, 
        PlayerRepository? playerRepo = null)
    {
        _logger = logger;
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
        }
        else
        {
            _logger.LogInformation("InitializeTables: schema is managed by migrations; skipping table creation.");
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
        if (hands.Count == 0) return 0;

        _logger.LogInformation($"[DB] Starting batch insert: {hands.Count} hands, {analytics.Count} analytics");

        var batchSw = Stopwatch.StartNew();
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;

        try
        {
            var analyticsDict = analytics.Where(a => a.HandId != null).ToDictionary(a => a.HandId!);

            var handsInsertSw = Stopwatch.StartNew();
            var handCmd = connection.CreateCommand();
            handCmd.Transaction = transaction;
            handCmd.CommandText = @"INSERT OR REPLACE INTO hands (
                id, game_id, hand_id, room, game_mode, game_type, game_name,
                prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                total_pot, rake, preflop_action,
                flop, flop_action, turn, turn_action, river, river_action,
                showdown, result, all_in_street, went_to_showdown, player_count, position,
                limit_type, game_variant, currency, button_seat, ante, tournament_id,
                tournament_name, tournament_level, buyin_currency, rake_per_player,
                structured_actions
            ) VALUES (
                @id, @game_id, @hand_id, @room, @game_mode, @game_type, @game_name,
                @prize_pool, @multiplier, @buy_in, @date_time, @table_id, @blinds,
                @total_pot, @rake, @preflop_action,
                @flop, @flop_action, @turn, @turn_action, @river, @river_action,
                @showdown, @result, @all_in_street, @went_to_showdown, @player_count, @position,
                @limit_type, @game_variant, @currency, @button_seat, @ante, @tournament_id,
                @tournament_name, @tournament_level, @buyin_currency, @rake_per_player,
                @structured_actions
            )";

            _logger.LogInformation($"[DB] SQL prepared, starting insert loop for {hands.Count} hands");

            foreach (var hand in hands)
            {
                if (string.IsNullOrEmpty(hand?.Id))
                {
                    _logger.LogWarning($"Skipping hand with null/empty Id");
                    continue;
                }

                handCmd.Parameters.Clear();
                handCmd.Parameters.AddWithValue("@id", hand.Id ?? "");
                handCmd.Parameters.AddWithValue("@game_id", hand.GameId ?? "");
                handCmd.Parameters.AddWithValue("@hand_id", hand.HandId ?? "");
                handCmd.Parameters.AddWithValue("@room", hand.Room ?? "");
                handCmd.Parameters.AddWithValue("@game_mode", hand.GameMode ?? "");
                handCmd.Parameters.AddWithValue("@game_type", hand.GameType ?? "");
                handCmd.Parameters.AddWithValue("@game_name", hand.GameName ?? "");
                handCmd.Parameters.AddWithValue("@prize_pool", hand.PrizePool);
                handCmd.Parameters.AddWithValue("@multiplier", hand.Multiplier);
                handCmd.Parameters.AddWithValue("@buy_in", hand.BuyIn);
                handCmd.Parameters.AddWithValue("@date_time", hand.DateTime ?? "");
                handCmd.Parameters.AddWithValue("@table_id", hand.TableId ?? "");
                handCmd.Parameters.AddWithValue("@blinds", hand.Blinds ?? "");
                handCmd.Parameters.AddWithValue("@total_pot", hand.TotalPot);
                handCmd.Parameters.AddWithValue("@rake", hand.Rake);
                handCmd.Parameters.AddWithValue("@preflop_action", hand.PreflopAction ?? "");
                handCmd.Parameters.AddWithValue("@flop", hand.Flop ?? "");
                handCmd.Parameters.AddWithValue("@flop_action", hand.FlopAction ?? "");
                handCmd.Parameters.AddWithValue("@turn", hand.Turn ?? "");
                handCmd.Parameters.AddWithValue("@turn_action", hand.TurnAction ?? "");
                handCmd.Parameters.AddWithValue("@river", hand.River ?? "");
                handCmd.Parameters.AddWithValue("@river_action", hand.RiverAction ?? "");
                handCmd.Parameters.AddWithValue("@showdown", hand.Showdown ?? "");
                handCmd.Parameters.AddWithValue("@result", hand.Result ?? "");
                handCmd.Parameters.AddWithValue("@all_in_street", hand.AllInStreet ?? "");
                handCmd.Parameters.AddWithValue("@went_to_showdown", hand.WentToShowdown ? 1 : 0);
                handCmd.Parameters.AddWithValue("@player_count", hand.PlayerCount);
                handCmd.Parameters.AddWithValue("@position", hand.Position);

                var structuredActionsJson = hand.StructuredActions != null 
                    ? JsonSerializer.Serialize(hand.StructuredActions) 
                    : null;
                handCmd.Parameters.AddWithValue("@limit_type", hand.LimitType ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@game_variant", hand.GameVariant ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@currency", hand.Currency ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@button_seat", hand.ButtonSeat ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@ante", hand.Ante ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@tournament_id", hand.TournamentId ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@tournament_name", hand.TournamentName ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@tournament_level", hand.TournamentLevel ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@buyin_currency", hand.BuyinCurrency ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@rake_per_player", hand.RakePerPlayer ?? (object)DBNull.Value);
                handCmd.Parameters.AddWithValue("@structured_actions", structuredActionsJson ?? (object)DBNull.Value);

                inserted += await handCmd.ExecuteNonQueryAsync();
            }
            handsInsertSw.Stop();
            _logger.LogInformation($"[DB] Inserted {inserted} hands in {handsInsertSw.ElapsedMilliseconds}ms");

            var playersInsertSw = Stopwatch.StartNew();
            var playerCmd = connection.CreateCommand();
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

            var playerCount = 0;
            foreach (var hand in hands)
            {
                if (string.IsNullOrEmpty(hand?.Id) || hand.Players == null) continue;
                
                var handAnalytics = !string.IsNullOrEmpty(hand.Id) && analyticsDict.TryGetValue(hand.Id, out var ha) ? ha : null;

                foreach (var p in hand.Players)
                {
                    if (string.IsNullOrEmpty(p?.Name)) continue;

                    playerCmd.Parameters.Clear();

                    object evChips = DBNull.Value, netWonAdj, showdownWin, nonShowdownWin;
                    object eqPreflop = DBNull.Value, eqFlop = DBNull.Value, eqTurn = DBNull.Value, eqRiver = DBNull.Value;
                    double cevContrib = 0;

                    if (p.IsHero && handAnalytics != null)
                    {
                        evChips = handAnalytics.EvChips.HasValue ? (object)handAnalytics.EvChips.Value : DBNull.Value;
                        netWonAdj = handAnalytics.NetWonAdjusted.HasValue ? (object)handAnalytics.NetWonAdjusted.Value : p.NetProfit;
                        showdownWin = handAnalytics.ChipsWonShowdown.HasValue ? (object)handAnalytics.ChipsWonShowdown.Value : (p.WentToShowdown ? p.NetProfit : 0);
                        nonShowdownWin = handAnalytics.ChipsWonNoShowdown.HasValue ? (object)handAnalytics.ChipsWonNoShowdown.Value : (!p.WentToShowdown ? p.NetProfit : 0);
                        eqPreflop = handAnalytics.EquityPreflop.HasValue ? (object)handAnalytics.EquityPreflop.Value : DBNull.Value;
                        eqFlop = handAnalytics.EquityFlop.HasValue ? (object)handAnalytics.EquityFlop.Value : DBNull.Value;
                        eqTurn = handAnalytics.EquityTurn.HasValue ? (object)handAnalytics.EquityTurn.Value : DBNull.Value;
                        eqRiver = handAnalytics.EquityRiver.HasValue ? (object)handAnalytics.EquityRiver.Value : DBNull.Value;
                        cevContrib = handAnalytics.CevContribution.HasValue ? handAnalytics.CevContribution.Value : 0;
                    }
                    else
                    {
                        netWonAdj = p.NetProfit;
                        showdownWin = p.WentToShowdown ? p.NetProfit : 0;
                        nonShowdownWin = !p.WentToShowdown ? p.NetProfit : 0;
                    }

                    playerCmd.Parameters.AddWithValue("@hand_id", hand.Id ?? "");
                    playerCmd.Parameters.AddWithValue("@player_name", p.Name ?? "");
                    playerCmd.Parameters.AddWithValue("@position", p.Position ?? "");
                    playerCmd.Parameters.AddWithValue("@stack", (int)p.Stack);
                    playerCmd.Parameters.AddWithValue("@cards", p.Cards ?? "");
                    playerCmd.Parameters.AddWithValue("@investment", p.Investment);
                    playerCmd.Parameters.AddWithValue("@chips_won", p.ChipsWon);
                    playerCmd.Parameters.AddWithValue("@net_profit", p.NetProfit);
                    playerCmd.Parameters.AddWithValue("@is_all_in", p.IsAllIn ? 1 : 0);
                    playerCmd.Parameters.AddWithValue("@went_to_showdown", p.WentToShowdown ? 1 : 0);
                    playerCmd.Parameters.AddWithValue("@ev_chips", evChips);
                    playerCmd.Parameters.AddWithValue("@net_won_adjusted", netWonAdj);
                    playerCmd.Parameters.AddWithValue("@showdown_winning", showdownWin);
                    playerCmd.Parameters.AddWithValue("@non_showdown_winning", nonShowdownWin);
                    playerCmd.Parameters.AddWithValue("@equity_preflop", eqPreflop);
                    playerCmd.Parameters.AddWithValue("@equity_flop", eqFlop);
                    playerCmd.Parameters.AddWithValue("@equity_turn", eqTurn);
                    playerCmd.Parameters.AddWithValue("@equity_river", eqRiver);
                    playerCmd.Parameters.AddWithValue("@cev_contribution", cevContrib);

                    await playerCmd.ExecuteNonQueryAsync();
                    playerCount++;
                }
            }
            playersInsertSw.Stop();
            _logger.LogInformation($"[DB] Inserted {playerCount} player_hands in {playersInsertSw.ElapsedMilliseconds}ms");

            await transaction.CommitAsync();
            batchSw.Stop();
            _logger.LogInformation($"[DB] Batch completed: {inserted} hands + {playerCount} players in {batchSw.ElapsedMilliseconds}ms total");
            return inserted;
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError($"Transaction failed: {ex.Message}\nStackTrace: {ex.StackTrace}");
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
