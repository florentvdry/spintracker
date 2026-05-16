using System.Text;
using System.Text.Json;
using System.Diagnostics;
using System.Threading.Channels;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Globalization;
using System.Text.RegularExpressions;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;
using SpinTrackerBackend.Engines;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Services;

public class ImporterService : IImporterService
{
    private readonly Database _db;
    private readonly IAnalyticsCalculator _analyticsCalc;
    private readonly ILogger<ImporterService> _logger;
    private const int InternalBatchSize = 500;
    
    private static readonly System.Text.RegularExpressions.Regex HandIdRegex = 
        new(@"Hand #(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled);
    
    private static readonly System.Text.RegularExpressions.Regex PlayerActionRegex = 
        new(@"^(?:[0-9:]+\s*-\s*)?([^:]+):", System.Text.RegularExpressions.RegexOptions.Compiled);
    
    private static readonly System.Text.RegularExpressions.Regex PostsRegex = 
        new(@"posts\s+\w+\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex RaisesToRegex = 
        new(@"raises\s+to\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex CallsRegex = 
        new(@"calls\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex BetsRegex = 
        new(@"bets\s+(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex AllInRegex = 
        new(@"(\d+)\s+and\s+is\s+all-in", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    
    private static readonly System.Text.RegularExpressions.Regex DealtToNameRegex = 
        new(@"Dealt to\s+(.+?)\s+\[", System.Text.RegularExpressions.RegexOptions.Compiled);
    
    private static readonly ConcurrentDictionary<string, bool> HandIdCache = new();
    private const int MaxCacheSize = 10000;
    
    private static readonly ConcurrentDictionary<string, EquityResult> EquityCache = new();
    private const int MaxEquityCacheSize = 50000; 

    private sealed class WinamaxSummaryInfo
    {
        public int Position { get; set; }
        public double PrizePool { get; set; }
        public double BuyIn { get; set; }
    }

    private static readonly Regex WinamaxSummaryTournamentIdRegex =
        new(@"Tournament summary\s*:\s*.*\((?<id>\d+)\)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex WinamaxSummaryPrizePoolRegex =
        new(@"Prizepool\s*:\s*(?<value>\d+(?:[.,]\d+)?)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex WinamaxSummaryBuyInRegex =
        new(@"Buy-In\s*:\s*(?<buy>\d+(?:[.,]\d+)?)\D+\+\s*(?<fee>\d+(?:[.,]\d+)?)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex WinamaxSummaryPositionRegex =
        new(@"You finished in\s*(?<pos>\d+)(?:st|nd|rd|th)\s*place", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static bool IsHandBoundary(string line, string separator)
    {
        if (string.IsNullOrWhiteSpace(line) || string.IsNullOrWhiteSpace(separator)) return false;
        var trimmed = line.Trim();
        return trimmed.Equals(separator, StringComparison.Ordinal) ||
               trimmed.StartsWith(separator, StringComparison.Ordinal);
    }

    public ImporterService(Database db, IAnalyticsCalculator analyticsCalc, ILogger<ImporterService> logger, SpinTrackerBackend.Data.Repositories.PlayerRepository? playerRepo = null)
    {
        _db = db;
        _analyticsCalc = analyticsCalc;
        _logger = logger;
        _playerRepo = playerRepo;
    }

    private readonly SpinTrackerBackend.Data.Repositories.PlayerRepository? _playerRepo;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private string? TryExtractHandIdQuick(string handText)
    {
        if (string.IsNullOrEmpty(handText)) return null;
        
        var firstLine = handText.IndexOf('\n') > 0 ? handText.Substring(0, handText.IndexOf('\n')) : handText;
        
        var match = HandIdRegex.Match(firstLine);
        if (match.Success)
        {
            var handId = match.Groups[1].Value;
            if (HandIdCache.Count > MaxCacheSize)
            {
                HandIdCache.Clear();
            }
            HandIdCache.TryAdd(handId, true);
            return handId;
        }
        
        return null;
    }

    public async Task<int> CountHandsInFileAsync(string filePath, CancellationToken cancellationToken)
    {
        if (!File.Exists(filePath))
        {
            return 0;
        }

        // Detect parser to get separator
        string firstChunk;
        using (var reader = new StreamReader(filePath))
        {
            var buffer = new char[4096];
            int read = await reader.ReadAsync(buffer, 0, buffer.Length);
            firstChunk = new string(buffer, 0, read);
        }

        var parser = ParserFactory.GetParser(firstChunk);
        if (parser == null)
        {
            return 0;
        }

        string separator = parser.HandSeparator;
        int count = 0;

        using (var reader = new StreamReader(filePath))
        {
            string? line;
            while ((line = await reader.ReadLineAsync()) != null)
            {
                if (cancellationToken.IsCancellationRequested) break;

                if (IsHandBoundary(line, separator))
                {
                    count++;
                }
            }
        }

        return count;
    }

    public async Task ImportFileAsync(string filePath, Func<ImportProgress, Task> onProgress, CancellationToken cancellationToken)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"File not found: {filePath}");
        }

        var stopwatch = Stopwatch.StartNew();
        var fileInfo = new FileInfo(filePath);
        var totalBytes = fileInfo.Length;
        
        _logger.LogInformation($"[IMPORT] Starting import of {filePath} ({totalBytes} bytes)");
        
        // Initial progress
        await onProgress(new ImportProgress { Message = "Initializing pipeline...", Percent = 0 });

        // Detect parser
        var detectStart = Stopwatch.StartNew();
        string firstChunk;
        using (var reader = new StreamReader(filePath))
        {
            var buffer = new char[4096];
            int read = await reader.ReadAsync(buffer, 0, buffer.Length);
            firstChunk = new string(buffer, 0, read);
        }

        var parser = ParserFactory.GetParser(firstChunk);
        if (parser == null)
        {
            throw new Exception("Could not detect hand history format");
        }

        string separator = parser.HandSeparator; 
        _logger.LogInformation($"[IMPORT] Parser detected in {detectStart.ElapsedMilliseconds}ms, separator: {separator}");

        Dictionary<string, WinamaxSummaryInfo>? winamaxSummaries = null;
        Dictionary<string, WinamaxSummaryInfo>? unibetSummaries = null;
        if (parser is WinamaxParser)
        {
            var cleaned = await _db.CleanupCorruptedWinamaxHandsAsync();
            if (cleaned > 0)
            {
                _logger.LogInformation($"[IMPORT] Cleaned {cleaned} stale/corrupted Winamax rows before import.");
            }

            winamaxSummaries = TryLoadWinamaxSummaries(filePath);
            _logger.LogInformation($"[IMPORT] Winamax summaries loaded: {winamaxSummaries.Count}");
        }
        else if (parser is UnibetParser)
        {
            unibetSummaries = TryLoadUnibetSummaries(filePath);
            _logger.LogInformation($"[IMPORT] Unibet summaries loaded: {unibetSummaries.Count}");
        }

        // Pipeline channels - increased buffer size for better throughput
        var handTextChannel = Channel.CreateBounded<string>(new BoundedChannelOptions(5000) { FullMode = BoundedChannelFullMode.Wait });
        var processedChannel = Channel.CreateBounded<(ParsedHand, HandAnalytics)>(new BoundedChannelOptions(5000) { FullMode = BoundedChannelFullMode.Wait });

        // Statistics tracking
        int totalHandsFound = 0;
        int importedHands = 0;
        int skippedHands = 0;
        long processedBytes = 0;

        // 1. Reader Task
        var readerTask = Task.Run(async () =>
        {
            var readerSw = Stopwatch.StartNew();
            try
            {
                var handBuffer = new StringBuilder();
                using var reader = new StreamReader(filePath);
                string? line;
                while ((line = await reader.ReadLineAsync()) != null)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    processedBytes += Encoding.UTF8.GetByteCount(line) + 2;

                    if (IsHandBoundary(line, separator))
                    {
                        if (handBuffer.Length > 0)
                        {
                            var handText = handBuffer.ToString();
                            await handTextChannel.Writer.WriteAsync(handText, cancellationToken);
                            totalHandsFound++;
                            handBuffer.Clear();
                        }
                        // Keep boundary line as part of the next hand block (required by Winamax parser header parsing).
                        handBuffer.AppendLine(line);
                    }
                    else
                    {
                        handBuffer.AppendLine(line);
                    }
                }
                
                if (handBuffer.Length > 0)
                {
                    await handTextChannel.Writer.WriteAsync(handBuffer.ToString(), cancellationToken);
                    totalHandsFound++;
                }
            }
            finally
            {
                _logger.LogInformation($"[IMPORT] Reader finished: {totalHandsFound} hands in {readerSw.ElapsedMilliseconds}ms");
                handTextChannel.Writer.Complete();
            }
        }, cancellationToken);

        // 2. Worker Tasks (Parallel Parsing + Analytics)
        // Pre-scan file to detect hero name (the player with most "Dealt to" occurrences)
        string? detectedHeroName = null;
        if (parser is UnibetParser)
        {
            detectedHeroName = await DetectHeroNameFromFileAsync(filePath);
            if (!string.IsNullOrEmpty(detectedHeroName))
                _logger.LogInformation($"[IMPORT] Detected hero: {detectedHeroName}");
        }
        
        // Use more workers for I/O-bound parsing work
        int workerCount = Math.Max(4, Environment.ProcessorCount * 2);
        _logger.LogInformation($"[IMPORT] Starting {workerCount} worker tasks");
        var workerSw = Stopwatch.StartNew();
        var workerTasks = Enumerable.Range(0, workerCount).Select(workerId => Task.Run(async () =>
        {
            var localParser = parser;
            int handsParsed = 0;
            int analyticsComputed = 0;
            int cacheHits = 0;
            var parseSw = new Stopwatch();
            var analyticsSw = new Stopwatch();
            try
            {
                await foreach (var handText in handTextChannel.Reader.ReadAllAsync(cancellationToken))
                {
                    try
                    {
                        parseSw.Start();
                        var hand = localParser.ParseHand(handText);
                        parseSw.Stop();
                        if (hand == null) continue;

                        if (winamaxSummaries != null && !string.IsNullOrWhiteSpace(hand.GameId) && winamaxSummaries.TryGetValue(hand.GameId, out var summary))
                        {
                            if (summary.Position > 0) hand.Position = summary.Position;
                            if (summary.PrizePool > 0) hand.PrizePool = summary.PrizePool;
                            if (summary.BuyIn > 0) hand.BuyIn = summary.BuyIn;
                            if (hand.BuyIn > 0 && hand.PrizePool > 0)
                            {
                                hand.Multiplier = Math.Max(1, (int)Math.Round(hand.PrizePool / hand.BuyIn, MidpointRounding.AwayFromZero));
                            }
                        }
                        else if (unibetSummaries != null && !string.IsNullOrWhiteSpace(hand.GameId) && unibetSummaries.TryGetValue(hand.GameId, out var uSummary))
                        {
                            if (uSummary.Position > 0) hand.Position = uSummary.Position;
                            if (uSummary.PrizePool > 0) hand.PrizePool = uSummary.PrizePool;
                            if (uSummary.BuyIn > 0) hand.BuyIn = uSummary.BuyIn;
                            if (hand.BuyIn > 0 && hand.PrizePool > 0)
                            {
                                hand.Multiplier = Math.Max(1, (int)Math.Round(hand.PrizePool / hand.BuyIn, MidpointRounding.AwayFromZero));
                            }
                        }

                        handsParsed++;

                        HandAnalytics analytics;
                        var hero = hand.Players.FirstOrDefault(p => p.IsHero);
                        if (hero == null && !string.IsNullOrEmpty(detectedHeroName))
                        {
                            hero = hand.Players.FirstOrDefault(p => p.Name == detectedHeroName);
                        }
                        hero ??= hand.Players.FirstOrDefault(p => !string.IsNullOrEmpty(p.Cards));
                        if (hero != null && !hero.IsHero)
                        {
                            foreach (var p in hand.Players) p.IsHero = false;
                            hero.IsHero = true;
                        }
                        bool needsAnalytics = hand.WentToShowdown && 
                                              hand.PlayerCount <= 3 && 
                                              hero != null && 
                                              !string.IsNullOrEmpty(hero.Cards) &&
                                              (hero.IsAllIn || hand.Players.Any(p => !p.IsHero && p.IsAllIn));
                        
                        if (needsAnalytics)
                        {
                            analyticsSw.Start();
                            analytics = _analyticsCalc.CalculateHandAnalytics(hand);
                            analyticsSw.Stop();
                            analyticsComputed++;
                        }
                        else
                        {
                            analytics = new HandAnalytics { HandId = hand.Id };
                            if (hero != null)
                            {
                                analytics.NetWonAdjusted = hero.NetProfit;
                                analytics.ChipsWonShowdown = hero.WentToShowdown ? hero.NetProfit : 0;
                                analytics.ChipsWonNoShowdown = !hero.WentToShowdown ? hero.NetProfit : 0;
                            }
                        }
                        
                        await processedChannel.Writer.WriteAsync((hand, analytics), cancellationToken);
                    }
                    catch (Exception e)
                    {
                        _logger.LogWarning($"Parse/Analytics error: {e.Message}");
                    }
                }
            }
            catch (OperationCanceledException) { }
            finally
            {
                _logger.LogInformation($"[IMPORT] Worker {workerId} done: {handsParsed} parsed ({parseSw.ElapsedMilliseconds}ms), {analyticsComputed} analytics ({analyticsSw.ElapsedMilliseconds}ms), {cacheHits} cache hits");
            }
        }, cancellationToken)).ToArray();

        // 3. Writer Task (DB Batching)
        var writerTask = Task.Run(async () =>
        {
            try
            {
                var handsBatch = new List<ParsedHand>(InternalBatchSize);
                var analyticsBatch = new List<HandAnalytics>(InternalBatchSize);
                
                var lastProgressReport = Stopwatch.StartNew();

                await foreach (var (hand, analytics) in processedChannel.Reader.ReadAllAsync(cancellationToken))
                {
                    handsBatch.Add(hand);
                    analyticsBatch.Add(analytics);

                    if (handsBatch.Count >= InternalBatchSize)
                    {
                        await _db.InsertHandsAndAnalyticsBatchAsync(handsBatch, analyticsBatch);
                        importedHands += handsBatch.Count;
                        handsBatch.Clear();
                        analyticsBatch.Clear();

                        // Progress report
                        if (lastProgressReport.ElapsedMilliseconds > 200)
                        {
                            var percent = (int)((double)processedBytes / totalBytes * 100);
                            await onProgress(new ImportProgress 
                            { 
                                Message = $"Imported {importedHands} hands...", 
                                Percent = Math.Min(99, percent),
                                HandsImported = importedHands,
                                HandsSkipped = skippedHands,
                                TotalHands = totalHandsFound
                            });
                            lastProgressReport.Restart();
                        }
                    }
                }

                if (handsBatch.Count > 0)
                {
                    await _db.InsertHandsAndAnalyticsBatchAsync(handsBatch, analyticsBatch);
                    importedHands += handsBatch.Count;
                }
            }
            finally
            {
                // Nothing to close here
            }
        }, cancellationToken);

        // Wait for reader and workers to finish
        await readerTask;
        await Task.WhenAll(workerTasks);
        processedChannel.Writer.Complete();
        await writerTask;

        stopwatch.Stop();

        if (_playerRepo != null && importedHands > 0)
        {
            await _playerRepo.UpdatePlayerStatsAsync();
        }

        var equityStats = AnalyticsCalculator.GetEquityCacheStats();
        
        await onProgress(new ImportProgress 
        { 
            Message = "Import completed successfully", 
            Percent = 100, 
            HandsImported = importedHands,
            HandsSkipped = skippedHands,
            TotalHands = importedHands + skippedHands,
            Success = true
        });
        
        _logger.LogInformation($"Imported {importedHands} hands in {stopwatch.ElapsedMilliseconds}ms using {workerCount} workers. Equity cache: {equityStats.hits} hits, {equityStats.misses} misses, {equityStats.size} entries");
    }

    private Dictionary<string, WinamaxSummaryInfo> TryLoadWinamaxSummaries(string importedFilePath)
    {
        var map = new Dictionary<string, WinamaxSummaryInfo>(StringComparer.Ordinal);

        try
        {
            var directory = Path.GetDirectoryName(importedFilePath);
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            {
                return map;
            }

            var summaryFiles = Directory.GetFiles(directory, "*_summary.txt", SearchOption.TopDirectoryOnly);
            foreach (var summaryFile in summaryFiles)
            {
                try
                {
                    var text = File.ReadAllText(summaryFile);
                    var info = ParseWinamaxSummary(text);
                    if (info != null)
                    {
                        map[info.Value.GameId] = info.Value.Info;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug($"Failed to parse Winamax summary file {summaryFile}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Unable to load Winamax summaries from {importedFilePath}: {ex.Message}");
        }

        return map;
    }

    private (string GameId, WinamaxSummaryInfo Info)? ParseWinamaxSummary(string text)
    {
        var idMatch = WinamaxSummaryTournamentIdRegex.Match(text);
        if (!idMatch.Success) return null;

        var gameId = idMatch.Groups["id"].Value.Trim();
        if (string.IsNullOrWhiteSpace(gameId)) return null;

        double prizePool = 0;
        var prizeMatch = WinamaxSummaryPrizePoolRegex.Match(text);
        if (prizeMatch.Success) prizePool = ParseWinamaxNumber(prizeMatch.Groups["value"].Value);

        double buyIn = 0;
        var buyInMatch = WinamaxSummaryBuyInRegex.Match(text);
        if (buyInMatch.Success)
        {
            var buy = ParseWinamaxNumber(buyInMatch.Groups["buy"].Value);
            var fee = ParseWinamaxNumber(buyInMatch.Groups["fee"].Value);
            buyIn = buy > 0 ? buy : 0;
            if (buyIn <= 0 && fee > 0)
            {
                buyIn = fee;
            }
        }

        int position = 0;
        var positionMatch = WinamaxSummaryPositionRegex.Match(text);
        if (positionMatch.Success && int.TryParse(positionMatch.Groups["pos"].Value, out var parsedPos))
        {
            position = parsedPos;
        }

        return (gameId, new WinamaxSummaryInfo
        {
            Position = position,
            PrizePool = prizePool,
            BuyIn = buyIn
        });
    }

    private static double ParseWinamaxNumber(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        return double.TryParse(raw.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : 0;
    }

    private async Task<string?> DetectHeroNameFromFileAsync(string filePath)
    {
        try
        {
            var dealtCounts = new Dictionary<string, int>(StringComparer.Ordinal);
            using var reader = new StreamReader(filePath);
            string? line;
            while ((line = await reader.ReadLineAsync()) != null)
            {
                var match = DealtToNameRegex.Match(line);
                if (match.Success)
                {
                    var name = match.Groups[1].Value.Trim();
                    dealtCounts[name] = dealtCounts.TryGetValue(name, out var c) ? c + 1 : 1;
                }
            }
            if (dealtCounts.Count == 0) return null;
            return dealtCounts.OrderByDescending(kvp => kvp.Value).First().Key;
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Failed to detect hero name from file: {ex.Message}");
            return null;
        }
    }

    private static readonly Regex UnibetSummaryTournamentIdRegex =
        new(@"Unibet Tournament #(?<id>\d+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex UnibetSummaryPrizePoolRegex =
        new(@"Total Prize Pool: €(?<value>\d+(?:[.,]\d+)?)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex UnibetSummaryBuyInRegex =
        new(@"Buy-In: €(?<buy>\d+(?:[.,]\d+)?)\s*\+\s*€(?<fee>\d+(?:[.,]\d+)?)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex UnibetSummaryPositionRegex =
        new(@"You finished in (?<pos>\d+)(?:st|nd|rd|th) place", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private Dictionary<string, WinamaxSummaryInfo> TryLoadUnibetSummaries(string importedFilePath)
    {
        var map = new Dictionary<string, WinamaxSummaryInfo>(StringComparer.Ordinal);

        try
        {
            var directory = Path.GetDirectoryName(importedFilePath);
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            {
                return map;
            }

            var summaryFiles = Directory.GetFiles(directory, "TS*.txt", SearchOption.TopDirectoryOnly);
            foreach (var summaryFile in summaryFiles)
            {
                try
                {
                    var text = File.ReadAllText(summaryFile);
                    var info = ParseUnibetSummary(text);
                    if (info != null)
                    {
                        map[info.Value.GameId] = info.Value.Info;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug($"Failed to parse Unibet summary file {summaryFile}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Unable to load Unibet summaries from {importedFilePath}: {ex.Message}");
        }

        return map;
    }

    private (string GameId, WinamaxSummaryInfo Info)? ParseUnibetSummary(string text)
    {
        var idMatch = UnibetSummaryTournamentIdRegex.Match(text);
        if (!idMatch.Success) return null;

        var gameId = idMatch.Groups["id"].Value.Trim();
        if (string.IsNullOrWhiteSpace(gameId)) return null;

        double prizePool = 0;
        var prizeMatch = UnibetSummaryPrizePoolRegex.Match(text);
        if (prizeMatch.Success) prizePool = double.Parse(prizeMatch.Groups["value"].Value, CultureInfo.InvariantCulture);

        double buyIn = 0;
        var buyInMatch = UnibetSummaryBuyInRegex.Match(text);
        if (buyInMatch.Success)
        {
            var buy = double.Parse(buyInMatch.Groups["buy"].Value, CultureInfo.InvariantCulture);
            var fee = double.Parse(buyInMatch.Groups["fee"].Value, CultureInfo.InvariantCulture);
            buyIn = buy > 0 ? buy : 0;
        }

        int position = 0;
        var positionMatch = UnibetSummaryPositionRegex.Match(text);
        if (positionMatch.Success && int.TryParse(positionMatch.Groups["pos"].Value, out var parsedPos))
        {
            position = parsedPos;
        }

        return (gameId, new WinamaxSummaryInfo
        {
            Position = position,
            PrizePool = prizePool,
            BuyIn = buyIn
        });
    }
}
