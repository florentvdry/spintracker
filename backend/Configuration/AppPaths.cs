namespace SpinTrackerBackend.Configuration;

public static class AppPaths
{
    public static string ResolveDatabasePath(string? providedDbPath)
    {
        if (!string.IsNullOrWhiteSpace(providedDbPath))
        {
            return providedDbPath;
        }

        var backendDir = Directory.GetCurrentDirectory();
        var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
        return Path.Combine(projectRoot, "poker_tracker.db");
    }
}
