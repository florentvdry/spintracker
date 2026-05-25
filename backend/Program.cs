using SpinTrackerBackend;
using SpinTrackerBackend.Configuration;
using SpinTrackerBackend.Extensions;
using SpinTrackerBackend.Tools;

// Initialize SQLite
SQLitePCL.Batteries_V2.Init();

if (args.Length > 0 && args[0] == "--compare")
{
    await ComparisonTool.Run();
    return;
}

if (args.Length > 0 && args[0] == "--benchmark")
{
    await PokerEvaluatorBenchmark.Run();
    return;
}

var builder = WebApplication.CreateBuilder(args);

var dbPathArg = args.FirstOrDefault(a => a.StartsWith("--db-path="))?.Replace("--db-path=", "");
var dbPath = AppPaths.ResolveDatabasePath(dbPathArg);

builder.Services.AddSpinTrackerServices(dbPath);

var app = builder.Build();

app.Services.RunSpinTrackerMigrations(app.Logger);

try
{
    app.Services.GetRequiredService<Database>();
    app.Logger.LogInformation("Database initialized successfully");
}
catch (Exception ex)
{
    app.Logger.LogError("Failed to initialize Database: {Message}\nStackTrace: {StackTrace}", ex.Message, ex.StackTrace);
    throw;
}

var port = args.Length > 0 && int.TryParse(args[0], out var parsedPort) ? parsedPort : 5050;
app.Logger.LogInformation("Starting C# backend on port {Port}", port);
app.Logger.LogInformation("Available parsers: Betclic");

app.UseSpinTrackerPipeline();
app.Run($"http://127.0.0.1:{port}");
