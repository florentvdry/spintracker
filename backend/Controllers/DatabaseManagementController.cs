using Microsoft.AspNetCore.Mvc;
using SpinTrackerBackend.Services;

namespace SpinTrackerBackend.Controllers;

[ApiController]
[Route("api/databases")]
public class DatabaseManagementController : ControllerBase
{
    private readonly DatabaseRegistry _registry;
    private readonly ILogger<DatabaseManagementController> _logger;

    public DatabaseManagementController(
        DatabaseRegistry registry,
        ILogger<DatabaseManagementController> logger)
    {
        _registry = registry;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        try
        {
            var databases = _registry.GetAll();
            return Ok(new { success = true, data = databases });
        }
        catch (Exception e)
        {
            _logger.LogError($"Error getting databases: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpGet("active")]
    public IActionResult GetActive()
    {
        try
        {
            var active = _registry.GetActive();
            return Ok(new { success = true, data = active });
        }
        catch (Exception e)
        {
            _logger.LogError($"Error getting active database: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateDatabaseRequest request)
    {
        try
        {
            var name = request?.Name ?? "Nouvelle base de données";
            var db = _registry.Create(name);
            
            if (db == null)
            {
                return BadRequest(new { success = false, message = "Failed to create database" });
            }
            
            return Ok(new { success = true, data = db });
        }
        catch (Exception e)
        {
            _logger.LogError($"Error creating database: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPost("{id}/set-active")]
    public IActionResult SetActive(string id)
    {
        try
        {
            var success = _registry.SetActive(id);
            
            if (!success)
            {
                return BadRequest(new { success = false, message = "Database not found or cannot be set as active" });
            }
            
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            _logger.LogError($"Error setting active database: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        try
        {
            var success = _registry.Delete(id);
            
            if (!success)
            {
                return BadRequest(new { success = false, message = "Cannot delete database (may be the last one or is currently active)" });
            }
            
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            _logger.LogError($"Error deleting database: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }

    [HttpPut("{id}")]
    public IActionResult Rename(string id, [FromBody] RenameDatabaseRequest request)
    {
        try
        {
            var newName = request?.Name;
            if (string.IsNullOrWhiteSpace(newName))
            {
                return BadRequest(new { success = false, message = "Name is required" });
            }
            
            var success = _registry.Rename(id, newName);
            
            if (!success)
            {
                return BadRequest(new { success = false, message = "Database not found" });
            }
            
            return Ok(new { success = true });
        }
        catch (Exception e)
        {
            _logger.LogError($"Error renaming database: {e.Message}");
            return Problem(detail: e.Message, statusCode: 500);
        }
    }
}

public class CreateDatabaseRequest
{
    public string? Name { get; set; }
}

public class RenameDatabaseRequest
{
    public string? Name { get; set; }
}
