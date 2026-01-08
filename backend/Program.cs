using System.Net;
using System.Text;
using System.Text.Json;
using PokerTrackerBackend;

// Initialize SQLite
SQLitePCL.Batteries.Init();

if (args.Length > 0 && args[0] == "--compare")
{
    await ComparisonTool.Run();
    return;
}

var builder = WebApplication.CreateBuilder(args);

// Configure services
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddSingleton<Database>();
builder.Services.AddSingleton<EquityCalculator>();
builder.Services.AddSingleton<AnalyticsCalculator>();
builder.Services.AddSingleton<AnalysisEngine>();
builder.Services.AddSingleton<AnalysisService>();
builder.Services.AddSingleton<ImporterService>();

var app = builder.Build();

// Test database initialization
try
{
    var db = app.Services.GetRequiredService<Database>();
    app.Logger.LogInformation("Database initialized successfully");
}
catch (Exception ex)
{
    app.Logger.LogError($"Failed to initialize Database: {ex.Message}\nStackTrace: {ex.StackTrace}");
    throw;
}

app.UseCors();

// Global exception handler
app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (Exception ex)
    {
        app.Logger.LogError($"Unhandled exception: {ex.Message}\nStackTrace: {ex.StackTrace}");
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { success = false, error = ex.Message, stackTrace = ex.StackTrace });
    }
});

var logger = app.Logger;

// JSON options: be case-insensitive to match frontend payloads (e.g. "content" vs "Content")
var jsonOptions = new JsonSerializerOptions
{
    PropertyNameCaseInsensitive = true
};

// ============ Health Check ============
app.MapGet("/health", () =>
{
    return Results.Json(new
    {
        success = true,
        status = "running",
        version = "2.0.0-csharp",
        features = new
        {
            database = true,
            parsers = new[] { "Betclic" },
            equity = true,
            analysis = true
        }
    });
});

// ============ Parser Endpoints ============
app.MapPost("/import/file", async (HttpContext context, ImporterService importer) =>
{
    context.Response.ContentType = "text/event-stream";
    context.Response.Headers.Append("Cache-Control", "no-cache");
    context.Response.Headers.Append("Connection", "keep-alive");

    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<ImportFileRequest>(body, jsonOptions);

        if (data == null || string.IsNullOrEmpty(data.FilePath))
        {
            var errorPayload = JsonSerializer.Serialize(new { success = false, error = "No file path provided" });
            await context.Response.WriteAsync($"data: {errorPayload}\n\n");
            return;
        }

        await importer.ImportFileAsync(data.FilePath, async (progress) =>
        {
            var payload = JsonSerializer.Serialize(progress);
            await context.Response.WriteAsync($"data: {payload}\n\n");
            await context.Response.Body.FlushAsync();
        }, context.RequestAborted);
    }
    catch (Exception e)
    {
        logger.LogError($"Import error: {e.Message}");
        var errorPayload = JsonSerializer.Serialize(new { success = false, error = e.Message });
        await context.Response.WriteAsync($"data: {errorPayload}\n\n");
    }
});

app.MapPost("/parse/file", async (HttpContext context) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<ParseFileRequest>(body, jsonOptions);

        if (data == null || string.IsNullOrEmpty(data.Content))
        {
            return Results.BadRequest(new { success = false, error = "No content provided" });
        }

        IHandParser? parser;
        if (!string.IsNullOrEmpty(data.Room))
        {
            parser = ParserFactory.GetParserByRoom(data.Room);
        }
        else
        {
            parser = ParserFactory.GetParser(data.Content);
        }

        if (parser == null)
        {
            return Results.BadRequest(new { success = false, error = "Could not detect hand history format" });
        }

        var result = parser.ParseFile(data.Content);

        return Results.Json(new
        {
            success = result.Success,
            room = parser.RoomName,
            hands = result.Hands,
            count = result.Count,
            error = result.Error
        });
    }
    catch (Exception e)
    {
        logger.LogError($"Parse error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/parse/detect", async (HttpContext context) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<ParseDetectRequest>(body, jsonOptions);

        if (data == null || string.IsNullOrEmpty(data.Content))
        {
            return Results.BadRequest(new { success = false, error = "No content provided" });
        }

        var parser = ParserFactory.GetParser(data.Content);

        if (parser != null)
        {
            return Results.Json(new
            {
                success = true,
                room = parser.RoomName,
                version = parser.ParserVersion
            });
        }
        else
        {
            return Results.Json(new { success = false, error = "Unknown format" });
        }
    }
    catch (Exception e)
    {
        return Results.Json(new { success = false, message = e.Message, error = e.Message });
    }
});

