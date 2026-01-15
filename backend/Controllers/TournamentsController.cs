using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class TournamentsController : ControllerBase
{
    private readonly TournamentsRepository _tournamentsRepo;
    private readonly ILogger<TournamentsController> _logger;

    public TournamentsController(TournamentsRepository tournamentsRepo, ILogger<TournamentsController> logger)
    {
        _tournamentsRepo = tournamentsRepo;
        _logger = logger;
    }

    [HttpGet("db/tournaments")]
    [HttpPost("db/tournaments")]
    public async Task<IActionResult> GetTournaments([FromBody] HandsQueryOptions? postOptions)
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

            var result = await _tournamentsRepo.GetTournamentsAsync(options);
            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Get tournaments error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}