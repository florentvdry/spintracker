using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using SpinTrackerBackend.Interfaces;
using SpinTrackerBackend;
using SpinTrackerBackend.Data.Repositories;

namespace SpinTrackerBackend.Services
{
    public class AnalysisService : IAnalysisService
    {
        private readonly Database _db;
        private readonly HandRepository _handRepo;
        private readonly AnalyticsRepository _analyticsRepo;
        private readonly PlayerRepository _playerRepo;
        private readonly ILogger<AnalysisService> _logger;

        public AnalysisService(Database db, HandRepository handRepo, AnalyticsRepository analyticsRepo, PlayerRepository playerRepo, ILogger<AnalysisService> logger)
        {
            _db = db;
            _handRepo = handRepo;
            _analyticsRepo = analyticsRepo;
            _playerRepo = playerRepo;
            _logger = logger;
        }

        private bool IsLineByPlayer(string line, string playerName, out string cleanAction)
        {
            cleanAction = "";
            if (string.IsNullOrWhiteSpace(line)) return false;

            var processingLine = line.Trim();

            // Strip timestamp (Betclic format: "22:53:05 - ")
            var splitParts = processingLine.Split(new[] { " - " }, 2, StringSplitOptions.None);
            if (splitParts.Length > 1) processingLine = splitParts[1].Trim();

            // Format 1: "PlayerName: action"
            if (processingLine.StartsWith(playerName + ":", StringComparison.OrdinalIgnoreCase))
            {
                cleanAction = processingLine.Substring(playerName.Length + 1).Trim();
                return true;
            }

            // Format 2: "PlayerName action" (Winamax/Unibet sometimes)
            if (processingLine.StartsWith(playerName + " ", StringComparison.OrdinalIgnoreCase))
            {
                // Verify it's not just a name prefix by checking if the next word is a known action
                var potentialAction = processingLine.Substring(playerName.Length).Trim();
                var firstWord = potentialAction.Split(' ')[0].ToLower();
                var knownActions = new[] { "posts", "calls", "bets", "raises", "folds", "checks" };
                if (knownActions.Contains(firstWord))
                {
                    cleanAction = potentialAction;
                    return true;
                }
            }

            return false;
        }

        private string GetCleanAction(string line)
        {
            if (string.IsNullOrWhiteSpace(line)) return line;
            var processingLine = line.Trim();
            var splitParts = processingLine.Split(new[] { " - " }, 2, StringSplitOptions.None);
            if (splitParts.Length > 1) processingLine = splitParts[1].Trim();
            
            var colonIdx = processingLine.IndexOf(':');
            if (colonIdx >= 0) return processingLine.Substring(colonIdx + 1).Trim();
            
            return processingLine;
        }

        public async Task<AnalysisHandsResult> GetAnalysisHandsAsync(AnalysisHandsRequest request)
        {
            // Removed HeroName check to allow Field analysis

            // 1. Get raw hands from DB (filtered by Date, Hero, Position)
            var hands = await _analyticsRepo.GetHandsForAnalysisAsync(request);
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
            var fullHands = await _handRepo.GetHandsByIdsAsync(ids, request.HeroName);

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
            var hands = await _analyticsRepo.GetHandsForAnalysisAsync(filters);

            // 2. Apply in-memory filters (Situation, Action, Stack)
            var filteredHands = FilterHands(hands, filters);

            // 3. Calculate Stats
            return CalculateStats(filteredHands, filters.HeroName);
        }

