using Microsoft.Maui.Controls;
using SpinTracker.ViewModels;

namespace SpinTracker.Views;

public partial class DashboardView : ContentPage
{
    public DashboardView(DashboardViewModel viewModel)
    {
        BindingContext = viewModel;
        InitializeComponent();
        Loaded += async (s, e) => await viewModel.LoadCommand.ExecuteAsync(null);
    }
}