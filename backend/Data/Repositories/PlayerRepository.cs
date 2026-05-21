using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using SpinTrackerBackend.Data;

namespace SpinTrackerBackend.Data.Repositories;

public class PlayerRepository
{
    private readonly string _connectionString;
    private readonly ILogger<PlayerRepository> _logger;

    public PlayerRepository(string connectionString, ILogger<PlayerRepository> logger)
    {
        _connectionString = connectionString;
        _logger = logger;
    }

    public async Task<object> GetPlayersOverviewAsync(PlayersQueryOptions options)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var whereClauses = new List<string>();
        var parameters = new List<SqliteParameter>();

        if (options.MinHands.HasValue)
        {
            whereClauses.Add("total_hands >= @minHands");
            parameters.Add(new SqliteParameter("@minHands", options.MinHands.Value));
        }

        if (!string.IsNullOrEmpty(options.IsRegFilter))
        {
            var isReg = options.IsRegFilter == "reg" ? 1 : 0;
            whereClauses.Add("is_reg = @isReg");
            parameters.Add(new SqliteParameter("@isReg", isReg));
        }

        var whereClause = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";
        var limitClause = options.Limit.HasValue ? $"LIMIT {options.Limit.Value}" : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT id, name, room, total_hands, total_profit, is_reg, is_reg_forced FROM players
            {whereClause}
            ORDER BY total_hands DESC
            {limitClause}";

        foreach (var param in parameters)
        {
            cmd.Parameters.Add(param);
        }

