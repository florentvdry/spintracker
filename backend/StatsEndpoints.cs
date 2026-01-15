using System.Text.Json;
using SpinTrackerBackend.StatsBuilder;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public static class StatsEndpoints
{
    private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    public static void Map(WebApplication app)
    {
        var logger = app.Logger;

        app.MapPost("/stats/builder/evaluate", async (HttpContext context, AnalyticsRepository analyticsRepo, IStatsBuilderEngine engine) =>
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
                var hands = await analyticsRepo.GetAllHandsForAnalysisAsync();

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

        app.MapGet("/stats", async (CustomStatsRepository customStatsRepo) =>
        {
            try
            {
                var stats = await customStatsRepo.GetCustomStatsAsync();
                return Results.Json(new { success = true, data = stats });
            }
            catch (Exception e)
            {
                logger.LogError($"Get stats error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapGet("/stats/{id}", async (string id, CustomStatsRepository customStatsRepo) =>
        {
            try
            {
                var stat = await customStatsRepo.GetCustomStatAsync(id);
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

        app.MapPost("/stats", async (HttpContext context, CustomStatsRepository customStatsRepo) =>
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

                await customStatsRepo.SaveCustomStatAsync(id, data.Name, data.Description ?? "", data.Definition);

                return Results.Json(new { success = true, id });
            }
            catch (Exception e)
            {
                logger.LogError($"Save stat error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapDelete("/stats/{id}", async (string id, CustomStatsRepository customStatsRepo) =>
        {
            try
            {
                await customStatsRepo.DeleteCustomStatAsync(id);
                return Results.Json(new { success = true });
            }
            catch (Exception e)
            {
                logger.LogError($"Delete stat error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapGet("/stats/export", async (CustomStatsRepository customStatsRepo) =>
        {
            try
            {
                var stats = await customStatsRepo.GetCustomStatsAsync();
                return Results.Json(new { success = true, data = stats });
            }
            catch (Exception e)
            {
                logger.LogError($"Export stats error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapPost("/stats/import", async (HttpContext context, CustomStatsRepository customStatsRepo) =>
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
                    await customStatsRepo.SaveCustomStatAsync(id, stat.Name, stat.Description ?? "", stat.Definition);
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

        app.MapPost("/stats/builder/evaluate-batch", async (HttpContext context, AnalyticsRepository analyticsRepo, IStatsBuilderEngine engine) =>
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
                var hands = await analyticsRepo.GetFilteredHandsForStatsAsync(request.Filters ?? new SpinTrackerBackend.AnalysisFilters());
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

        app.MapMethods("/db/winrate-chart", new[] { "GET", "POST" }, async (HttpContext context) =>
        {
            try
            {
                var statsRepo = context.RequestServices.GetRequiredService<StatsRepository>();
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

                var data = await statsRepo.GetWinrateChartDataAsync(options);
                return Results.Json(new { success = true, data });
            }
            catch (Exception e)
            {
                logger.LogError($"Winrate chart error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });
    }
}