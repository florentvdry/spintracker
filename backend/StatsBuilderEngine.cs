using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using PokerTrackerBackend;

namespace PokerTrackerBackend.StatsBuilder
{
    public class StatsBuilderEngine
    {
        private readonly ILogger<StatsBuilderEngine> _logger;

        public StatsBuilderEngine(ILogger<StatsBuilderEngine> logger)
        {
            _logger = logger;
        }

        public StatEvaluationResult Evaluate(List<ParsedHand> hands, StatDefinition stat)
        {
            var result = new StatEvaluationResult();
            
            foreach (var hand in hands)
            {
                // 1. Check Denominator (Opportunity)
                if (EvaluateGroup(hand, stat.Denominator))
                {
                    result.Opportunities++;

                    // 2. Check Numerator (Success)
                    if (EvaluateGroup(hand, stat.Numerator))
                    {
                        result.Successes++;
                        result.MatchingHands.Add(new HandSummary 
                        { 
                            Id = hand.Id ?? "", 
                            HandId = hand.HandId ?? "", 
                            DateTime = hand.DateTime ?? "" 
                        });
                    }
                }
            }

            return result;
        }

        public Dictionary<string, StatEvaluationResult> EvaluateBatch(List<ParsedHand> hands, List<StatDefinition> stats, string? heroName = null)
        {
            var results = new Dictionary<string, StatEvaluationResult>();
            foreach (var stat in stats)
            {
                var key = !string.IsNullOrEmpty(stat.Id) ? stat.Id : stat.Name;
                if (!results.ContainsKey(key))
                {
                    results[key] = new StatEvaluationResult();
                }
            }

            foreach (var hand in hands)
            {
                // If heroName is provided, evaluate only for that player.
                // If NULL (Field Analysis), evaluate for EVERY player who has cards.
                var playersToEvaluate = !string.IsNullOrEmpty(heroName) 
                    ? new List<string> { heroName }
                    : hand.Players.Where(p => !string.IsNullOrEmpty(p.Cards)).Select(p => p.Name).ToList();

                foreach (var player in playersToEvaluate)
                {
                    // Create a virtual "perspective" for this player
                    var pInfo = hand.Players.FirstOrDefault(p => p.Name == player);
                    if (pInfo == null) continue;

                    // Temporary override of hand properties for this evaluation
                    var originalHeroName = hand.HeroName;
                    var originalHeroStack = hand.HeroStack;
                    var originalHeroPos = hand.HeroPosition;

                    hand.HeroName = player;
                    hand.HeroStack = (int)pInfo.Stack;
                    hand.HeroPosition = pInfo.Position;

                    foreach (var stat in stats)
                    {
                        var key = !string.IsNullOrEmpty(stat.Id) ? stat.Id : stat.Name;
                        
                        if (EvaluateGroup(hand, stat.Denominator))
                        {
                            results[key].Opportunities++;
                            if (EvaluateGroup(hand, stat.Numerator))
                            {
                                results[key].Successes++;
                            }
                        }
                    }

                    // Restore original values
                    hand.HeroName = originalHeroName;
                    hand.HeroStack = originalHeroStack;
                    hand.HeroPosition = originalHeroPos;
                }
            }

            return results;
        }

        private bool EvaluateGroup(ParsedHand hand, ConditionGroup group)
        {
            if (group.Conditions.Count == 0 && group.SubGroups.Count == 0) return true; // Empty group = true (or false? usually true for "all")

            bool isAnd = group.Operator == "AND";
            bool currentResult = isAnd; // Start with true for AND, false for OR? 
            // Actually:
            // AND: all must be true. Start true. If any false, return false.
            // OR: any must be true. Start false. If any true, return true.

            // Combine Conditions and SubGroups
            var results = new List<bool>();

            foreach (var condition in group.Conditions)
            {
                results.Add(EvaluateCondition(hand, condition));
            }

            foreach (var subGroup in group.SubGroups)
            {
                results.Add(EvaluateGroup(hand, subGroup));
            }

            if (results.Count == 0) return true;

            bool finalResult;
            if (isAnd)
            {
                finalResult = results.All(x => x);
            }
            else // OR
            {
                finalResult = results.Any(x => x);
            }

            return group.Not ? !finalResult : finalResult;
        }