        private List<AnalysisHandData> FilterHands(List<AnalysisHandData> hands, AnalysisFilters filters)
        {
            var result = new List<AnalysisHandData>();

            int loggedSkips = 0;
            foreach (var hand in hands)
            {
                // When using an alias, hand.HeroName contains the actual pseudo found in that hand.
                // We MUST use it for all text parsing logic instead of filters.HeroName (which might be the alias name).
                var effectiveHeroName = hand.HeroName ?? filters.HeroName;

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

                // Filter by Opponent Type (reg/fish)
                if (!string.IsNullOrEmpty(filters.OpponentType) && filters.OpponentType != "all")
                {
                    var opponentIsReg = CheckOpponentIsReg(hand, effectiveHeroName);
                    if (filters.OpponentType == "reg" && !opponentIsReg) continue;
                    if (filters.OpponentType == "fish" && opponentIsReg) continue;
                }

                // Filter by Situation (Street)
                if (!string.IsNullOrEmpty(filters.Situation))
                {
                    if (!MatchesSituation(hand, filters.Situation)) continue;
                }

                // Filter by Action (Global)
                if (!string.IsNullOrEmpty(filters.Action))
                {
                    if (!MatchesAction(hand, filters.Situation, filters.Action, effectiveHeroName)) continue;
                }

                // NEW: Ordered Sequence Filter
                if (filters.ActionSequence != null && filters.ActionSequence.Count > 0)
                {
                    if (!MatchesActionSequence(hand, filters.ActionSequence))
                    {
                        if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to Sequence mismatch.");
                        continue;
                    }
                }
                else 
                {
                    // Fallback to legacy presence-based filters if no sequence provided
                    if (!MatchesStreetActionByPosition(hand.PreflopAction, filters.PreflopBtnAction, filters.PreflopSbAction, filters.PreflopBbAction, hand)) 
                    {
                        if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to PreflopAction mismatch.");
                        continue;
                    }
                    
                    // Keep Postflop filters valid even with sequence (sequence is Preflop only for now)
                    if (!MatchesStreetActionByPosition(hand.FlopAction, filters.FlopBtnAction, filters.FlopSbAction, filters.FlopBbAction, hand)) 
                    {
                        if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to FlopAction mismatch.");
                        continue;
                    }
                    if (!MatchesStreetActionByPosition(hand.TurnAction, filters.TurnBtnAction, filters.TurnSbAction, filters.TurnBbAction, hand)) 
                    {
                        if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to TurnAction mismatch.");
                        continue;
                    }
                    if (!MatchesStreetActionByPosition(hand.RiverAction, filters.RiverBtnAction, filters.RiverSbAction, filters.RiverBbAction, hand)) 
                    {
                        if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to RiverAction mismatch.");
                        continue;
                    }
                }
                
                // Filter by SituationId (RFI vs Limp) - always apply if provided
                if (!string.IsNullOrEmpty(filters.SituationId))
                {
                    if (!MatchesSituationId(hand, filters.SituationId, filters.Positions))
                    {
                        if (loggedSkips++ < 5) _logger.LogInformation($"Skipped {hand.HandId} due to SituationId mismatch ({filters.SituationId}).");
                        continue;
                    }
                }

                result.Add(hand);
            }
            
            _logger.LogInformation($"FilterHands: {result.Count}/{hands.Count} passed filters");

            return result;
        }

        private bool MatchesActionSequence(AnalysisHandData hand, List<string> sequence)
        {
             if (sequence == null || sequence.Count == 0) return true;
             if (string.IsNullOrEmpty(hand.PreflopAction)) return false;

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

             // Parse Hand Actions into a list of "Position:Action"
             // Format of line: "PlayerName: raises to 40"
             var actualActions = new List<string>();
             var lines = hand.PreflopAction.Split('\n');
             
             foreach (var line in lines)
             {
                 if (string.IsNullOrEmpty(line)) continue;
                 
                 var processingLine = line.Trim();
                 var splitParts = processingLine.Split(new[] { " - " }, 2, StringSplitOptions.None);
                 if (splitParts.Length > 1) processingLine = splitParts[1].Trim();

                 var colonIndex = processingLine.IndexOf(':');
                 if (colonIndex == -1) continue;

                 var playerName = processingLine.Substring(0, colonIndex).Trim();
                 var content = processingLine.Substring(colonIndex + 1).Trim().ToLower();

                 if (posMap.TryGetValue(playerName, out var pos))
                 {
                     // Convert content to standardized verb
                     string verb = "unknown";
                     if (content.Contains("all-in")) verb = "all-in";
                     else if (content.Contains("raises")) verb = "raise";
                     else if (content.Contains("bets")) verb = "bet";
                     else if (content.Contains("calls")) verb = "call";
                     else if (content.Contains("checks")) verb = "check";
                     else if (content.Contains("folds")) verb = "fold";
                     else if (content.Contains("posts")) continue; // Skip blinds posting
                     else if (content.Contains("ante")) continue;
                     
                     if (verb != "unknown")
                     {
                         actualActions.Add($"{pos}:{verb}");
                     }
                 }
             }

             // Check if 'actualActions' starts with 'sequence'
             if (actualActions.Count < sequence.Count) return false;

             for (int i = 0; i < sequence.Count; i++)
             {
                 var required = sequence[i]; // "BTN:raise"
                 var actual = actualActions[i]; // "BTN:raise"
                 
                 // Flexible match?
                 // Require exact Position:Verb match
                 if (!string.Equals(required, actual, StringComparison.OrdinalIgnoreCase))
                 {
                     // Allow "raise" to match "bet" or "all-in" if loose matching desired?
                     // For now strict: user selected "Raise", hand must have "Raise".
                     // Exception: "all-in" often contains "raises" in text ("raises to 100 and is all-in")
                     // My parser above sets verb to "all-in" if content contains "all-in".
                     // If user filters "raise", but hand is "all-in", currently fails.
                     // Fix: if required is "raise", allow "all-in"? Maybe not.
                     return false;
                 }
             }

             return true;
        }

