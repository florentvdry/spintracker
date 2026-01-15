using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Interfaces;

namespace SpinTrackerBackend.Controllers;

[ApiController]
[Route("equity")]
public class EquityController : ControllerBase
{
    private readonly IEquityCalculator _equityCalc;
    private readonly ILogger<EquityController> _logger;

    public EquityController(IEquityCalculator equityCalc, ILogger<EquityController> logger)
    {
        _equityCalc = equityCalc;
        _logger = logger;
    }

    [HttpPost]
    public IActionResult Calculate([FromBody] EquityRequest data)
    {
        try
        {
            if (data == null || string.IsNullOrEmpty(data.HeroCards) || string.IsNullOrEmpty(data.VillainCards))
            {
                return BadRequest(new
                {
                    success = false,
                    error = "heroCards and villainCards are required"
                });
            }

            var result = _equityCalc.Calculate(
                data.HeroCards,
                data.VillainCards,
                data.Board ?? "",
                data.Iterations ?? 10000
            );

            return Ok(new { success = true, data = result });
        }
        catch (Exception e)
        {
            _logger.LogError($"Equity calculation error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("batch")]
    public IActionResult CalculateBatch([FromBody] BatchEquityRequest data)
    {
        try
        {
            if (data == null || data.Hands == null)
            {
                return BadRequest(new { success = false, error = "Invalid request" });
            }

            var iterations = data.Iterations ?? 5000;
            var results = new List<object>();

            foreach (var hand in data.Hands)
            {
                var result = _equityCalc.Calculate(
                    hand.HeroCards ?? "",
                    hand.VillainCards ?? "",
                    hand.Board ?? "",
                    iterations
                );

                results.Add(new
                {
                    id = hand.Id,
                    result.HeroEquity,
                    result.VillainEquity,
                    result.TieEquity
                });
            }

            return Ok(new
            {
                success = true,
                data = results,
                processed = results.Count
            });
        }
        catch (Exception e)
        {
            _logger.LogError($"Batch equity calculation error: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}