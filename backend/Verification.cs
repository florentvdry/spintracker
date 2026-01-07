using PokerTrackerBackend;
using Microsoft.Extensions.Logging.Abstractions;

public static class Verification
{
    public static async Task Run()
    {
        Console.WriteLine("Starting Verification...");
        
        // Use NullLogger to silence debug noise
        var loggerFactory = LoggerFactory.Create(builder => {});
        var equityCalc = new EquityCalculator(NullLogger<EquityCalculator>.Instance);
        var analyticsCalc = new AnalyticsCalculator(equityCalc, NullLogger<AnalyticsCalculator>.Instance);
        var parser = new BetclicParser();

        var dataDir = Path.Combine(Directory.GetCurrentDirectory(), "..", "exemple-data", "Betclic");
        if (!Directory.Exists(dataDir))
        {
            Console.WriteLine($"Data directory not found: {dataDir}");
            return;
        }

        var files = Directory.GetFiles(dataDir, "*.txt");
        var allHands = new List<ParsedHand>();

        foreach (var file in files)
        {
            if (Path.GetFileName(file) == "excepted_result.txt") continue;

            var content = await File.ReadAllTextAsync(file);
            var result = parser.ParseFile(content);
            if (result.Success)
            {
                allHands.AddRange(result.Hands);
                
                double fileShowdown = 0;
                double fileNoShowdown = 0;
                double fileTotal = 0;
                int count = 0;
                foreach (var h in result.Hands) {
                    var a = analyticsCalc.CalculateHandAnalytics(h);
                    fileShowdown += a.ChipsWonShowdown ?? 0;
                    fileNoShowdown += a.ChipsWonNoShowdown ?? 0;
                    fileTotal += h.HeroProfit;
                    
                    if (count < 100 && Path.GetFileName(file).Contains("2026-1-2")) {
                        // Console.WriteLine($"[Hand Check] ID={h.Id} Profit={h.HeroProfit} Showdown={h.WentToShowdown}");
                    }
                    if (!h.WentToShowdown && (!string.IsNullOrEmpty(h.VillainCards) || !string.IsNullOrEmpty(h.Showdown))) {
                        Console.WriteLine($"[CRITICAL] Showdown Flag Missing: ID={h.Id} VCards='{h.VillainCards}' ShowdownLen={h.Showdown?.Length}");
                    }
                    if (h.Result.Contains("shows") && !h.Result.Contains("*** SHOWDOWN ***")) {
                        Console.WriteLine($"[INFO] Shows without Header: ID={h.Id} Showdown={h.WentToShowdown}");
                    }
                    count++;
                }
                Console.WriteLine($"[File Stats] {Path.GetFileName(file)}: Total={fileTotal:N0} Showdown={fileShowdown:N0} NoShowdown={fileNoShowdown:N0}");
            }
        }

        Console.WriteLine($"Parsed {allHands.Count} hands. Checking for outliers...");

        var outliers = allHands.Where(h => h.HeroProfit > 2000 || h.HeroProfit < -2000).ToList();
        if (outliers.Any())
        {
            Console.WriteLine($"Found {outliers.Count} outlier hands!");
            foreach(var o in outliers.Take(5))
            {
               Console.WriteLine($"Outlier: {o.Id} {o.DateTime} Profit: {o.HeroProfit}");
            }
        }
        else
        {
            Console.WriteLine("No outliers found (>2000).");
        }
        
        // Sum total to verify again
        double sum = allHands.Sum(h => h.HeroProfit);
        double checkShowdownTextProfit = allHands.Where(h => h.Result.Contains("*** SHOWDOWN ***")).Sum(h => h.HeroProfit);
        double checkAllInNoShowdownProfit = allHands.Where(h => !h.WentToShowdown && !string.IsNullOrEmpty(h.AllInStreet)).Sum(h => h.HeroProfit);
        double checkAllInNoShowdownWinnerProfit = allHands.Where(h => !h.WentToShowdown && !string.IsNullOrEmpty(h.AllInStreet) && h.HeroProfit > 0).Sum(h => h.HeroProfit);
        Console.WriteLine($"Total Sum Verification: {sum:N0}");
        Console.WriteLine($"Showdown Text Profit Verification: {checkShowdownTextProfit:N0}");
        Console.WriteLine($"All-In NoShowdown Profit Verification: {checkAllInNoShowdownProfit:N0}");
        Console.WriteLine($"All-In NoShowdown Winner Profit Verification: {checkAllInNoShowdownWinnerProfit:N0}");

        // Calculate analytics for all hands
        Console.WriteLine($"\n=== Calculating Net Expected Chips Won ===");
        double netExpectedChipsWon = 0;
        double actualProfit = 0;
        double chipsWonShowdown = 0;
        double chipsWonNoShowdown = 0;
        int evCalculated = 0;
        int evSkipped = 0;
        
        double sumEVHands = 0;  // Sum of net_won_adjusted for hands where EV was calculated
        double sumActualProfitEV = 0; // Sum of heroProfit for hands where EV was calculated
        double sumNonEVHands = 0;  // Sum for hands where EV wasn't calculated
        int evPositive = 0;
        int evNegative = 0;
        
        foreach (var hand in allHands)
        {
            var analytics = analyticsCalc.CalculateHandAnalytics(hand);
            netExpectedChipsWon += analytics.NetWonAdjusted ?? hand.HeroProfit;
            actualProfit += hand.HeroProfit;
            chipsWonShowdown += analytics.ChipsWonShowdown ?? 0;
            chipsWonNoShowdown += analytics.ChipsWonNoShowdown ?? 0;
            
            if (analytics.EvChips.HasValue && analytics.EvChips != 0)
            {
                evCalculated++;
                sumEVHands += analytics.NetWonAdjusted ?? 0;
                sumActualProfitEV += hand.HeroProfit;
                if (analytics.EvChips > 0) evPositive++;
                else evNegative++;
                
                // Debug: show extreme EV values
                if (Math.Abs(analytics.EvChips.Value) > 400)
                {
                    Console.WriteLine($"[Extreme EV] {hand.Id} Profit:{hand.HeroProfit} EV:{analytics.EvChips:F0} Hero:{hand.HeroCards} V:{hand.VillainCards}");
                }
            }
            else
            {
                sumNonEVHands += hand.HeroProfit;
                if (hand.HeroAllIn || hand.VillainAllIn) {
                    evSkipped++;
                    if (evSkipped <= 5) {
                         Console.WriteLine($"[Audit] Skipped All-In EV: ID={hand.Id} Showdown={hand.WentToShowdown} VCards='{hand.VillainCards}'");
                    }
                }
            }
        }

        double netNetProfit = netExpectedChipsWon;
        Console.WriteLine($"\n=== FINAL STATS ===");
        Console.WriteLine($"Total Actual Profit (Net): {actualProfit:N0} (Expected Total: 28,500)");
        Console.WriteLine($"Actual Profit from EV hands: {sumActualProfitEV:N0}");
        Console.WriteLine($"Expected Profit from EV hands: {sumEVHands:N0}");
        Console.WriteLine($"Actual Profit from Non-EV hands: {sumNonEVHands:N0}");
        Console.WriteLine($"Net Expected Chips Won (Combined): {netNetProfit:N0} (Target: 25,786)");
        Console.WriteLine($"Gap to Target: {netNetProfit - 25786:N0}");
        Console.WriteLine($"Chips Won with Showdown: {chipsWonShowdown:N0} (Target: 25,372)");
        Console.WriteLine($"Chips Won without Showdown: {chipsWonNoShowdown:N0} (Target: 3,128)");
        Console.WriteLine($"EV calculated for {evCalculated} hands, skipped for {evSkipped} all-in hands");

        // Show breakdown by missing data
        var allInHands = allHands.Where(h => h.HeroAllIn || h.VillainAllIn).ToList();
        var withVillainCards = allInHands.Where(h => !string.IsNullOrEmpty(h.VillainCards)).Count();
        var toShowdown = allInHands.Where(h => h.WentToShowdown).Count();
        Console.WriteLine($"\nAll-In hands: {allInHands.Count}");
        Console.WriteLine($"  Went to showdown: {toShowdown}");
        Console.WriteLine($"  Have villain cards: {withVillainCards}");
        
        // Debug specific hand
        var debugHand = allHands.FirstOrDefault(h => h.Id == "01KE0SQ3QVHABGKFSJQ23BKDEN");
        if (debugHand != null)
        {
            Console.WriteLine($"\n=== DEBUG HAND: {debugHand.Id} ===");
            Console.WriteLine($"Hero: {debugHand.HeroCards}, Villain: {debugHand.VillainCards}");
            Console.WriteLine($"Profit: {debugHand.HeroProfit}, TotalPot: {debugHand.TotalPot}");
            Console.WriteLine($"Flop: {debugHand.Flop}, Turn: {debugHand.Turn}, River: {debugHand.River}");
            Console.WriteLine($"HeroAllIn: {debugHand.HeroAllIn}, VillainAllIn: {debugHand.VillainAllIn}");
            Console.WriteLine($"WentToShowdown: {debugHand.WentToShowdown}");
            
            // Direct equity calculation test
            Console.WriteLine($"\n--- Equity Test ---");
            var boardAtAllIn = "";  // Preflop
            var eq = equityCalc.Calculate(debugHand.HeroCards ?? "", debugHand.VillainCards ?? "", boardAtAllIn, 10000);
            Console.WriteLine($"Preflop Equity (T9o vs A8o): Hero={eq.HeroEquity:F2}% Villain={eq.VillainEquity:F2}%");
            
            // Test with board
            if (!string.IsNullOrEmpty(debugHand.Flop))
            {
                var fullBoard = $"{debugHand.Flop} {debugHand.Turn} {debugHand.River}".Trim();
                var eqBoard = equityCalc.Calculate(debugHand.HeroCards ?? "", debugHand.VillainCards ?? "", fullBoard, 10000);
                Console.WriteLine($"Full Board [{fullBoard}] Equity: Hero={eqBoard.HeroEquity:F2}%");
            }
            
            var analytics2 = analyticsCalc.CalculateHandAnalytics(debugHand);
            Console.WriteLine($"Final EV: {analytics2.EvChips:F2}, NetWonAdj: {analytics2.NetWonAdjusted:F2}");
        }
    }
}
