using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SpinTracker.Services;
using SpinTrackerBackend.Models;

namespace SpinTracker.ViewModels;

public partial class HandHistoryViewModel : ObservableObject
{
    private readonly DataService _dataService;

    [ObservableProperty]
    private HandsResult? _handsResult;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private int _currentPage = 1;

    [ObservableProperty]
    private string? _heroName;

    [ObservableProperty]
    private string? _dateFrom;

    [ObservableProperty]
    private string? _dateTo;

    [ObservableProperty]
    private string? _position;

    [ObservableProperty]
    private string? _result;

    [ObservableProperty]
    private HandDetails? _selectedHand;

    public HandHistoryViewModel(DataService dataService)
    {
        _dataService = dataService;
    }

    [RelayCommand]
    public async Task LoadAsync()
    {
        IsLoading = true;

        try
        {
            var options = new HandsQueryOptions
            {
                Page = CurrentPage,
                Limit = 50,
                HeroName = HeroName,
                DateFrom = DateFrom,
                DateTo = DateTo,
                Position = Position,
                Result = Result
            };
            HandsResult = await _dataService.GetHands(options);
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task SelectHandAsync(int handId)
    {
        SelectedHand = await _dataService.GetHandDetails(handId, HeroName);
    }

    [RelayCommand]
    public async Task NextPageAsync()
    {
        CurrentPage++;
        await LoadAsync();
    }

    [RelayCommand]
    public async Task PreviousPageAsync()
    {
        if (CurrentPage > 1)
        {
            CurrentPage--;
            await LoadAsync();
        }
    }
}