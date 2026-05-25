using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Interfaces;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class ParserController : ControllerBase
{
    private readonly IImporterService _importer;
    private readonly ILogger<ParserController> _logger;

    public ParserController(IImporterService importer, ILogger<ParserController> logger)
    {
        _importer = importer;
        _logger = logger;
    }

    [HttpPost("import/file")]
    public async Task ImportFile([FromBody] ImportFileRequest data)
    {
        try
        {
            if (data == null || string.IsNullOrEmpty(data.FilePath))
            {
                Response.StatusCode = 400;
                var errorPayload = JsonSerializer.Serialize(new { success = false, error = "No file path provided" });
                await Response.WriteAsync(errorPayload);
                return;
            }

            Response.ContentType = "text/event-stream";
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");

            await _importer.ImportFileAsync(data.FilePath, async (progress) =>
            {
                try
                {
                    var payload = JsonSerializer.Serialize(progress);
                    await Response.WriteAsync($"data: {payload}\n\n");
                    await Response.Body.FlushAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Failed to write progress to stream: {ex.Message}");
                }
            }, HttpContext.RequestAborted);
            
            // Send final completion marker if not already success
            // await Response.WriteAsync("data: {\"Success\": true, \"Percent\": 100}\n\n");
            // await Response.Body.FlushAsync();
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Import cancelled by client.");
        }
        catch (Exception e)
        {
            _logger.LogError($"Import error: {e.Message}");
            try 
            {
                var errorPayload = JsonSerializer.Serialize(new { success = false, error = e.Message });
                await Response.WriteAsync($"data: {errorPayload}\n\n");
                await Response.Body.FlushAsync();
            } catch {}
        }
    }

    [HttpPost("import/count-hands")]
    public async Task<IActionResult> CountHands([FromBody] ImportFileRequest data)
    {
        try
        {
            if (data == null || string.IsNullOrEmpty(data.FilePath))
            {
                return Ok(new { success = false, error = "No file path provided" });
            }

            var count = await _importer.CountHandsInFileAsync(data.FilePath, HttpContext.RequestAborted);
            return Ok(new { success = true, count });
        }
        catch (Exception e)
        {
            _logger.LogError($"Count hands error: {e.Message}");
            return Ok(new { success = false, error = e.Message });
        }
    }

    [HttpPost("parse/file")]
    public IActionResult ParseFile([FromBody] ParseFileRequest data)
    {
        try
        {
            if (data == null || string.IsNullOrEmpty(data.Content))
            {
                return BadRequest(new { success = false, error = "No content provided" });
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
                return BadRequest(new { success = false, error = "Could not detect hand history format" });
            }

            var result = parser.ParseFile(data.Content);

            return Ok(new
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
            _logger.LogError($"Parse error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("parse/detect")]
    public IActionResult DetectParser([FromBody] ParseDetectRequest data)
    {
        try
        {
            if (data == null || string.IsNullOrEmpty(data.Content))
            {
                return BadRequest(new { success = false, error = "No content provided" });
            }

            var parser = ParserFactory.GetParser(data.Content);

            if (parser != null)
            {
                return Ok(new
                {
                    success = true,
                    room = parser.RoomName,
                    version = parser.ParserVersion
                });
            }
            else
            {
                return Ok(new { success = false, error = "Unknown format" });
            }
        }
        catch (Exception e)
        {
            return Ok(new { success = false, message = e.Message, error = e.Message });
        }
    }
}
