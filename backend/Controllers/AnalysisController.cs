using System.Text.Json;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Controllers;

public static class AnalysisController
{
    public static void MapEndpoints(WebApplication app)
    {
        var logger = app.Logger;
        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        // ============ Analysis Endpoints ============
        app.MapPost("/analysis/stats", async (HttpContext context, IAnalysisService analysisService) =>
        {
            try
            {
                using var reader = new StreamReader(context.Request.Body);
                var body = await reader.ReadToEndAsync();
                var filters = JsonSerializer.Deserialize<AnalysisFilters>(body, jsonOptions);

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
                var filters = JsonSerializer.Deserialize<AnalysisFilters>(body, jsonOptions);

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