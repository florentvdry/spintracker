using Microsoft.Maui;
using Microsoft.Maui.Controls;
using Microsoft.Maui.Hosting;
using SpinTracker;
using SpinTracker.Services;
using SpinTracker.ViewModels;
using SpinTracker.Views;
using SpinTrackerBackend;
using SpinTrackerBackend.Data.Repositories;
using SpinTrackerBackend.Engines;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend.Services;
using Microsoft.Extensions.DependencyInjection;

public static class MauiProgram
{
    public static MauiApp CreateBuilder(string[] args)
    {
        SQLitePCL.Batteries_V2.Init();

        var builder = MauiApp.CreateBuilder();

        builder.Services.AddSingleton<DataService>();
        builder.Services.AddSingleton<NavigationService>();

        builder.Services.AddTransient<DashboardViewModel>();
        builder.Services.AddTransient<HandHistoryViewModel>();
        builder.Services.AddTransient<ChartsViewModel>();
        builder.Services.AddTransient<AnalysisViewModel>();
        builder.Services.AddTransient<SettingsViewModel>();
        builder.Services.AddTransient<PlayersViewModel>();
        builder.Services.AddTransient<RangeResearchViewModel>();

        builder.UseMauiApp<App>();

        var app = builder.Build();

        InitializeServices(app.Services, args);

        return app;
    }

    private static void InitializeServices(IServiceProvider services, string[] args)
    {
        string? dbPath = args.FirstOrDefault(a => a.StartsWith("--db-path="))?.Replace("--db-path=", "");

        if (string.IsNullOrEmpty(dbPath))
        {
            var appDir = Directory.GetCurrentDirectory();
            var projectRoot = Path.GetFullPath(Path.Combine(appDir, ".."));
            dbPath = Path.Combine(projectRoot, "poker_tracker.db");
        }

        App.SetDbPath(dbPath);
    }

    public static void Main(string[] args)
    {
        var app = CreateBuilder(args);
        App.Services = app.Services;
        app.Run(args);
    }
}