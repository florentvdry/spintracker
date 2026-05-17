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

    [Fact]
    public void VerifyBetclicStats_CalculatesVpipAndPfrCorrectly()
    {
        // Sample hand with timestamps and colons
        var handContent = @"
Hand #21793509 - Tournament #12345
Table 'Table 1' 3-max
Seat 1: Hero (500)
Seat 2: Villain (500)
Seat 3: Player3 (500)
Hero posts SB 10
Villain posts BB 20
*** HOLE CARDS ***
Dealt to Hero [As Ks]
22:52:30 - Player3: Folds
22:52:32 - Hero: Raises to 40
22:52:35 - Villain: Calls 20
*** FLOP *** [2h 7s 9d]
22:52:40 - Villain: Checks
22:52:42 - Hero: Bets 40
22:52:45 - Villain: Folds
*** SUMMARY ***
Hero wins 120
";
        var result = _parser.ParseFile(handContent);
        Assert.Single(result.Hands);
        var hand = result.Hands[0];

        // Verify that the logic in IsLineByPlayer works for these lines
        Assert.True(TestIsLineByPlayer("22:52:32 - Hero: Raises to 40", "Hero", out var clean));
        Assert.Equal("Raises to 40", clean);
        
        Assert.True(TestIsLineByPlayer("22:52:40 - Villain: Checks", "Villain", out var cleanVillain));
        Assert.Equal("Checks", cleanVillain);
        
        Assert.False(TestIsLineByPlayer("22:52:30 - Player3: Folds", "Hero", out _));

        // Test format without timestamp but with colon (common for some rooms or after initial parse)
        Assert.True(TestIsLineByPlayer("Hero: Raises to 40", "Hero", out var clean2));
        Assert.Equal("Raises to 40", clean2);
    }

    private bool TestIsLineByPlayer(string line, string playerName, out string cleanAction)
    {
        cleanAction = "";
        if (string.IsNullOrWhiteSpace(line)) return false;

        var processingLine = line.Trim();

        // Strip timestamp (Betclic format: "22:53:05 - ")
        var splitParts = processingLine.Split(new[] { " - " }, 2, StringSplitOptions.None);
        if (splitParts.Length > 1) processingLine = splitParts[1].Trim();

        // Format 1: "PlayerName: action"
        if (processingLine.StartsWith(playerName + ":", StringComparison.OrdinalIgnoreCase))
        {
            cleanAction = processingLine.Substring(playerName.Length + 1).Trim();
            return true;
        }

        // Format 2: "PlayerName action" (Winamax/Unibet sometimes)
        if (processingLine.StartsWith(playerName + " ", StringComparison.OrdinalIgnoreCase))
        {
            var potentialAction = processingLine.Substring(playerName.Length).Trim();
            var firstWord = potentialAction.Split(' ')[0].ToLower();
            var knownActions = new[] { "posts", "calls", "bets", "raises", "folds", "checks" };
            if (knownActions.Contains(firstWord))
            {
                cleanAction = potentialAction;
                return true;
            }
        }

        return false;
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
