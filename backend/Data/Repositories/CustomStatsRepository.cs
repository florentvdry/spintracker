using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Text.Json;

namespace SpinTrackerBackend.Data.Repositories;

public class CustomStatsRepository
{
    private readonly string _connectionString;

    public CustomStatsRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<List<Dictionary<string, object>>> GetCustomStatsAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var stats = new List<Dictionary<string, object>>();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT id, name, description, definition, created_at, updated_at FROM custom_stats ORDER BY name";

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var stat = new Dictionary<string, object>
            {
                ["id"] = reader.GetString(0),
                ["name"] = reader.GetString(1),
                ["description"] = reader.IsDBNull(2) ? "" : reader.GetString(2),
                ["definition"] = JsonSerializer.Deserialize<object>(reader.GetString(3)),
                ["createdAt"] = reader.GetDateTime(4),
                ["updatedAt"] = reader.GetDateTime(5)
            };
            stats.Add(stat);
        }
        return stats;
    }

    public async Task<Dictionary<string, object>?> GetCustomStatAsync(string id)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT id, name, description, definition, created_at, updated_at FROM custom_stats WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new Dictionary<string, object>
            {
                ["id"] = reader.GetString(0),
                ["name"] = reader.GetString(1),
                ["description"] = reader.IsDBNull(2) ? "" : reader.GetString(2),
                ["definition"] = JsonSerializer.Deserialize<object>(reader.GetString(3)),
                ["createdAt"] = reader.GetDateTime(4),
                ["updatedAt"] = reader.GetDateTime(5)
            };
        }
        return null;
    }

    public async Task SaveCustomStatAsync(string id, string name, string description, object definition)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO custom_stats (id, name, description, definition, updated_at)
            VALUES (@id, @name, @description, @definition, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                definition = excluded.definition,
                updated_at = excluded.updated_at
        ";

        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@name", name);
        cmd.Parameters.AddWithValue("@description", description ?? "");
        cmd.Parameters.AddWithValue("@definition", JsonSerializer.Serialize(definition));

        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeleteCustomStatAsync(string id)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM custom_stats WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await cmd.ExecuteNonQueryAsync();
    }
}