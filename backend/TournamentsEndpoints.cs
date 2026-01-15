using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public static class TournamentsEndpoints
{
    public static void Map(WebApplication app)
    {
        var logger = app.Logger;

        app.MapMethods("/db/tournaments", new[] { "GET", "POST" }, async (HttpContext context) =>
        {
            try
            {
                var tournamentsRepo = context.RequestServices.GetRequiredService<TournamentsRepository>();
                HandsQueryOptions options;

                if (context.Request.Method == "POST")
                {
                    using var reader = new StreamReader(context.Request.Body);
                    var body = await reader.ReadToEndAsync();
                    options = JsonSerializer.Deserialize<HandsQueryOptions>(body, JsonSerializerOptions.Default) ?? new HandsQueryOptions();
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

                var result = await tournamentsRepo.GetTournamentsAsync(options);
                return Results.Json(new { success = true, data = result });
            }
            catch (Exception e)
            {
                logger.LogError($"Get tournaments error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });
    }
}