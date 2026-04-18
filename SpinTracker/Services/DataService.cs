using SpinTrackerBackend.Data.Repositories;
using SpinTrackerBackend.Models;

namespace SpinTracker.Services;

public class DataService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<DataService> _logger;

    public DataService(IServiceProvider sp, ILogger<DataService> logger)
    {
        _sp = sp;
        _logger = logger;
    }

    private StatsRepository CreateStatsRepo() => _sp.CreateScope().ServiceProvider.GetRequiredService<StatsRepository>();
    private HandRepository CreateHandRepo() => _sp.CreateScope().ServiceProvider.GetRequiredService<HandRepository>();
    private TournamentsRepository CreateTournamentsRepo() => _sp.CreateScope().ServiceProvider.GetRequiredService<TournamentsRepository>();
    private PlayerRepository CreatePlayerRepo() => _sp.CreateScope().ServiceProvider.GetRequiredService<PlayerRepository>();
    private AnalyticsRepository CreateAnalyticsRepo() => _sp.CreateScope().ServiceProvider.GetRequiredService<AnalyticsRepository>();

    public async Task<List<SessionInfo>> GetSessionHistory(int limit = 50, string? heroName = null, string? dateFrom = null, string? dateTo = null, double? buyIn = null)
    {
        var repo = CreateTournamentsRepo();
        return await repo.GetSessionHistoryAsync(limit, heroName, dateFrom, dateTo, buyIn);
    }

    public async Task<DashboardStats> GetDashboardStats(string? heroName, string? dateFrom, string? dateTo, double? buyIn)
    {
        var repo = CreateStatsRepo();
        return await repo.GetDashboardStatsAsync(heroName, dateFrom, dateTo, buyIn);
    }

    public async Task<List<WinrateDataPoint>> GetWinrateChartData(ChartQueryOptions options)
    {
        var repo = CreateStatsRepo();
        return await repo.GetWinrateChartDataAsync(options);
    }

    public async Task<HandsResult> GetHands(HandsQueryOptions options)
    {
        var repo = CreateHandRepo();
        return await repo.GetHandsAsync(options);
    }

    public async Task<HandDetails> GetHandDetails(int handId, string? heroName = null)
    {
        var repo = CreateHandRepo();
        return await repo.GetHandDetailsAsync(handId, heroName);
    }

    public async Task<List<PlayerInfo>> GetPlayers(PlayersQueryOptions options)
    {
        var repo = CreatePlayerRepo();
        return await repo.GetPlayersAsync(options);
    }

    public async Task UpdatePlayerRegStatus(int playerId, bool isReg)
    {
        var repo = CreatePlayerRepo();
        await repo.UpdateRegStatusAsync(playerId, isReg);
    }

    public async Task<HandReplay> GetHandReplay(int handId, string? heroName = null)
    {
        var repo = CreateHandRepo();
        return await repo.GetHandReplayAsync(handId, heroName);
    }

    public async Task<List<RangeHeatmapCell>> GetRangeHeatmap(RangeHeatmapFilters filters)
    {
        var repo = CreateAnalyticsRepo();
        return await repo.GetRangeHeatmapAsync(filters);
    }

    public async Task<AnalysisStats> GetAnalysisStats(StatsFilters filters)
    {
        var repo = CreateAnalyticsRepo();
        return await repo.GetAnalysisStatsAsync(filters);
    }

    public async Task<HandsResult> GetAnalysisHands(AnalysisHandsRequest request)
    {
        var repo = CreateAnalyticsRepo();
        return await repo.GetAnalysisHandsAsync(request);
    }

    public async Task<List<double>> GetBuyIns()
    {
        var repo = CreateTournamentsRepo();
        return await repo.GetBuyInsAsync();
    }

    public async Task<List<ParsedTournament>> GetTournaments(HandsQueryOptions options)
    {
        var repo = CreateTournamentsRepo();
        return await repo.GetTournamentsAsync(options);
    }
}