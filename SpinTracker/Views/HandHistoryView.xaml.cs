using Microsoft.Maui.Controls;
using SpinTracker.ViewModels;

namespace SpinTracker.Views;

public partial class HandHistoryView : ContentPage
{
    public HandHistoryView(HandHistoryViewModel viewModel)
    {
        BindingContext = viewModel;
        InitializeComponent();
        Loaded += async (s, e) => await viewModel.LoadCommand.ExecuteAsync(null);
    }
}