using System.Net;
using System.Text;
using System.Text.Json;
using SpinTrackerBackend;
using SpinTrackerBackend.StatsBuilder;
using FluentMigrator.Runner;
using SpinTrackerBackend.Migrations;

// Initialize SQLite (use Batteries_V2 to match SQLitePCLRaw.batteries_v2)
SQLitePCL.Batteries_V2.Init();

if (args.Length > 0 && args[0] == "--compare")
{
    await ComparisonTool.Run();
    return;
}

var builder = WebApplication.CreateBuilder(args);

// Extract db-path if provided
string? dbPath = args.FirstOrDefault(a => a.StartsWith("--db-path="))?.Replace("--db-path=", "");

// Ensure dbPath defaults to the same path used by Database when not provided
if (string.IsNullOrEmpty(dbPath))
{
    var backendDir = Directory.GetCurrentDirectory();
    var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
    dbPath = Path.Combine(projectRoot, "poker_tracker.db");
}

var _connectionStringForMigrations = $"Data Source={dbPath}";

// Register FluentMigrator to run SQLite migrations
builder.Services.AddFluentMigratorCore()
    .ConfigureRunner(rb => rb
        .AddSQLite()
        .WithGlobalConnectionString(_connectionStringForMigrations)
        .ScanIn(typeof(InitialCreate20260111).Assembly).For.Migrations())
    .AddLogging(lb => lb.AddFluentMigratorConsole());

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

builder.Services.AddSingleton<Database>(sp => 
    new Database(sp.GetRequiredService<ILogger<Database>>(), dbPath));
builder.Services.AddSingleton<EquityCalculator>();
builder.Services.AddSingleton<AnalyticsCalculator>();
builder.Services.AddSingleton<AnalysisService>();
builder.Services.AddSingleton<StatsBuilderEngine>();
builder.Services.AddSingleton<ImporterService>();

var app = builder.Build();

// Run migrations before creating the Database singleton
using (var scope = app.Services.CreateScope())
{
    var migrationRunner = scope.ServiceProvider.GetService<IMigrationRunner>();
    if (migrationRunner != null)
    {
        app.Logger.LogInformation("Running database migrations...");
        migrationRunner.MigrateUp();
        app.Logger.LogInformation("Database migrations complete.");
    }
}

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

