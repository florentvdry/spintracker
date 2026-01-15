using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public static class PlayerEndpoints
{
    public static void Map(WebApplication app)
    {
        var logger = app.Logger;

        app.MapMethods("/db/players", new[] { "GET", "POST" }, async (HttpContext context) =>
        {
            try
            {
                var playerRepo = context.RequestServices.GetRequiredService<PlayerRepository>();
                PlayersQueryOptions options;

                if (context.Request.Method == "POST")
                {
                    using var reader = new StreamReader(context.Request.Body);
                    var body = await reader.ReadToEndAsync();
                    options = JsonSerializer.Deserialize<PlayersQueryOptions>(body, JsonSerializerOptions.Default) ?? new PlayersQueryOptions();
                }
                else
                {
                    var limit = int.TryParse(context.Request.Query["limit"], out var l) ? l : (int?)null;
                    options = new PlayersQueryOptions { Limit = limit };
                }

                var playersData = await playerRepo.GetPlayersOverviewAsync(options);
                return Results.Json(new { success = true, data = playersData });
            }
            catch (Exception e)
            {
                logger.LogError($"Players overview error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });
    }
}