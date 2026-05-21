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

    [HttpPost("db/players/{playerId}/reg-status")]
    public async Task<IActionResult> UpdatePlayerRegStatus(int playerId, [FromBody] UpdateRegStatusRequest request)
    {
        try
        {
            var result = await _playerRepo.UpdatePlayerRegStatusAsync(playerId, request.IsReg);
            if (result)
            {
                return Ok(new { success = true });
            }
            return NotFound(new { success = false, error = "Player not found" });
        }
        catch (Exception e)
        {
            _logger.LogError($"Update reg status error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("db/opponents")]
    public async Task<IActionResult> GetOpponents([FromQuery] string? heroName, [FromQuery] int? limit)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(heroName))
            {
                return Ok(new { success = true, data = Array.Empty<object>() });
            }

            var playersData = await _playerRepo.GetOpponentsForHeroAsync(heroName, limit);
            return Ok(new { success = true, data = playersData });
        }
        catch (Exception e)
        {
            _logger.LogError($"Opponents overview error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("db/players/sync")]
    public async Task<IActionResult> SyncPlayers()
    {
        try
        {
            await _playerRepo.UpdatePlayerStatsAsync();
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            _logger.LogError($"Sync players error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("db/aliases")]
    public async Task<IActionResult> GetAliases()
    {
        try
        {
            var data = await _playerRepo.GetAliasesAsync();
            return Ok(new { success = true, data });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("db/aliases")]
    public async Task<IActionResult> CreateAlias([FromBody] CreateAliasRequest request)
    {
        try
        {
            var id = await _playerRepo.CreateAliasAsync(request.Name);
            return Ok(new { success = true, id });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpDelete("db/aliases/{id}")]
    public async Task<IActionResult> DeleteAlias(int id)
    {
        try
        {
            await _playerRepo.DeleteAliasAsync(id);
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("db/players/{playerId}/link")]
    public async Task<IActionResult> LinkPlayer(int playerId, [FromBody] LinkPlayerRequest request)
    {
        try
        {
            await _playerRepo.LinkPlayerToAliasAsync(playerId, request.AliasId);
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("db/players/{playerId}/unlink")]
    public async Task<IActionResult> UnlinkPlayer(int playerId)
    {
        try
        {
            await _playerRepo.UnlinkPlayerFromAliasAsync(playerId);
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}

public class UpdateRegStatusRequest
{
    public bool IsReg { get; set; }
}
