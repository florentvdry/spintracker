using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SpinTracker.Services;

namespace SpinTracker.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly DataService _dataService;

    [ObservableProperty]
    private string _heroName = "";

    [ObservableProperty]
    private bool _isDarkMode;

    [ObservableProperty]
    private string _language = "fr";

    [ObservableProperty]
    private bool _isSaving;

    public SettingsViewModel(DataService dataService)
    {
        _dataService = dataService;
    }

    [RelayCommand]
    public void Load()
    {
    }

    [RelayCommand]
    public async Task SaveAsync()
    {
        IsSaving = true;
        await Task.Delay(100);
        IsSaving = false;
    }
}