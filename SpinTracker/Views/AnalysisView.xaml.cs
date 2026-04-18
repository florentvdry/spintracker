using Microsoft.Maui.Controls;
using SpinTracker.ViewModels;

namespace SpinTracker.Views;

public partial class AnalysisView : ContentPage
{
    public AnalysisView(AnalysisViewModel viewModel)
    {
        BindingContext = viewModel;
        InitializeComponent();
        Loaded += async (s, e) => await viewModel.LoadCommand.ExecuteAsync(null);
    }
}