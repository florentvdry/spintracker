using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SpinTracker.Services;
using SpinTrackerBackend.Models;

namespace SpinTracker.ViewModels;

public partial class ChartsViewModel : ObservableObject
{
    private readonly DataService _dataService;

    [ObservableProperty]
    private List<WinrateDataPoint> _winrateData = new();

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
    private string? _position;

    public ChartsViewModel(DataService dataService)
    {
        _dataService = dataService;
    }

    [RelayCommand]
    public async Task LoadAsync()
    {
        IsLoading = true;

        try
        {
            var options = new ChartQueryOptions
            {
                HeroName = HeroName,
                DateFrom = DateFrom,
                DateTo = DateTo,
                BuyIn = BuyIn,
                Position = Position
            };
            WinrateData = await _dataService.GetWinrateChartData(options);
        }
        finally
        {
            IsLoading = false;
        }
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
        Position = null;
        await LoadAsync();
    }
}