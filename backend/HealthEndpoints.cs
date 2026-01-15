using System.Text.Json;

namespace SpinTrackerBackend;

public static class HealthEndpoints
{
    public static void Map(WebApplication app)
    {
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
    }
}