        private bool MatchesSituationId(AnalysisHandData hand, string situationId, string[]? positions)
        {
            if (string.IsNullOrEmpty(situationId)) return true;
            if (string.IsNullOrEmpty(hand.PreflopAction)) return false;
            
            // Get hero position
            var heroPos = hand.HeroPosition;
            if (positions != null && positions.Length > 0)
            {
                heroPos = positions[0];
            }
            
            // Parse the preflop action for the hero
            var heroAction = ParseHeroAction(hand, heroPos);
            if (heroAction == null) return false;
            
            var action = heroAction.Value.action;
            var amountBB = heroAction.Value.amountBB;
            
            var rfiSituations = new[] { "rfi", "sb_rfi", "hu_sb_rfi" };
            var limpSituations = new[] { "limp", "vs_btn_limp", "hu_sb_limp" };
            var bbVsOpenSituations = new[] { "vs_sb_open", "vs_btn_open_sb_fold", "vs_btn_open_sb_call" };
            var bbVsLimpSituations = new[] { "vs_sb_limp", "vs_btn_limp_sb_limp", "vs_btn_limp_sb_fold", "hu_vs_sb_limp" };
            
            if (rfiSituations.Contains(situationId.ToLower()))
            {
                // RFI: Any raise or all-in (no amount restriction for filtering)
                return action == "raise" || action == "all-in";
            }
            
            if (limpSituations.Contains(situationId.ToLower()))
            {
                // Limp: Call approximately 1 BB (just call the blind)
                // Note: SB calls SB amount = 0.5bb (since SB posted 0.5bb already)
                // BTN limp calls 1bb
                // Also include all-in calls
                return (action == "call" && amountBB >= 0.3 && amountBB <= 1.5) || action == "all-in";
            }

            if (bbVsOpenSituations.Contains(situationId.ToLower()))
            {
                // BB vs Open: Raise, All-in, or Call (flatting)
                return action == "raise" || action == "all-in" || action == "call";
            }
            
            if (bbVsLimpSituations.Contains(situationId.ToLower()))
            {
                // BB vs limp: BB has already posted 1bb, so they can't "call"
                // They can only "check" (do nothing) or "raise"
                // So we match any action except fold
                return action != "fold";
            }
            
            return true;
        }
        
        private (string action, double amountBB)? ParseHeroAction(AnalysisHandData hand, string heroPosition)
        {
            if (string.IsNullOrEmpty(hand.PreflopAction) || string.IsNullOrEmpty(heroPosition)) return null;
            
            // Try to use PlayerPositionsMap if available
            var posMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrEmpty(hand.PlayerPositionsMap))
            {
                var pairs = hand.PlayerPositionsMap.Split('|');
                foreach (var pair in pairs)
                {
                    var parts = pair.Split(':');
                    if (parts.Length == 2)
                    {
                        posMap[parts[0]] = parts[1];
                    }
                }
            }
            
            // Find the hero's action in PreflopAction
            var lines = hand.PreflopAction.Split('\n');
            var bb = ParseBigBlind(hand.Blinds);
            
            // Get hero name from hand
            var heroName = hand.HeroName;
            
