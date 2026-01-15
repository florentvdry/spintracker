using System.Text.Json;
using SpinTrackerBackend;
using SpinTrackerBackend.Engines;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public static class DatabaseEndpoints
{
    private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    public static void Map(WebApplication app)
    {
        var logger = app.Logger;

        app.MapPost("/db/insert-hands", async (HttpContext context, HandRepository handRepo, AnalyticsRepository analyticsRepo, IAnalyticsCalculator analyticsCalc) =>
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
                var inserted = await handRepo.InsertHandsBatchAsync(data.Hands);

                // Calculate analytics in parallel
                var analyticsList = await Task.WhenAll(
                    data.Hands.Select(hand => Task.Run(() => analyticsCalc.CalculateHandAnalytics(hand)))
                );

                // Insert analytics
                if (analyticsList.Length > 0)
                {
                    await analyticsRepo.InsertAnalyticsBatchAsync(analyticsList);
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

        app.MapMethods("/db/hands", new[] { "GET", "POST" }, async (HttpContext context, ILogger<Program> logger) =>
        {
            try
            {
                logger.LogInformation($"GET /db/hands called with method: {context.Request.Method}");
                var handRepo = context.RequestServices.GetRequiredService<HandRepository>();
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

                var result = await handRepo.GetHandsAsync(options);
                return Results.Json(new { success = true, data = result });
            }
            catch (Exception e)
            {
                logger.LogError($"Get hands error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });


        app.MapGet("/db/tournament-hands", async (string gameId, string? heroName, HandRepository handRepo) =>
        {
            try
            {
                var result = await handRepo.GetTournamentHandsAsync(gameId, heroName);
                return Results.Json(new { success = true, data = result });
            }
            catch (Exception e)
            {
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapGet("/db/hand/{handId}", async (string handId, HandRepository handRepo) =>
        {
            try
            {
                var hand = await handRepo.GetHandByIdAsync(handId);

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

        app.MapGet("/db/dashboard-stats", async (HttpContext context) =>
        {
            try
            {
                var statsRepo = context.RequestServices.GetRequiredService<StatsRepository>();
                var heroName = context.Request.Query["heroName"].ToString();
                var dateFrom = context.Request.Query["dateFrom"].ToString();
                var dateTo = context.Request.Query["dateTo"].ToString();
                var buyInStr = context.Request.Query["buyIn"].ToString();
                double? buyIn = double.TryParse(buyInStr, out var b) ? b : null;

                var stats = await statsRepo.GetDashboardStatsAsync(
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

        app.MapMethods("/db/session-history", new[] { "GET", "POST" }, async (HttpContext context) =>
        {
            try
            {
                var statsRepo = context.RequestServices.GetRequiredService<StatsRepository>();
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

                var sessions = await statsRepo.GetSessionHistoryAsync(limit, heroName, dateFrom, dateTo, buyIn);
                return Results.Json(new { success = true, data = sessions });
            }
            catch (Exception e)
            {
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapGet("/db/buyins", async (StatsRepository statsRepo) =>
        {
            try
            {
                var buyIns = await statsRepo.GetUniqueBuyInsAsync();
                return Results.Json(new { success = true, data = buyIns });
            }
            catch (Exception e)
            {
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        // DEBUG endpoint: return raw dashboard sums and sample hands
        app.MapGet("/debug/dashboard-raw", async (StatsRepository statsRepo) =>
        {
            try
            {
                var data = await statsRepo.GetDashboardRawAsync(50);
                return Results.Json(new { success = true, data });
            }
            catch (Exception e)
            {
                logger.LogError($"Debug dashboard raw error: {e.Message}");
                return Results.Json(new { success = false, error = e.Message });
            }
        });

        app.MapMethods("/db/range-heatmap", new[] { "GET", "POST" }, async (HttpContext context, AnalyticsRepository analyticsRepo) =>
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

                var heatmap = await analyticsRepo.GetRangeHeatmapAsync(filters);
                return Results.Json(new { success = true, data = heatmap });
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

        app.MapPost("/recalculate-analytics", async (AnalyticsRepository analyticsRepo, IAnalyticsCalculator analyticsCalc) =>
        {
            try
            {
                // Delete existing analytics
                await analyticsRepo.DeleteAllAnalyticsAsync();

                // Get all raw hands
                var hands = await analyticsRepo.GetAllHandsForAnalysisAsync();

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
                    var inserted = await analyticsRepo.InsertAnalyticsBatchAsync(analyticsList);
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

        app.MapPost("/recalculate-analytics/stream", async (HttpContext context, AnalyticsRepository analyticsRepo, IAnalyticsCalculator analyticsCalc) =>
        {
            context.Response.ContentType = "text/event-stream";
            context.Response.Headers.Append("Cache-Control", "no-cache");
            context.Response.Headers.Append("Connection", "keep-alive");

            try
            {
                await analyticsRepo.DeleteAllAnalyticsAsync();
                var hands = await analyticsRepo.GetAllHandsForAnalysisAsync();
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
                    var inserted = await analyticsRepo.InsertAnalyticsBatchAsync(analyticsList.ToArray());
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

        app.MapPost("/reset-default-stats", async (StatsRepository statsRepo) =>
        {
            try
            {
                await statsRepo.ResetDefaultStatsAndProfilesAsync();
                return Results.Json(new { success = true, message = "Default stats and profiles reloaded" });
            }
            catch (Exception e)
            {
                logger.LogError($"Reset default stats error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });
    }
}