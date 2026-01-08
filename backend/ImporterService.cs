using System.Text;
using System.Text.Json;
using System.Diagnostics;

namespace PokerTrackerBackend;

public class ImporterService
{
    private readonly Database _db;
    private readonly AnalyticsCalculator _analyticsCalc;
    private readonly ILogger<ImporterService> _logger;
    private const int BatchSize = 200; // Increased batch size for better throughput

    public ImporterService(Database db, AnalyticsCalculator analyticsCalc, ILogger<ImporterService> logger)
    {
        _db = db;
        _analyticsCalc = analyticsCalc;
        _logger = logger;
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
        long processedBytes = 0;
        int totalHands = 0;
        int importedHands = 0;
        
        // Initial progress
        await onProgress(new ImportProgress { Message = "Reading file...", Percent = 0 });

        // We need to determine the parser and separator first.
        // Let's read the first few lines to detect format.
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

        // Hardcoded separator for Betclic for now, or we could add it to IHandParser interface
        string separator = "------------"; 
        
        var handBuffer = new StringBuilder();
        var handsBatch = new List<ParsedHand>();
        
        using (var reader = new StreamReader(filePath))
        {
            string? line;
            while ((line = await reader.ReadLineAsync()) != null)
            {
                if (cancellationToken.IsCancellationRequested) break;

                processedBytes += Encoding.UTF8.GetByteCount(line) + 2; // +2 for newline approximation

                if (line.Trim() == separator)
                {
                    if (handBuffer.Length > 0)
                    {
                        var handText = handBuffer.ToString();
                        var hand = parser.ParseHand(handText);
                        if (hand != null)
                        {
                            handsBatch.Add(hand);
                            totalHands++;
                        }
                        handBuffer.Clear();

                        if (handsBatch.Count >= BatchSize)
                        {
                            await ProcessBatchAsync(handsBatch, onProgress);
                            importedHands += handsBatch.Count;
                            handsBatch.Clear();
                            
                            // Report progress
                            var percent = (int)((double)processedBytes / totalBytes * 100);
                            await onProgress(new ImportProgress 
                            { 
                                Message = $"Imported {importedHands} hands...", 
                                Percent = Math.Min(99, percent),
                                HandsImported = importedHands,
                                TotalHands = totalHands // approximate or running total
                            });
                        }
                    }
                }
                else
                {
                    handBuffer.AppendLine(line);
                }
            }
            
            // Process remaining buffer
            if (handBuffer.Length > 0)
            {
                var handText = handBuffer.ToString();
                var hand = parser.ParseHand(handText);
                if (hand != null)
                {
                    handsBatch.Add(hand);
                    totalHands++;
                }
            }
            
            // Process final batch
            if (handsBatch.Count > 0)
            {
                await ProcessBatchAsync(handsBatch, onProgress);
                importedHands += handsBatch.Count;
            }
        }

        stopwatch.Stop();
        await onProgress(new ImportProgress 
        { 
            Message = "Import completed successfully", 
            Percent = 100, 
            HandsImported = importedHands,
            TotalHands = totalHands,
            Success = true
        });
        
        _logger.LogInformation($"Imported {importedHands} hands in {stopwatch.ElapsedMilliseconds}ms");
    }

    private async Task ProcessBatchAsync(List<ParsedHand> hands, Func<ImportProgress, Task> onProgress)
    {
        // 1. Calculate Analytics in Parallel
        var analytics = await Task.WhenAll(
            hands.Select(hand => Task.Run(() => _analyticsCalc.CalculateHandAnalytics(hand)))
        );

        // 2. Insert Hands and Analytics in one transaction
        await _db.InsertHandsAndAnalyticsBatchAsync(hands, analytics.ToList());
    }
}

public class ImportProgress
{
    public string Message { get; set; } = "";
    public int Percent { get; set; }
    public int HandsImported { get; set; }
    public int TotalHands { get; set; }
    public bool Success { get; set; }
    public string? Error { get; set; }
}
