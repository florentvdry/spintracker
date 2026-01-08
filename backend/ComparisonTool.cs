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
        var equityCalc = new EquityCalculator(NullLogger<EquityCalculator>.Instance);
        
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

        // 2. Connect to PT4 DB and Fetch Data
        var pt4Data = new Dictionary<string, Pt4HandData>();
        
        try 
        {
            await using var conn = new NpgsqlConnection(ConnectionString);
            await conn.OpenAsync();

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

        object lockObj = new object();
        int processedCount = 0;
        int totalToProcess = localHands.Count;

        Parallel.ForEach(localHands, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, localHand =>
        {
            if (string.IsNullOrEmpty(localHand.HandId)) return;
            
            if (pt4Data.TryGetValue(localHand.HandId, out var pt4Hand))
            {
                var analytics = analyticsCalc.CalculateHandAnalytics(localHand);
                bool mismatch = false;
                
                // Check if using pInfo makes a difference
                 var heroP = localHand.Players.FirstOrDefault(p => p.IsHero || p.Name == "jmenfouu");
                 bool heroWentToSd = heroP?.WentToShowdown ?? localHand.HeroWentToShowdown;
                 

 
                 // Compare Showdown
                if (heroWentToSd != pt4Hand.Showdown)
                {
                    lock(lockObj) Console.WriteLine($"[Mismatch Showdown] Hand {localHand.HandId}: Local={heroWentToSd}, PT4={pt4Hand.Showdown}");
                    mismatch = true;
                }
                
                // Compare Profit
                if (Math.Abs(localHand.HeroProfit - pt4Hand.ChipsWon) > 0.01)
                {
                     lock(lockObj) Console.WriteLine($"[Mismatch Profit] Hand {localHand.HandId}: Local={localHand.HeroProfit}, PT4={pt4Hand.ChipsWon}");
                     mismatch = true;
                }

                double pt4Ev = pt4Hand.NetExpectedChipsWon ?? pt4Hand.ChipsWon;
                double localEv = analytics.NetWonAdjusted ?? localHand.HeroProfit;
                
                if (Math.Abs(localEv - pt4Ev) > 0.05)
                {
                     lock(lockObj) Console.WriteLine($"[Mismatch EV] Hand {localHand.HandId}: Local={localEv:F2}, PT4={pt4Ev:F2} (Diff={localEv-pt4Ev:F2})");
                     mismatch = true;
                }

                lock (lockObj)
                {
                    processedCount++;
                    if (processedCount % 100 == 0) Console.Write($"\rProcessed {processedCount}/{totalToProcess}...");

                    // Accumulate EV
                    totalLocalEv += localEv;
                    totalPt4Ev += pt4Ev;

                    if (mismatch)
                    {
                        mismatchCount++;
                    }
                    
                    totalLocalWon += localHand.HeroProfit;
                    totalPt4Won += pt4Hand.ChipsWon;
                    
                    if (heroWentToSd) 
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
        });

        Console.WriteLine("\nComparison Finished.");

        Console.WriteLine($"Total Mismatches: {mismatchCount}");
        Console.WriteLine($"Total Local Won: {totalLocalWon:F2}, PT4 Won: {totalPt4Won:F2}");
        Console.WriteLine($"Local Showdown Won: {localShowdownWon:F2}, NoShowdown Won: {localNoShowdownWon:F2}");
        Console.WriteLine($"Total Local EV:  {totalLocalEv:F2}, PT4 EV:  {totalPt4Ev:F2}");
        Console.WriteLine($"Total Local Showdowns: {localShowdownCount}, PT4 Showdowns: {pt4ShowdownCount}");

        // 4. Check SQLite DB Consistency
        Console.WriteLine("\n--- Checking SQLite DB Consistency ---");
        try
        {
            var dbPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "poker_tracker.db");
            var connStr = $"Data Source={dbPath}";
            using var conn = new Microsoft.Data.Sqlite.SqliteConnection(connStr);
            await conn.OpenAsync();
            
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT 
                    SUM(ph.net_profit) as total_profit,
                    SUM(CASE WHEN ph.went_to_showdown = 1 THEN ph.net_profit ELSE 0 END) as showdown_profit,
                    SUM(CASE WHEN ph.went_to_showdown = 0 THEN ph.net_profit ELSE 0 END) as no_showdown_profit,
                    SUM(CASE WHEN ph.is_hero = 1 THEN COALESCE(a.net_won_adjusted, ph.net_profit) ELSE ph.net_profit END) as total_ev,
                    COUNT(*) as total_hands
                FROM player_hands ph
                LEFT JOIN hands_analytics a ON ph.hand_id = a.hand_id
                WHERE ph.player_name = 'jmenfouu'";
            
            using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                var dbProfit = reader.IsDBNull(0) ? 0 : reader.GetDouble(0);
                var dbShowdown = reader.IsDBNull(1) ? 0 : reader.GetDouble(1);
                var dbNoShowdown = reader.IsDBNull(2) ? 0 : reader.GetDouble(2);
                var dbEv = reader.IsDBNull(3) ? 0 : reader.GetDouble(3);
                var dbCount = reader.GetInt32(4);

                Console.WriteLine($"SQLite DB Stats for 'jmenfouu':");
                Console.WriteLine($"Total Hands: {dbCount}");
                Console.WriteLine($"Total Profit: {dbProfit:F2} (Local Parsed: {totalLocalWon:F2})");
                Console.WriteLine($"Showdown: {dbShowdown:F2} (Local Parsed: {localShowdownWon:F2})");
                Console.WriteLine($"No Showdown: {dbNoShowdown:F2} (Local Parsed: {localNoShowdownWon:F2})");
                Console.WriteLine($"Total EV: {dbEv:F2} (Local Parsed: {totalLocalEv:F2})");

                if (Math.Abs(dbProfit - totalLocalWon) > 1 || Math.Abs(dbShowdown - localShowdownWon) > 1)
                {
                    Console.WriteLine("CRITICAL: SQLite DB does not match Local Parsing! You must re-import hands.");
                    
                    // Find mismatches
                    Console.WriteLine("\n--- Checking specific hands for mismatches ---");
                    using var allCmd = conn.CreateCommand();
                    allCmd.CommandText = "SELECT hand_id, went_to_showdown FROM player_hands WHERE player_name = 'jmenfouu'";
                    var dbHands = new Dictionary<string, bool>();
                    using var allReader = await allCmd.ExecuteReaderAsync();
                    while (await allReader.ReadAsync())
                    {
                        var hid = allReader.GetString(0);
                        var wtsd = allReader.GetInt32(1) == 1;
                        dbHands[hid] = wtsd;
                    }
                    Console.WriteLine($"DB Loaded {dbHands.Count} hands for checking.");

                    int misCount = 0;
                    int checkedCount = 0;
                    foreach (var lh in localHands)
                    {
                        if (lh.HeroName != "jmenfouu") continue;
                        checkedCount++;
                        if (dbHands.TryGetValue(lh.Id, out var dbWtsd))
                        {
                            if (lh.HeroWentToShowdown != dbWtsd)
                            {
                                Console.WriteLine($"Mismatch Hand {lh.Id}: Local={lh.HeroWentToShowdown}, DB={dbWtsd}");
                                misCount++;
                                if (misCount >= 5) break;
                            }
                        }
                    }
                    Console.WriteLine($"Checked {checkedCount} local hands against DB.");
                }
                else
                {
                    Console.WriteLine("SUCCESS: SQLite DB matches Local Parsing.");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error checking SQLite DB: {ex.Message}");
        }
    }

    class Pt4HandData
    {
        public string HandId { get; set; }
        public double ChipsWon { get; set; }
        public bool Showdown { get; set; }
        public double? NetExpectedChipsWon { get; set; }
    }
}
