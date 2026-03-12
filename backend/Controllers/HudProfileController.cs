using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Controllers;

[ApiController]
[Route("hud-profiles")]
public class HudProfileController : ControllerBase
{
    private readonly HudProfileRepository _hudRepo;
    private readonly ILogger<HudProfileController> _logger;

    public HudProfileController(HudProfileRepository hudRepo, ILogger<HudProfileController> logger)
    {
        _hudRepo = hudRepo;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var profiles = await _hudRepo.GetHudProfilesAsync();
            return Ok(new { success = true, data = profiles });
        }
        catch (Exception e)
        {
            _logger.LogError($"Get HUD profiles error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost]
    public async Task<IActionResult> Save([FromBody] HudProfileRequest data)
    {
        try
        {
            if (data == null || string.IsNullOrEmpty(data.Name))
            {
                return BadRequest(new { success = false, error = "Name is required" });
            }

            var id = Guid.NewGuid().ToString();
            await _hudRepo.SaveHudProfileAsync(id, data.Name, data.Layout ?? new { }, data.IsActive);
            return Ok(new { success = true, id });
        }
        catch (Exception e)
        {
            _logger.LogError($"Save HUD profile error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        try
        {
            await _hudRepo.DeleteHudProfileAsync(id);
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            _logger.LogError($"Delete HUD profile error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}