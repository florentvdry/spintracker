using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SpinTracker.Services;
using SpinTrackerBackend.Models;

namespace SpinTracker.ViewModels;

public partial class RangeResearchViewModel : ObservableObject
{
    private readonly DataService _dataService;

    [ObservableProperty]
    private List<RangeHeatmapCell> _heatmap = new();

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _heroName;

    [ObservableProperty]
    private string? _selectedPosition;

    [ObservableProperty]
    private string? _selectedAction;

    [ObservableProperty]
    private int _selectedStack = 100;

    public RangeResearchViewModel(DataService dataService)
    {
        _dataService = dataService;
    }

    [RelayCommand]
    public async Task LoadAsync()
    {
        IsLoading = true;

        try
        {
            var filters = new RangeHeatmapFilters
            {
                HeroName = HeroName
            };
            Heatmap = await _dataService.GetRangeHeatmap(filters);
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task SelectSituationAsync(string position, string action, int stack)
    {
        SelectedPosition = position;
        SelectedAction = action;
        SelectedStack = stack;
        
        var filters = new RangeHeatmapFilters
        {
            HeroName = HeroName
        };
        Heatmap = await _dataService.GetRangeHeatmap(filters);
    }
}