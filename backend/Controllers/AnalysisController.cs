using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Interfaces;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class AnalysisController : ControllerBase
{
    private readonly IAnalysisService _analysisService;
    private readonly ILogger<AnalysisController> _logger;

    public AnalysisController(IAnalysisService analysisService, ILogger<AnalysisController> logger)
    {
        _analysisService = analysisService;
        _logger = logger;
    }

    [HttpPost("analysis/stats")]
    public async Task<IActionResult> GetAnalysisStats([FromBody] AnalysisFilters filters)
    {
        try
        {
            if (filters == null)
            {
                return BadRequest(new { success = false, error = "No filters provided" });
            }

            var result = await _analysisService.GetAnalysisStatsAsync(filters);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Analysis error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("analysis/hands")]
    public async Task<IActionResult> GetAnalysisHands([FromBody] AnalysisHandsRequest request)
    {
        try
        {
            if (request == null)
            {
                return BadRequest(new { success = false, error = "Invalid request" });
            }

            var result = await _analysisService.GetAnalysisHandsAsync(request);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Analysis hands error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("analysis/range-breakdown")]
    public async Task<IActionResult> GetRangeAnalysis([FromBody] AnalysisFilters filters)
    {
        try
        {
            if (filters == null)
            {
                return BadRequest(new { success = false, error = "Invalid request" });
            }

            var result = await _analysisService.GetRangeAnalysisAsync(filters);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Range breakdown error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("analyze/range")]
    public IActionResult AnalyzeRange([FromBody] AnalyzeRangeRequest data)
    {
        try
        {
            if (data == null)
            {
                return BadRequest(new { success = false, error = "Invalid request" });
            }

            var result = _analysisService.AnalyzeRange(data.Position, data.Action, data.Stack ?? 20);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Range analysis error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("analysis/replayer/{handId}")]
    public async Task<IActionResult> GetHandReplay(string handId, [FromQuery] string? heroName)
    {
        try
        {
            var result = await _analysisService.GetHandReplayAsync(handId, heroName);
            if (result == null) return NotFound(new { success = false, error = "Hand not found" });
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Replayer error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}