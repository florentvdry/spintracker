using System.Text.Json;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public static class HudProfileEndpoints
{
    private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    public static void Map(WebApplication app)
    {
        var logger = app.Logger;

        app.MapGet("/hud-profiles", async (HudProfileRepository hudRepo) =>
        {
            try
            {
                var profiles = await hudRepo.GetHudProfilesAsync();
                return Results.Json(new { success = true, data = profiles });
            }
            catch (Exception e)
            {
                logger.LogError($"Get HUD profiles error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapPost("/hud-profiles", async (HttpContext context, HudProfileRepository hudRepo) =>
        {
            try
            {
                using var reader = new StreamReader(context.Request.Body);
                var body = await reader.ReadToEndAsync();
                var data = JsonSerializer.Deserialize<HudProfileRequest>(body, jsonOptions);

                if (data == null || string.IsNullOrEmpty(data.Name))
                {
                    return Results.BadRequest(new { success = false, error = "Name is required" });
                }

                var id = Guid.NewGuid().ToString();
                await hudRepo.SaveHudProfileAsync(id, data.Name, data.Layout, data.IsActive);
                return Results.Json(new { success = true, id });
            }
            catch (Exception e)
            {
                logger.LogError($"Save HUD profile error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });

        app.MapDelete("/hud-profiles/{id}", async (string id, HudProfileRepository hudRepo) =>
        {
            try
            {
                await hudRepo.DeleteHudProfileAsync(id);
                return Results.Json(new { success = true });
            }
            catch (Exception e)
            {
                logger.LogError($"Delete HUD profile error: {e.Message}");
                return Results.Problem(detail: e.Message, statusCode: 500);
            }
        });
    }
}