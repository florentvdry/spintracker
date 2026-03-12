using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.StatsBuilder;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class StatsController : ControllerBase
{
    private readonly AnalyticsRepository _analyticsRepo;
    private readonly CustomStatsRepository _customStatsRepo;
    private readonly StatsRepository _statsRepo;
    private readonly IStatsBuilderEngine _engine;
    private readonly ILogger<StatsController> _logger;

    public StatsController(
        AnalyticsRepository analyticsRepo,
        CustomStatsRepository customStatsRepo,
        StatsRepository statsRepo,
        IStatsBuilderEngine engine,
        ILogger<StatsController> logger)
    {
        _analyticsRepo = analyticsRepo;
        _customStatsRepo = customStatsRepo;
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

    [HttpGet("stats")]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var stats = await _customStatsRepo.GetCustomStatsAsync();
            return Ok(new { success = true, data = stats });
        }
        catch (Exception e)
        {
            _logger.LogError($"Get stats error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("stats/{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        try
        {
            var stat = await _customStatsRepo.GetCustomStatAsync(id);
            if (stat != null)
            {
                return Ok(new { success = true, data = stat });
            }
            return NotFound(new { success = false, error = "Stat not found" });
        }
        catch (Exception e)
        {
            _logger.LogError($"Get stat error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("stats")]
    public async Task<IActionResult> Save([FromBody] CustomStatRequest data)
    {
        try
        {
            if (data == null || string.IsNullOrEmpty(data.Name) || data.Definition == null)
            {
                return BadRequest(new { success = false, error = "Name and Definition are required" });
            }

            var id = string.IsNullOrEmpty(data.Id) ? Guid.NewGuid().ToString() : data.Id;
            await _customStatsRepo.SaveCustomStatAsync(id, data.Name, data.Description ?? "", data.Definition ?? new { });
            return Ok(new { success = true, id });
        }
        catch (Exception e)
        {
            _logger.LogError($"Save stat error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpDelete("stats/{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        try
        {
            await _customStatsRepo.DeleteCustomStatAsync(id);
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            _logger.LogError($"Delete stat error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("stats/export")]
    public async Task<IActionResult> Export()
    {
        try
        {
            var stats = await _customStatsRepo.GetCustomStatsAsync();
            return Ok(new { success = true, data = stats });
        }
        catch (Exception e)
        {
            _logger.LogError($"Export stats error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("stats/import")]
    public async Task<IActionResult> Import([FromBody] List<CustomStatRequest> stats)
    {
        try
        {
            if (stats == null) return BadRequest(new { success = false, error = "Invalid JSON" });

            int count = 0;
            foreach (var stat in stats)
            {
                var id = string.IsNullOrEmpty(stat.Id) ? Guid.NewGuid().ToString() : stat.Id;
                await _customStatsRepo.SaveCustomStatAsync(id, stat.Name, stat.Description ?? "", stat.Definition ?? new { });
                count++;
            }

            return Ok(new { success = true, count });
        }
        catch (Exception e)
        {
            _logger.LogError($"Import stats error: {e.Message}");
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