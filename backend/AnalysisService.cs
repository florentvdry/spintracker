using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace PokerTrackerBackend
{
    public class AnalysisService
    {
        private readonly Database _db;
        private readonly ILogger<AnalysisService> _logger;

        public AnalysisService(Database db, ILogger<AnalysisService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<AnalysisHandsResult> GetAnalysisHandsAsync(AnalysisHandsRequest request)
        {
            // Removed HeroName check to allow Field analysis

            // 1. Get raw hands from DB (filtered by Date, Hero, Position)
            var hands = await _db.GetHandsForAnalysisAsync(request);
            _logger.LogInformation($"GetAnalysisHandsAsync: Got {hands.Count} hands from DB");

            // 2. Apply in-memory filters (Situation, Action, Stack)
            var filteredHands = FilterHands(hands, request);
            _logger.LogInformation($"GetAnalysisHandsAsync: After filter {filteredHands.Count} hands");

            // 3. Sort
            switch (request.SortBy?.ToLower())
            {
                case "date_asc":
                    filteredHands = filteredHands.OrderBy(h => h.Date).ToList();
                    break;
                case "profit_desc":
                    filteredHands = filteredHands.OrderByDescending(h => h.Profit).ToList();
                    break;
                case "profit_asc":
                    filteredHands = filteredHands.OrderBy(h => h.Profit).ToList();
                    break;
                case "ev_desc":
                    filteredHands = filteredHands.OrderByDescending(h => h.EvChips.GetValueOrDefault()).ToList();
                    break;
                case "ev_asc":
                    filteredHands = filteredHands.OrderBy(h => h.EvChips.GetValueOrDefault()).ToList();
                    break;
                case "date_desc":
                default:
                    filteredHands = filteredHands.OrderByDescending(h => h.Date).ToList();
                    break;
            }

            // 4. Paginate
            var total = filteredHands.Count;
            var page = request.Page < 1 ? 1 : request.Page;
            var limit = request.Limit < 1 ? 50 : request.Limit;
            var offset = (page - 1) * limit;

            var pagedItems = filteredHands.Skip(offset).Take(limit).ToList();
            var ids = pagedItems.Select(h => h.HandId).ToList();

            // 5. Fetch full details
            var fullHands = await _db.GetHandsByIdsAsync(ids, request.HeroName);

            // 6. Re-sort full hands to match pagedItems order (DB returns Date DESC)
            var sortedFullHands = new List<object>();
            foreach (var id in ids)
            {
                var match = fullHands.FirstOrDefault(h => (string)((dynamic)h).id == id);
                if (match != null)
                {
                    sortedFullHands.Add(match);
                }
            }

            return new AnalysisHandsResult
            {
                Hands = sortedFullHands,
                Total = total,
                Page = page,
                Limit = limit,
                Pages = (int)Math.Ceiling(total / (double)limit)
            };
        }

        public async Task<AnalysisStatsResult> GetAnalysisStatsAsync(AnalysisFilters filters)
        {
            // Removed HeroName check to allow Field analysis

            // 1. Get raw hands from DB (filtered by Date, Hero, Position)
            var hands = await _db.GetHandsForAnalysisAsync(filters);

            // 2. Apply in-memory filters (Situation, Action, Stack)
            var filteredHands = FilterHands(hands, filters);

            // 3. Calculate Stats
            return CalculateStats(filteredHands, filters.HeroName);
        }

        private List<AnalysisHandData> FilterHands(List<AnalysisHandData> hands, AnalysisFilters filters)
        {
            var result = new List<AnalysisHandData>();
            var heroName = filters.HeroName;

            int loggedSkips = 0;
            foreach (var hand in hands)
            {
                // ... (existing checks)
                // Filter by Stack BB
                if (filters.MinStackBB.HasValue || filters.MaxStackBB.HasValue)
                {
                    var bb = ParseBigBlind(hand.Blinds);
                    if (bb > 0)
                    {
                        var stackBB = hand.HeroStack / bb;
                        if (filters.MinStackBB.HasValue && stackBB < filters.MinStackBB.Value) continue;
                        if (filters.MaxStackBB.HasValue && stackBB > filters.MaxStackBB.Value) continue;
                    }
                }

                // Filter by Situation (Street)
                if (!string.IsNullOrEmpty(filters.Situation))
                {
                    if (!MatchesSituation(hand, filters.Situation)) continue;
                }

                // Filter by Action
                if (!string.IsNullOrEmpty(filters.Action))
                {
                    if (!MatchesAction(hand, filters.Situation, filters.Action, heroName)) continue;
                }

                // Per-street Action Filters by Position
                if (!MatchesStreetActionByPosition(hand.PreflopAction, filters.PreflopBtnAction, filters.PreflopSbAction, filters.PreflopBbAction, hand)) 
                {
                    if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to PreflopAction mismatch. Filters: BTN={filters.PreflopBtnAction}, SB={filters.PreflopSbAction}, BB={filters.PreflopBbAction}");
                    continue;
                }
                if (!MatchesStreetActionByPosition(hand.FlopAction, filters.FlopBtnAction, filters.FlopSbAction, filters.FlopBbAction, hand)) 
                {
                    if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to FlopAction mismatch. Action='{hand.FlopAction}' Filters: BTN={filters.FlopBtnAction}, SB={filters.FlopSbAction}, BB={filters.FlopBbAction}");
                    continue;
                }
                if (!MatchesStreetActionByPosition(hand.TurnAction, filters.TurnBtnAction, filters.TurnSbAction, filters.TurnBbAction, hand)) 
                {
                    if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to TurnAction mismatch. Action='{hand.TurnAction}'");
                    continue;
                }
                if (!MatchesStreetActionByPosition(hand.RiverAction, filters.RiverBtnAction, filters.RiverSbAction, filters.RiverBbAction, hand)) 
                {
                    if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to RiverAction mismatch. Action='{hand.RiverAction}'");
                    continue;
                }

                result.Add(hand);
            }
            
            _logger.LogInformation($"FilterHands: {result.Count}/{hands.Count} passed filters");

            return result;
        }

        private bool MatchesStreetActionByPosition(string handAction, string? btnAction, string? sbAction, string? bbAction)
        {
             // This overload is no longer used, but kept for compatibility if needed.
             return false;
        }

        private bool MatchesStreetActionByPosition(string handAction, string? btnAction, string? sbAction, string? bbAction, AnalysisHandData hand)
        {
             if (string.IsNullOrEmpty(btnAction) && string.IsNullOrEmpty(sbAction) && string.IsNullOrEmpty(bbAction)) return true;
             if (string.IsNullOrEmpty(handAction)) return false;
             
             // ... rest of method
             // Parse PlayerPositionsMap: "Player1:BTN|Player2:SB"
             var posMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
             if (!string.IsNullOrEmpty(hand.PlayerPositionsMap))
             {
                 var pairs = hand.PlayerPositionsMap.Split('|');
                 foreach (var pair in pairs)
                 {
                     var parts = pair.Split(':');
                     if (parts.Length == 2)
                     {
                         posMap[parts[0]] = parts[1]; // Name -> Position
                     }
                 }
             }

             var lines = handAction.Split('\n');
             bool btnMatch = string.IsNullOrEmpty(btnAction);
             bool sbMatch = string.IsNullOrEmpty(sbAction);
             bool bbMatch = string.IsNullOrEmpty(bbAction);

             foreach (var line in lines)
             {
                 if (string.IsNullOrEmpty(line)) continue;
                 
                 // Clean up line if it contains timestamp prefix "HH:MM:SS - "
                 var processingLine = line;
                 var splitParts = line.Split(new[] { " - " }, 2, StringSplitOptions.None);
                 if (splitParts.Length > 1)
                 {
                     processingLine = splitParts[1].Trim();
                 }

                 // Extract Player Name from line
                 // Format: "PlayerName: checks" or "PlayerName raises..."
                 var colonIndex = processingLine.IndexOf(':');
                 string playerName = "";
                 string content = "";

                 if (colonIndex != -1)
                 {
                     playerName = processingLine.Substring(0, colonIndex).Trim();
                     content = processingLine.Substring(colonIndex + 1).Trim().ToLower();
                 }
                 else
                 {
                     // Heuristic: take first word as name if we can match it to posMap?
                     // Or just split by space
                     var spaceIndex = processingLine.IndexOf(' ');
                     if (spaceIndex != -1)
                     {
                         playerName = processingLine.Substring(0, spaceIndex).Trim();
                         content = processingLine.Substring(spaceIndex).Trim().ToLower();
                     }
                     else
                     {
                         continue;
                     }
                 }

                 // Resolve Position
                 if (posMap.TryGetValue(playerName, out var position))
                 {
                     if (position == "BTN" && !string.IsNullOrEmpty(btnAction) && !btnMatch)
                     {
                         if (MatchesVerb(content, btnAction)) btnMatch = true;
                         else _logger.LogInformation($"BTN Action mismatch: '{content}' vs '{btnAction}' for {playerName}");
                       }
                       else if (position == "SB" && !string.IsNullOrEmpty(sbAction) && !sbMatch)
                       {
                           if (MatchesVerb(content, sbAction)) sbMatch = true;
                           else _logger.LogInformation($"SB Action mismatch: '{content}' vs '{sbAction}' for {playerName}");
                       }
                       else if (position == "BB" && !string.IsNullOrEmpty(bbAction) && !bbMatch)
                       {
                           if (MatchesVerb(content, bbAction)) bbMatch = true;
                           else _logger.LogInformation($"BB Action mismatch: '{content}' vs '{bbAction}' for {playerName}");
                       }
                   }
                   else 
                   {
                       if (!string.IsNullOrEmpty(playerName)) _logger.LogWarning($"Player {playerName} not found in PosMap: {string.Join(",", posMap.Keys)}");
                   }
             }

             return btnMatch && sbMatch && bbMatch;
        }
        
        // ... (rest of file)

        private bool MatchesVerb(string content, string filter)
        {
            var f = filter.ToLower();
            if (f == "any") return true;
            
            // Map simple verbs to "contains"
            // We use base forms to match variations (checks, check, checking)
            
            if (f == "bet") return content.Contains("bet");
            if (f == "raise") return content.Contains("raise");
            if (f == "check") return content.Contains("check");
            if (f == "call") return content.Contains("call");
            if (f == "fold") return content.Contains("fold");
            if (f == "all-in") return content.Contains("all-in");
            
            return content.Contains(f);
        }

        private double ParseBigBlind(string blinds)
        {
            if (string.IsNullOrEmpty(blinds)) return 0;
            // Format usually "SB/BB" e.g. "10/20"
            var parts = blinds.Split('/');
            if (parts.Length == 2 && double.TryParse(parts[1], out var bb))
            {
                return bb;
            }
            return 0;
        }

        private bool MatchesSituation(AnalysisHandData hand, string situation)
        {
            switch (situation.ToLower())
            {
                case "preflop": return true; 
                case "flop": return !string.IsNullOrEmpty(hand.FlopAction);
                case "turn": return !string.IsNullOrEmpty(hand.TurnAction);
                case "river": return !string.IsNullOrEmpty(hand.RiverAction);
                default: return true;
            }
        }

        private bool MatchesAction(AnalysisHandData hand, string? situation, string action, string? heroName)
        {
            // If global heroName is null (Field Analysis), check the hero of the hand
            var currentHeroName = heroName ?? hand.HeroName;
            
            if (string.IsNullOrEmpty(currentHeroName)) return false;

            var targetText = "";
            if (!string.IsNullOrEmpty(situation))
            {
                targetText = situation.ToLower() switch
                {
                    "preflop" => hand.PreflopAction,
                    "flop" => hand.FlopAction,
                    "turn" => hand.TurnAction,
                    "river" => hand.RiverAction,
                    _ => hand.PreflopAction + "\n" + hand.FlopAction + "\n" + hand.TurnAction + "\n" + hand.RiverAction
                };
            }
            else
            {
                 targetText = hand.PreflopAction + "\n" + hand.FlopAction + "\n" + hand.TurnAction + "\n" + hand.RiverAction;
            }

            if (string.IsNullOrEmpty(targetText)) return false;

            var lines = targetText.Split('\n');
            foreach (var line in lines)
            {
                if (line.StartsWith(currentHeroName + ":", StringComparison.OrdinalIgnoreCase))
                {
                    var act = line.Substring(currentHeroName.Length + 1).ToLower();
                    switch (action.ToLower())
                    {
                        case "bet": return act.Contains("bets");
                        case "raise": return act.Contains("raises");
                        case "check": return act.Contains("checks");
                        case "fold": return act.Contains("folds");
                        case "call": return act.Contains("calls");
                    }
                }
            }

            return false;
        }

        private AnalysisStatsResult CalculateStats(List<AnalysisHandData> hands, string? heroName)
        {
            var stats = new AnalysisStatsResult
            {
                TotalHands = hands.Count,
                TotalProfit = hands.Sum(h => h.Profit)
            };

            if (stats.TotalHands == 0) return stats;

            double vpipCount = 0;
            double pfrCount = 0;
            double wtsdCount = 0; 
            double wsdCount = 0; 
            double sawFlopCount = 0;
            
            // Aggression counters (postflop)
            int aggBets = 0;
            int aggRaises = 0;
            int aggCalls = 0;
            int aggFolds = 0;

            // Sort hands by date for graph
            var sortedHands = hands.OrderBy(h => h.Date).ToList();
            double cumulativeProfit = 0;

            // 3Bet detection
            double threeBetCount = 0;
            double threeBetOppCount = 0;

            foreach (var hand in sortedHands)
            {
                var currentHeroName = heroName ?? hand.HeroName;
                if (string.IsNullOrEmpty(currentHeroName)) continue;

                // Graph Data
                cumulativeProfit += hand.Profit;
                stats.GraphData.Add(new GraphPoint
                {
                    Date = hand.Date.ToString("yyyy-MM-dd HH:mm:ss"), // or shorter format
                    Profit = hand.Profit,
                    CumulativeProfit = cumulativeProfit
                });

                // VPIP / PFR / 3Bet (Preflop)
                bool isVpip = false;
                bool isPfr = false;
                bool is3Bet = false;
                bool has3BetOpp = false;
                
                if (!string.IsNullOrEmpty(hand.PreflopAction))
                {
                    var lines = hand.PreflopAction.Split('\n');
                    
                    // Track preflop state
                    bool hasOpenRaise = false;
                    bool heroActed = false;

                    foreach (var line in lines)
                    {
                        var lowerLine = line.ToLower();
                        bool isHero = line.StartsWith(currentHeroName + ":", StringComparison.OrdinalIgnoreCase);

                        // Check for open raise from others
                        if (!isHero && !heroActed)
                        {
                            if (lowerLine.Contains("raises"))
                            {
                                hasOpenRaise = true;
                            }
                        }

                        if (isHero)
                        {
                            heroActed = true;
                            if (lowerLine.Contains("calls") || lowerLine.Contains("raises") || lowerLine.Contains("bets"))
                            {
                                isVpip = true;
                            }
                            if (lowerLine.Contains("raises"))
                            {
                                isPfr = true;
                                if (hasOpenRaise)
                                {
                                    is3Bet = true;
                                }
                            }
                            
                            // Opportunity: If there was an open raise and we acted (raise, call, or fold)
                            if (hasOpenRaise)
                            {
                                has3BetOpp = true;
                            }
                        }
                    }
                }
                
                if (isVpip) vpipCount++;
                if (isPfr) pfrCount++;
                if (is3Bet) threeBetCount++;
                if (has3BetOpp) threeBetOppCount++;

                // WTSD / W$SD
                bool sawFlop = !string.IsNullOrEmpty(hand.FlopAction); 
                
                if (sawFlop)
                {
                    sawFlopCount++;
                    if (hand.WentToShowdown)
                    {
                        wtsdCount++;
                        if (hand.Profit > 0) 
                        {
                            wsdCount++;
                        }
                    }
                }

                // Aggression Frequency (Postflop)
                CountAggression(hand.FlopAction, currentHeroName, ref aggBets, ref aggRaises, ref aggCalls, ref aggFolds);
                CountAggression(hand.TurnAction, currentHeroName, ref aggBets, ref aggRaises, ref aggCalls, ref aggFolds);
                CountAggression(hand.RiverAction, currentHeroName, ref aggBets, ref aggRaises, ref aggCalls, ref aggFolds);
            }

            stats.Vpip = (vpipCount / stats.TotalHands) * 100.0;
            stats.Pfr = (pfrCount / stats.TotalHands) * 100.0;
            
            if (sawFlopCount > 0)
            {
                stats.Wtsd = (wtsdCount / sawFlopCount) * 100.0;
            }
            
            if (wtsdCount > 0)
            {
                stats.Wsd = (wsdCount / wtsdCount) * 100.0;
            }

            var totalAggActions = aggBets + aggRaises + aggCalls + aggFolds;
            if (totalAggActions > 0)
            {
                stats.AggressionFreq = ((double)(aggBets + aggRaises) / totalAggActions) * 100.0;
            }

            if (threeBetOppCount > 0)
            {
                stats.ThreeBet = (threeBetCount / threeBetOppCount) * 100.0;
            }

            return stats;
        }

        private void CountAggression(string actionText, string heroName, ref int bets, ref int raises, ref int calls, ref int folds)
        {
            if (string.IsNullOrEmpty(actionText)) return;
            var lines = actionText.Split('\n');
            foreach (var line in lines)
            {
                if (line.StartsWith(heroName + ":", StringComparison.OrdinalIgnoreCase))
                {
                    var act = line.ToLower();
                    if (act.Contains("bets")) bets++;
                    else if (act.Contains("raises")) raises++;
                    else if (act.Contains("calls")) calls++;
                    else if (act.Contains("folds")) folds++;
                }
            }
        }
    }
}
