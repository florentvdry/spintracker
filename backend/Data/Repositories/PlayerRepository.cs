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

        var whereClause = options.MinHands.HasValue ? $"WHERE total_hands >= {options.MinHands.Value}" : "";
        var limitClause = options.Limit.HasValue ? $"LIMIT {options.Limit.Value}" : "";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT id, name, total_hands, total_profit FROM players
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

    public async Task UpdatePlayerStatsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT OR REPLACE INTO players (name, total_hands, total_profit, total_ev_profit, updated_at)
            SELECT 
                ph.player_name,
                COUNT(*) as total_hands,
                SUM(ph.net_profit) as total_profit,
                SUM(ph.net_won_adjusted) as total_ev_profit,
                CURRENT_TIMESTAMP
            FROM player_hands ph
            JOIN hands h ON ph.hand_id = h.id
            WHERE h.player_count <= 3
            GROUP BY ph.player_name";
        
        await cmd.ExecuteNonQueryAsync();
    }
}