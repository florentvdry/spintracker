using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using SpinTrackerBackend;
using SpinTrackerBackend.Data;
using System;
using System.Text.Json;

namespace SpinTrackerBackend.Data.Repositories;

public class HandRepository
{
    private readonly string _connectionString;
    private readonly ILogger<HandRepository> _logger;
    private readonly PlayerRepository _playerRepo;

    public HandRepository(string connectionString, ILogger<HandRepository> logger, PlayerRepository playerRepo)
    {
        _connectionString = connectionString;
        _logger = logger;
        _playerRepo = playerRepo;
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
            await _playerRepo.UpdatePlayerStatsAsync();
            
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
            whereClauses.Add("h.player_count <= 3");
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

            if (!string.IsNullOrEmpty(options.Opponent))
            {
                joinClause += " JOIN player_hands ph_opp ON h.id = ph_opp.hand_id";
                whereClauses.Add("ph_opp.player_name = @opponent");
                parameters.Add(new SqliteParameter("@opponent", options.Opponent));
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

    private async Task LoadPlayersForHand(ParsedHand hand)
    {
        if (string.IsNullOrEmpty(hand.Id)) return;
        
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT player_name, position, stack, cards, investment, chips_won, net_profit, is_all_in, went_to_showdown, ev_chips
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
                WentToShowdown = reader.IsDBNull(8) ? false : reader.GetInt32(8) == 1,
                EvChips = reader.IsDBNull(9) ? null : (double?)reader.GetDouble(9)
            });
        }
        
        // Set PlayerCount
        hand.PlayerCount = hand.Players.Count;
    }

    private int? TryGetOrdinal(SqliteDataReader reader, string columnName)
    {
        try { return reader.GetOrdinal(columnName); } catch { return null; }
    }

    private object ReadHandFromReader(SqliteDataReader reader)
    {
        try
        {
            var hand = new Dictionary<string, object?>();
            
            // Core fields always present in 'hands' table
            string[] coreFields = { 
                "id", "game_id", "hand_id", "room", "game_mode", "game_type", "game_name", 
                "prize_pool", "multiplier", "buy_in", "date_time", "table_id", "blinds", 
                "total_pot", "rake", "preflop_action", "flop", "flop_action", "turn", 
                "turn_action", "river", "river_action", "showdown", "result", "player_count" 
            };

            foreach (var field in coreFields)
            {
                int? idx = TryGetOrdinal(reader, field);
                if (idx.HasValue)
                {
                    if (reader.IsDBNull(idx.Value)) hand[field] = null;
                    else hand[field] = reader.GetValue(idx.Value);
                }
            }

            // Dynamic fields from JOINs
            hand["hero_position"] = DatabaseUtils.GetStringOrNull(reader, "dyn_hero_position");
            hand["hero_stack"] = DatabaseUtils.GetDoubleOrNull(reader, "dyn_hero_stack");
            hand["hero_cards"] = DatabaseUtils.GetStringOrNull(reader, "dyn_hero_cards");
            hand["hero_name"] = DatabaseUtils.GetStringOrNull(reader, "dyn_hero_name");
            hand["hero_profit"] = DatabaseUtils.GetDoubleOrNull(reader, "dyn_hero_profit");
            hand["hero_all_in"] = DatabaseUtils.GetBoolOrNull(reader, "dyn_hero_all_in") ?? false;
            hand["went_to_showdown"] = DatabaseUtils.GetBoolOrNull(reader, "dyn_went_to_showdown") ?? DatabaseUtils.GetBoolOrNull(reader, "went_to_showdown") ?? false;
            hand["ev_chips"] = DatabaseUtils.GetDoubleOrNull(reader, "ev_chips");
            
            // Analytics
            hand["equity_preflop"] = DatabaseUtils.GetDoubleOrNull(reader, "equity_preflop");
            hand["equity_flop"] = DatabaseUtils.GetDoubleOrNull(reader, "equity_flop");
            hand["equity_turn"] = DatabaseUtils.GetDoubleOrNull(reader, "equity_turn");
            hand["equity_river"] = DatabaseUtils.GetDoubleOrNull(reader, "equity_river");

            _logger.LogInformation($"Successfully read hand from DB: {hand["id"]}");
            return hand;
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error in ReadHandFromReader: {ex.Message}");
            throw;
        }
    }

    public async Task<object?> GetHandByIdAsync(string handId, string? heroName = null)
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
                WHERE h.id = @handId AND h.player_count <= 3";
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
                        Stack = reader.GetDouble(2),
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
                        EquityRiver = reader.IsDBNull(13) ? null : (double?)reader.GetDouble(13),
                        IsHero = heroName != null && reader.GetString(0).ToLower() == heroName.ToLower()
                    });
                }
            }
        }

        // Combine into a dictionary to return merged result
        var json = System.Text.Json.JsonSerializer.Serialize(handData);
        var result = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object>>(json);
        if (result != null)
        {
            result["players"] = players;
            return result;
        }

        return handData;
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
            WHERE h.game_id = @gameId AND h.player_count <= 3
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
            WHERE h.id IN ({string.Join(",", idParams)}) AND h.player_count <= 3
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
}