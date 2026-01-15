using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
public class PlayerController : ControllerBase
{
    private readonly PlayerRepository _playerRepo;
    private readonly ILogger<PlayerController> _logger;

    public PlayerController(PlayerRepository playerRepo, ILogger<PlayerController> logger)
    {
        _playerRepo = playerRepo;
        _logger = logger;
    }

    [HttpGet("db/players")]
    [HttpPost("db/players")]
    public async Task<IActionResult> GetPlayers([FromBody] PlayersQueryOptions? postOptions)
    {
        try
        {
            PlayersQueryOptions options;
            if (Request.Method == "POST" && postOptions != null)
            {
                options = postOptions;
            }
            else
            {
                var limit = int.TryParse(Request.Query["limit"], out var l) ? l : (int?)null;
                options = new PlayersQueryOptions { Limit = limit };
            }

            var playersData = await _playerRepo.GetPlayersOverviewAsync(options);
            return Ok(new { success = true, data = playersData });
        }
        catch (Exception e)
        {
            _logger.LogError($"Players overview error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}