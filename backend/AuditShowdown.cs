using PokerTrackerBackend;
using Microsoft.Extensions.Logging.Abstractions;

public static class AuditShowdown
{
    public static async Task Run()
    {
        var equityCalc = new EquityCalculator(NullLogger<EquityCalculator>.Instance);
        var analyticsCalc = new AnalyticsCalculator(equityCalc, NullLogger<AnalyticsCalculator>.Instance);
        var parser = new BetclicParser();

        var dataDir = Path.Combine(Directory.GetCurrentDirectory(), "..", "exemple-data", "Betclic");
        var files = Directory.GetFiles(dataDir, "*.txt");
        
        int missCount = 0;
        foreach (var file in files)
        {
            if (Path.GetFileName(file) == "excepted_result.txt") continue;
            var content = await File.ReadAllTextAsync(file);
            var result = parser.ParseFile(content);
            
            foreach (var hand in result.Hands)
            {
                if (hand.Id == "01KE07GK7BGA0VGNA694AB9XD1")
                {
                    Console.WriteLine($"[DEBUG-TARGET] Found Hand 01KE07GK7BGA0VGNA694AB9XD1");
                    Console.WriteLine($"HeroName: '{hand.HeroName}'");
                    Console.WriteLine($"HeroProfit: {hand.HeroProfit}");
                    Console.WriteLine($"HeroInvestment: {hand.HeroInvestment}");
                    Console.WriteLine($"WentToShowdown: {hand.WentToShowdown}");
                    Console.WriteLine($"Result Raw:\n{hand.Result}");
                }
                if (!hand.WentToShowdown && hand.HeroProfit > 0)
                {
                    missCount++;
                    if (missCount <= 10) {
                        Console.WriteLine($"[Audit] NoShowdown-Winner #{missCount}: ID={hand.Id} Profit={hand.HeroProfit} Showdown={hand.WentToShowdown}");
                        Console.WriteLine($"--- RAW TEXT ---");
                        Console.WriteLine(hand.Result);
                        Console.WriteLine("----------------");
                    }
                }
            }
        }
        Console.WriteLine($"Total potentially misclassified hands: {missCount}");
    }
}