// ============ Database Endpoints ============
app.MapPost("/db/insert-hands", async (HttpContext context, Database db, AnalyticsCalculator analyticsCalc) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        
        var data = JsonSerializer.Deserialize<InsertHandsRequest>(body, jsonOptions);

        if (data == null || data.Hands == null || data.Hands.Count == 0)
        {
            return Results.Json(new { success = true, inserted = 0 });
        }

        // Insert raw hand data
        var inserted = await db.InsertHandsBatchAsync(data.Hands);

        // Calculate analytics in parallel
        var analyticsList = await Task.WhenAll(
            data.Hands.Select(hand => Task.Run(() => analyticsCalc.CalculateHandAnalytics(hand)))
        );

        // Insert analytics
        if (analyticsList.Length > 0)
        {
            await db.InsertAnalyticsBatchAsync(analyticsList);
        }

        return Results.Json(new
        {
            success = true,
            inserted,
            total = data.Hands.Count,
            analytics_calculated = analyticsList.Length
        });
    }
    catch (Exception e)
    {
        logger.LogWarning($"Insert error: {e.Message}\nStackTrace: {e.StackTrace}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapMethods("/db/hands", new[] { "GET", "POST" }, async (HttpContext context, Database db, ILogger<Program> logger) =>
{
    try
    {
        logger.LogInformation($"GET /db/hands called with method: {context.Request.Method}");
        HandsQueryOptions options;

        if (context.Request.Method == "POST")
        {
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync();
            options = JsonSerializer.Deserialize<HandsQueryOptions>(body, jsonOptions) ?? new HandsQueryOptions();
        }
        else
        {
            options = new HandsQueryOptions
            {
                Page = int.TryParse(context.Request.Query["page"], out var p) ? p : 1,
                Limit = int.TryParse(context.Request.Query["limit"], out var l) ? l : 50,
                DateFrom = context.Request.Query["dateFrom"],
                DateTo = context.Request.Query["dateTo"],
                HeroName = context.Request.Query["heroName"]
            };
        }

        var result = await db.GetHandsAsync(options);
        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Get hands error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapGet("/db/hand/{handId}", async (string handId, Database db) =>
{
    try
    {
        var hand = await db.GetHandByIdAsync(handId);

        if (hand != null)
        {
            return Results.Json(new { success = true, data = hand });
        }
        else
        {
            return Results.NotFound(new { success = false, error = "Hand not found" });
        }
    }
    catch (Exception e)
    {
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapGet("/db/dashboard-stats", async (HttpContext context, Database db) =>
{
    try
    {
        var heroName = context.Request.Query["heroName"].ToString();
        var stats = await db.GetDashboardStatsAsync(string.IsNullOrEmpty(heroName) ? null : heroName);
        return Results.Json(new { success = true, data = stats });
    }
    catch (Exception e)
    {
        logger.LogError($"Dashboard stats error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapMethods("/db/session-history", new[] { "GET", "POST" }, async (HttpContext context, Database db) =>
{
    try
    {
        var limit = 50;
        string? heroName = null;
        if (context.Request.Method == "POST")
        {
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonSerializer.Deserialize<SessionHistoryRequest>(body, jsonOptions);
            limit = data?.Limit ?? 50;
            heroName = data?.HeroName;
        }
        else
        {
            limit = int.TryParse(context.Request.Query["limit"], out var l) ? l : 50;
            heroName = context.Request.Query["heroName"];
        }

        var sessions = await db.GetSessionHistoryAsync(limit, heroName);
        return Results.Json(new { success = true, data = sessions });
    }
    catch (Exception e)
    {
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapMethods("/db/winrate-chart", new[] { "GET", "POST" }, async (HttpContext context, Database db) =>
{
    try
    {
        ChartQueryOptions options;

        if (context.Request.Method == "POST")
        {
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync();
            options = JsonSerializer.Deserialize<ChartQueryOptions>(body, jsonOptions) ?? new ChartQueryOptions();
        }
        else
        {
            options = new ChartQueryOptions
            {
                DateFrom = context.Request.Query["dateFrom"],
                DateTo = context.Request.Query["dateTo"],
                HeroName = context.Request.Query["heroName"]
            };
        }

        var data = await db.GetWinrateChartDataAsync(options);
        return Results.Json(new { success = true, data });
    }
    catch (Exception e)
    {
        logger.LogError($"Winrate chart error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

        // DEBUG endpoint: return raw dashboard sums and sample hands
        app.MapGet("/debug/dashboard-raw", async (Database db) =>
        {
            try
            {
                var data = await db.GetDashboardRawAsync(50);
                return Results.Json(new { success = true, data });
            }
            catch (Exception e)
            {
                logger.LogError($"Debug dashboard raw error: {e.Message}");
                return Results.Json(new { success = false, error = e.Message });
            }
        });

        app.MapMethods("/db/range-heatmap", new[] { "GET", "POST" }, async (HttpContext context, Database db) =>
{
    try
    {
        RangeHeatmapFilters filters;

        if (context.Request.Method == "POST")
        {
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync();
            filters = JsonSerializer.Deserialize<RangeHeatmapFilters>(body, jsonOptions) ?? new RangeHeatmapFilters();
        }
        else
        {
            filters = new RangeHeatmapFilters();
        }

        var heatmap = await db.GetRangeHeatmapAsync(filters);
        return Results.Json(new { success = true, data = heatmap });
    }
    catch (Exception e)
    {
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapMethods("/db/players", new[] { "GET", "POST" }, async (HttpContext context, Database db) =>
{
    try
    {
        PlayersQueryOptions options;

        if (context.Request.Method == "POST")
        {
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync();
            options = JsonSerializer.Deserialize<PlayersQueryOptions>(body, jsonOptions) ?? new PlayersQueryOptions();
        }
        else
        {
            var limit = int.TryParse(context.Request.Query["limit"], out var l) ? l : (int?)null;
            options = new PlayersQueryOptions { Limit = limit };
        }

        var playersData = await db.GetPlayersOverviewAsync(options);
        return Results.Json(new { success = true, data = playersData });
    }
    catch (Exception e)
    {
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/db/delete-all", async (Database db) =>
{
    try
    {
        var result = await db.DeleteAllHandsAsync();
        return Results.Json(result);
    }
    catch (Exception e)
    {
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

// ============ Equity Endpoints ============
app.MapPost("/equity", async (HttpContext context, EquityCalculator equityCalc) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<EquityRequest>(body, jsonOptions);

        if (data == null || string.IsNullOrEmpty(data.HeroCards) || string.IsNullOrEmpty(data.VillainCards))
        {
            return Results.BadRequest(new
            {
                success = false,
                error = "heroCards and villainCards are required"
            });
        }

        var result = equityCalc.Calculate(
            data.HeroCards,
            data.VillainCards,
            data.Board ?? "",
            data.Iterations ?? 10000
        );

        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Equity calculation error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/equity/batch", async (HttpContext context, EquityCalculator equityCalc) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<BatchEquityRequest>(body, jsonOptions);

        if (data == null || data.Hands == null)
        {
            return Results.BadRequest(new { success = false, error = "Invalid request" });
        }

        var iterations = data.Iterations ?? 5000;
        var results = new List<object>();

        foreach (var hand in data.Hands)
        {
            var result = equityCalc.Calculate(
                hand.HeroCards ?? "",
                hand.VillainCards ?? "",
                hand.Board ?? "",
                iterations
            );

            results.Add(new
            {
                id = hand.Id,
                result.HeroEquity,
                result.VillainEquity,
                result.TieEquity
            });
        }

        return Results.Json(new
        {
            success = true,
            data = results,
            processed = results.Count
        });
    }
    catch (Exception e)
    {
        logger.LogError($"Batch equity calculation error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

// ============ Analysis Endpoints ============
app.MapPost("/analysis/stats", async (HttpContext context, AnalysisService analysisService) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var filters = JsonSerializer.Deserialize<PokerTrackerBackend.AnalysisFilters>(body, jsonOptions);

        if (filters == null)
        {
             return Results.BadRequest(new { success = false, error = "No filters provided" });
        }

        var result = await analysisService.GetAnalysisStatsAsync(filters);
        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Analysis error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/analysis/hands", async (HttpContext context, AnalysisService analysisService) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var request = JsonSerializer.Deserialize<AnalysisHandsRequest>(body, jsonOptions);

        if (request == null)
        {
             return Results.BadRequest(new { success = false, error = "Invalid request" });
        }

        var result = await analysisService.GetAnalysisHandsAsync(request);
        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Analysis hands error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/analyze/leaks", async (HttpContext context, Database db, AnalysisEngine analysisEngine) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<AnalyzeLeaksRequest>(body, jsonOptions);

        string? heroName = null;
        if (data?.Options != null && data.Options.ContainsKey("heroName"))
        {
            heroName = data.Options["heroName"]?.ToString();
        }

        var hands = await db.GetAllHandsForAnalysisAsync(heroName);
        var result = analysisEngine.DetectLeaks(hands, data?.Options ?? new Dictionary<string, object>());

        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Leak analysis error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/analyze/range", async (HttpContext context, AnalysisEngine analysisEngine) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<AnalyzeRangeRequest>(body, jsonOptions);

        if (data == null)
        {
            return Results.BadRequest(new { success = false, error = "Invalid request" });
        }

        var result = analysisEngine.AnalyzeRange(data.Position, data.Action, data.Stack ?? 20);

        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Range analysis error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/recalculate-analytics", async (Database db, AnalyticsCalculator analyticsCalc) =>
{
    try
    {
        // Delete existing analytics
        await db.DeleteAllAnalyticsAsync();

        // Get all raw hands
        var hands = await db.GetAllHandsForAnalysisAsync();

        if (hands.Count == 0)
        {
            return Results.Json(new { success = true, data = Array.Empty<object>(), processed = 0 });
        }

        logger.LogInformation($"Recalculating analytics for {hands.Count} hands...");

        // Process in parallel
        var analyticsList = await Task.WhenAll(
            hands.Select(hand => Task.Run(() => analyticsCalc.CalculateHandAnalytics(hand)))
        );

        // Insert all analytics
        if (analyticsList.Length > 0)
        {
            var inserted = await db.InsertAnalyticsBatchAsync(analyticsList);
            logger.LogInformation($"Inserted {inserted} analytics records");
        }

        return Results.Json(new
        {
            success = true,
            processed = analyticsList.Length,
            total_hands = hands.Count
        });
    }
    catch (Exception e)
    {
        logger.LogError($"Analytics recalculation error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/recalculate-analytics/stream", async (HttpContext context, Database db, AnalyticsCalculator analyticsCalc) =>
{
    context.Response.ContentType = "text/event-stream";
    context.Response.Headers.Append("Cache-Control", "no-cache");
    context.Response.Headers.Append("Connection", "keep-alive");

    try
    {
        await db.DeleteAllAnalyticsAsync();
        var hands = await db.GetAllHandsForAnalysisAsync();
        var total = hands.Count;

        if (hands.Count == 0)
        {
            var payload = JsonSerializer.Serialize(new
            {
                success = true,
                processed = 0,
                total_hands = 0,
                progress = 100,
                message = "No hands to process"
            });
            await context.Response.WriteAsync($"data: {payload}\n\n");
            await context.Response.Body.FlushAsync();
            return;
        }

        var analyticsList = new List<HandAnalytics>();
        var processed = 0;

        // Process in batches
        var batchSize = 100;
        for (var i = 0; i < hands.Count; i += batchSize)
        {
            var batch = hands.Skip(i).Take(batchSize).ToList();
            var batchResults = await Task.WhenAll(
                batch.Select(hand => Task.Run(() => analyticsCalc.CalculateHandAnalytics(hand)))
            );

            analyticsList.AddRange(batchResults);
            processed += batchResults.Length;

            var progress = (int)((processed / (double)total) * 100);
            var payload = JsonSerializer.Serialize(new
            {
                progress,
                message = $"Processed {processed}/{total} hands",
                processed,
                total
            });

            await context.Response.WriteAsync($"data: {payload}\n\n");
            await context.Response.Body.FlushAsync();
        }

        // Insert all analytics
        if (analyticsList.Count > 0)
        {
            var inserted = await db.InsertAnalyticsBatchAsync(analyticsList.ToArray());
            var finalPayload = JsonSerializer.Serialize(new
            {
                progress = 100,
                message = "Terminé",
                processed = analyticsList.Count,
                total,
                inserted,
                success = true
            });
            await context.Response.WriteAsync($"data: {finalPayload}\n\n");
        }
        else
        {
            var finalPayload = JsonSerializer.Serialize(new
            {
                progress = 100,
                message = "Terminé",
                processed = 0,
                total,
                success = true
            });
            await context.Response.WriteAsync($"data: {finalPayload}\n\n");
        }

        await context.Response.Body.FlushAsync();
    }
    catch (Exception e)
    {
        logger.LogError($"Analytics recalculation stream error: {e.Message}");
        var errorPayload = JsonSerializer.Serialize(new
        {
            progress = 100,
            message = e.Message,
            error = true
        });
        await context.Response.WriteAsync($"data: {errorPayload}\n\n");
        await context.Response.Body.FlushAsync();
    }
});

// Get port from command line args
var port = args.Length > 0 && int.TryParse(args[0], out var p) ? p : 5050;

logger.LogInformation($"Starting C# backend on port {port}");
logger.LogInformation("Available parsers: Betclic");

app.Run($"http://127.0.0.1:{port}");

// ============ Request/Response Models ============
public record ImportFileRequest(string FilePath);
public record ParseFileRequest(string? Content, string? Room);
public record ParseDetectRequest(string? Content);
public class InsertHandsRequest { public List<ParsedHand> Hands { get; set; } = new(); }
public record HandsQueryOptions
{
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 50;
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? Position { get; set; }
    public string? Result { get; set; }
    public string? GameType { get; set; }
    public double? MinPot { get; set; }
    public double? MaxPot { get; set; }
    public string? HeroName { get; set; }
}
public record SessionHistoryRequest(int Limit = 50, string? HeroName = null);
public record ChartQueryOptions
{
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? HeroName { get; set; }
}
public record RangeHeatmapFilters 
{ 
    public string? HeroName { get; set; }
}
public record PlayersQueryOptions
{
    public int? Limit { get; set; }
    public int? MinHands { get; set; }
}
public record EquityRequest(string? HeroCards, string? VillainCards, string? Board, int? Iterations);
public record BatchEquityRequest(List<BatchEquityHand> Hands, int? Iterations);
public record BatchEquityHand(string? Id, string? HeroCards, string? VillainCards, string? Board);
public record AnalyzeLeaksRequest(Dictionary<string, object>? Options);
public record AnalyzeRangeRequest(string? Position, string? Action, int? Stack);
// AnalysisFilters record removed to use class from AnalysisModels.cs

// ... existing code ...
