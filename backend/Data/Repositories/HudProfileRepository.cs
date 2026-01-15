using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Text.Json;

namespace SpinTrackerBackend.Data.Repositories;

public class HudProfileRepository
{
    private readonly string _connectionString;

    public HudProfileRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<List<Dictionary<string, object>>> GetHudProfilesAsync()
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        var profiles = new List<Dictionary<string, object>>();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT id, name, layout, is_active, created_at, updated_at FROM hud_profiles ORDER BY name";

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var profile = new Dictionary<string, object>
            {
                ["id"] = reader.GetString(0),
                ["name"] = reader.GetString(1),
                ["layout"] = JsonSerializer.Deserialize<object>(reader.GetString(2)),
                ["isActive"] = reader.GetBoolean(3),
                ["createdAt"] = reader.GetDateTime(4),
                ["updatedAt"] = reader.GetDateTime(5)
            };
            profiles.Add(profile);
        }
        return profiles;
    }

    public async Task SaveHudProfileAsync(string id, string name, object layout, bool isActive)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();
        try
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = transaction;

            if (isActive)
            {
                // Deactivate others
                cmd.CommandText = "UPDATE hud_profiles SET is_active = 0";
                await cmd.ExecuteNonQueryAsync();
            }

            cmd.Parameters.Clear();
            cmd.CommandText = @"
                INSERT INTO hud_profiles (id, name, layout, is_active, updated_at)
                VALUES (@id, @name, @layout, @isActive, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    layout = excluded.layout,
                    is_active = excluded.is_active,
                    updated_at = excluded.updated_at
            ";

            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@name", name);
            cmd.Parameters.AddWithValue("@layout", JsonSerializer.Serialize(layout));
            cmd.Parameters.AddWithValue("@isActive", isActive ? 1 : 0);

            await cmd.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task DeleteHudProfileAsync(string id)
    {
        using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM hud_profiles WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);

        await cmd.ExecuteNonQueryAsync();
    }
}