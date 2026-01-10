import json

def create_stat(name, denom_conditions, num_conditions, player_count, min_stack, max_stack):
    # Add common parameters to all conditions
    params = {"PlayerCount": player_count}
    if min_stack is not None: params["MinStackBB"] = min_stack
    if max_stack is not None: params["MaxStackBB"] = max_stack

    for cond in denom_conditions:
        cond["parameters"] = {**cond.get("parameters", {}), **params}
    for cond in num_conditions:
        cond["parameters"] = {**cond.get("parameters", {}), **params}

    return {
        "Name": f"{name} ({player_count}w {min_stack or 0}-{max_stack or 'inf'}bb)",
        "Id": f"{name.lower().replace('/', '_').replace(' ', '_')}_{player_count}w_{min_stack or 0}_{max_stack or 'inf'}",
        "Definition": {
            "denominator": {
                "operator": "AND",
                "conditions": denom_conditions,
                "subGroups": []
            },
            "numerator": {
                "operator": "AND",
                "conditions": num_conditions,
                "subGroups": []
            }
        }
    }

stats = []
stack_depths = [
    (15, None, "15+"),
    (10, 15, "15-10"),
    (8, 10, "10-8"),
    (0, 6, "6-")
]

player_counts = [3, 2]

for pc in player_counts:
    for min_s, max_s, label in stack_depths:
        # Open/Fold (Facing a 3Bet after opening)
        stats.append(create_stat(f"Open/Fold {label}", 
            [{"street": "Preflop", "actor": "Hero", "action": "Raise"}, {"street": "Preflop", "actor": "Villain", "action": "Raise"}],
            [{"street": "Preflop", "actor": "Hero", "action": "Fold"}],
            pc, min_s, max_s))
        
        # Open/Call (Facing a 3Bet after opening)
        stats.append(create_stat(f"Open/Call {label}", 
            [{"street": "Preflop", "actor": "Hero", "action": "Raise"}, {"street": "Preflop", "actor": "Villain", "action": "Raise"}],
            [{"street": "Preflop", "actor": "Hero", "action": "Call"}],
            pc, min_s, max_s))

        # All in (Open Shove)
        stats.append(create_stat(f"All in {label}", 
            [{"street": "Preflop", "actor": "Hero", "action": "Any"}], 
            [{"street": "Preflop", "actor": "Hero", "action": "AllIn"}], # Strict All-In only
            pc, min_s, max_s))

        # Iso (Raise over a limper)
        stats.append(create_stat(f"Iso {label}", 
            [{"street": "Preflop", "actor": "Villain", "action": "Call"}], 
            [{"street": "Preflop", "actor": "Hero", "action": "Raise"}],
            pc, min_s, max_s))

        # Iso Fold (Fold to 3Bet after Iso)
        stats.append(create_stat(f"Iso Fold {label}", 
            [{"street": "Preflop", "actor": "Villain", "action": "Call"}, {"street": "Preflop", "actor": "Hero", "action": "Raise"}, {"street": "Preflop", "actor": "Villain", "action": "Raise"}],
            [{"street": "Preflop", "actor": "Hero", "action": "Fold"}],
            pc, min_s, max_s))

with open("custom_stats_import.json", "w") as f:
    json.dump(stats, f, indent=2)
