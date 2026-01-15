using SpinTrackerBackend;

namespace SpinTrackerBackend.Interfaces;

public interface IAnalyticsCalculator
{
    HandAnalytics CalculateHandAnalytics(ParsedHand hand);
}