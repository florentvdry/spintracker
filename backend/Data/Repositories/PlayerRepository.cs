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
            SELECT id, name, total_hands, total_profit, is_reg, is_reg_forced FROM players
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
                total_hands = reader.GetInt32(2),
                total_profit = reader.GetDouble(3),
                is_reg = reader.GetInt32(4) == 1,
                is_reg_forced = reader.GetInt32(5) == 1
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
            INSERT OR REPLACE INTO players (name, total_hands, total_profit, total_ev_profit, is_reg, is_reg_forced, updated_at)
            SELECT 
                ph.player_name,
                COUNT(*) as total_hands,
                SUM(ph.net_profit) as total_profit,
                SUM(ph.net_won_adjusted / 1000.0) as total_ev_profit,
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
}
