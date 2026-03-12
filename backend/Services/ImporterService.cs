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
    private const int InternalBatchSize = 500; 

    public ImporterService(Database db, IAnalyticsCalculator analyticsCalc, ILogger<ImporterService> logger, SpinTrackerBackend.Data.Repositories.PlayerRepository? playerRepo = null)
    {
        _db = db;
        _analyticsCalc = analyticsCalc;
        _logger = logger;
        _playerRepo = playerRepo;
    }

    private readonly SpinTrackerBackend.Data.Repositories.PlayerRepository? _playerRepo;

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
        
        // Initial progress
        await onProgress(new ImportProgress { Message = "Initializing pipeline...", Percent = 0 });

        // Detect parser
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
        
        // 0. Fetch existing hands to skip duplicates
        var existingHandIds = await _db.GetExistingHandIdsAsync();
        int skippedHands = 0;

        // Pipeline channels
        var handTextChannel = Channel.CreateBounded<string>(new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.Wait });
        var processedChannel = Channel.CreateBounded<(ParsedHand, HandAnalytics)>(new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.Wait });

        // Statistics tracking
        int totalHandsFound = 0;
        int importedHands = 0;
        long processedBytes = 0;

        // 1. Reader Task
        var readerTask = Task.Run(async () =>
        {
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
                            // Quick check for hand ID to skip if possible
                            // Note: full ID is only known after parsing, but many formats have it in first line
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
                handTextChannel.Writer.Complete();
            }
        }, cancellationToken);

        // 2. Worker Tasks (Parallel Parsing + Analytics)
        int workerCount = Math.Max(1, Environment.ProcessorCount - 1);
        var workerTasks = Enumerable.Range(0, workerCount).Select(_ => Task.Run(async () =>
        {
            try
            {
                await foreach (var handText in handTextChannel.Reader.ReadAllAsync(cancellationToken))
                {
                    try
                    {
                        var hand = parser.ParseHand(handText);
                        if (hand != null && hand.PlayerCount <= 3 && hand.Id != null && existingHandIds.Contains(hand.Id))
                        {
                            Interlocked.Increment(ref skippedHands);
                            continue;
                        }

                        if (hand == null) continue;
                        var analytics = _analyticsCalc.CalculateHandAnalytics(hand);
                        await processedChannel.Writer.WriteAsync((hand, analytics), cancellationToken);
                    }
                    catch (Exception e)
                    {
                        _logger.LogWarning($"Parse/Analytics error: {e.Message}");
                    }
                }
            }
            catch (OperationCanceledException) { }
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
