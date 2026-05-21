using Microsoft.Data.Sqlite;

namespace SpinTrackerBackend.Data;

public static class DatabaseUtils
{
    public static string? GetStringOrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
        }
        catch
        {
            // Log warning if logger available, but since static, perhaps not
            return null;
        }
    }

    public static double? GetDoubleOrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetDouble(ordinal);
        }
        catch
        {
            return null;
        }
    }

    public static int? GetInt32OrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
        }
        catch
        {
            return null;
        }
    }

    public static bool? GetBoolOrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal) == 1;
        }
        catch
        {
            return null;
        }
    }

    public static int? GetIntOrNull(SqliteDataReader reader, string columnName)
    {
        try
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
        }
        catch
        {
            return null;
        }
    }

    public static string GetHeroResolutionSql(string paramName = "@heroName")
    {
        return $"(SELECT name FROM players WHERE name = {paramName} UNION SELECT p.name FROM players p JOIN aliases a ON p.alias_id = a.id WHERE a.name = {paramName})";
    }
}
