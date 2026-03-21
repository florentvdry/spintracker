using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using SpinTrackerBackend;
using SpinTrackerBackend.Engines;

namespace SpinTrackerBackend.Tools;

public static class PokerEvaluatorBenchmark
{
    public static async Task Run()
    {
        Console.WriteLine("╔════════════════════════════════════════════════════════════╗");
        Console.WriteLine("║         POKER EVALUATOR BENCHMARK TOOL                     ║");
        Console.WriteLine("╚════════════════════════════════════════════════════════════╝");
        Console.WriteLine();

        var dataDir = Path.Combine(Directory.GetCurrentDirectory(), "exemple-data", "Betclic");
        var files = Directory.GetFiles(dataDir, "*.txt")
            .Where(f => !Path.GetFileName(f).Contains("excepted"))
            .ToArray();

        Console.WriteLine($"Found {files.Length} data files to process");
        Console.WriteLine();

        var parser = new BetclicParser();
        
        var totalHands = new List<ParsedHand>();
        foreach (var file in files)
        {
            var content = await File.ReadAllTextAsync(file);
            var result = parser.ParseFile(content);
            totalHands.AddRange(result.Hands);
        }

        Console.WriteLine($"Total hands parsed: {totalHands.Count}");
        Console.WriteLine();

        var expected = ReadExpectedResults(Path.Combine(dataDir, "excepted_result.txt"));
        
        Console.WriteLine("=== BENCHMARK STARTING ===");
        Console.WriteLine();

        await RunEquityBenchmark(totalHands, expected);
    }

