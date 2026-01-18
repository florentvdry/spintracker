using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Data.Repositories;

public class AnalyticsRepository
{
    private readonly string _connectionString;
    private readonly ILogger<AnalyticsRepository> _logger;

    public AnalyticsRepository(string connectionString, ILogger<AnalyticsRepository> logger)
    {
        _connectionString = connectionString;
        _logger = logger;
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

    public async Task<List<ParsedHand>> GetAllHandsForAnalysisAsync(string? heroName = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        
        var selectFields = "*";
        var joinClause = "";
        

        if (!string.IsNullOrEmpty(heroName))
        {
            // When a specific hero is requested, join to player_hands to get hero-specific columns
            joinClause = "JOIN player_hands ph ON hands.id = ph.hand_id AND ph.player_name = @heroName";
            selectFields = "hands.*, ph.player_name as dyn_hero_name, ph.net_profit as dyn_hero_profit, ph.cards as dyn_hero_cards, ph.position as dyn_hero_position, ph.is_all_in as dyn_hero_all_in, ph.went_to_showdown as dyn_went_to_showdown";
            cmd.Parameters.AddWithValue("@heroName", heroName);
            cmd.CommandText = $"SELECT {selectFields} FROM hands {joinClause} WHERE hands.player_count <= 3 ORDER BY date_time";
        }
        else
        {
            // Field Analysis: do not JOIN player_hands here because that would return one row per player
            // We'll load players per-hand after fetching unique hands to avoid duplicates.
            cmd.CommandText = "SELECT hands.* FROM hands WHERE player_count <= 3 ORDER BY date_time";
        }

        var hands = new List<ParsedHand>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            hands.Add(ReadParsedHandFromReader(reader));
        }

        // Load player info for each hand so analysis engines have access to players and hero flags
        foreach (var hand in hands)
        {
            try
            {
                await LoadPlayersForHand(hand);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Failed loading players for hand {hand.Id}: {ex.Message}");
            }
        }

        return hands;
    }

    // Note: ReadParsedHandFromReader and LoadPlayersForHand need to be moved to a shared utility or kept in Database
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
            WHERE {cardsCol} IS NOT NULL AND {cardsCol} != '' AND hands.player_count <= 3";

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

    public async Task<List<AnalysisHandData>> GetHandsForAnalysisAsync(AnalysisFilters filters)
    {
        _logger.LogInformation($"GetHandsForAnalysisAsync called for hero={filters.HeroName}");
        try
        {
            using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync();

            var whereClauses = new List<string>();
            whereClauses.Add("h.player_count <= 3");
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
                var dateTo = filters.DateTo;
                if (dateTo.Length == 10) dateTo += " 23:59:59";
                whereClauses.Add("h.date_time <= @dateTo");
                parameters.Add(new SqliteParameter("@dateTo", dateTo));
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

    public async Task<List<ParsedHand>> GetFilteredHandsForStatsAsync(AnalysisFilters filters)
    {
        _logger.LogInformation($"GetFilteredHandsForStatsAsync: Starting with HeroName='{filters.HeroName}', PlayerCount={filters.PlayerCount}");
        
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
        whereClauses.Add("hands.player_count <= 3");
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
            var dateTo = filters.DateTo;
            if (dateTo.Length == 10) dateTo += " 23:59:59";
            whereClauses.Add("hands.date_time <= @dateTo");
            parameters.Add(new SqliteParameter("@dateTo", dateTo));
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
        cmd.CommandText = "DELETE FROM player_hands WHERE ev_chips IS NOT NULL";
        await cmd.ExecuteNonQueryAsync();
    }
}