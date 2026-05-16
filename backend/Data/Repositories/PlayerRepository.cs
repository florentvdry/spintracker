using Microsoft.Data.Sqlite;
using System.Collections.Generic;

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
            INSERT OR REPLACE INTO players (id, name, room, total_hands, total_profit, total_ev_profit, is_reg, is_reg_forced, updated_at)
            SELECT 
                COALESCE((SELECT p.id FROM players p WHERE p.name = ph.player_name), NULL),
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
            GROUP BY ph.player_name";
        
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
            JOIN player_hands hhero ON hhero.hand_id = v.hand_id AND hhero.player_name = @heroName
            LEFT JOIN players p ON p.name = v.player_name
            WHERE v.player_name != @heroName
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
