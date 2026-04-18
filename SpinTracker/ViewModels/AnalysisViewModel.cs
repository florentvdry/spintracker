using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SpinTracker.Services;
using SpinTrackerBackend.Models;

namespace SpinTracker.ViewModels;

public partial class AnalysisViewModel : ObservableObject
{
    private readonly DataService _dataService;

    [ObservableProperty]
    private AnalysisStats? _stats;

    [ObservableProperty]
    private HandsResult? _handsResult;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _heroName;

    [ObservableProperty]
    private string? _dateFrom;

    [ObservableProperty]
    private string? _dateTo;

    [ObservableProperty]
    private string? _position;

    [ObservableProperty]
    private int _currentPage = 1;

    [ObservableProperty]
    private string? _selectedSituation;

    public AnalysisViewModel(DataService dataService)
    {
        _dataService = dataService;
    }

    [RelayCommand]
    public async Task LoadAsync()
    {
        IsLoading = true;

        try
        {
            await Task.WhenAll(LoadStatsAsync(), LoadHandsAsync());
        }
        finally
        {
            IsLoading = false;
        }
    }

    private async Task LoadStatsAsync()
    {
        var filters = new StatsFilters
        {
            HeroName = HeroName,
            DateFrom = DateFrom,
            DateTo = DateTo
        };
        Stats = await _dataService.GetAnalysisStats(filters);
    }

    private async Task LoadHandsAsync()
    {
        var request = new AnalysisHandsRequest
        {
            Page = CurrentPage,
            Limit = 50,
            HeroName = HeroName,
            DateFrom = DateFrom,
            DateTo = DateTo,
            Position = Position,
            Situation = SelectedSituation
        };
        HandsResult = await _dataService.GetAnalysisHands(request);
    }

    [RelayCommand]
    public async Task ApplyFiltersAsync()
    {
        await LoadAsync();
    }

    [RelayCommand]
    public async Task SelectSituationAsync(string? situation)
    {
        SelectedSituation = situation;
        await LoadHandsAsync();
    }
}