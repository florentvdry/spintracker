using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.StatsBuilder;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class StatsController : ControllerBase
{
    private readonly AnalyticsRepository _analyticsRepo;
    private readonly StatsRepository _statsRepo;
    private readonly IStatsBuilderEngine _engine;
    private readonly ILogger<StatsController> _logger;

    public StatsController(
        AnalyticsRepository analyticsRepo,
        StatsRepository statsRepo,
        IStatsBuilderEngine engine,
        ILogger<StatsController> logger)
    {
        _analyticsRepo = analyticsRepo;
        _statsRepo = statsRepo;
        _engine = engine;
        _logger = logger;
    }

    [HttpPost("stats/builder/evaluate")]
    public async Task<IActionResult> Evaluate([FromBody] StatDefinition stat)
    {
        try
        {
            if (stat == null)
            {
                return BadRequest(new { success = false, error = "Invalid definition" });
            }

            var hands = await _analyticsRepo.GetAllHandsForAnalysisAsync();
            var result = _engine.Evaluate(hands, stat);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Stats Builder error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("stats/builder/evaluate-batch")]
    public async Task<IActionResult> EvaluateBatch([FromBody] EvaluateBatchRequest request)
    {
        try
        {
            if (request == null || request.Stats == null || request.Stats.Count == 0)
            {
                return BadRequest(new { success = false, error = "Invalid request" });
            }

            _logger.LogInformation($"EvaluateBatch: Received {request.Stats.Count} stats to evaluate");

            var hands = await _analyticsRepo.GetFilteredHandsForStatsAsync(request.Filters ?? new SpinTrackerBackend.AnalysisFilters());
            
            if (hands.Count == 0)
            {
                var emptyResults = new Dictionary<string, StatEvaluationResult>();
                foreach (var stat in request.Stats)
                {
                    var key = !string.IsNullOrEmpty(stat.Id) ? stat.Id : stat.Name;
                    emptyResults[key] = new StatEvaluationResult { Opportunities = 0, Successes = 0 };
                }
                return Ok(new { success = true, data = emptyResults });
            }

            var result = _engine.EvaluateBatch(hands, request.Stats, request.Filters?.HeroName);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Batch Eval error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
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
