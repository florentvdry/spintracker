using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Linq;
using PokerTrackerBackend;
using Microsoft.Extensions.Logging.Abstractions;

public class Benchmark
{
    public static void Run()
    {
        var calc = new EquityCalculator(NullLogger<EquityCalculator>.Instance);
        var hero = "As Ks";
        var villain = "2d 2c";
        var board = "";
        
        Console.WriteLine("Starting Benchmark for Preflop Exact Enumeration...");
        var sw = Stopwatch.StartNew();
        
        // This will trigger the exact enumeration (C(48, 5) iterations)
        var result = calc.Calculate(hero, villain, board, 0);
        
        sw.Stop();
        Console.WriteLine($"Time elapsed: {sw.ElapsedMilliseconds}ms");
        Console.WriteLine($"Equity: {result.HeroEquity:F2}%");
    }
}