            foreach (var line in lines)
            {
                if (string.IsNullOrEmpty(line)) continue;
                
                var processingLine = line.Trim();
                var splitParts = processingLine.Split(new[] { " - " }, 2, StringSplitOptions.None);
                if (splitParts.Length > 1) processingLine = splitParts[1].Trim();

                var colonIndex = processingLine.IndexOf(':');
                if (colonIndex == -1) continue;
                
                var playerName = processingLine.Substring(0, colonIndex).Trim();
                var content = processingLine.Substring(colonIndex + 1).Trim().ToLower();
                
                // Check if this is the hero's action by:
                // 1. Matching player name to hero name, OR
                // 2. Matching position via PlayerPositionsMap
                bool isHeroAction = false;
                
                if (!string.IsNullOrEmpty(heroName) && string.Equals(playerName, heroName, StringComparison.OrdinalIgnoreCase))
                {
                    isHeroAction = true;
                }
                else if (posMap.Count > 0 && posMap.TryGetValue(playerName, out var pos))
                {
                    isHeroAction = string.Equals(pos, heroPosition, StringComparison.OrdinalIgnoreCase);
                }
                
                if (!isHeroAction) continue;
                
                // Determine action and amount
                string action;
                double amountBB = 0;
                
                if (content.Contains("all-in"))
                {
                    action = "all-in";
                    // Try to extract amount from "raises to X and is all-in"
                    var amountMatch = System.Text.RegularExpressions.Regex.Match(content, @"to\s+(\d+\.?\d*)");
                    if (amountMatch.Success && bb > 0)
                    {
                        amountBB = double.Parse(amountMatch.Groups[1].Value) / bb;
                    }
                }
                else if (content.Contains("raises"))
                {
                    action = "raise";
                    // Extract amount from "raises to X"
                    var amountMatch = System.Text.RegularExpressions.Regex.Match(content, @"to\s+(\d+\.?\d*)");
                    if (amountMatch.Success && bb > 0)
                    {
                        amountBB = double.Parse(amountMatch.Groups[1].Value) / bb;
                    }
                }
                else if (content.Contains("calls"))
                {
                    action = "call";
                    // Extract amount from "calls X"
                    var amountMatch = System.Text.RegularExpressions.Regex.Match(content, @"(\d+\.?\d*)");
                    if (amountMatch.Success && bb > 0)
                    {
                        amountBB = double.Parse(amountMatch.Groups[1].Value) / bb;
                    }
                }
                else
                {
                    continue; // Skip other actions like check, fold
                }
                
                return (action, amountBB);
            }
            
            return null;
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

        private bool CheckOpponentIsReg(AnalysisHandData hand, string? heroName)
        {
            if (string.IsNullOrEmpty(hand.PlayerPositionsMap)) return false;

            var currentHeroName = heroName ?? hand.HeroName;
            if (string.IsNullOrEmpty(currentHeroName)) return false;

            var players = hand.PlayerPositionsMap.Split('|');
            foreach (var playerPos in players)
            {
                var parts = playerPos.Split(':');
                if (parts.Length < 2) continue;

                var playerName = parts[0].Trim();
                if (string.Equals(playerName, currentHeroName, StringComparison.OrdinalIgnoreCase)) continue;

                var isReg = _playerRepo.CheckPlayerIsRegAsync(playerName).Result;
                return isReg;
            }

            return false;
        }

        private bool MatchesAction(AnalysisHandData hand, string? situation, string action, string? heroName)
        {
            // Use hand-specific HeroName (actual pseudo) if available
            var currentHeroName = hand.HeroName ?? heroName;
            
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
                if (IsLineByPlayer(line, currentHeroName, out var act))
                {
                    act = act.ToLower();
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
                // Use hand-specific HeroName (actual pseudo) if available
                var currentHeroName = hand.HeroName ?? heroName;
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
                        bool isHero = IsLineByPlayer(line, currentHeroName, out var cleanAction);
                        var lowerLine = cleanAction.ToLower();

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
                if (IsLineByPlayer(line, heroName, out var act))
                {
                    act = act.ToLower();
                    if (act.Contains("bets")) bets++;
                    else if (act.Contains("raises")) raises++;
                    else if (act.Contains("calls")) calls++;
                    else if (act.Contains("folds")) folds++;
                }
            }
        }

