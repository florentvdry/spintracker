"""
Generate complete preflop equity lookup table.
This will take some time but only needs to run once.
"""
import itertools
import pickle
import os
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
import time

try:
    from treys import Card, Evaluator, Deck
    TREYS_AVAILABLE = True
except ImportError:
    TREYS_AVAILABLE = False
    print("Treys not available!")
    exit(1)

RANKS = 'AKQJT98765432'
SUITS = 'shdc'

def get_hand_type(card1: str, card2: str) -> str:
    """Get hand type from two cards"""
    r1, s1 = card1[0], card1[1]
    r2, s2 = card2[0], card2[1]
    
    # Order by rank (higher first)
    if RANKS.index(r1) > RANKS.index(r2):
        r1, r2, s1, s2 = r2, r1, s2, s1
    
    if r1 == r2:
        return f"{r1}{r2}"
    elif s1 == s2:
        return f"{r1}{r2}s"
    else:
        return f"{r1}{r2}o"


def calculate_equity_for_matchup(args):
    """Calculate exact equity for one hand type matchup"""
    hero_type, villain_type = args
    
    evaluator = Evaluator()
    
    # Generate representative hands for each type
    hero_hands = generate_hands_for_type(hero_type)
    villain_hands = generate_hands_for_type(villain_type)
    
    total_equity = 0.0
    total_matchups = 0
    
    for hero in hero_hands:
        hero_cards = [Card.new(hero[0]), Card.new(hero[1])]
        hero_set = set(hero_cards)
        
        for villain in villain_hands:
            villain_cards = [Card.new(villain[0]), Card.new(villain[1])]
            
            # Skip if cards overlap
            if any(c in hero_set for c in villain_cards):
                continue
            
            # Calculate equity
            dead = set(hero_cards + villain_cards)
            deck = [c for c in Deck().cards if c not in dead]
            
            wins = 0
            ties = 0
            total = 0
            
            for board in itertools.combinations(deck, 5):
                board_list = list(board)
                h_score = evaluator.evaluate(board_list, hero_cards)
                v_score = evaluator.evaluate(board_list, villain_cards)
                
                if h_score < v_score:
                    wins += 1
                elif h_score == v_score:
                    ties += 1
                total += 1
            
            if total > 0:
                total_equity += (wins + ties * 0.5) / total * 100
                total_matchups += 1
    
    if total_matchups > 0:
        return (hero_type, villain_type, total_equity / total_matchups)
    return None


def generate_hands_for_type(hand_type: str) -> list:
    """Generate all specific hands for a hand type"""
    hands = []
    
    if len(hand_type) == 2:  # Pair (e.g., "AA")
        rank = hand_type[0]
        for s1, s2 in itertools.combinations(SUITS, 2):
            hands.append((f"{rank}{s1}", f"{rank}{s2}"))
    elif hand_type.endswith('s'):  # Suited
        r1, r2 = hand_type[0], hand_type[1]
        for suit in SUITS:
            hands.append((f"{r1}{suit}", f"{r2}{suit}"))
    else:  # Offsuit
        r1, r2 = hand_type[0], hand_type[1]
        for s1, s2 in itertools.product(SUITS, SUITS):
            if s1 != s2:
                hands.append((f"{r1}{s1}", f"{r2}{s2}"))
    
    return hands


def generate_all_hand_types():
    """Generate all 169 hand types"""
    types = []
    for i, r1 in enumerate(RANKS):
        for j, r2 in enumerate(RANKS):
            if i < j:
                types.append(f"{r1}{r2}s")
                types.append(f"{r1}{r2}o")
            elif i == j:
                types.append(f"{r1}{r2}")
    return types


if __name__ == '__main__':
    print("Generating complete preflop equity table...")
    print("This will take several hours. Results are saved incrementally.")
    
    hand_types = generate_all_hand_types()
    print(f"Hand types: {len(hand_types)}")
    
    # Generate all unique matchups (avoid duplicates)
    matchups = []
    for i, h1 in enumerate(hand_types):
        for h2 in hand_types[i:]:  # Only pairs where h1 <= h2 to avoid duplicates
            matchups.append((h1, h2))
    
    print(f"Total matchups to calculate: {len(matchups)}")
    
    # Load existing results if any
    results_file = 'preflop_equity_table.pkl'
    if os.path.exists(results_file):
        with open(results_file, 'rb') as f:
            equity_table = pickle.load(f)
        print(f"Loaded {len(equity_table)} existing results")
    else:
        equity_table = {}
    
    # Filter out already computed matchups
    remaining = [(h, v) for h, v in matchups if f"{h}_{v}" not in equity_table]
    print(f"Remaining matchups: {len(remaining)}")
    
    if not remaining:
        print("All matchups already calculated!")
    else:
        start_time = time.time()
        completed = 0
        
        # Process in parallel (use fewer workers to avoid memory issues)
        with ProcessPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(calculate_equity_for_matchup, m): m for m in remaining[:100]}  # Start with batch
            
            for future in as_completed(futures):
                result = future.result()
                if result:
                    h, v, eq = result
                    equity_table[f"{h}_{v}"] = round(eq, 2)
                    completed += 1
                    
                    if completed % 10 == 0:
                        elapsed = time.time() - start_time
                        rate = completed / elapsed
                        remaining_count = len(remaining) - completed
                        eta = remaining_count / rate if rate > 0 else 0
                        print(f"Completed {completed}/{len(remaining)} ({rate:.1f}/s, ETA: {eta/3600:.1f}h)")
                        
                        # Save incrementally
                        with open(results_file, 'wb') as f:
                            pickle.dump(equity_table, f)
        
        # Final save
        with open(results_file, 'wb') as f:
            pickle.dump(equity_table, f)
    
    # Export as Python dict
    print("\n\nExporting as Python code...")
    with open('preflop_equity_dict.py', 'w') as f:
        f.write("PREFLOP_EQUITY_COMPLETE = {\n")
        for key in sorted(equity_table.keys()):
            f.write(f"    '{key}': {equity_table[key]},\n")
        f.write("}\n")
    
    print(f"Done! Total entries: {len(equity_table)}")
