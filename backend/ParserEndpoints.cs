using System.Text.Json;
using SpinTrackerBackend.Interfaces;

namespace SpinTrackerBackend;

public static class ParserEndpoints
{
    private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    public static void Map(WebApplication app)
    {
        var logger = app.Logger;

        app.MapPost("/import/file", async (HttpContext context, IImporterService importer) =>
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

        app.MapPost("/import/count-hands", async (HttpContext context, IImporterService importer) =>
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
    }
}