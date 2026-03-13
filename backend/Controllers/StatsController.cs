using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class StatsController : ControllerBase
{
    private readonly StatsRepository _statsRepo;
    private readonly ILogger<StatsController> _logger;

    public StatsController(
        StatsRepository statsRepo,
        ILogger<StatsController> logger)
    {
        _statsRepo = statsRepo;
        _logger = logger;
    }

    [HttpGet("db/winrate-chart")]
    [HttpPost("db/winrate-chart")]
    public async Task<IActionResult> GetWinrateChart([FromBody] ChartQueryOptions? postOptions)
    {
        try
        {
            ChartQueryOptions options;
            if (Request.Method == "POST" && postOptions != null)
            {
                options = postOptions;
            }
            else
            {
                options = new ChartQueryOptions
                {
                    DateFrom = Request.Query["dateFrom"],
                    DateTo = Request.Query["dateTo"],
                    HeroName = Request.Query["heroName"],
                    BuyIn = double.TryParse(Request.Query["buyIn"], out var b) ? b : null
                };
            }

            var data = await _statsRepo.GetWinrateChartDataAsync(options);
            return Ok(new { success = true, data });
        }
        catch (Exception e)
        {
            _logger.LogError($"Winrate chart error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}
