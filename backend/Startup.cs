using SpinTrackerBackend.Extensions;

namespace SpinTrackerBackend;

public static class Startup
{
    public static void ConfigureServices(IServiceCollection services, string? dbPath)
    {
        services.AddSpinTrackerServices(dbPath);
    }

    public static void Configure(WebApplication app)
    {
        app.UseSpinTrackerPipeline();
    }
}