        public async Task<HandReplayData?> GetHandReplayAsync(string handId, string? heroName)
        {
            var rawHand = await _handRepo.GetHandByIdAsync(handId, heroName);
            if (rawHand == null) return null;

            // Convert rawHand (Dictionary) to a typed object or dynamic for easier access
            var json = System.Text.Json.JsonSerializer.Serialize(rawHand);
            var hand = System.Text.Json.JsonSerializer.Deserialize<HandDetailsDto>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            
            if (hand == null) return null;

            var replay = new HandReplayData
            {
                HandId = hand.Id,
                Room = hand.Room,
                Blinds = hand.Blinds,
                BuyIn = hand.Buy_In,
                Date = hand.Date_Time,
                TotalPot = hand.Total_Pot,
                Board = string.Join("", new[] { hand.Flop, hand.Turn, hand.River }
                    .Where(s => !string.IsNullOrEmpty(s))
                    .Select(s => s.Replace(" ", "").Replace("[", "").Replace("]", "").Replace("|", "")))
            };

            // Set Players
            foreach (var p in hand.Players)
            {
                // Fix: Ensure only 2 cards for players and remove formatting
                string cleanCards = (p.Cards ?? "").Replace(" ", "").Replace("[", "").Replace("]", "").Replace("|", "");
                if (cleanCards.Length > 4) cleanCards = cleanCards.Substring(0, 4);

                replay.Players.Add(new ReplayPlayer
                {
                    Name = p.Name,
                    Position = p.Position,
                    InitialStack = p.Stack,
                    Cards = cleanCards,
                    IsHero = p.IsHero
                });
            }

            // Parse Actions
            int order = 1;
            double currentPot = 0;
            var actions = new List<ReplayAction>();

            // 1. Deal Cards (hole cards) FIRST
            actions.Add(new ReplayAction { Order = order++, Street = "Preflop", Type = "DealCards", Description = "Dealing hole cards" });

            // 2. Post Blinds
            var bbAmount = ParseBigBlind(hand.Blinds);
            var sbAmount = bbAmount / 2.0;

            foreach (var p in replay.Players)
            {
                if (p.Position.Contains("SB"))
                {
                    actions.Add(new ReplayAction { 
                        Order = order++, Street = "Preflop", Type = "PostSB", 
                        PlayerName = p.Name, Amount = sbAmount, PotBefore = currentPot, 
                        PotAfter = currentPot + sbAmount, Description = $"{p.Name} posts SB {sbAmount}" 
                    });
                    currentPot += sbAmount;
                }
                else if (p.Position.Contains("BB"))
                {
                    actions.Add(new ReplayAction { 
                        Order = order++, Street = "Preflop", Type = "PostBB", 
                        PlayerName = p.Name, Amount = bbAmount, PotBefore = currentPot, 
                        PotAfter = currentPot + bbAmount, Description = $"{p.Name} posts BB {bbAmount}" 
                    });
                    currentPot += bbAmount;
                }
            }

            // 3. Preflop Actions
            currentPot = ParseActionText(hand.Preflop_Action, "Preflop", order, currentPot, actions, bbAmount);
            order = actions.Count + 1;

            // 4. Flop
            if (!string.IsNullOrEmpty(hand.Flop))
            {
                var cleanCards = hand.Flop.Replace(" ", "").Replace("[", "").Replace("]", "").Replace("|", "");
                actions.Add(new ReplayAction { Order = order++, Street = "Flop", Type = "DealCards", Cards = cleanCards, Description = $"Flop: {hand.Flop}" });
                currentPot = ParseActionText(hand.Flop_Action, "Flop", order, currentPot, actions, bbAmount);
                order = actions.Count + 1;
            }

            // 5. Turn
            if (!string.IsNullOrEmpty(hand.Turn))
            {
                var cleanCards = hand.Turn.Replace(" ", "").Replace("[", "").Replace("]", "").Replace("|", "");
                actions.Add(new ReplayAction { Order = order++, Street = "Turn", Type = "DealCards", Cards = cleanCards, Description = $"Turn: {hand.Turn}" });
                currentPot = ParseActionText(hand.Turn_Action, "Turn", order, currentPot, actions, bbAmount);
                order = actions.Count + 1;
            }

            // 6. River
            if (!string.IsNullOrEmpty(hand.River))
            {
                var cleanCards = hand.River.Replace(" ", "").Replace("[", "").Replace("]", "").Replace("|", "");
                actions.Add(new ReplayAction { Order = order++, Street = "River", Type = "DealCards", Cards = cleanCards, Description = $"River: {hand.River}" });
                currentPot = ParseActionText(hand.River_Action, "River", order, currentPot, actions, bbAmount);
                order = actions.Count + 1;
            }

            // 7. Showdown
            if (hand.Went_To_Showdown)
            {
                foreach (var p in hand.Players)
                {
                    if (!string.IsNullOrEmpty(p.Cards))
                    {
                        var cleanCards = p.Cards.Replace(" ", "").Replace("[", "").Replace("]", "").Replace("|", "");
                        actions.Add(new ReplayAction { 
                            Order = order++, Street = "Showdown", Type = "ShowCards", 
                            PlayerName = p.Name, Cards = cleanCards, Description = $"{p.Name} shows {p.Cards}" 
                        });
                    }
                }
            }

            // 8. Collect Pot
            var winners = hand.Players.Where(p => p.ChipsWon > 0).ToList();
            if (winners.Count > 0)
            {
                foreach (var w in winners)
                {
                    actions.Add(new ReplayAction
                    {
                        Order = order++,
                        Street = "Showdown",
                        Type = "CollectPot",
                        PlayerName = w.Name,
                        Amount = w.ChipsWon,
                        PotBefore = currentPot,
                        PotAfter = 0,
                        Description = $"{w.Name} wins {w.ChipsWon}"
                    });
                }
            }
            else if (hand.Total_Pot > 0)
            {
                var lastActionLine = hand.River_Action?.Split('\n').LastOrDefault(l => !string.IsNullOrEmpty(l));
                if (!string.IsNullOrEmpty(lastActionLine))
                {
                    var colonIndex = lastActionLine.IndexOf(':');
                    var winnerName = colonIndex > 0 ? lastActionLine.Substring(0, colonIndex).Trim() : "Unknown";
                    actions.Add(new ReplayAction
                    {
                        Order = order++,
                        Street = "Showdown",
                        Type = "CollectPot",
                        PlayerName = winnerName,
                        Amount = hand.Total_Pot,
                        PotBefore = currentPot,
                        PotAfter = 0,
                        Description = $"{winnerName} wins {hand.Total_Pot}"
                    });
                }
            }

            replay.Actions = actions;
            return replay;
        }

