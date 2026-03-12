using FluentMigrator;
using System;
using System.Text.Json;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SpinTrackerBackend.Data;

namespace SpinTrackerBackend.Migrations;

[Migration(20260111_001)]
public class InitialCreate20260111 : Migration
{
	public override void Up()
	{
		// Config table
		Execute.Sql(@"
			CREATE TABLE IF NOT EXISTS config (
				key TEXT PRIMARY KEY,
				value TEXT
			)
		");

		// Hands table
		Execute.Sql(@"
			CREATE TABLE IF NOT EXISTS hands (
				id TEXT PRIMARY KEY,
				game_id TEXT,
				hand_id TEXT,
				room TEXT,
				game_mode TEXT,
				game_type TEXT,
				game_name TEXT,
				prize_pool REAL,
				multiplier INTEGER,
				buy_in REAL,
				date_time TEXT,
				table_id TEXT,
				blinds TEXT,
				total_pot REAL,
				rake REAL,
				preflop_action TEXT,
				flop TEXT,
				flop_action TEXT,
				turn TEXT,
				turn_action TEXT,
				river TEXT,
				river_action TEXT,
				showdown TEXT,
				result TEXT,
				all_in_street TEXT,
				went_to_showdown BOOLEAN DEFAULT 0,
				player_count INTEGER DEFAULT 2,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		");

		// Player Hands table
		Execute.Sql(@"
			CREATE TABLE IF NOT EXISTS player_hands (
				hand_id TEXT,
				player_name TEXT,
				position TEXT,
				stack INTEGER,
				cards TEXT,
				investment REAL DEFAULT 0,
				chips_won REAL DEFAULT 0,
				net_profit REAL DEFAULT 0,
				is_all_in BOOLEAN DEFAULT 0,
				went_to_showdown BOOLEAN DEFAULT 0,
				ev_chips REAL,
				net_won_adjusted REAL,
				showdown_winning REAL,
				non_showdown_winning REAL,
				equity_preflop REAL,
				equity_flop REAL,
				equity_turn REAL,
				equity_river REAL,
				cev_contribution REAL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (hand_id, player_name),
				FOREIGN KEY (hand_id) REFERENCES hands(id)
			)
		");

		// Players table
		Execute.Sql(@"
			CREATE TABLE IF NOT EXISTS players (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT UNIQUE NOT NULL,
				total_hands INTEGER DEFAULT 0,
				total_profit REAL DEFAULT 0,
				total_ev_profit REAL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		");

		// Indexes
		Execute.Sql("CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time)");
		Execute.Sql("CREATE INDEX IF NOT EXISTS idx_hands_game_id ON hands(game_id)");
		Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_hand ON player_hands(hand_id)");
		Execute.Sql("CREATE INDEX IF NOT EXISTS idx_player_hands_player ON player_hands(player_name)");

		// Custom Stats table
		Execute.Sql(@"
			CREATE TABLE IF NOT EXISTS custom_stats (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				definition TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		");

		// HUD Profiles table
		Execute.Sql(@"
			CREATE TABLE IF NOT EXISTS hud_profiles (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				layout TEXT NOT NULL,
				is_active BOOLEAN DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		");

		// Try to automatically import JSON files if they exist next to the running assembly
		try
		{
			var stats = DefaultData.DefaultStats;
			if (stats != null)
			{
				foreach (var stat in stats)
				{
					string id = stat.ContainsKey("Id") ? stat["Id"]?.ToString() : null ?? Guid.NewGuid().ToString();
					string name = stat.ContainsKey("Name") ? stat["Name"]?.ToString() ?? "" : "";
					object? definitionObj = stat.ContainsKey("Definition") ? stat["Definition"] : null;
					string definition = definitionObj != null ? JsonSerializer.Serialize(definitionObj) : "{}";
					id = id.Replace("'", "''");
					name = name.Replace("'", "''");
					definition = definition.Replace("'", "''");
					Execute.Sql($"INSERT OR IGNORE INTO custom_stats (id,name,definition) VALUES ('{id}','{name}','{definition}')");
				}
			}
		}
		catch
		{
			// ignore import errors
		}

		try
		{
			var hudProfile = DefaultData.DefaultHudProfile;
			if (hudProfile != null)
			{
				string hudName = hudProfile.ContainsKey("name") ? hudProfile["name"]?.ToString() ?? "HUD" : "Minimalist Spin HUD";
				string hudId = hudName.ToLowerInvariant().Replace(' ', '_').Replace('-', '_');
				object? layoutObj = hudProfile.ContainsKey("layout") ? hudProfile["layout"] : null;
				string layout = layoutObj != null ? JsonSerializer.Serialize(layoutObj) : "[]";
				hudId = hudId.Replace("'", "''");
				hudName = hudName.Replace("'", "''");
				layout = layout.Replace("'", "''");
				Execute.Sql($"INSERT OR IGNORE INTO hud_profiles (id,name,layout,is_active) VALUES ('{hudId}','{hudName}','{layout}', 0)");
			}
		}
		catch
		{
			// ignore
		}
	}

	public override void Down()
	{
		Execute.Sql("DROP TABLE IF EXISTS hud_profiles");
		Execute.Sql("DROP TABLE IF EXISTS custom_stats");
		Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_player");
		Execute.Sql("DROP INDEX IF EXISTS idx_player_hands_hand");
		Execute.Sql("DROP INDEX IF EXISTS idx_hands_game_id");
		Execute.Sql("DROP INDEX IF EXISTS idx_hands_date");
		Execute.Sql("DROP TABLE IF EXISTS players");
		Execute.Sql("DROP TABLE IF EXISTS player_hands");
		Execute.Sql("DROP TABLE IF EXISTS hands");
		Execute.Sql("DROP TABLE IF EXISTS config");
	}
}


