using SpinTracker;
using SpinTracker.Tools;
using SpinTracker.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using FluentMigrator.Runner;

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

string? dbPath = args.FirstOrDefault(a => a.StartsWith("--db-path="))?.Replace("--db-path=", "");

if (string.IsNullOrEmpty(dbPath))
{
    var baseDir = Directory.GetCurrentDirectory();
    var projectRoot = Path.GetFullPath(Path.Combine(baseDir, ".."));
    dbPath = Path.Combine(projectRoot, "poker_tracker.db");
}

builder.Services.AddRazorComponents()
    .AddInteractiveServerRenderMode();

var connectionString = $"Data Source={dbPath}";

builder.Services.AddFluentMigratorCore()
    .ConfigureRunner(rb => rb
        .AddSQLite()
        .WithGlobalConnectionString(connectionString)
        .ScanIn(typeof(InitialCreate20260111).Assembly).For.Migrations())
    .AddLogging(lb => lb.AddFluentMigratorConsole());

builder.Services.AddSingleton(sp => 
    new Database(
        sp.GetRequiredService<ILogger<Database>>(), 
        dbPath,
        sp.GetRequiredService<Repositories.StatsRepository>(),
        sp.GetRequiredService<Repositories.PlayerRepository>()
    ));

builder.Services.AddSingleton<IEquityCalculator, Engines.EquityCalculator>();
builder.Services.AddSingleton<IAnalyticsCalculator, Engines.AnalyticsCalculator>();
builder.Services.AddSingleton<IAnalysisService, AnalysisService>();
builder.Services.AddSingleton<IImporterService>(sp => 
    new ImporterService(
        sp.GetRequiredService<Database>(),
        sp.GetRequiredService<IAnalyticsCalculator>(),
        sp.GetRequiredService<ILogger<ImporterService>>(),
        sp.GetRequiredService<Repositories.PlayerRepository>()
    ));

builder.Services.AddScoped(sp => new Repositories.AnalyticsRepository(connectionString, sp.GetRequiredService<ILogger<Repositories.AnalyticsRepository>>()));
builder.Services.AddScoped(sp => new Repositories.HandRepository(connectionString, sp.GetRequiredService<ILogger<Repositories.HandRepository>>(), sp.GetRequiredService<Repositories.PlayerRepository>()));
builder.Services.AddScoped(sp => new Repositories.StatsRepository(connectionString, sp.GetRequiredService<ILogger<Repositories.StatsRepository>>()));
builder.Services.AddScoped(sp => new Repositories.PlayerRepository(connectionString, sp.GetRequiredService<ILogger<Repositories.PlayerRepository>>()));
builder.Services.AddScoped(sp => new Repositories.TournamentsRepository(connectionString, sp.GetRequiredService<ILogger<Repositories.TournamentsRepository>>()));

builder.Services.AddScoped<UI.Services.PageState>();

builder.Services.AddCors();

var app = builder.Build();

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

try
{
    var db = app.Services.GetRequiredService<Database>();
    app.Logger.LogInformation("Database initialized successfully");
}
catch (Exception ex)
{
    app.Logger.LogError($"Failed to initialize Database: {ex.Message}");
    throw;
}

app.UseCors();
app.UseAntiforgery();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

var port = args.Length > 0 && int.TryParse(args[0], out var p) ? p : 5050;

app.Logger.LogInformation($"Starting SpinTracker on port {port}");

app.Run($"http://127.0.0.1:{port}");