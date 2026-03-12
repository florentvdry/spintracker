using System.Net;
using System.Text;
using System.Text.Json;
using SpinTrackerBackend;
using SpinTrackerBackend.StatsBuilder;
using FluentMigrator.Runner;
using SpinTrackerBackend.Migrations;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Engines;
using SpinTrackerBackend.Services;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend;

public static class Startup
{
    public static void ConfigureServices(IServiceCollection services, string? dbPath)
    {
        services.AddSingleton<DatabaseRegistry>(sp => 
            new DatabaseRegistry(sp.GetRequiredService<ILogger<DatabaseRegistry>>(), dbPath));

        var registry = services.BuildServiceProvider().GetRequiredService<DatabaseRegistry>();
        var activeDb = registry.GetActive();
        var actualDbPath = dbPath;
        
        if (activeDb != null)
        {
            actualDbPath = activeDb.FilePath;
        }
        else if (string.IsNullOrEmpty(dbPath))
        {
            var backendDir = Directory.GetCurrentDirectory();
            var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
            actualDbPath = Path.Combine(projectRoot, "poker_tracker.db");
        }

        var _connectionStringForMigrations = $"Data Source={actualDbPath}";

        // Register FluentMigrator to run SQLite migrations
        services.AddFluentMigratorCore()
            .ConfigureRunner(rb => rb
                .AddSQLite()
                .WithGlobalConnectionString(_connectionStringForMigrations)
                .ScanIn(typeof(InitialCreate20260111).Assembly).For.Migrations())
            .AddLogging(lb => lb.AddFluentMigratorConsole());

        // Configure services
        services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                policy.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            });
        });

        services.AddSingleton<Database>(sp => 
            new Database(
                sp.GetRequiredService<ILogger<Database>>(), 
                actualDbPath,
                sp.GetRequiredService<CustomStatsRepository>(),
                sp.GetRequiredService<StatsRepository>(),
                sp.GetRequiredService<PlayerRepository>()
            ));
        services.AddSingleton<IEquityCalculator, EquityCalculator>();
        services.AddSingleton<IAnalyticsCalculator, AnalyticsCalculator>();
        services.AddSingleton<IAnalysisService, AnalysisService>();
        services.AddSingleton<IStatsBuilderEngine, StatsBuilderEngine>();
        services.AddSingleton<IImporterService>(sp => 
            new ImporterService(
                sp.GetRequiredService<Database>(),
                sp.GetRequiredService<IAnalyticsCalculator>(),
                sp.GetRequiredService<ILogger<ImporterService>>(),
                sp.GetRequiredService<PlayerRepository>()
            ));

        string connectionString = $"Data Source={actualDbPath}";

        // Repositories
        services.AddScoped(sp => new AnalyticsRepository(connectionString, sp.GetRequiredService<ILogger<AnalyticsRepository>>()));
        services.AddScoped(sp => new CustomStatsRepository(connectionString));
        services.AddScoped(sp => new HandRepository(connectionString, sp.GetRequiredService<ILogger<HandRepository>>(), sp.GetRequiredService<PlayerRepository>()));
        services.AddScoped(sp => new StatsRepository(connectionString, sp.GetRequiredService<ILogger<StatsRepository>>(), sp.GetRequiredService<CustomStatsRepository>()));
        services.AddScoped(sp => new PlayerRepository(connectionString, sp.GetRequiredService<ILogger<PlayerRepository>>()));
        services.AddScoped(sp => new TournamentsRepository(connectionString, sp.GetRequiredService<ILogger<TournamentsRepository>>()));

        services.AddControllers()
            .AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
                options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            });
    }

    public static void Configure(WebApplication app)
    {
        app.UseCors();

        // Global exception handler
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (Exception ex)
            {
                app.Logger.LogError($"Unhandled exception: {ex.Message}\nStackTrace: {ex.StackTrace}");
                context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                context.Response.ContentType = "application/json";
                var errorResponse = new { error = "Internal server error", message = ex.Message };
                await context.Response.WriteAsJsonAsync(errorResponse);
            }
        });

        // JSON options
        app.Use(async (context, next) =>
        {
            context.Response.ContentType = "application/json";
            await next(context);
        });

        // Add endpoints
        app.MapControllers();
    }
}