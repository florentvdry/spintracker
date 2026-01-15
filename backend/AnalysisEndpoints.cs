using System.Text.Json;
using SpinTrackerBackend.Services;
using SpinTrackerBackend.Interfaces;

namespace SpinTrackerBackend;

public static class AnalysisEndpoints
{
    private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    public static void Map(WebApplication app)
    {
        var logger = app.Logger;

        app.MapPost("/analysis/stats", async (HttpContext context, IAnalysisService analysisService) =>
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

        app.MapPost("/analysis/hands", async (HttpContext context, IAnalysisService analysisService) =>
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

        app.MapPost("/analysis/range-breakdown", async (HttpContext context, IAnalysisService analysisService) =>
        {
            try
            {
                using var reader = new StreamReader(context.Request.Body);
                var body = await reader.ReadToEndAsync();
                // Reuse AnalysisFilters but without strict action filtering?
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

        app.MapPost("/analyze/range", async (HttpContext context, IAnalysisService analysisService) =>
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
    }
}