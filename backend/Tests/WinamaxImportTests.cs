using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using Microsoft.Extensions.Logging.Abstractions;
using SpinTrackerBackend.Engines;
using Xunit;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Tests;

public class WinamaxImportTests
{
    private readonly WinamaxParser _parser = new();

    private string GetExampleDataPath()
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        return Path.Combine(baseDir, "..", "..", "..", "..", "exemple-data", "Winamax");
    }

    [Fact]
    public void ParseWinamaxExampleData_MatchesExpectedCounts()
    {
        var dataDir = GetExampleDataPath();
        var expectedFile = Path.Combine(dataDir, "expected_result.txt");

        Assert.True(Directory.Exists(dataDir), $"Example data directory not found: {dataDir}");
        Assert.True(File.Exists(expectedFile), $"Expected results file not found: {expectedFile}");

        var expected = ParseExpectedStats(File.ReadAllLines(expectedFile));

        var handFiles = Directory.GetFiles(dataDir, "*.txt")
            .Where(f =>
                !Path.GetFileName(f).Equals("expected_result.txt", StringComparison.OrdinalIgnoreCase) &&
                !Path.GetFileName(f).Contains("_summary", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        Assert.NotEmpty(handFiles);

        var allHands = new System.Collections.Generic.List<ParsedHand>();
        foreach (var handFile in handFiles)
        {
            var content = File.ReadAllText(handFile);
            var result = _parser.ParseFile(content);
            Assert.True(result.Success, $"Parser failed for {Path.GetFileName(handFile)}: {result.Error}");
            Assert.All(result.Hands, h => Assert.Contains(h.Players, p => p.IsHero));
            allHands.AddRange(result.Hands);
        }

        Assert.Equal(expected.Hands, allHands.Count);

        var tournaments = allHands
            .Where(h => !string.IsNullOrWhiteSpace(h.GameId))
            .Select(h => h.GameId!)
            .Distinct(StringComparer.Ordinal)
            .Count();

        Assert.Equal(expected.Tournaments, tournaments);
    }

    [Fact]
    public void ParseWinamaxExampleData_MatchesExpectedGlobalMetrics()
    {
        var dataDir = GetExampleDataPath();
        var expectedFile = Path.Combine(dataDir, "expected_result.txt");
        var expected = ParseExpectedFullStats(File.ReadAllLines(expectedFile));

        var handFiles = Directory.GetFiles(dataDir, "*.txt")
            .Where(f =>
                !Path.GetFileName(f).Equals("expected_result.txt", StringComparison.OrdinalIgnoreCase) &&
                !Path.GetFileName(f).Contains("_summary", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        Assert.NotEmpty(handFiles);

        var allHands = new List<ParsedHand>();
        foreach (var handFile in handFiles)
        {
            var content = File.ReadAllText(handFile);
            var result = _parser.ParseFile(content);
            Assert.True(result.Success, $"Parser failed for {Path.GetFileName(handFile)}: {result.Error}");
            allHands.AddRange(result.Hands);
        }

        var equity = new EquityCalculator(NullLogger<EquityCalculator>.Instance);
        var analytics = new AnalyticsCalculator(equity, NullLogger<AnalyticsCalculator>.Instance);

        var totalHands = allHands.Count;
        var totalTournaments = allHands.Where(h => !string.IsNullOrWhiteSpace(h.GameId)).Select(h => h.GameId!).Distinct().Count();

        double chipsWon = 0;
        double chipsWonShowdown = 0;
        double chipsWonNonShowdown = 0;
        double netExpectedChipsWon = 0;
        var posSums = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            ["HU SB"] = 0,
            ["HU BB"] = 0,
            ["3W BTN"] = 0,
            ["3W SB"] = 0,
            ["3W BB"] = 0
        };
        var posTournaments = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["HU SB"] = new HashSet<string>(StringComparer.Ordinal),
            ["HU BB"] = new HashSet<string>(StringComparer.Ordinal),
            ["3W BTN"] = new HashSet<string>(StringComparer.Ordinal),
            ["3W SB"] = new HashSet<string>(StringComparer.Ordinal),
            ["3W BB"] = new HashSet<string>(StringComparer.Ordinal)
        };

        foreach (var hand in allHands)
        {
            var hero = hand.Players.FirstOrDefault(p => p.IsHero);
            Assert.NotNull(hero);

            chipsWon += hero!.NetProfit;
            if (hero.WentToShowdown) chipsWonShowdown += hero.NetProfit;
            else chipsWonNonShowdown += hero.NetProfit;

            var a = analytics.CalculateHandAnalytics(hand);
            netExpectedChipsWon += a.NetWonAdjusted ?? hero.NetProfit;
            var posKey = GetPositionKey(hero.Position, hand.PlayerCount);
            if (posSums.ContainsKey(posKey))
            {
                posSums[posKey] += a.NetWonAdjusted ?? hero.NetProfit;
                if (!string.IsNullOrWhiteSpace(hand.GameId))
                {
                    posTournaments[posKey].Add(hand.GameId!);
                }
            }
        }

        int ContributionPerTournament(string key)
        {
            if (totalTournaments == 0) return 0;
            return (int)Math.Round(posSums[key] / totalTournaments);
        }

        var cevPerTournament = totalTournaments > 0
            ? (int)Math.Round(netExpectedChipsWon / totalTournaments)
            : 0;

        var actual = new ExpectedStats
        {
            Hands = totalHands,
            Tournaments = totalTournaments,
            EvPerTournament = cevPerTournament,
            HuSb = ContributionPerTournament("HU SB"),
            HuBb = ContributionPerTournament("HU BB"),
            ThreeWayBtn = ContributionPerTournament("3W BTN"),
            ThreeWaySb = ContributionPerTournament("3W SB"),
            ThreeWayBb = ContributionPerTournament("3W BB"),
            ChipsWon = (int)Math.Round(chipsWon),
            NetExpectedChipsWon = (int)Math.Round(netExpectedChipsWon),
            ChipsWonShowdown = (int)Math.Round(chipsWonShowdown),
            ChipsWonNonShowdown = (int)Math.Round(chipsWonNonShowdown)
        };

        var diffs = new List<string>();
        void Check(string label, int exp, int act, int tolerance = 0)
        {
            if (Math.Abs(exp - act) > tolerance) diffs.Add($"{label}: expected={exp}, actual={act}");
        }

        Check("Hands", expected.Hands, actual.Hands);
        Check("Tournaments", expected.Tournaments, actual.Tournaments);
        Check("Chips ev / Tournaments", expected.EvPerTournament, actual.EvPerTournament, 1);
        Check("HeadsUp SB", expected.HuSb, actual.HuSb, 1);
        Check("HeadsUp BB", expected.HuBb, actual.HuBb, 1);
        Check("Button 3W", expected.ThreeWayBtn, actual.ThreeWayBtn, 1);
        Check("3Way Small Blind", expected.ThreeWaySb, actual.ThreeWaySb, 1);
        Check("3Way BigBlinds", expected.ThreeWayBb, actual.ThreeWayBb, 1);
        Check("chips won", expected.ChipsWon, actual.ChipsWon);
        Check("Net excepted Chips Won", expected.NetExpectedChipsWon, actual.NetExpectedChipsWon, 2);
        Check("chips won with showdown", expected.ChipsWonShowdown, actual.ChipsWonShowdown);
        Check("chips won without showdown", expected.ChipsWonNonShowdown, actual.ChipsWonNonShowdown);

        Assert.True(diffs.Count == 0,
            "Winamax expected vs actual mismatch:\n" + string.Join("\n", diffs));
    }

    [Fact]
    public void ImportSplitterLogic_WinamaxSeparatorDetectsAllHands()
    {
        var dataDir = GetExampleDataPath();
        var handFile = Directory.GetFiles(dataDir, "*_no-limit.txt")
            .FirstOrDefault(f => !Path.GetFileName(f).Contains("_summary", StringComparison.OrdinalIgnoreCase));

        Assert.False(string.IsNullOrWhiteSpace(handFile), "No Winamax hand file found for splitter test.");

        var content = File.ReadAllText(handFile!);
        var expectedByParser = _parser.ParseFile(content).Hands.Count;
        Assert.True(expectedByParser > 0, "Parser did not return hands for Winamax sample.");

        var chunks = SplitLikeImporter(content, _parser.HandSeparator);
        Assert.Equal(expectedByParser, chunks.Count);
    }

    private static System.Collections.Generic.List<string> SplitLikeImporter(string fileContent, string separator)
    {
        var lines = fileContent.Split('\n');
        var chunks = new System.Collections.Generic.List<string>();
        var current = new System.Text.StringBuilder();

        static bool IsBoundary(string line, string sep)
        {
            if (string.IsNullOrWhiteSpace(line) || string.IsNullOrWhiteSpace(sep)) return false;
            var trimmed = line.Trim();
            return trimmed.Equals(sep, StringComparison.Ordinal) ||
                   trimmed.StartsWith(sep, StringComparison.Ordinal);
        }

        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd('\r');
            if (IsBoundary(line, separator))
            {
                if (current.Length > 0)
                {
                    chunks.Add(current.ToString());
                    current.Clear();
                }
            }
            current.AppendLine(line);
        }

        if (current.Length > 0)
        {
            chunks.Add(current.ToString());
        }

        return chunks
            .Select(c => c.Trim())
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .ToList();
    }

    private static (int Hands, int Tournaments) ParseExpectedStats(string[] lines)
    {
        int hands = 0;
        int tournaments = 0;

        foreach (var line in lines.Select(l => l.Trim()))
        {
            if (line.Contains("Mains", StringComparison.OrdinalIgnoreCase))
            {
                var token = line.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(token) && int.TryParse(token, out var parsedHands))
                {
                    hands = parsedHands;
                }
            }
            else if (line.StartsWith("Tornaments", StringComparison.OrdinalIgnoreCase) || line.StartsWith("Tournaments", StringComparison.OrdinalIgnoreCase))
            {
                var token = line.Split(' ', StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
                if (!string.IsNullOrWhiteSpace(token) && int.TryParse(token, out var parsedTournaments))
                {
                    tournaments = parsedTournaments;
                }
            }
        }

        return (hands, tournaments);
    }

    private static string GetPositionKey(string position, int playerCount)
    {
        var prefix = playerCount == 2 ? "HU" : "3W";
        var pos = (position ?? string.Empty).ToUpperInvariant();

        if (pos.Contains("SB")) return prefix + " SB";
        if (pos.Contains("BB")) return prefix + " BB";
        if (pos.Contains("BTN") || pos.Contains("BUTTON")) return prefix + " BTN";

        return prefix + " " + pos;
    }

    private static ExpectedStats ParseExpectedFullStats(string[] lines)
    {
        var stats = new ExpectedStats();

        foreach (var raw in lines)
        {
            var line = raw.Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;

            if (line.Contains("Mains", StringComparison.OrdinalIgnoreCase))
                stats.Hands = ExtractFirstInt(line);
            else if (line.StartsWith("Tornaments", StringComparison.OrdinalIgnoreCase) || line.StartsWith("Tournaments", StringComparison.OrdinalIgnoreCase))
                stats.Tournaments = ExtractLastInt(line);
            else if (line.StartsWith("Chips ev / Tournaments", StringComparison.OrdinalIgnoreCase))
                stats.EvPerTournament = ExtractLastInt(line);
            else if (line.StartsWith("HeadsUp SB", StringComparison.OrdinalIgnoreCase))
                stats.HuSb = ExtractLastInt(line);
            else if (line.StartsWith("HeadsUp BB", StringComparison.OrdinalIgnoreCase))
                stats.HuBb = ExtractLastInt(line);
            else if (line.StartsWith("Button 3W", StringComparison.OrdinalIgnoreCase))
                stats.ThreeWayBtn = ExtractLastInt(line);
            else if (line.StartsWith("3Way Small Blind", StringComparison.OrdinalIgnoreCase))
                stats.ThreeWaySb = ExtractLastInt(line);
            else if (line.StartsWith("3Way BigBlinds", StringComparison.OrdinalIgnoreCase))
                stats.ThreeWayBb = ExtractLastInt(line);
            else if (System.Text.RegularExpressions.Regex.IsMatch(line, @"^\d+\s+chips won$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                stats.ChipsWon = ExtractFirstInt(line);
            else if (line.Contains("Net excepted Chips Won", StringComparison.OrdinalIgnoreCase))
                stats.NetExpectedChipsWon = ExtractFirstInt(line);
            else if (line.Contains("chips won with showdown", StringComparison.OrdinalIgnoreCase))
                stats.ChipsWonShowdown = ExtractFirstInt(line);
            else if (line.Contains("chips won without showdown", StringComparison.OrdinalIgnoreCase))
                stats.ChipsWonNonShowdown = ExtractFirstInt(line);
        }

        return stats;
    }

    private static int ExtractFirstInt(string s)
    {
        var token = new string(s.Where(c => char.IsDigit(c) || c == ' ').ToArray())
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault();
        return int.TryParse(token, out var v) ? v : 0;
    }

    private static int ExtractLastInt(string s)
    {
        var token = new string(s.Where(c => char.IsDigit(c) || c == ' ').ToArray())
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .LastOrDefault();
        return int.TryParse(token, out var v) ? v : 0;
    }

    private sealed class ExpectedStats
    {
        public int Hands { get; set; }
        public int Tournaments { get; set; }
        public int EvPerTournament { get; set; }
        public int HuSb { get; set; }
        public int HuBb { get; set; }
        public int ThreeWayBtn { get; set; }
        public int ThreeWaySb { get; set; }
        public int ThreeWayBb { get; set; }
        public int ChipsWon { get; set; }
        public int NetExpectedChipsWon { get; set; }
        public int ChipsWonShowdown { get; set; }
        public int ChipsWonNonShowdown { get; set; }
    }
}
