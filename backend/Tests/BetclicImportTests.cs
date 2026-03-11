using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Xunit;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Tests;

public class BetclicImportTests
{
    private readonly BetclicParser _parser = new();

    private string GetExampleDataPath() 
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        return Path.Combine(baseDir, "..", "..", "..", "..", "exemple-data", "Betclic");
    }

    [Fact]
    public void ParseBetclicExampleData_MatchesExpectedResults()
    {
        var dataDir = GetExampleDataPath();
        var expectedFile = Path.Combine(dataDir, "excepted_result.txt");
        
        Assert.True(Directory.Exists(dataDir), $"Example data directory not found: {dataDir}");
        Assert.True(File.Exists(expectedFile), $"Expected results file not found: {expectedFile}");

        var files = Directory.GetFiles(dataDir, "*.txt")
            .Where(f => Path.GetFileName(f) != "excepted_result.txt")
            .ToArray();

        var allHands = new List<ParsedHand>();
        foreach (var file in files)
        {
            var content = File.ReadAllText(file);
            var result = _parser.ParseFile(content);
            allHands.AddRange(result.Hands);
        }

        var heroHands = new List<HeroHandData>();
        foreach (var hand in allHands)
        {
            var hero = hand.Players.FirstOrDefault(p => p.IsHero || p.Name == "jmenfouu");
            if (hero != null)
            {
                heroHands.Add(new HeroHandData { Hand = hand, Hero = hero });
            }
        }

        var globalStats = CalculateStats(heroHands);

        var expectedContent = File.ReadAllLines(expectedFile);
        var expectedGlobal = ParseExpectedSection(expectedContent, null);

        Assert.Equal(expectedGlobal.HandCount, allHands.Count);
        Assert.Equal(expectedGlobal.ChipsWon, globalStats.ChipsWon, 0);
    }

    private class HeroHandData
    {
        public ParsedHand Hand { get; set; } = null!;
        public PlayerInfo Hero { get; set; } = null!;
    }

    private ParsedStats CalculateStats(List<HeroHandData> heroHands)
    {
        var games = new HashSet<string>();
        double chipsWon = 0;

        foreach (var item in heroHands)
        {
            var hero = item.Hero;
            var hand = item.Hand;
            
            if (!string.IsNullOrEmpty(hand.GameId))
                games.Add(hand.GameId);
            
            chipsWon += hero.NetProfit;
        }

        return new ParsedStats
        {
            TournamentCount = games.Count,
            ChipsWon = chipsWon
        };
    }

    private ParsedStats ParseExpectedSection(string[] lines, int? startIdx)
    {
        var stats = new ParsedStats();
        var i = 0;
        
        while (i < lines.Length)
        {
            var line = lines[i].Trim();
            
            if (line.StartsWith("Betclic:"))
            {
                i++;
                continue;
            }
            
            if (line.StartsWith("date:"))
            {
                break;
            }
            
            if (string.IsNullOrEmpty(line))
            {
                i++;
                continue;
            }

            if (line.Contains("Mains"))
            {
                var parts = line.Split(' ');
                foreach (var p in parts)
                {
                    if (int.TryParse(p, out var count))
                    {
                        stats.HandCount = count;
                        break;
                    }
                }
            }
            else if (line.Contains("chips won") && !line.Contains("Net") && !line.Contains("with") && !line.Contains("without"))
            {
                var parts = line.Split(' ');
                foreach (var p in parts)
                {
                    if (int.TryParse(p, out var count))
                    {
                        stats.ChipsWon = count;
                        break;
                    }
                }
            }

            i++;
        }

        return stats;
    }

    private class ParsedStats
    {
        public int HandCount { get; set; }
        public int TournamentCount { get; set; }
        public double ChipsWon { get; set; }
    }
}
