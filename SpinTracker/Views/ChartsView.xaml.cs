using Microsoft.Maui.Controls;
using SpinTracker.ViewModels;

namespace SpinTracker.Views;

public partial class ChartsView : ContentPage
{
    public ChartsView(ChartsViewModel viewModel)
    {
        BindingContext = viewModel;
        InitializeComponent();
        Loaded += async (s, e) => await viewModel.LoadCommand.ExecuteAsync(null);
    }
}