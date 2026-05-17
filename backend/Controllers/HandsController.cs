using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class HandsController : ControllerBase
{
    private readonly HandRepository _handRepo;
    private readonly ILogger<HandsController> _logger;

    public HandsController(HandRepository handRepo, ILogger<HandsController> logger)
    {
        _handRepo = handRepo;
        _logger = logger;
    }

    [HttpGet("db/hands")]
    [HttpPost("db/hands")]
    public async Task<IActionResult> GetHands([FromBody] HandsQueryOptions? postOptions)
    {
        try
        {
            HandsQueryOptions options;
            if (Request.Method == "POST" && postOptions != null)
            {
                options = postOptions;
            }
            else
            {
                options = new HandsQueryOptions
                {
                    Page = int.TryParse(Request.Query["page"], out var p) ? p : 1,
                    Limit = int.TryParse(Request.Query["limit"], out var l) ? l : 50,
                    DateFrom = Request.Query["dateFrom"],
                    DateTo = Request.Query["dateTo"],
                    HeroName = Request.Query["heroName"],
                    Position = Request.Query["position"],
                    Result = Request.Query["result"],
                    GameType = Request.Query["gameType"],
                    SortBy = Request.Query["sortBy"]
                };
            }

            var result = await _handRepo.GetHandsAsync(options);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Get hands error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}
