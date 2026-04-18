using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SpinTracker.Services;
using SpinTrackerBackend.Models;

namespace SpinTracker.ViewModels;

public partial class DashboardViewModel : ObservableObject
{
    private readonly DataService _dataService;

    [ObservableProperty]
    private DashboardStats? _stats;

    [ObservableProperty]
    private List<SessionInfo> _sessions = new();

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _heroName;

    [ObservableProperty]
    private string? _dateFrom;

    [ObservableProperty]
    private string? _dateTo;

    [ObservableProperty]
    private double? _buyIn;

    [ObservableProperty]
    private List<double> _availableBuyIns = new();

    public DashboardViewModel(DataService dataService)
    {
        _dataService = dataService;
    }

    [RelayCommand]
    public async Task LoadAsync()
    {
        IsLoading = true;

        try
        {
            var loadTasks = new List<Task>
            {
                LoadStatsAsync(),
                LoadSessionsAsync(),
                LoadBuyInsAsync()
            };
            await Task.WhenAll(loadTasks);
        }
        finally
        {
            IsLoading = false;
        }
    }

    private async Task LoadStatsAsync()
    {
        Stats = await _dataService.GetDashboardStats(HeroName, DateFrom, DateTo, BuyIn);
    }

    private async Task LoadSessionsAsync()
    {
        Sessions = await _dataService.GetSessionHistory(50, HeroName, DateFrom, DateTo, BuyIn);
    }

    private async Task LoadBuyInsAsync()
    {
        AvailableBuyIns = await _dataService.GetBuyIns();
    }

    [RelayCommand]
    public async Task ApplyFiltersAsync()
    {
        await LoadAsync();
    }

    [RelayCommand]
    public async Task ClearFiltersAsync()
    {
        HeroName = null;
        DateFrom = null;
        DateTo = null;
        BuyIn = null;
        await LoadAsync();
    }
}