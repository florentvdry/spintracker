using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Services;
using Xunit;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Tests;

public class UnibetImportTests
{
    private readonly UnibetParser _parser = new();

    [Fact]
    public void ParseFile_DiagnoseFieldValues()
    {
        var dataDir = GetExampleDataPath();
        var content = File.ReadAllText(Path.Combine(dataDir, "H20260415 T80995705 €2 Power Spin €1.86 + €0.14 No Limit Holdem.txt"));
        var result = _parser.ParseFile(content);
        var hand = result.Hands.First();
        var hero = hand.Players.First(p => p.IsHero);

        Console.WriteLine($"BuyIn={hand.BuyIn} Rake={hand.Rake} PrizePool={hand.PrizePool} Multiplier={hand.Multiplier}");
        Console.WriteLine($"Blinds={hand.Blinds}");
        Console.WriteLine($"Hero={hero.Name} Pos={hero.Position} Cards='{hero.Cards}'");
        Console.WriteLine($"PreflopAction='{hand.PreflopAction}'");

        Assert.True(hand.BuyIn > 0, $"BuyIn manquant (={hand.BuyIn})");
        Assert.True(hand.Rake > 0, $"Rake manquant (={hand.Rake})");
        Assert.True(hand.PrizePool > 0, $"PrizePool manquant (={hand.PrizePool})");
        Assert.True(hand.Multiplier > 1, $"Multiplier manquant (={hand.Multiplier})");
        Assert.False(string.IsNullOrEmpty(hero.Cards), $"Cards du héros vide");
        Assert.False(string.IsNullOrEmpty(hand.PreflopAction), $"PreflopAction vide");
    }

    [Fact]
    public void ParseHand_DetectsHeroFromUnibetId_WhenImportUsesSingleHandParsing()
    {
        var handText = @"Unibet Hand #1489941675, Tournament #80995705, EUR1.86 + EUR0.14 - 10.00/20.00 - No Limit Hold'Em - Total prize EUR6 - UTC 18:09:27 2026/04/15
Table ""Mergus"" 3-max
*** Seated players ***
Seat 1: VillainOne (500)
Seat 2: HeroPlayer[Unibet_5362bfc439408f11] (500)
Seat 3: VillainTwo (500)
*** Blinds and button ***
HeroPlayer[Unibet_5362bfc439408f11] has the button
VillainTwo posts small blind 10
VillainOne posts big blind 20
*** Hole cards ***
Dealt in VillainOne
Dealt in HeroPlayer[Unibet_5362bfc439408f11]
Dealt in VillainTwo
*** Summary ***
Total pot 30";

        var hand = _parser.ParseHand(handText);

        Assert.NotNull(hand);
        var heroes = hand!.Players.Where(p => p.IsHero).ToList();
        Assert.Single(heroes);
        Assert.Equal("HeroPlayer", heroes[0].Name);
    }