app.MapPost("/import/count-hands", async (HttpContext context, ImporterService importer) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<ImportFileRequest>(body, jsonOptions);

        if (data == null || string.IsNullOrEmpty(data.FilePath))
        {
            return Results.Json(new { success = false, error = "No file path provided" });
        }

        var count = await importer.CountHandsInFileAsync(data.FilePath, context.RequestAborted);
        return Results.Json(new { success = true, count });
    }
    catch (Exception e)
    {
        logger.LogError($"Count hands error: {e.Message}");
        return Results.Json(new { success = false, error = e.Message });
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
                HeroName = context.Request.Query["heroName"],
                SortBy = context.Request.Query["sortBy"]
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

app.MapMethods("/db/tournaments", new[] { "GET", "POST" }, async (HttpContext context, Database db, ILogger<Program> logger) =>
{
    try
    {
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
                HeroName = context.Request.Query["heroName"],
                SortBy = context.Request.Query["sortBy"]
            };
        }

        var result = await db.GetTournamentsAsync(options);
        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Get tournaments error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapGet("/db/tournament-hands", async (string gameId, string? heroName, Database db) =>
{
    try
    {
        var result = await db.GetTournamentHandsAsync(gameId, heroName);
        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
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
        var dateFrom = context.Request.Query["dateFrom"].ToString();
        var dateTo = context.Request.Query["dateTo"].ToString();
        var buyInStr = context.Request.Query["buyIn"].ToString();
        double? buyIn = double.TryParse(buyInStr, out var b) ? b : null;

        var stats = await db.GetDashboardStatsAsync(
            string.IsNullOrEmpty(heroName) ? null : heroName,
            string.IsNullOrEmpty(dateFrom) ? null : dateFrom,
            string.IsNullOrEmpty(dateTo) ? null : dateTo,
            buyIn
        );
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
        string? dateFrom = null;
        string? dateTo = null;
        double? buyIn = null;

        if (context.Request.Method == "POST")
        {
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync();
            var data = JsonSerializer.Deserialize<SessionHistoryRequest>(body, jsonOptions);
            limit = data?.Limit ?? 50;
            heroName = data?.HeroName;
            dateFrom = data?.DateFrom;
            dateTo = data?.DateTo;
            buyIn = data?.BuyIn;
        }
        else
        {
            limit = int.TryParse(context.Request.Query["limit"], out var l) ? l : 50;
            heroName = context.Request.Query["heroName"];
            dateFrom = context.Request.Query["dateFrom"];
            dateTo = context.Request.Query["dateTo"];
            if (double.TryParse(context.Request.Query["buyIn"], out var b)) buyIn = b;
        }

        var sessions = await db.GetSessionHistoryAsync(limit, heroName, dateFrom, dateTo, buyIn);
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
                HeroName = context.Request.Query["heroName"],
                BuyIn = double.TryParse(context.Request.Query["buyIn"], out var b) ? b : null
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

app.MapGet("/db/buyins", async (Database db) =>
{
    try
    {
        var buyIns = await db.GetUniqueBuyInsAsync();
        return Results.Json(new { success = true, data = buyIns });
    }
    catch (Exception e)
    {
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
        var filters = JsonSerializer.Deserialize<SpinTrackerBackend.AnalysisFilters>(body, jsonOptions);

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

app.MapPost("/analysis/range-breakdown", async (HttpContext context, AnalysisService analysisService) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        // Reuse AnalysisFilters but without strict action filtering? 
        // The service method will use the filters as is.
        var filters = JsonSerializer.Deserialize<SpinTrackerBackend.AnalysisFilters>(body, jsonOptions);

        if (filters == null)
        {
             return Results.BadRequest(new { success = false, error = "Invalid request" });
        }

        var result = await analysisService.GetRangeAnalysisAsync(filters);
        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Range breakdown error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/stats/builder/evaluate", async (HttpContext context, Database db, StatsBuilderEngine engine) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var stat = JsonSerializer.Deserialize<StatDefinition>(body, jsonOptions);

        if (stat == null)
        {
             return Results.BadRequest(new { success = false, error = "Invalid definition" });
        }

        // 1. Get All Hands (or filtered subset if optimization needed)
        // For now, fetch all hands to be safe, or maybe last 1000 for quick testing?
        // Let's fetch all for accuracy, but warn about perf.
        var hands = await db.GetAllHandsForAnalysisAsync();

        // 2. Evaluate
        var result = engine.Evaluate(hands, stat);

        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Stats Builder error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/analyze/range", async (HttpContext context, AnalysisService analysisService) =>
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

        var result = analysisService.AnalyzeRange(data.Position, data.Action, data.Stack ?? 20);

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


// ============ Custom Stats Endpoints ============
app.MapGet("/stats", async (Database db) =>
{
    try
    {
        var stats = await db.GetCustomStatsAsync();
        return Results.Json(new { success = true, data = stats });
    }
    catch (Exception e)
    {
        logger.LogError($"Get stats error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapGet("/stats/{id}", async (string id, Database db) =>
{
    try
    {
        var stat = await db.GetCustomStatAsync(id);
        if (stat != null)
        {
            return Results.Json(new { success = true, data = stat });
        }
        return Results.NotFound(new { success = false, error = "Stat not found" });
    }
    catch (Exception e)
    {
        logger.LogError($"Get stat error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/stats", async (HttpContext context, Database db) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<CustomStatRequest>(body, jsonOptions);

        if (data == null || string.IsNullOrEmpty(data.Name) || data.Definition == null)
        {
            return Results.BadRequest(new { success = false, error = "Name and Definition are required" });
        }

        var id = string.IsNullOrEmpty(data.Id) ? Guid.NewGuid().ToString() : data.Id;

        await db.SaveCustomStatAsync(id, data.Name, data.Description ?? "", data.Definition);

        return Results.Json(new { success = true, id });
    }
    catch (Exception e)
    {
        logger.LogError($"Save stat error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapDelete("/stats/{id}", async (string id, Database db) =>
{
    try
    {
        await db.DeleteCustomStatAsync(id);
        return Results.Json(new { success = true });
    }
    catch (Exception e)
    {
        logger.LogError($"Delete stat error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapGet("/stats/export", async (Database db) =>
{
    try
    {
        var stats = await db.GetCustomStatsAsync();
        return Results.Json(new { success = true, data = stats });
    }
    catch (Exception e)
    {
        logger.LogError($"Export stats error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/stats/import", async (HttpContext context, Database db) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var stats = JsonSerializer.Deserialize<List<CustomStatRequest>>(body, jsonOptions);

        if (stats == null) return Results.BadRequest(new { success = false, error = "Invalid JSON" });

        int count = 0;
        foreach (var stat in stats)
        {
            var id = string.IsNullOrEmpty(stat.Id) ? Guid.NewGuid().ToString() : stat.Id;
            await db.SaveCustomStatAsync(id, stat.Name, stat.Description ?? "", stat.Definition);
            count++;
        }

        return Results.Json(new { success = true, count });
    }
    catch (Exception e)
    {
        logger.LogError($"Import stats error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/stats/builder/evaluate-batch", async (HttpContext context, Database db, StatsBuilderEngine engine) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        
        // Expecting: { stats: [StatDefinition], filters: AnalysisFilters }
        var request = JsonSerializer.Deserialize<EvaluateBatchRequest>(body, jsonOptions);

        if (request == null || request.Stats == null || request.Stats.Count == 0)
        {
             return Results.BadRequest(new { success = false, error = "Invalid request" });
        }

        logger.LogInformation($"EvaluateBatch: Received {request.Stats.Count} stats to evaluate");
        logger.LogInformation($"EvaluateBatch: Filters - HeroName='{request.Filters?.HeroName}', PlayerCount={request.Filters?.PlayerCount}");

        // 1. Get Hands based on filters
        var hands = await db.GetFilteredHandsForStatsAsync(request.Filters ?? new SpinTrackerBackend.AnalysisFilters());
        logger.LogInformation($"EvaluateBatch: Retrieved {hands.Count} hands from database");

        if (hands.Count == 0)
        {
            logger.LogWarning("EvaluateBatch: No hands found with current filters");
            // Return empty results for all stats
            var emptyResults = new Dictionary<string, StatEvaluationResult>();
            foreach (var stat in request.Stats)
            {
                var key = !string.IsNullOrEmpty(stat.Id) ? stat.Id : stat.Name;
                emptyResults[key] = new StatEvaluationResult { Opportunities = 0, Successes = 0 };
            }
            return Results.Json(new { success = true, data = emptyResults });
        }

        // 2. Evaluate
        var result = engine.EvaluateBatch(hands, request.Stats, request.Filters?.HeroName);
        logger.LogInformation($"EvaluateBatch: Evaluation complete. Result count: {result.Count}");

        // Log some sample results
        int loggedSamples = 0;
        foreach (var kvp in result.Take(5))
        {
            logger.LogInformation($"EvaluateBatch: {kvp.Key} - Opportunities: {kvp.Value.Opportunities}, Successes: {kvp.Value.Successes}, Value: {kvp.Value.Value:F2}%");
            loggedSamples++;
        }

        return Results.Json(new { success = true, data = result });
    }
    catch (Exception e)
    {
        logger.LogError($"Batch Eval error: {e.Message}");
        logger.LogError($"Stack trace: {e.StackTrace}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

// ============ HUD Profile Endpoints ============

app.MapGet("/hud-profiles", async (Database db) =>
{
    try
    {
        var profiles = await db.GetHudProfilesAsync();
        return Results.Json(new { success = true, data = profiles });
    }
    catch (Exception e)
    {
        logger.LogError($"Get HUD profiles error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/hud-profiles", async (HttpContext context, Database db) =>
{
    try
    {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<HudProfileRequest>(body, jsonOptions);

        if (data == null || string.IsNullOrEmpty(data.Name) || data.Layout == null)
        {
            return Results.BadRequest(new { success = false, error = "Name and Layout are required" });
        }

        var id = string.IsNullOrEmpty(data.Id) ? Guid.NewGuid().ToString() : data.Id;

        await db.SaveHudProfileAsync(id, data.Name, data.Layout, data.IsActive);

        return Results.Json(new { success = true, id });
    }
    catch (Exception e)
    {
        logger.LogError($"Save HUD profile error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapDelete("/hud-profiles/{id}", async (string id, Database db) =>
{
    try
    {
        await db.DeleteHudProfileAsync(id);
        return Results.Json(new { success = true });
    }
    catch (Exception e)
    {
        logger.LogError($"Delete HUD profile error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

app.MapPost("/reset-default-stats", async (Database db) =>
{
    try
    {
        await db.ResetDefaultStatsAndProfilesAsync();
        return Results.Json(new { success = true, message = "Default stats and profiles reloaded" });
    }
    catch (Exception e)
    {
        logger.LogError($"Reset default stats error: {e.Message}");
        return Results.Problem(detail: e.Message, statusCode: 500);
    }
});

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
    public string? SortBy { get; set; }
}
public record SessionHistoryRequest(int Limit = 50, string? HeroName = null, string? DateFrom = null, string? DateTo = null, double? BuyIn = null);
public record ChartQueryOptions
{
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? HeroName { get; set; }
    public double? BuyIn { get; set; }
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
public record AnalyzeRangeRequest(string? Position, string? Action, int? Stack);
// AnalysisFilters record removed to use class from AnalysisModels.cs
// ... existing code ...

public class CustomStatRequest
{
    public string? Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public object? Definition { get; set; }
}

public class HudProfileRequest
{
    public string? Id { get; set; }
    public string Name { get; set; } = "";
    public object? Layout { get; set; }
    public bool IsActive { get; set; }
}

public class EvaluateBatchRequest
{
    public List<StatDefinition> Stats { get; set; } = new();
    public SpinTrackerBackend.AnalysisFilters? Filters { get; set; }
}
