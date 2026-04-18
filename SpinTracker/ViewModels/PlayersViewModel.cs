using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SpinTracker.Services;
using SpinTrackerBackend.Models;

namespace SpinTracker.ViewModels;

public partial class PlayersViewModel : ObservableObject
{
    private readonly DataService _dataService;

    [ObservableProperty]
    private List<PlayerInfo> _players = new();

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private PlayerInfo? _selectedPlayer;

    [ObservableProperty]
    private int _limit = 50;

    [ObservableProperty]
    private int? _minHands;

    [ObservableProperty]
    private string? _isRegFilter;

    public PlayersViewModel(DataService dataService)
    {
        _dataService = dataService;
    }

    [RelayCommand]
    public async Task LoadAsync()
    {
        IsLoading = true;

        try
        {
            var options = new PlayersQueryOptions
            {
                Limit = Limit,
                MinHands = MinHands,
                IsRegFilter = IsRegFilter
            };
            Players = await _dataService.GetPlayers(options);
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task ToggleRegStatusAsync(int playerId)
    {
        var player = Players.FirstOrDefault(p => p.Id == playerId);
        if (player != null)
        {
            await _dataService.UpdatePlayerRegStatus(playerId, !player.IsReg);
            await LoadAsync();
        }
    }
}