    private static async Task RunEquityBenchmark(List<ParsedHand> allHands, Dictionary<string, double> expected)
    {
        var equityCalc = new EquityCalculator(NullLogger<EquityCalculator>.Instance);
        var analyticsCalc = new AnalyticsCalculator(equityCalc, NullLogger<AnalyticsCalculator>.Instance);

        Console.WriteLine("Calculating EV for all hands...");
        var sw = Stopwatch.StartNew();
        
        var total = allHands.Count;
        var progress = 0;
        var processedCount = 0;
        var threadResults = new System.Collections.Concurrent.ConcurrentBag<BenchResult>();
        var allInCount = 0;
        var showdownCount = 0;
        var allInCountLock = new object();
        var showdownCountLock = new object();

        await Task.Run(() =>
        {
            Parallel.ForEach(allHands, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, hand =>
            {
                var analytics = analyticsCalc.CalculateHandAnalytics(hand);
                var hero = hand.Players.FirstOrDefault(p => p.IsHero);
                
                var position = hero?.Position ?? "";
                var playerCount = hand.PlayerCount;
                bool isAllIn = hero?.IsAllIn == true || hand.Players.Any(p => p.IsAllIn);
                bool wentToShowdown = hand.WentToShowdown || (hero?.WentToShowdown == true);
                
                threadResults.Add(new BenchResult
                {
                    HandId = hand.Id ?? "",
                    Position = position,
                    PlayerCount = playerCount,
                    Profit = hero?.NetProfit ?? 0,
                    Ev = analytics.NetWonAdjusted ?? hero?.NetProfit ?? 0,
                    CevContribution = analytics.CevContribution ?? 0,
                    IsAllIn = isAllIn,
                    WentToShowdown = wentToShowdown,
                    GameId = hand.GameId ?? ""
                });

                if (isAllIn)
                {
                    lock (allInCountLock) { allInCount++; }
                }
                if (wentToShowdown)
                {
                    lock (showdownCountLock) { showdownCount++; }
                }

                var currentProgress = Interlocked.Increment(ref processedCount);
                if (currentProgress % 500 == 0)
                {
                    Console.Write($"\r  Progress: {currentProgress}/{total} ({currentProgress * 100.0 / total:F1}%)");
                }
            });
        });

        Console.WriteLine($"\r  Progress: {total}/{total} (100.0%)");
        sw.Stop();

        var results = threadResults.ToList();
        Console.WriteLine();
        Console.WriteLine($"Calculation time: {sw.ElapsedMilliseconds}ms");
        Console.WriteLine($"Hands per second: {allHands.Count * 1000.0 / sw.ElapsedMilliseconds:F0}");
        Console.WriteLine();

        var totalTournaments = results.Select(r => r.GameId).Distinct().Count();
        var totalProfit = results.Sum(r => r.Profit);
        var totalEv = results.Sum(r => r.Ev);
        var chipsWithShowdown = results.Where(r => r.WentToShowdown).Sum(r => r.Profit);
        var chipsWithoutShowdown = results.Where(r => !r.WentToShowdown).Sum(r => r.Profit);

        Console.WriteLine($"Total Tournaments: {totalTournaments}");
        Console.WriteLine($"Total Profit: {totalProfit:F2} chips");
        Console.WriteLine($"Total EV: {totalEv:F2} chips");
        Console.WriteLine($"Chips with showdown: {chipsWithShowdown:F2}");
        Console.WriteLine($"Chips without showdown: {chipsWithoutShowdown:F2}");
        Console.WriteLine($"All-in hands: {allInCount}");
        Console.WriteLine($"Showdown hands: {showdownCount}");
        Console.WriteLine();

        var avgCevPerTournament = totalTournaments > 0 ? totalEv / totalTournaments : 0;
        Console.WriteLine($"CEV SpinnPro (avg/tournament): {avgCevPerTournament:F2}");
        Console.WriteLine();

        var byPosition = results.GroupBy(r => GetPositionKey(r.Position, r.PlayerCount))
            .ToDictionary(g => g.Key, g => new PosData 
            { 
                Profit = g.Sum(x => x.Profit), 
                Ev = g.Sum(x => x.Ev),
                Tournaments = g.Select(x => x.GameId).Distinct().Count(),
                Count = g.Count() 
            });

        Console.WriteLine("By Position (avg per tournament):");
        foreach (var (key, data) in byPosition.OrderBy(x => x.Key))
        {
            var avgEv = data.Tournaments > 0 ? data.Ev / data.Tournaments : 0;
            Console.WriteLine($"  {key}: Avg EV={avgEv:F2}, Profit={data.Profit:F2}, Tournaments={data.Tournaments}, Hands={data.Count}");
        }

        Console.WriteLine();
        Console.WriteLine("=== COMPARISON WITH EXPECTED (from excepted_result.txt) ===");
        Console.WriteLine();
        
        if (expected.Count == 0)
        {
            Console.WriteLine("WARNING: No expected values loaded from file!");
        }
        else
        {
            Console.WriteLine($"Loaded {expected.Count} expected values from Global section:");
            foreach (var kv in expected)
            {
                Console.WriteLine($"  {kv.Key}: {kv.Value}");
            }
        }
        
        Console.WriteLine($"{"Metric",-25} | {"Expected",12} | {"Actual",12} | {"Diff",8} | Status");
        Console.WriteLine(new string('-', 70));

        var allMatch = true;

        void Compare(string key, double actual)
        {
            if (!expected.ContainsKey(key)) return;
            var exp = expected[key];
            var diff = actual - exp;
            var match = Math.Abs(diff) <= 1 ? "MATCH" : "DIFF";
            if (Math.Abs(diff) > 1) allMatch = false;
            var displayKey = key.Length > 25 ? key.Substring(0, 22) + "..." : key;
            Console.WriteLine($"{displayKey,-25} | {exp,12:F2} | {actual,12:F2} | {diff,+8:F2} | {match}");
        }

        Compare("CEV SpinnPro", avgCevPerTournament);
        Compare("HU SB", byPosition.ContainsKey("HU SB") ? (byPosition["HU SB"].Tournaments > 0 ? byPosition["HU SB"].Ev / byPosition["HU SB"].Tournaments : 0) : 0);
        Compare("HU BB", byPosition.ContainsKey("HU BB") ? (byPosition["HU BB"].Tournaments > 0 ? byPosition["HU BB"].Ev / byPosition["HU BB"].Tournaments : 0) : 0);
        Compare("BTN", byPosition.ContainsKey("HU BTN") ? (byPosition["HU BTN"].Tournaments > 0 ? byPosition["HU BTN"].Ev / byPosition["HU BTN"].Tournaments : 0) : 
                       byPosition.ContainsKey("3W BTN") ? (byPosition["3W BTN"].Tournaments > 0 ? byPosition["3W BTN"].Ev / byPosition["3W BTN"].Tournaments : 0) : 0);
        Compare("3W SB", byPosition.ContainsKey("3W SB") ? (byPosition["3W SB"].Tournaments > 0 ? byPosition["3W SB"].Ev / byPosition["3W SB"].Tournaments : 0) : 0);
        Compare("3W BB", byPosition.ContainsKey("3W BB") ? (byPosition["3W BB"].Tournaments > 0 ? byPosition["3W BB"].Ev / byPosition["3W BB"].Tournaments : 0) : 0);
        
        Compare("Chips with showdown", chipsWithShowdown);
        Compare("Chips without showdown", chipsWithoutShowdown);
        Compare("Net Expected Chips Won", totalEv);

        Console.WriteLine();
        if (allMatch)
        {
            Console.WriteLine("SUCCESS: All values match within tolerance!");
        }
        else
        {
            Console.WriteLine("WARNING: Some values differ by more than 1 chip!");
        }
    }

