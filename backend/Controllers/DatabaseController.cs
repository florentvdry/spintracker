using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Engines;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class DatabaseController : ControllerBase
{
    private readonly HandRepository _handRepo;
    private readonly AnalyticsRepository _analyticsRepo;
    private readonly StatsRepository _statsRepo;
    private readonly IAnalyticsCalculator _analyticsCalc;
    private readonly Database _db;
    private readonly ILogger<DatabaseController> _logger;

    public DatabaseController(
        HandRepository handRepo, 
        AnalyticsRepository analyticsRepo, 
        StatsRepository statsRepo,
        IAnalyticsCalculator analyticsCalc,
        Database db,
        ILogger<DatabaseController> logger)
    {
        _handRepo = handRepo;
        _analyticsRepo = analyticsRepo;
        _statsRepo = statsRepo;
        _analyticsCalc = analyticsCalc;
        _db = db;
        _logger = logger;
    }

    [HttpPost("db/insert-hands")]
    public async Task<IActionResult> InsertHands([FromBody] InsertHandsRequest data)
    {
        try
        {
            if (data == null || data.Hands == null || data.Hands.Count == 0)
            {
                return Ok(new { success = true, inserted = 0 });
            }

            var inserted = await _handRepo.InsertHandsBatchAsync(data.Hands);

            var analyticsList = await Task.WhenAll(
                data.Hands.Select(hand => Task.Run(() => _analyticsCalc.CalculateHandAnalytics(hand)))
            );

            if (analyticsList.Length > 0)
            {
                await _analyticsRepo.InsertAnalyticsBatchAsync(analyticsList);
            }

            return Ok(
            new
            {
                success = true,
                inserted,
                total = data.Hands.Count,
                analytics_calculated = analyticsList.Length
            });
        }
        catch (Exception e)
        {
            _logger.LogWarning($"Insert error: {e.Message}\nStackTrace: {e.StackTrace}");
            return Problem(detail: e.Message, statusCode: 500);
        }
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

    [HttpGet("db/tournament-hands")]
    public async Task<IActionResult> GetTournamentHands([FromQuery] string gameId, [FromQuery] string? heroName)
    {
        try
        {
            var result = await _handRepo.GetTournamentHandsAsync(gameId, heroName);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("db/hand/{handId}")]
    public async Task<IActionResult> GetHandById(string handId, [FromQuery] string? heroName)
    {
        try
        {
            var hand = await _handRepo.GetHandByIdAsync(handId, heroName);
            if (hand != null)
            {
                return Ok(new { success = true, data = hand });
            }
            else
            {
                return NotFound(new { success = false, error = "Hand not found" });
            }
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("db/dashboard-stats")]
    public async Task<IActionResult> GetDashboardStats(
        [FromQuery] string? heroName, 
        [FromQuery] string? dateFrom, 
        [FromQuery] string? dateTo, 
        [FromQuery] double? buyIn)
    {
        try
        {
            var stats = await _statsRepo.GetDashboardStatsAsync(
                string.IsNullOrEmpty(heroName) ? null : heroName,
                string.IsNullOrEmpty(dateFrom) ? null : dateFrom,
                string.IsNullOrEmpty(dateTo) ? null : dateTo,
                buyIn
            );
            return Ok(new { success = true, data = stats });
        }
        catch (Exception e)
        {
            _logger.LogError($"Dashboard stats error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("db/session-history")]
    [HttpPost("db/session-history")]
    public async Task<IActionResult> GetSessionHistory([FromBody] SessionHistoryRequest? postRequest)
    {
        try
        {
            int limit = 50;
            string? heroName = null;
            string? dateFrom = null;
            string? dateTo = null;
            double? buyIn = null;

            if (Request.Method == "POST" && postRequest != null)
            {
                limit = postRequest.Limit;
                heroName = postRequest.HeroName;
                dateFrom = postRequest.DateFrom;
                dateTo = postRequest.DateTo;
                buyIn = postRequest.BuyIn;
            }
            else
            {
                limit = int.TryParse(Request.Query["limit"], out var l) ? l : 50;
                heroName = Request.Query["heroName"];
                dateFrom = Request.Query["dateFrom"];
                dateTo = Request.Query["dateTo"];
                if (double.TryParse(Request.Query["buyIn"], out var b)) buyIn = b;
            }

            var sessions = await _statsRepo.GetSessionHistoryAsync(limit, heroName, dateFrom, dateTo, buyIn);
            return Ok(new { success = true, data = sessions });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("db/buyins")]
    public async Task<IActionResult> GetBuyIns()
    {
        try
        {
            var buyIns = await _statsRepo.GetUniqueBuyInsAsync();
            return Ok(new { success = true, data = buyIns });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("debug/dashboard-raw")]
    public async Task<IActionResult> GetDashboardRaw()
    {
        try
        {
            var data = await _statsRepo.GetDashboardRawAsync(50);
            return Ok(new { success = true, data });
        }
        catch (Exception e)
        {
            _logger.LogError($"Debug dashboard raw error: {e.Message}");
            return Ok(new { success = false, error = e.Message });
        }
    }

    [HttpGet("db/range-heatmap")]
    [HttpPost("db/range-heatmap")]
    public async Task<IActionResult> GetRangeHeatmap([FromBody] RangeHeatmapFilters? postFilters)
    {
        try
        {
            RangeHeatmapFilters filters;
            if (Request.Method == "POST" && postFilters != null)
            {
                filters = postFilters;
            }
            else
            {
                filters = new RangeHeatmapFilters();
            }

            var heatmap = await _analyticsRepo.GetRangeHeatmapAsync(filters);
            return Ok(new { success = true, data = heatmap });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("db/delete-all")]
    public async Task<IActionResult> DeleteAll()
    {
        try
        {
            var result = await _db.DeleteAllHandsAsync();
            return Ok(result);
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("db/delete-tournament")]
    public async Task<IActionResult> DeleteTournament([FromBody] DeleteTournamentRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.GameId))
            {
                return BadRequest(new { success = false, message = "GameId is required" });
            }

            var result = await _db.DeleteTournamentAsync(request.GameId);
            return Ok(result);
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("db/update-betclic-rake")]
    public async Task<IActionResult> UpdateBetclicRake()
    {
        try
        {
            var updated = await _handRepo.UpdateBetclicRakeAsync();
            return Ok(new { success = true, updated_count = updated });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("db/betclic-rake-pending")]
    public async Task<IActionResult> GetBetclicRakePendingCount()
    {
        try
        {
            var count = await _handRepo.GetBetclicRakePendingCountAsync();
            return Ok(new { success = true, count });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}

public class DeleteTournamentRequest
{
    public string GameId { get; set; } = string.Empty;
}