        private bool EvaluateCondition(ParsedHand hand, StatCondition condition)
        {
            // 0. Check Parameters (Hand-level filters)
            if (condition.Parameters != null && condition.Parameters.Count > 0)
            {
                // Position
                if (condition.Parameters.TryGetValue("Position", out var posObj))
                {
                    var pos = posObj.ToString();
                    if (!string.IsNullOrEmpty(pos) && !string.Equals(hand.HeroPosition, pos, StringComparison.OrdinalIgnoreCase))
                    {
                        return false;
                    }
                }

                // Player Count
                if (condition.Parameters.TryGetValue("PlayerCount", out var pcObj))
                {
                    int pc = 0;
                    bool parsed = false;
                    if (pcObj is int i) { pc = i; parsed = true; }
                    else if (pcObj is double d) { pc = (int)d; parsed = true; }
                    else if (pcObj is long l) { pc = (int)l; parsed = true; }
                    else if (int.TryParse(pcObj.ToString(), out pc)) { parsed = true; }

                    if (parsed && hand.PlayerCount != pc) return false;
                }

                // Stack Depth (Hero)
                if (condition.Parameters.ContainsKey("MinStackBB") || condition.Parameters.ContainsKey("MaxStackBB"))
                {
                    double bb = ParseBigBlind(hand.Blinds);
                    if (bb > 0)
                    {
                        double stackBB = hand.HeroStack / bb;
                        
                        if (condition.Parameters.TryGetValue("MinStackBB", out var minObj))
                        {
                            double min = 0;
                            bool parsed = false;
                            if (minObj is double d) { min = d; parsed = true; }
                            else if (minObj is int i) { min = i; parsed = true; }
                            else if (minObj is long l) { min = l; parsed = true; }
                            else if (double.TryParse(minObj.ToString(), out min)) { parsed = true; }

                            if (parsed && stackBB < min) return false;
                        }
                        
                        if (condition.Parameters.TryGetValue("MaxStackBB", out var maxObj))
                        {
                            double max = 0;
                            bool parsed = false;
                            if (maxObj is double d) { max = d; parsed = true; }
                            else if (maxObj is int i) { max = i; parsed = true; }
                            else if (maxObj is long l) { max = l; parsed = true; }
                            else if (double.TryParse(maxObj.ToString(), out max)) { parsed = true; }

                            if (parsed && stackBB > max) return false;
                        }
                    }
                }
            }

            // 1. Identify Actor
            // IMPORTANT: hand.HeroName is set dynamically in EvaluateBatch 
            // to represent the current player being analyzed.
            string heroName = hand.HeroName;
            
            // 2. Get Action Text for Street
            string streetName = condition.Street ?? "Preflop";
            string actionText = GetActionTextForStreet(hand, streetName);
            if (string.IsNullOrEmpty(actionText)) return false;

            // 3. Parse Actions
            var actions = ParseActions(actionText);

            // 4. Check if Actor performed Action
            foreach (var act in actions)
            {
                bool actorMatch = false;
                
                if (condition.Actor == "Hero")
                {
                    actorMatch = IsHero(act.PlayerName, heroName);
                }
                else if (condition.Actor == "Villain")
                {
                    actorMatch = !IsHero(act.PlayerName, heroName);
                }
                else if (condition.Actor == "Any")
                {
                    actorMatch = true;
                }
                
                if (!actorMatch) continue;

                // Check Action Type
                if (MatchesActionType(act, condition.Action))
                {
                    return true;
                }
            }

            return false;
        }

        private double ParseBigBlind(string? blinds)
        {
            if (string.IsNullOrEmpty(blinds)) return 0;
            // "10/20" -> 20
            var parts = blinds.Split('/');
            if (parts.Length == 2 && double.TryParse(parts[1], out var bb))
            {
                return bb;
            }
            return 0;
        }

        private string GetActionTextForStreet(ParsedHand hand, string street)
        {
            return street.ToLower() switch
            {
                "preflop" => hand.PreflopAction,
                "flop" => hand.FlopAction,
                "turn" => hand.TurnAction,
                "river" => hand.RiverAction,
                _ => ""
            };
        }

        private bool IsHero(string playerName, string heroName)
        {
            if (string.IsNullOrEmpty(heroName)) return false; 
            return string.Equals(playerName, heroName, StringComparison.OrdinalIgnoreCase);
        }

        private bool MatchesActionType(ParsedAction action, string expected)
        {
            if (expected == "Any") return true;
            if (string.Equals(expected, "AllIn", StringComparison.OrdinalIgnoreCase) && action.IsAllIn) return true;

            if (string.Equals(expected, "VPIP", StringComparison.OrdinalIgnoreCase))
            {
                return action.ActionType == "Bet" || action.ActionType == "Raise" || action.ActionType == "Call" || (action.ActionType == "AllIn" && action.IsAllIn);
            }
            if (string.Equals(expected, "PFR", StringComparison.OrdinalIgnoreCase))
            {
                return action.ActionType == "Bet" || action.ActionType == "Raise" || (action.ActionType == "AllIn" && action.IsAllIn);
            }

            return string.Equals(action.ActionType, expected, StringComparison.OrdinalIgnoreCase);
        }

        private List<ParsedAction> ParseActions(string actionText)
        {
            var results = new List<ParsedAction>();
            if (string.IsNullOrEmpty(actionText)) return results;

            var lines = actionText.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            // Regex more robust for timestamps: matches any "HH:MM:SS - " or "HH:MM - " at start
            var timestampRegex = new Regex(@"^\d{1,2}:\d{2}(?::\d{2})?\s*-\s*");

            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                var cleanLine = timestampRegex.Replace(line.Trim(), "");

                var parts = cleanLine.Split(new[] { ':' }, 2);
                if (parts.Length != 2) continue;

                var player = parts[0].Trim();
                var content = parts[1].Trim().ToLower();

                string type = "unknown";
                
                double amount = 0;

                if (content.Contains("bets")) type = "Bet";
                else if (content.Contains("raises")) type = "Raise";
                else if (content.Contains("checks")) type = "Check";
                else if (content.Contains("calls")) type = "Call";
                else if (content.Contains("folds")) type = "Fold";
                else if (content.Contains("all-in")) type = "AllIn"; // Could be bet/raise/call
                else if (content.Contains("posts")) type = "Post";

                bool isAllIn = content.Contains("all-in");

                // Refine AllIn
                if (type == "AllIn")
                {
                    if (content.Contains("raises")) type = "Raise";
                    else if (content.Contains("calls")) type = "Call";
                    else if (content.Contains("bets")) type = "Bet";
                }

                results.Add(new ParsedAction
                {
                    PlayerName = player,
                    ActionType = type,
                    RawContent = content,
                    IsAllIn = isAllIn
                });
            }

            return results;
        }

        private class ParsedAction
        {
            public string PlayerName { get; set; } = "";
            public string ActionType { get; set; } = ""; // Bet, Check, Call, Raise, Fold
            public string RawContent { get; set; } = "";
            public bool IsAllIn { get; set; }
        }
    }
}
