using System.Text;
using System.Text.Json;
using System.Diagnostics;
using System.Threading.Channels;
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
    private const int InternalBatchSize = 1000; 

    public ImporterService(Database db, IAnalyticsCalculator analyticsCalc, ILogger<ImporterService> logger, SpinTrackerBackend.Data.Repositories.PlayerRepository? playerRepo = null)
    {
        _db = db;
        _analyticsCalc = analyticsCalc;
        _logger = logger;
        _playerRepo = playerRepo;
    }

    private readonly SpinTrackerBackend.Data.Repositories.PlayerRepository? _playerRepo;

    private static readonly System.Text.RegularExpressions.Regex QuickHandIdRegex = 
        new(@"Hand #(\d+)", System.Text.RegularExpressions.RegexOptions.Compiled);

    private string? TryExtractHandIdQuick(string handText, IHandParser parser)
    {
        if (string.IsNullOrEmpty(handText)) return null;
        
        var firstLine = handText.Split('\n').FirstOrDefault() ?? "";
        
        var match = QuickHandIdRegex.Match(firstLine);
        if (match.Success)
        {
            return match.Groups[1].Value;
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

                if (line.Trim() == separator)
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

        // Pipeline channels - increased buffer size for better throughput
        var handTextChannel = Channel.CreateBounded<string>(new BoundedChannelOptions(2000) { FullMode = BoundedChannelFullMode.Wait });
        var processedChannel = Channel.CreateBounded<(ParsedHand, HandAnalytics)>(new BoundedChannelOptions(2000) { FullMode = BoundedChannelFullMode.Wait });

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

                    if (line.Trim() == separator)
                    {
                        if (handBuffer.Length > 0)
                        {
                            var handText = handBuffer.ToString();
                            await handTextChannel.Writer.WriteAsync(handText, cancellationToken);
                            totalHandsFound++;
                            handBuffer.Clear();
                        }
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
        // Use more workers for I/O-bound parsing work
        int workerCount = Math.Max(4, Environment.ProcessorCount * 2);
        _logger.LogInformation($"[IMPORT] Starting {workerCount} worker tasks");
        var workerSw = Stopwatch.StartNew();
        var workerTasks = Enumerable.Range(0, workerCount).Select(_ => Task.Run(async () =>
        {
            int handsParsed = 0;
            int analyticsComputed = 0;
            var parseSw = new Stopwatch();
            var analyticsSw = new Stopwatch();
            try
            {
                await foreach (var handText in handTextChannel.Reader.ReadAllAsync(cancellationToken))
                {
                    try
                    {
                        parseSw.Start();
                        var hand = parser.ParseHand(handText);
                        parseSw.Stop();
                        if (hand == null) continue;

                        handsParsed++;

                        // Only calculate analytics when actually needed (all-in + showdown + cards known)
                        HandAnalytics analytics;
                        var hero = hand.Players.FirstOrDefault(p => p.IsHero);
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
                _logger.LogInformation($"[IMPORT] Worker done: {handsParsed} parsed ({parseSw.ElapsedMilliseconds}ms), {analyticsComputed} analytics ({analyticsSw.ElapsedMilliseconds}ms)");
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

        await onProgress(new ImportProgress 
        { 
            Message = "Import completed successfully", 
            Percent = 100, 
            HandsImported = importedHands,
            HandsSkipped = skippedHands,
            TotalHands = importedHands + skippedHands,
            Success = true
        });
        
        _logger.LogInformation($"Imported {importedHands} hands in {stopwatch.ElapsedMilliseconds}ms using {workerCount} workers");
    }
}
