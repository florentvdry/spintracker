using SpinTrackerBackend;

namespace SpinTrackerBackend.Interfaces;

public interface IEquityCalculator
{
    EquityResult Calculate(string heroCards, string villainCards, string board, int iterations, string? deadCards = null);
}