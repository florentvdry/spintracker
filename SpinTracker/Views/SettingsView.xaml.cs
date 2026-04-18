using Microsoft.Maui.Controls;
using SpinTracker.ViewModels;

namespace SpinTracker.Views;

public partial class SettingsView : ContentPage
{
    public SettingsView(SettingsViewModel viewModel)
    {
        BindingContext = viewModel;
        InitializeComponent();
        viewModel.LoadCommand.Execute(null);
    }
}