        private double ParseActionText(string actionText, string street, int startOrder, double initialPot, List<ReplayAction> actions, double bb)
        {
            if (string.IsNullOrEmpty(actionText)) return initialPot;

            var lines = actionText.Split('\n');
            double currentPot = initialPot;
            int order = startOrder;

            foreach (var line in lines)
            {
                if (string.IsNullOrEmpty(line)) continue;

                var processingLine = line.Trim();
                var splitParts = processingLine.Split(new[] { " - " }, 2, StringSplitOptions.None);
                if (splitParts.Length > 1) processingLine = splitParts[1].Trim();

                // Parse player name and content - support both formats:
                // Format 1: "playerName: action" (Betclic)
                // Format 2: "playerName action" (Winamax, no colon)
                string playerName = "";
                string content = "";
                
                var colonIndex = processingLine.IndexOf(':');
                if (colonIndex != -1)
                {
                    // Format 1: has colon
                    playerName = processingLine.Substring(0, colonIndex).Trim();
                    content = processingLine.Substring(colonIndex + 1).Trim().ToLower();
                }
                else
                {
                    // Format 2: no colon - find first space
                    var spaceIndex = processingLine.IndexOf(' ');
                    if (spaceIndex == -1) continue;
                    
                    playerName = processingLine.Substring(0, spaceIndex).Trim();
                    content = processingLine.Substring(spaceIndex + 1).Trim().ToLower();
                }
                
                if (string.IsNullOrEmpty(playerName)) continue;

                string type = "Unknown";
                double amount = 0;

                // Check for Post SB
                if (content.Contains("posts sb") || content.Contains("posts small blind"))
                {
                    type = "PostSB";
                    var match = Regex.Match(content, @"(\d+\.?\d*)");
                    if (match.Success && !string.IsNullOrEmpty(match.Groups[1].Value))
                        amount = double.Parse(match.Groups[1].Value);
                }
                // Check for Post BB
                else if (content.Contains("posts bb") || content.Contains("posts big blind"))
                {
                    type = "PostBB";
                    var match = Regex.Match(content, @"(\d+\.?\d*)");
                    if (match.Success && !string.IsNullOrEmpty(match.Groups[1].Value))
                        amount = double.Parse(match.Groups[1].Value);
                }
                // Check for Fold (EN + FR)
                else if (content.Contains("folds") || content.Contains("fold") || content.Contains("se couche")) type = "Fold";
                // Check for Check (EN + FR)
                else if (content.Contains("checks") || content.Contains("check") || content.Contains("parole")) type = "Check";
                // Check for Call (EN + FR)
                else if (content.Contains("calls") || content.Contains("call") || content.Contains("paye") || content.Contains("suit"))
                {
                    type = "Call";
                    var match = Regex.Match(content, @"(\d+\.?\d*)");
                    if (match.Success && !string.IsNullOrEmpty(match.Groups[1].Value))
                        amount = double.Parse(match.Groups[1].Value);
                }
                // Check for Raise (EN + FR)
                else if (content.Contains("raises") || content.Contains("raise") || content.Contains("relance") || content.Contains("mise"))
                {
                    type = "Raise";
                    var match = Regex.Match(content, @"to\s+(\d+\.?\d*)|(\d+\.?\d*)");
                    if (match.Success && !string.IsNullOrEmpty(match.Groups[1].Value))
                        amount = double.Parse(match.Groups[1].Value);
                }
                // Check for Bet (EN + FR)
                else if (content.Contains("bets") || content.Contains("bet") || content.Contains("mise"))
                {
                    type = "Bet";
                    var match = Regex.Match(content, @"(\d+\.?\d*)");
                    if (match.Success && !string.IsNullOrEmpty(match.Groups[1].Value))
                        amount = double.Parse(match.Groups[1].Value);
                }

                // Check for All-In (override)
                if (content.Contains("all-in") || content.Contains("all in") || content.Contains("tapis"))
                {
                    type = "AllIn";
                    var match = Regex.Match(content, @"(\d+\.?\d*)");
                    if (match.Success && !string.IsNullOrEmpty(match.Groups[1].Value))
                        amount = double.Parse(match.Groups[1].Value);
                }
                
                // Skip unknown actions - don't add them to the list
                if (type == "Unknown") continue;
                
                double addedToPot = 0;
                if (type is "Call" or "Bet" or "Raise" or "AllIn")
                {
                    addedToPot = amount;
                    currentPot += addedToPot;
                }

                actions.Add(new ReplayAction
                {
                    Order = order++,
                    Street = street,
                    Type = type,
                    PlayerName = playerName,
                    Amount = amount,
                    PotBefore = currentPot - addedToPot,
                    PotAfter = currentPot,
                    Description = processingLine
                });
            }

            return currentPot;
        }

