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

        var batchSw = Stopwatch.StartNew();
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        var inserted = 0;

        try
        {
            var analyticsDict = analytics.Where(a => a.HandId != null).ToDictionary(a => a.HandId!);

            // Batch insert hands using multi-row VALUES for much better performance
            var handValues = new List<string>();
            var handParams = new List<SqliteParameter>();
            
            foreach (var hand in hands)
            {
                if (hand.Id == null || string.IsNullOrEmpty(hand.Id))
                {
                    _logger.LogWarning($"Skipping hand with null/empty Id");
                    continue;
                }
                
                handValues.Add(@"(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                handParams.Add(new SqliteParameter(null, hand.Id ?? ""));
                handParams.Add(new SqliteParameter(null, hand.GameId ?? ""));
                handParams.Add(new SqliteParameter(null, hand.HandId ?? ""));
                handParams.Add(new SqliteParameter(null, hand.Room ?? ""));
                handParams.Add(new SqliteParameter(null, hand.GameMode ?? ""));
                handParams.Add(new SqliteParameter(null, hand.GameType ?? ""));
                handParams.Add(new SqliteParameter(null, hand.GameName ?? ""));
                handParams.Add(new SqliteParameter(null, hand.PrizePool));
                handParams.Add(new SqliteParameter(null, hand.Multiplier));
                handParams.Add(new SqliteParameter(null, hand.BuyIn));
                handParams.Add(new SqliteParameter(null, hand.DateTime ?? ""));
                handParams.Add(new SqliteParameter(null, hand.TableId ?? ""));
                handParams.Add(new SqliteParameter(null, hand.Blinds ?? ""));
                handParams.Add(new SqliteParameter(null, hand.TotalPot));
                handParams.Add(new SqliteParameter(null, hand.Rake));
                handParams.Add(new SqliteParameter(null, hand.PreflopAction ?? ""));
                handParams.Add(new SqliteParameter(null, hand.Flop ?? ""));
                handParams.Add(new SqliteParameter(null, hand.FlopAction ?? ""));
                handParams.Add(new SqliteParameter(null, hand.Turn ?? ""));
                handParams.Add(new SqliteParameter(null, hand.TurnAction ?? ""));
                handParams.Add(new SqliteParameter(null, hand.River ?? ""));
                handParams.Add(new SqliteParameter(null, hand.RiverAction ?? ""));
                handParams.Add(new SqliteParameter(null, hand.Showdown ?? ""));
                handParams.Add(new SqliteParameter(null, hand.Result ?? ""));
                handParams.Add(new SqliteParameter(null, hand.AllInStreet ?? ""));
                handParams.Add(new SqliteParameter(null, hand.WentToShowdown ? 1 : 0));
                handParams.Add(new SqliteParameter(null, hand.PlayerCount));
            }

            var handsInsertSw = Stopwatch.StartNew();
            if (handValues.Count > 0)
            {
                var handSql = @"INSERT OR REPLACE INTO hands (
                    id, game_id, hand_id, room, game_mode, game_type, game_name,
                    prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                    total_pot, rake, preflop_action,
                    flop, flop_action, turn, turn_action, river, river_action,
                    showdown, result, all_in_street, went_to_showdown, player_count
                ) VALUES " + string.Join(", ", handValues);
                
                using var handCmd = connection.CreateCommand();
                handCmd.Transaction = transaction;
                handCmd.CommandText = handSql;
                handCmd.Parameters.AddRange(handParams.ToArray());
                
                inserted += await handCmd.ExecuteNonQueryAsync();
            }
            handsInsertSw.Stop();
            _logger.LogInformation($"[DB] Inserted {hands.Count} hands in {handsInsertSw.ElapsedMilliseconds}ms");

            // Batch insert player hands
            var playerValues = new List<string>();
            var playerParams = new List<SqliteParameter>();

            foreach (var hand in hands)
            {
                if (hand.Id == null || hand.Players == null) continue;
                
                var handAnalytics = hand.Id != null && analyticsDict.TryGetValue(hand.Id, out var ha) ? ha : null;

                foreach (var p in hand.Players)
                {
                    if (string.IsNullOrEmpty(p?.Name)) continue;
                    
                    playerValues.Add(@"(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

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

                    playerParams.Add(new SqliteParameter(null, hand.Id ?? ""));
                    playerParams.Add(new SqliteParameter(null, p.Name ?? ""));
                    playerParams.Add(new SqliteParameter(null, p.Position ?? ""));
                    playerParams.Add(new SqliteParameter(null, (int)p.Stack));
                    playerParams.Add(new SqliteParameter(null, p.Cards ?? ""));
                    playerParams.Add(new SqliteParameter(null, p.Investment));
                    playerParams.Add(new SqliteParameter(null, p.ChipsWon));
                    playerParams.Add(new SqliteParameter(null, p.NetProfit));
                    playerParams.Add(new SqliteParameter(null, p.IsAllIn ? 1 : 0));
                    playerParams.Add(new SqliteParameter(null, p.WentToShowdown ? 1 : 0));
                    playerParams.Add(new SqliteParameter(null, evChips));
                    playerParams.Add(new SqliteParameter(null, netWonAdj));
                    playerParams.Add(new SqliteParameter(null, showdownWin));
                    playerParams.Add(new SqliteParameter(null, nonShowdownWin));
                    playerParams.Add(new SqliteParameter(null, eqPreflop));
                    playerParams.Add(new SqliteParameter(null, eqFlop));
                    playerParams.Add(new SqliteParameter(null, eqTurn));
                    playerParams.Add(new SqliteParameter(null, eqRiver));
                    playerParams.Add(new SqliteParameter(null, cevContrib));
                }
            }

            var playersInsertSw = Stopwatch.StartNew();
            if (playerValues.Count > 0)
            {
                var playerSql = @"INSERT OR REPLACE INTO player_hands (
                    hand_id, player_name, position, stack, cards, investment, 
                    chips_won, net_profit, is_all_in, went_to_showdown,
                    ev_chips, net_won_adjusted, showdown_winning, non_showdown_winning,
                    equity_preflop, equity_flop, equity_turn, equity_river, cev_contribution
                ) VALUES " + string.Join(", ", playerValues);

                using var playerCmd = connection.CreateCommand();
                playerCmd.Transaction = transaction;
                playerCmd.CommandText = playerSql;
                playerCmd.Parameters.AddRange(playerParams.ToArray());
                
                await playerCmd.ExecuteNonQueryAsync();
            }
            playersInsertSw.Stop();
            _logger.LogInformation($"[DB] Inserted {playerParams.Count / 19} player_hands in {playersInsertSw.ElapsedMilliseconds}ms");

            await transaction.CommitAsync();
            batchSw.Stop();
            _logger.LogInformation($"[DB] Batch completed: {hands.Count} hands + {playerValues.Count} players in {batchSw.ElapsedMilliseconds}ms total");
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
