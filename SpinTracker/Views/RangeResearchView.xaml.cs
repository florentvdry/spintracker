using Microsoft.Maui.Controls;
using SpinTracker.ViewModels;

namespace SpinTracker.Views;

public partial class RangeResearchView : ContentPage
{
    public RangeResearchView(RangeResearchViewModel viewModel)
    {
        BindingContext = viewModel;
        InitializeComponent();
        Loaded += async (s, e) => await viewModel.LoadCommand.ExecuteAsync(null);
    }
}