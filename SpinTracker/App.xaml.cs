using Microsoft.Maui;
using Microsoft.Maui.Controls;
using SpinTracker.Services;
using SpinTracker.ViewModels;
using SpinTracker.Views;
using SpinTrackerBackend;
using SpinTrackerBackend.Data.Repositories;
using SpinTrackerBackend.Engines;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Services;
using Microsoft.Extensions.DependencyInjection;

namespace SpinTracker;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;
    
    private static string _dbPath = null!;

    protected override void CreateMauiApp(MauiProgram builder)
    {
        SQLitePCL.Batteries_V2.Init();

        var app = MauiProgram.CreateBuilder().Build();
        Services = app.Services;

        ConfigureServices(app.Services);
        
        InitializeDatabase(app.Services);

        return app;
    }

    private static void ConfigureServices(IServiceCollection services)
    {
        services.AddSingleton(sp => new DatabaseRegistry(sp.GetRequiredService<ILogger<DatabaseRegistry>>(), _dbPath));

        var registry = services.BuildServiceProvider().GetRequiredService<DatabaseRegistry>();
        var activeDb = registry.GetActive();
        var actualDbPath = _dbPath;

        if (activeDb != null)
        {
            actualDbPath = activeDb.FilePath;
        }
        else if (string.IsNullOrEmpty(_dbPath))
        {
            var appDir = Directory.GetCurrentDirectory();
            var projectRoot = Path.GetFullPath(Path.Combine(appDir, ".."));
            actualDbPath = Path.Combine(projectRoot, "poker_tracker.db");
        }

        var connectionString = $"Data Source={actualDbPath}";

        services.AddSingleton(sp => new Database(sp.GetRequiredService<ILogger<Database>>(), actualDbPath, sp.GetRequiredService<StatsRepository>(), sp.GetRequiredService<PlayerRepository>()));
        services.AddSingleton<IEquityCalculator, EquityCalculator>();
        services.AddSingleton<IAnalyticsCalculator, AnalyticsCalculator>();
        services.AddSingleton<IAnalysisService, AnalysisService>();
        services.AddSingleton<IImporterService>(sp => new ImporterService(sp.GetRequiredService<Database>(), sp.GetRequiredService<IAnalyticsCalculator>(), sp.GetRequiredService<ILogger<ImporterService>>(), sp.GetRequiredService<PlayerRepository>()));

        services.AddScoped(sp => new AnalyticsRepository(connectionString, sp.GetRequiredService<ILogger<AnalyticsRepository>>()));
        services.AddScoped(sp => new HandRepository(connectionString, sp.GetRequiredService<ILogger<HandRepository>>(), sp.GetRequiredService<PlayerRepository>()));
        services.AddScoped(sp => new StatsRepository(connectionString, sp.GetRequiredService<ILogger<StatsRepository>>()));
        services.AddScoped(sp => new PlayerRepository(connectionString, sp.GetRequiredService<ILogger<PlayerRepository>>()));
        services.AddScoped(sp => new TournamentsRepository(connectionString, sp.GetRequiredService<ILogger<TournamentsRepository>>()));

        services.AddSingleton<DataService>();
        services.AddSingleton<NavigationService>();

        services.AddTransient<DashboardViewModel>();
        services.AddTransient<HandHistoryViewModel>();
        services.AddTransient<ChartsViewModel>();
        services.AddTransient<AnalysisViewModel>();
        services.AddTransient<SettingsViewModel>();
        services.AddTransient<PlayersViewModel>();
        services.AddTransient<RangeResearchViewModel>();
    }

    private static void InitializeDatabase(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<Database>();
            System.Diagnostics.Debug.WriteLine("Database initialized successfully");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Database initialization error: {ex.Message}");
            throw;
        }
    }

    public static void SetDbPath(string path) => _dbPath = path;

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var window = new Window
        {
            Title = "SpinTracker",
            Page = new AppShell()
        };
        MainWindow = window;
        window.Width = 1280;
        window.Height = 800;
        window.MinimumWidth = 1024;
        window.MinimumHeight = 600;
    }
}