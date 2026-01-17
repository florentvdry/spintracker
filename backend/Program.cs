using SpinTrackerBackend;
using FluentMigrator.Runner;

if (args.Length > 0 && args[0] == "--compare")
{
    await ComparisonTool.Run();
    return;
}

var builder = WebApplication.CreateBuilder(args);

// Extract db-path if provided
string? dbPath = args.FirstOrDefault(a => a.StartsWith("--db-path="))?.Replace("--db-path=", "");

// Ensure dbPath defaults to the same path used by Database when not provided
if (string.IsNullOrEmpty(dbPath))
{
    var backendDir = Directory.GetCurrentDirectory();
    var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
    dbPath = Path.Combine(projectRoot, "poker_tracker.db");
}

Startup.ConfigureServices(builder.Services, dbPath);

var app = builder.Build();

// Run migrations before creating the Database singleton
using (var scope = app.Services.CreateScope())
{
    var migrationRunner = scope.ServiceProvider.GetService<IMigrationRunner>();
    if (migrationRunner != null)
    {
        app.Logger.LogInformation("Running database migrations...");
        migrationRunner.MigrateUp();
        app.Logger.LogInformation("Database migrations complete.");
    }
}

// Test database initialization
try
{
    var db = app.Services.GetRequiredService<Database>();
    app.Logger.LogInformation("Database initialized successfully");
}
catch (Exception ex)
{
    app.Logger.LogError($"Failed to initialize Database: {ex.Message}\nStackTrace: {ex.StackTrace}");
    throw;
}

// Get port from command line args
var port = args.Length > 0 && int.TryParse(args[0], out var p) ? p : 5050;

app.Logger.LogInformation($"Starting C# backend on port {port}");
app.Logger.LogInformation("Available parsers: Betclic");

Startup.Configure(app);

app.Run($"http://127.0.0.1:{port}");