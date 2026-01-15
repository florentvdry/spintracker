using System.Text.Json;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Controllers;

public static class EquityController
{
    public static void MapEndpoints(WebApplication app)
    {
        var logger = app.Logger;
        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        // ============ Equity Endpoints (DISABLED - using EquityEndpoints.cs instead) ============
        // app.MapPost("/equity", async (HttpContext context, IEquityCalculator equityCalc) =>
        /*
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
        */

        // app.MapPost("/equity/batch", async (HttpContext context, IEquityCalculator equityCalc) =>
        /*
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
        */
    }
}