        var players = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            players.Add(new
            {
                id = reader.GetInt32(0),
                name = reader.GetString(1),
                room = reader.IsDBNull(2) ? null : reader.GetString(2),
                total_hands = reader.GetInt32(3),
                total_profit = reader.GetDouble(4),
                is_reg = reader.GetInt32(5) == 1,
                is_reg_forced = reader.GetInt32(6) == 1
            });
        }

        return players;
    }

    public async Task UpdatePlayerStatsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO players (name, room, total_hands, total_profit, total_ev_profit, is_reg, is_reg_forced, updated_at)
            SELECT 
                ph.player_name,
                (SELECT h.room FROM hands h WHERE h.id = ph.hand_id LIMIT 1) as room,
                COUNT(*) as total_hands,
                SUM(ph.net_profit) as total_profit,
                SUM(ph.net_won_adjusted) as total_ev_profit,
                CASE 
                    WHEN COUNT(*) >= 500 AND (SELECT is_reg_forced FROM players p2 WHERE p2.name = ph.player_name) = 0 THEN 1
                    WHEN (SELECT is_reg FROM players p2 WHERE p2.name = ph.player_name) = 1 THEN 1
                    ELSE 0
                END as is_reg,
                COALESCE((SELECT is_reg_forced FROM players p2 WHERE p2.name = ph.player_name), 0) as is_reg_forced,
                CURRENT_TIMESTAMP
            FROM player_hands ph
            JOIN hands h ON ph.hand_id = h.id
            WHERE h.player_count <= 3
            GROUP BY ph.player_name
            ON CONFLICT(name) DO UPDATE SET
                room = excluded.room,
                total_hands = excluded.total_hands,
                total_profit = excluded.total_profit,
                total_ev_profit = excluded.total_ev_profit,
                is_reg = excluded.is_reg,
                is_reg_forced = excluded.is_reg_forced,
                updated_at = excluded.updated_at";
        
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<AliasInfo>> GetAliasesAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT a.id, a.name, p.id, p.name, p.room
            FROM aliases a
            LEFT JOIN players p ON p.alias_id = a.id
            ORDER BY a.name, p.name";

        var aliases = new Dictionary<int, AliasInfo>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var aliasId = reader.GetInt32(0);
            if (!aliases.TryGetValue(aliasId, out var alias))
            {
                alias = new AliasInfo { Id = aliasId, Name = reader.GetString(1) };
                aliases[aliasId] = alias;
            }

            if (!reader.IsDBNull(2))
            {
                alias.Players.Add(new PlayerSummary
                {
                    Id = reader.GetInt32(2),
                    Name = reader.GetString(3),
                    Room = reader.IsDBNull(4) ? null : reader.GetString(4)
                });
            }
        }

        return aliases.Values.ToList();
    }

    public async Task<int> CreateAliasAsync(string name)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "INSERT INTO aliases (name) VALUES (@name); SELECT last_insert_rowid();";
        cmd.Parameters.AddWithValue("@name", name);

        var id = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(id);
    }

    public async Task DeleteAliasAsync(int aliasId)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        try
        {
            using var unlinkCmd = connection.CreateCommand();
            unlinkCmd.Transaction = transaction;
            unlinkCmd.CommandText = "UPDATE players SET alias_id = NULL WHERE alias_id = @id";
            unlinkCmd.Parameters.AddWithValue("@id", aliasId);
            await unlinkCmd.ExecuteNonQueryAsync();

            using var deleteCmd = connection.CreateCommand();
            deleteCmd.Transaction = transaction;
            deleteCmd.CommandText = "DELETE FROM aliases WHERE id = @id";
            deleteCmd.Parameters.AddWithValue("@id", aliasId);
            await deleteCmd.ExecuteNonQueryAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task LinkPlayerToAliasAsync(int playerId, int aliasId)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "UPDATE players SET alias_id = @aliasId WHERE id = @playerId";
        cmd.Parameters.AddWithValue("@aliasId", aliasId);
        cmd.Parameters.AddWithValue("@playerId", playerId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task UnlinkPlayerFromAliasAsync(int playerId)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "UPDATE players SET alias_id = NULL WHERE id = @playerId";
        cmd.Parameters.AddWithValue("@playerId", playerId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<bool> UpdatePlayerRegStatusAsync(int playerId, bool isReg)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE players 
            SET is_reg = @isReg, is_reg_forced = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = @playerId";
        
        cmd.Parameters.AddWithValue("@isReg", isReg ? 1 : 0);
        cmd.Parameters.AddWithValue("@playerId", playerId);

        var rowsAffected = await cmd.ExecuteNonQueryAsync();
        return rowsAffected > 0;
    }

    public async Task<bool> CheckPlayerIsRegAsync(string playerName)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT is_reg FROM players WHERE name = @name";
        cmd.Parameters.AddWithValue("@name", playerName);

        var result = await cmd.ExecuteScalarAsync();
        if (result != null && result != DBNull.Value)
        {
            return Convert.ToInt32(result) == 1;
        }
        return false;
    }

    public async Task<List<object>> GetOpponentsForHeroAsync(string heroName, int? limit = null)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT 
                p.id,
                v.player_name as name,
                (SELECT h.room FROM hands h WHERE h.id = v.hand_id LIMIT 1) as room,
                COUNT(DISTINCT v.hand_id) as hands_vs_hero,
                COALESCE(p.total_profit, 0) as total_profit,
                COALESCE(p.is_reg, 0) as is_reg,
                COALESCE(p.is_reg_forced, 0) as is_reg_forced
            FROM player_hands v
            JOIN player_hands hhero ON hhero.hand_id = v.hand_id AND hhero.player_name IN {DatabaseUtils.GetHeroResolutionSql("@heroName")}
            LEFT JOIN players p ON p.name = v.player_name
            WHERE v.player_name NOT IN {DatabaseUtils.GetHeroResolutionSql("@heroName")}
            GROUP BY v.player_name, p.id, p.total_profit, p.is_reg, p.is_reg_forced
            ORDER BY hands_vs_hero DESC
            {(limit.HasValue ? $"LIMIT {limit.Value}" : "")}";
        cmd.Parameters.AddWithValue("@heroName", heroName);

        var players = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            players.Add(new
            {
                id = reader.IsDBNull(0) ? 0 : reader.GetInt32(0),
                name = reader.GetString(1),
                room = reader.IsDBNull(2) ? null : reader.GetString(2),
                total_hands = reader.GetInt32(3),
                total_profit = reader.GetDouble(4),
                is_reg = reader.GetInt32(5) == 1,
                is_reg_forced = reader.GetInt32(6) == 1
            });
        }

        return players;
    }
}
