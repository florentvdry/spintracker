using System.Collections.Generic;
using SpinTrackerBackend;
using SpinTrackerBackend.StatsBuilder;

namespace SpinTrackerBackend.Interfaces;

public interface IStatsBuilderEngine
{
    StatEvaluationResult Evaluate(List<ParsedHand> hands, StatDefinition stat);
    Dictionary<string, StatEvaluationResult> EvaluateBatch(List<ParsedHand> hands, List<StatDefinition> stats, string? heroName);
}