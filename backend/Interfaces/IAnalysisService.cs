using SpinTrackerBackend;

namespace SpinTrackerBackend.Interfaces;

public interface IAnalysisService
{
    Task<AnalysisStatsResult> GetAnalysisStatsAsync(AnalysisFilters filters);
    Task<AnalysisHandsResult> GetAnalysisHandsAsync(AnalysisHandsRequest request);
    Task<object> GetRangeAnalysisAsync(AnalysisFilters filters);
    RangeAnalysisResult AnalyzeRange(string? position, string? action, int stack);
    Task<HandReplayData?> GetHandReplayAsync(string handId, string? heroName);
}