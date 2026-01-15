using Microsoft.AspNetCore.Mvc;

namespace SpinTrackerBackend.Controllers;

[ApiController]
[Route("health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            success = true,
            status = "running",
            version = "2.0.0-csharp",
            features = new
            {
                database = true,
                parsers = new[] { "Betclic" },
                equity = true,
                analysis = true
            }
        });
    }
}