    private static string GetPositionKey(string position, int playerCount)
    {
        var prefix = playerCount == 2 ? "HU" : "3W";
        var pos = position?.ToUpperInvariant() ?? "";
        
        if (pos.Contains("SB")) return prefix + " SB";
        if (pos.Contains("BB")) return prefix + " BB";
        if (pos.Contains("BTN") || pos.Contains("BUTTON")) return prefix + " BTN";
        if (pos.Contains("CO")) return prefix + " CO";
        if (pos.Contains("UTG")) return prefix + " UTG";
        
        return prefix + " " + pos;
    }

    private static Dictionary<string, double> ReadExpectedResults(string path)
    {
        var results = new Dictionary<string, double>();
        if (!File.Exists(path)) return results;

        var lines = File.ReadAllLines(path);
        
        var inGlobalSection = false;
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            trimmed = trimmed.TrimEnd('\r', '\n');
            if (string.IsNullOrEmpty(trimmed)) continue;
            
            if (trimmed.Contains("Global"))
            {
                inGlobalSection = true;
                results.Clear();
                continue;
            }
            
            if (trimmed.StartsWith("Betclic:"))
            {
                inGlobalSection = false;
                continue;
            }
            
            if (!inGlobalSection)
            {
                continue;
            }
            
            var parts = trimmed.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) continue;
            
            var lastPart = parts[parts.Length - 1];
            if (!double.TryParse(lastPart, out var value)) continue;
            
            if (trimmed.StartsWith("CEV SpinnPro"))
            {
                results["CEV SpinnPro"] = value;
            }
            else if (trimmed.StartsWith("CEV"))
            {
                var key = trimmed.Substring(3).Trim();
                results[key] = value;
            }
            else if (trimmed.Contains("Net excepted Chips Won"))
            {
                results["Net Expected Chips Won"] = value;
            }
            else if (trimmed.Contains("chips won with showdown"))
            {
                results["Chips with showdown"] = value;
            }
            else if (trimmed.Contains("chips won without showdown"))
            {
                results["Chips without showdown"] = value;
            }
            else if (trimmed.Contains("chips won") && !trimmed.Contains("with") && !trimmed.Contains("without"))
            {
                results["Chips won"] = value;
            }
        }

        return results;
    }

    private class BenchResult
    {
        public string HandId { get; set; } = "";
        public string GameId { get; set; } = "";
        public string Position { get; set; } = "";
        public int PlayerCount { get; set; }
        public double Profit { get; set; }
        public double Ev { get; set; }
        public double CevContribution { get; set; }
        public bool IsAllIn { get; set; }
        public bool WentToShowdown { get; set; }
    }

    private class PosData
    {
        public double Profit { get; set; }
        public double Ev { get; set; }
        public int Tournaments { get; set; }
        public int Count { get; set; }
    }
}