        // DTOs for JSON deserialization of DB result
        private class HandDetailsDto
        {
            public string Id { get; set; } = "";
            public string Room { get; set; } = "";
            public string Blinds { get; set; } = "";
            public string Date_Time { get; set; } = "";
            public double Buy_In { get; set; }
            public double Total_Pot { get; set; }
            public string Preflop_Action { get; set; } = "";
            public string? Flop { get; set; }
            public string? Flop_Action { get; set; }
            public string? Turn { get; set; }
            public string? Turn_Action { get; set; }
            public string? River { get; set; }
            public string? River_Action { get; set; }
            public bool Went_To_Showdown { get; set; }
            public List<PlayerDto> Players { get; set; } = new();
        }

        private class PlayerDto
        {
            public string Name { get; set; } = "";
            public string Position { get; set; } = "";
            public double Stack { get; set; }
            public string? Cards { get; set; }
            public bool IsHero { get; set; }
            public double ChipsWon { get; set; }
        }

        public async Task<object> GetRangeAnalysisAsync(AnalysisFilters filters)
        {
            _logger.LogInformation($"GetRangeAnalysisAsync: Starting analysis for Hero='{filters.HeroName}', Situation='{filters.Situation}'");

            // 1. Get raw hands from DB
            var hands = await _analyticsRepo.GetHandsForAnalysisAsync(filters);
            _logger.LogInformation($"GetRangeAnalysisAsync: DB returned {hands.Count} hands");

            // 2. Filter in memory
            var filteredHands = FilterHands(hands, filters);
            _logger.LogInformation($"GetRangeAnalysisAsync: After filtering {filteredHands.Count} hands");

            // Determine Target Position. 
            string? targetPosition = null;
            if (filters.Positions != null && filters.Positions.Length > 0)
            {
                targetPosition = filters.Positions[0];
            }
            else if (filters.ActionSequence != null && filters.ActionSequence.Count > 0)
            {
                var lastItem = filters.ActionSequence.Last();
                var parts = lastItem.Split(':');
                if (parts.Length > 0)
                {
                    targetPosition = parts[0].Trim();
                }
            }

            // 3. Aggregate
            var rangeData = new Dictionary<string, RangeHandStats>();
            int skippedNoHeroName = 0;
            int skippedNoCards = 0;
            int processed = 0;

            foreach (var hand in filteredHands)
            {
                // Use hand.HeroName (the actual pseudo) if available, fallback to filter's HeroName (the alias)
                var effectiveHeroName = hand.HeroName ?? filters.HeroName;

                if (string.IsNullOrEmpty(effectiveHeroName))
                {
                    skippedNoHeroName++;
                    continue;
                }

                if (!string.IsNullOrEmpty(targetPosition))
                {
                    if (!string.Equals(hand.HeroPosition, targetPosition, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                }

                var cards = NormalizeCards(hand.HeroCards);
                if (cards == null)
                {
                    skippedNoCards++;
                    continue;
                }

                var actionType = DetermineActionType(hand, filters.Situation, filters.SituationId, effectiveHeroName);
                if (actionType == "None") continue;

                if (!rangeData.ContainsKey(cards))
                {
                    rangeData[cards] = new RangeHandStats { Hand = cards };
                }

                var stats = rangeData[cards];
                stats.TotalCount++;
                stats.TotalProfit += hand.Profit;
                stats.TotalEv += hand.EvChips.GetValueOrDefault();

                stats.Hands.Add(new RangeHandSummary
                {
                    Id = hand.HandId,
                    Date = hand.Date,
                    Profit = hand.Profit,
                    Ev = hand.EvChips,
                    Action = actionType
                });

                if (!stats.Actions.ContainsKey(actionType))
                {
                    stats.Actions[actionType] = 0;
                }
                stats.Actions[actionType]++;
                processed++;
            }

            _logger.LogInformation($"GetRangeAnalysisAsync: Processed {processed}. Skipped: NoHeroName={skippedNoHeroName}, NoCards={skippedNoCards}");

            return rangeData;
        }

        public RangeAnalysisResult AnalyzeRange(string? position, string? action, int stack)
        {
            return new RangeAnalysisResult
            {
                Position = position ?? "BTN",
                Action = action ?? "Open",
                Stack = stack,
                Range = "22+, A2s+, K5s+, Q8s+, J8s+, T8s+, 98s, A7o+, KTo+, QTo+, JTo",
                Vpip = 24.5,
                Pfr = 18.2
            };
        }

        private string DetermineActionType(AnalysisHandData hand, string? situation, string? situationId, string heroName)
        {
            var actionText = "";
            if (string.IsNullOrEmpty(situation) || situation.ToLower() == "preflop")
                actionText = hand.PreflopAction;
            else if (situation.ToLower() == "flop") actionText = hand.FlopAction;
            else if (situation.ToLower() == "turn") actionText = hand.TurnAction;
            else if (situation.ToLower() == "river") actionText = hand.RiverAction;

            if (string.IsNullOrEmpty(actionText)) return "None";

            var rfiSituations = new[] { "rfi", "sb_rfi", "hu_sb_rfi" };
            bool isRfiSituation = !string.IsNullOrEmpty(situationId) && rfiSituations.Contains(situationId.ToLower());

            var lines = actionText.Split('\n');
            foreach (var line in lines)
            {
                if (IsLineByPlayer(line, heroName, out var act))
                {
                    act = act.ToLower();
                    if (act.Contains("all-in")) return "AllIn";

                    if (act.Contains("raises"))
                    {
                        if (isRfiSituation)
                        {
                            var amountBB = ParseActionAmount(act, hand.Blinds);
                            if (amountBB >= 4.0) return "Raise4BB";
                            return "Raise2_3BB";
                        }
                        return "Raise";
                    }

                    if (act.Contains("bets")) return "Bet";
                    if (act.Contains("calls")) return "Call";
                    if (act.Contains("folds")) return "Fold";
                    if (act.Contains("checks")) return "Check";
                }
            }

            return "None";
        }

        private double ParseActionAmount(string act, string blinds)
        {
            var amountMatch = Regex.Match(act, @"to\s+(\d+\.?\d*)");
            if (amountMatch.Success)
            {
                var bb = ParseBigBlind(blinds);
                if (bb > 0 && double.TryParse(amountMatch.Groups[1].Value, out var amount))
                {
                    return amount / bb;
                }
            }
            return 0;
        }

        private string? NormalizeCards(string? cardsRaw)
        {
            if (string.IsNullOrEmpty(cardsRaw)) return null;

            var clean = cardsRaw.Replace(" ", "").Replace(",", "").Trim();
            if (clean.Length != 4) return null;

            var r1 = char.ToUpper(clean[0]);
            var s1 = clean[1];
            var r2 = char.ToUpper(clean[2]);
            var s2 = clean[3];

            var rankOrder = "AKQJT98765432";
            var i1 = rankOrder.IndexOf(r1);
            var i2 = rankOrder.IndexOf(r2);

            if (i1 == -1 || i2 == -1) return null;

            if (i1 > i2)
            {
                (r1, r2) = (r2, r1);
                (s1, s2) = (s2, s1);
            }

            if (r1 == r2) return $"{r1}{r2}";
            else if (s1 == s2) return $"{r1}{r2}s";
            else return $"{r1}{r2}o";
        }

        public class RangeHandSummary
        {
            public string Id { get; set; } = "";
            public DateTime Date { get; set; }
            public double Profit { get; set; }
            public double? Ev { get; set; }
            public string Action { get; set; } = "";
        }

        public class RangeHandStats
        {
            public string Hand { get; set; } = "";
            public int TotalCount { get; set; }
            public double TotalProfit { get; set; }
            public double TotalEv { get; set; }
            public Dictionary<string, int> Actions { get; set; } = new();
            public List<RangeHandSummary> Hands { get; set; } = new();
        }
    }
}
