using FluentMigrator.Runner;
using SpinTrackerBackend.Configuration;
using SpinTrackerBackend.Data.Repositories;
using SpinTrackerBackend.Engines;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Migrations;
using SpinTrackerBackend.Services;

namespace SpinTrackerBackend.Extensions;

public static class ServiceCollectionExtensions
{
    private static string ResolveActualDbPath(string fallbackDbPath, DatabaseInfo? activeDb, ILogger logger)
    {
        if (activeDb == null || string.IsNullOrWhiteSpace(activeDb.FilePath))
        {
            return fallbackDbPath;
        }

        var candidate = activeDb.FilePath;
        var directory = Path.GetDirectoryName(candidate);

        if (string.IsNullOrWhiteSpace(directory))
        {
            logger.LogWarning("Active database path is invalid. Falling back to {FallbackDbPath}", fallbackDbPath);
            return fallbackDbPath;
        }

        if (File.Exists(candidate))
        {
            return candidate;
        }

        if (!Directory.Exists(directory))
        {
            logger.LogWarning("Active database path does not exist ({Candidate}). Falling back to {FallbackDbPath}", candidate, fallbackDbPath);
            return fallbackDbPath;
        }

        return candidate;
    }

    public static IServiceCollection AddSpinTrackerServices(this IServiceCollection services, string? providedDbPath)
    {
        var fallbackDbPath = AppPaths.ResolveDatabasePath(providedDbPath);

        services.AddSingleton<DatabaseRegistry>(sp =>
            new DatabaseRegistry(sp.GetRequiredService<ILogger<DatabaseRegistry>>(), fallbackDbPath));

        using var tmpProvider = services.BuildServiceProvider();
        var registry = tmpProvider.GetRequiredService<DatabaseRegistry>();
        var logger = tmpProvider.GetRequiredService<ILoggerFactory>().CreateLogger("SpinTrackerStartup");
        var activeDb = registry.GetActive();
        var actualDbPath = ResolveActualDbPath(fallbackDbPath, activeDb, logger);

        var actualDbDirectory = Path.GetDirectoryName(actualDbPath);
        if (!string.IsNullOrWhiteSpace(actualDbDirectory) && !Directory.Exists(actualDbDirectory))
        {
            Directory.CreateDirectory(actualDbDirectory);
        }

        var connectionString = $"Data Source={actualDbPath}";

        services
            .AddFluentMigratorCore()
            .ConfigureRunner(rb => rb
                .AddSQLite()
                .WithGlobalConnectionString(connectionString)
                .ScanIn(typeof(InitialCreate20260111).Assembly).For.Migrations())
            .AddLogging(lb => lb.AddFluentMigratorConsole());

        services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
            });
        });

        services.AddSingleton<Database>(sp =>
            new Database(
                sp.GetRequiredService<ILogger<Database>>(),
                actualDbPath,
                sp.GetRequiredService<StatsRepository>(),
                sp.GetRequiredService<PlayerRepository>()
            ));

        services.AddSingleton<IEquityCalculator, EquityCalculator>();
        services.AddSingleton<IAnalyticsCalculator, AnalyticsCalculator>();
        services.AddSingleton<IAnalysisService, AnalysisService>();
        services.AddSingleton<IImporterService>(sp =>
            new ImporterService(
                sp.GetRequiredService<Database>(),
                sp.GetRequiredService<IAnalyticsCalculator>(),
                sp.GetRequiredService<ILogger<ImporterService>>(),
                sp.GetRequiredService<PlayerRepository>()
            ));

        services.AddScoped(sp => new AnalyticsRepository(connectionString, sp.GetRequiredService<ILogger<AnalyticsRepository>>()));
        services.AddScoped(sp => new HandRepository(connectionString, sp.GetRequiredService<ILogger<HandRepository>>(), sp.GetRequiredService<PlayerRepository>()));
        services.AddScoped(sp => new StatsRepository(connectionString, sp.GetRequiredService<ILogger<StatsRepository>>()));
        services.AddScoped(sp => new PlayerRepository(connectionString, sp.GetRequiredService<ILogger<PlayerRepository>>()));
        services.AddScoped(sp => new TournamentsRepository(connectionString, sp.GetRequiredService<ILogger<TournamentsRepository>>()));

        services.AddControllers().AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
            options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        });

        return services;
    }

    public static void RunSpinTrackerMigrations(this IServiceProvider provider, ILogger logger)
    {
        using var scope = provider.CreateScope();
        var migrationRunner = scope.ServiceProvider.GetService<IMigrationRunner>();
        if (migrationRunner == null)
        {
            return;
        }

        logger.LogInformation("Running database migrations...");
        migrationRunner.MigrateUp();
        logger.LogInformation("Database migrations complete.");
    }
}
