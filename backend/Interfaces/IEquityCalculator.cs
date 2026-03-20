using SpinTrackerBackend;

namespace SpinTrackerBackend.Interfaces;

public interface IEquityCalculator
{
    EquityResult Calculate(string heroCards, string villainCards, string board, string? deadCards = null);
}