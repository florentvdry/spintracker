using System.Threading;
using SpinTrackerBackend;

namespace SpinTrackerBackend.Interfaces;

public interface IImporterService
{
    Task<int> CountHandsInFileAsync(string filePath, CancellationToken cancellationToken);
    Task ImportFileAsync(string filePath, Func<ImportProgress, Task> progressCallback, CancellationToken cancellationToken);
}