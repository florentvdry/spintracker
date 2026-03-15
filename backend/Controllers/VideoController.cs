using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Services;

namespace SpinTrackerBackend.Controllers;

[ApiController]
[Route("video")]
public class VideoController : ControllerBase
{
    private readonly Services.VideoRendererService _videoRenderer;
    private readonly ILogger<VideoController> _logger;

    public VideoController(Services.VideoRendererService videoRenderer, ILogger<VideoController> logger)
    {
        _videoRenderer = videoRenderer;
        _logger = logger;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> GenerateVideo([FromBody] VideoRenderRequest request)
    {
        try
        {
            _logger.LogInformation("Received video generation request with {FrameCount} frames", request.Frames?.Count ?? 0);
            
            if (request.Frames == null || request.Frames.Count == 0)
            {
                return BadRequest(new { success = false, error = "No frames provided" });
            }

            var result = await _videoRenderer.RenderVideoAsync(request);

            if (!result.Success)
            {
                return BadRequest(new { success = false, error = result.Error });
            }

            // Return video as base64
            var base64 = Convert.ToBase64String(result.VideoData!);
            return Ok(new 
            { 
                success = true, 
                videoData = base64,
                contentType = "video/mp4"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Video generation failed");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    [HttpGet("health")]
    public IActionResult Health()
    {
        return Ok(new { status = "ok" });
    }
}
