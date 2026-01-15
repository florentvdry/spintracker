using System.Collections.Generic;

namespace SpinTrackerBackend.StatsBuilder
{
    public class StatDefinition
    {
        public string? Id { get; set; }
        public string Name { get; set; } = "New Stat";
        public string Description { get; set; } = "";
        // Population removed as requested
        public ConditionGroup Denominator { get; set; } = new();
        public ConditionGroup Numerator { get; set; } = new();
    }

    public class ConditionGroup
    {
        public string Operator { get; set; } = "AND"; // AND, OR
        public bool Not { get; set; } = false; // Negates the result of the group
        public string StreetContext { get; set; } = ""; // UI Helper: "Flop", "Turn", etc.
        public List<StatCondition> Conditions { get; set; } = new();
        public List<ConditionGroup> SubGroups { get; set; } = new();
    }

    public class StatCondition
    {
        public string Street { get; set; } = "Any"; // Preflop, Flop, Turn, River
        public string Actor { get; set; } = "Hero"; // Hero, Villain, Player
        public string Action { get; set; } = "Any"; // Check, Call, Bet, Raise, Fold
        
        // Parameters like: MinSizeBB, Position, BoardTexture, etc.
        public Dictionary<string, object> Parameters { get; set; } = new();
    }

    public class StatEvaluationResult
    {
        public int Opportunities { get; set; }
        public int Successes { get; set; }
        public double Value => Opportunities > 0 ? (double)Successes / Opportunities * 100 : 0;
        public List<HandSummary> MatchingHands { get; set; } = new();
    }

    public class HandSummary
    {
        public string Id { get; set; } = "";
        public string HandId { get; set; } = "";
        public string DateTime { get; set; } = "";
        public double? ChipsWon { get; set; }
        public double? EvChips { get; set; }
        public string HeroName { get; set; } = "";
    }
}