    private string GetExampleDataPath()
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        return Path.Combine(baseDir, "..", "..", "..", "..", "exemple-data", "Unibet");
    }

    [Fact]
    public void ParseUnibetExampleData_MatchesExpectedResults()
    {
        var dataDir = GetExampleDataPath();
        var expectedFile = Path.Combine(dataDir, "expected_result.txt");

        Assert.True(Directory.Exists(dataDir), $"Example data directory not found: {dataDir}");
        Assert.True(File.Exists(expectedFile), $"Expected results file not found: {expectedFile}");

        var files = Directory.GetFiles(dataDir, "*.txt")
            .Where(f => Path.GetFileName(f) != "expected_result.txt")
            .ToArray();

        var allHands = new List<ParsedHand>();
        foreach (var file in files)
        {
            var content = File.ReadAllText(file);
            var result = _parser.ParseFile(content);
            Assert.True(result.Success, $"Parser failed for {Path.GetFileName(file)}: {result.Error}");
            allHands.AddRange(result.Hands);
        }

        var heroHands = new List<HeroHandData>();
        foreach (var hand in allHands)
        {
            var hero = hand.Players.FirstOrDefault(p => p.IsHero || p.Name.Contains("Unibet_"));
            if (hero != null)
            {
                heroHands.Add(new HeroHandData { Hand = hand, Hero = hero });
            }
        }

        var globalStats = CalculateStats(heroHands);

        var expectedContent = File.ReadAllLines(expectedFile);
        var expectedGlobal = ParseExpectedSection(expectedContent);

        Assert.Equal(expectedGlobal.Pseudo, globalStats.Pseudo);
        Assert.Equal(expectedGlobal.HandCount, allHands.Count);
        Assert.Equal(expectedGlobal.TournamentCount, globalStats.TournamentCount);
        Assert.Equal(expectedGlobal.ChipsWon, globalStats.ChipsWon, 0);
        Assert.Equal(expectedGlobal.ChipsWonWithShowdown, globalStats.ChipsWonWithShowdown, 0);
        Assert.Equal(expectedGlobal.ChipsWonWithoutShowdown, globalStats.ChipsWonWithoutShowdown, 0);
    }

    [Fact]
    public void ParseHand_OnImportedSingleHandChunks_MatchesExpectedCountAndHero()
    {
        var dataDir = GetExampleDataPath();
        var files = Directory.GetFiles(dataDir, "*.txt")
            .Where(f => Path.GetFileName(f) != "expected_result.txt")
            .ToArray();

        var parsedHands = new List<ParsedHand>();

        foreach (var file in files)
        {
            var content = File.ReadAllText(file).Replace("\r\n", "\n");
            var handTexts = Regex.Split(content, @"(?=^Unibet Hand #)", RegexOptions.Multiline)
                .Where(text => !string.IsNullOrWhiteSpace(text) && text.TrimStart().StartsWith("Unibet Hand #", StringComparison.Ordinal))
                .ToArray();

            foreach (var handText in handTexts)
            {
                var hand = _parser.ParseHand(handText);
                Assert.NotNull(hand);

                var heroes = hand!.Players.Where(player => player.IsHero).ToList();
                Assert.Single(heroes);
                Assert.DoesNotContain("Unibet_", heroes[0].Name);

                parsedHands.Add(hand);
            }
        }

        Assert.Equal(29, parsedHands.Count);
    }

    [Fact]
    public async Task CountHandsInFileAsync_SplitsUnibetHandsOnHeaderLines()
    {
        var dataDir = GetExampleDataPath();
        var filePath = Path.Combine(dataDir, "H20260415 T80995705 €2 Power Spin €1.86 + €0.14 No Limit Holdem.txt");
        var expectedCount = _parser.ParseFile(File.ReadAllText(filePath)).Count;

        var tempDbPath = Path.Combine(Path.GetTempPath(), $"spintracker-unibet-test-{Guid.NewGuid():N}.db");

        try
        {
            var database = new Database(NullLogger<Database>.Instance, tempDbPath);
            var service = new ImporterService(database, new FakeAnalyticsCalculator(), NullLogger<ImporterService>.Instance);

            var count = await service.CountHandsInFileAsync(filePath, CancellationToken.None);

            Assert.Equal(expectedCount, count);
        }
        finally
        {
            if (File.Exists(tempDbPath)) File.Delete(tempDbPath);
            if (File.Exists(tempDbPath + "-shm")) File.Delete(tempDbPath + "-shm");
            if (File.Exists(tempDbPath + "-wal")) File.Delete(tempDbPath + "-wal");
        }
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
        double chipsWonWithShowdown = 0;
        double chipsWonWithoutShowdown = 0;
        string pseudo = "";

        foreach (var item in heroHands)
        {
            var hero = item.Hero;
            var hand = item.Hand;

            if (string.IsNullOrEmpty(pseudo))
            {
                pseudo = hero.Name;
            }

            if (!string.IsNullOrEmpty(hand.GameId))
                games.Add(hand.GameId);

            chipsWon += hero.NetProfit;
            if (hand.WentToShowdown)
                chipsWonWithShowdown += hero.NetProfit;
            else
                chipsWonWithoutShowdown += hero.NetProfit;
        }

        return new ParsedStats
        {
            Pseudo = pseudo,
            TournamentCount = games.Count,
            ChipsWon = chipsWon,
            ChipsWonWithShowdown = chipsWonWithShowdown,
            ChipsWonWithoutShowdown = chipsWonWithoutShowdown
        };
    }

    private ParsedStats ParseExpectedSection(string[] lines)
    {
        var stats = new ParsedStats();
        var i = 0;

        while (i < lines.Length)
        {
            var line = lines[i].Trim();

            if (line.StartsWith("Unibet:", StringComparison.OrdinalIgnoreCase) &&
                line.Contains("pseudo:", StringComparison.OrdinalIgnoreCase))
            {
                var idx = line.IndexOf("pseudo:", StringComparison.OrdinalIgnoreCase);
                stats.Pseudo = line[(idx + "pseudo:".Length)..].Trim();
                i++;
                continue;
            }

            // Keep same behavior as Betclic test: stop at first dated subsection line ('date:').
            if (line.StartsWith("date:"))
            {
                break;
            }

            if (string.IsNullOrEmpty(line))
            {
                i++;
                continue;
            }

            if (line.Contains("Mains", StringComparison.OrdinalIgnoreCase))
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
            else if (line.Contains("Tournaments", StringComparison.OrdinalIgnoreCase) ||
                     line.Contains("Tornaments", StringComparison.OrdinalIgnoreCase))
            {
                var parts = line.Split(' ');
                foreach (var p in parts)
                {
                    if (int.TryParse(p, out var count))
                    {
                        stats.TournamentCount = count;
                        break;
                    }
                }
            }
            else if (line.Contains("chips won with showdown", StringComparison.OrdinalIgnoreCase))
            {
                var parts = line.Split(' ');
                foreach (var p in parts)
                {
                    if (int.TryParse(p, out var count))
                    {
                        stats.ChipsWonWithShowdown = count;
                        break;
                    }
                }
            }
            else if (line.Contains("chips won without showdown", StringComparison.OrdinalIgnoreCase))
            {
                var parts = line.Split(' ');
                foreach (var p in parts)
                {
                    if (int.TryParse(p, out var count))
                    {
                        stats.ChipsWonWithoutShowdown = count;
                        break;
                    }
                }
            }
            else if (line.Contains("chips won", StringComparison.OrdinalIgnoreCase) &&
                     !line.Contains("Net", StringComparison.OrdinalIgnoreCase) &&
                     !line.Contains("with", StringComparison.OrdinalIgnoreCase) &&
                     !line.Contains("without", StringComparison.OrdinalIgnoreCase))
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
        public string Pseudo { get; set; } = "";
        public int HandCount { get; set; }
        public int TournamentCount { get; set; }
        public double ChipsWon { get; set; }
        public double ChipsWonWithShowdown { get; set; }
        public double ChipsWonWithoutShowdown { get; set; }
    }

    private sealed class FakeAnalyticsCalculator : IAnalyticsCalculator
    {
        public HandAnalytics CalculateHandAnalytics(ParsedHand hand) => new() { HandId = hand.Id };
    }
}
