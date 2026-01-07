using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Npgsql;
using PokerTrackerBackend;
using Microsoft.Extensions.Logging.Abstractions;

public static class ComparisonTool
{
    private const string ConnectionString = "Host=localhost;Port=5432;Username=postgres;Password=dbpass;Database=PT4_2026_01_05_223628";

    public static async Task Run()
    {
        Console.WriteLine("Starting Comparison Tool...");

        var equityCalc = new EquityCalculator(NullLogger<EquityCalculator>.Instance);
        
        // DEBUG MANUAL EQUITY CHECK
        var eqRes = equityCalc.Calculate("Ad Ah", "Td 9c", "", 20000);
        Console.WriteLine($"[DEBUG MANUAL] AA vs T9o Equity: {eqRes.HeroEquity}");

        var analyticsCalc = new AnalyticsCalculator(equityCalc, NullLogger<AnalyticsCalculator>.Instance);

        // 1. Load and Parse Local Files
        var parser = new BetclicParser();
        var dataDir = Path.Combine(Directory.GetCurrentDirectory(), "..", "exemple-data", "Betclic");
        var files = Directory.GetFiles(dataDir, "*.txt");
        
        var localHands = new List<ParsedHand>();
        foreach (var file in files)
        {
            if (Path.GetFileName(file) == "excepted_result.txt") continue;
            var content = await File.ReadAllTextAsync(file);
            var result = parser.ParseFile(content);
            localHands.AddRange(result.Hands);
        }
        Console.WriteLine($"Loaded {localHands.Count} local hands.");

        // 2. Connect to PT4 DB and Fetch Data
        var pt4Data = new Dictionary<string, Pt4HandData>();
        
        try 
        {
            await using var conn = new NpgsqlConnection(ConnectionString);
            await conn.OpenAsync();
            Console.WriteLine("Connected to PT4 Database.");

            var sql = @"
                SELECT 
                    ths.hand_no,
                    thps.amt_won,
                    thps.flg_showdown,
                    thps.amt_expected_won
                FROM tourney_hand_player_statistics thps
                JOIN tourney_hand_summary ths ON thps.id_hand = ths.id_hand
                JOIN player p ON thps.id_player = p.id_player
                WHERE p.player_name = 'jmenfouu' 
            ";
            
            await using var cmd = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            
            while (await reader.ReadAsync())
            {
                var handNo = reader.GetString(0);
                var amtWon = reader.GetDouble(1);
                var flgShowdown = reader.GetBoolean(2);
                var amtExpectedWon = reader.IsDBNull(3) ? (double?)null : reader.GetDouble(3);

                pt4Data[handNo] = new Pt4HandData 
                { 
                    HandId = handNo, 
                    ChipsWon = amtWon, 
                    Showdown = flgShowdown,
                    NetExpectedChipsWon = amtExpectedWon
                };
            }
            Console.WriteLine($"Loaded {pt4Data.Count} PT4 hands for hero 'jmenfouu'.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error querying PT4 DB: {ex.Message}");
            return;
        }

        // 3. Compare
        int mismatchCount = 0;
        double totalLocalWon = 0;
        double totalPt4Won = 0;
        double totalLocalEv = 0;
        double totalPt4Ev = 0;
        double localShowdownWon = 0;
        double localNoShowdownWon = 0;
        
        int localShowdownCount = 0;
        int pt4ShowdownCount = 0;

        foreach (var localHand in localHands)
        {
            if (string.IsNullOrEmpty(localHand.HandId)) continue;
            
            if (pt4Data.TryGetValue(localHand.HandId, out var pt4Hand))
            {
                var analytics = analyticsCalc.CalculateHandAnalytics(localHand);
                bool mismatch = false;
                
                // Compare Showdown
                if (localHand.HeroWentToShowdown != pt4Hand.Showdown)
                {
                    Console.WriteLine($"[Mismatch Showdown] Hand {localHand.HandId}: Local={localHand.HeroWentToShowdown}, PT4={pt4Hand.Showdown}");
                    mismatch = true;
                }
                
                // Compare Profit
                if (Math.Abs(localHand.HeroProfit - pt4Hand.ChipsWon) > 0.01)
                {
                     Console.WriteLine($"[Mismatch Profit] Hand {localHand.HandId}: Local={localHand.HeroProfit}, PT4={pt4Hand.ChipsWon}");
                     mismatch = true;
                }

                double pt4Ev = pt4Hand.NetExpectedChipsWon ?? pt4Hand.ChipsWon;
                double localEv = analytics.NetWonAdjusted ?? localHand.HeroProfit;
                
                // Accumulate EV
                totalLocalEv += localEv;
                totalPt4Ev += pt4Ev;

                if (Math.Abs(localEv - pt4Ev) > 10.0)
                {
                     Console.WriteLine($"[Mismatch EV] Hand {localHand.HandId}: Local={localEv:F2}, PT4={pt4Ev:F2} (Diff={localEv-pt4Ev:F2})");
                     mismatch = true;
                }

                if (mismatch)
                {
                    mismatchCount++;
                    if (mismatchCount <= 5)
                    {
                        Console.WriteLine($"--- RAW LOCAL HAND {localHand.HandId} ---");
                        Console.WriteLine(localHand.Result);
                        Console.WriteLine("------------------------------------------");
                    }
                }
                
                totalLocalWon += localHand.HeroProfit;
                totalPt4Won += pt4Hand.ChipsWon;
                
                if (localHand.HeroWentToShowdown) 
                {
                    localShowdownCount++;
                    localShowdownWon += localHand.HeroProfit;
                }
                else
                {
                    localNoShowdownWon += localHand.HeroProfit;
                }

                if (pt4Hand.Showdown) pt4ShowdownCount++;
            }
        }

        Console.WriteLine($"Total Mismatches: {mismatchCount}");
        Console.WriteLine($"Total Local Won: {totalLocalWon:F2}, PT4 Won: {totalPt4Won:F2}");
        Console.WriteLine($"Local Showdown Won: {localShowdownWon:F2}, NoShowdown Won: {localNoShowdownWon:F2}");
        Console.WriteLine($"Total Local EV:  {totalLocalEv:F2}, PT4 EV:  {totalPt4Ev:F2}");
        Console.WriteLine($"Total Local Showdowns: {localShowdownCount}, PT4 Showdowns: {pt4ShowdownCount}");
    }

    class Pt4HandData
    {
        public string HandId { get; set; }
        public double ChipsWon { get; set; }
        public bool Showdown { get; set; }
        public double? NetExpectedChipsWon { get; set; }
    }
}
