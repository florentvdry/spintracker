using System;
using System.IO;
using System.Data;
using Microsoft.Data.Sqlite;

namespace SpinTrackerBackend.Tools;

public static class DebugDatabaseTool
{
    public static void Run()
    {
        var dbPath = @"C:\Users\flore\Desktop\databases\poker_tracker.db";
        var connStr = $"Data Source={dbPath}";

        Console.WriteLine($"Inspecting database at: {dbPath}");

        try
        {
            using var connection = new SqliteConnection(connStr);
            connection.Open();

            using var cmdHands = connection.CreateCommand();
            cmdHands.CommandText = "SELECT COUNT(*) FROM hands";
            var handsCount = Convert.ToInt32(cmdHands.ExecuteScalar());
            Console.WriteLine($"Total hands in 'hands' table: {handsCount}");

            using var cmdPlayerHands = connection.CreateCommand();
            cmdPlayerHands.CommandText = "SELECT COUNT(*) FROM player_hands";
            var playerHandsCount = Convert.ToInt32(cmdPlayerHands.ExecuteScalar());
            Console.WriteLine($"Total hands in 'player_hands' table: {playerHandsCount}");

            if (handsCount > 0) {
                using var cmdSample = connection.CreateCommand();
                cmdSample.CommandText = "SELECT id, hand_id, date_time FROM hands LIMIT 5";
                using var reader = cmdSample.ExecuteReader();
                Console.WriteLine("\nSample hands:");
                while(reader.Read()) {
                    Console.WriteLine($"ID: {reader[0]}, HandID: {reader[1]}, Date: {reader[2]}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error inspecting database: {ex.Message}");
        }
    }
}
