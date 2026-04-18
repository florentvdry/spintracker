namespace SpinTracker.Services;

public class NavigationService
{
    private Page? _currentPage;
    
    public event Action<Page>? NavigationRequested;

    public void NavigateTo(Page page)
    {
        _currentPage = page;
        NavigationRequested?.Invoke(page);
    }

    public void GoBack()
    {
    }
}