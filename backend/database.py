"""
Poker Tracker Pro - Database Module
SQLite database management for hand history storage and analysis
"""

import sqlite3
import os
import logging
from pathlib import Path
from typing import Optional, Dict, List, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class Database:
    """SQLite database for poker hand history"""
    
    def __init__(self, db_path: Optional[str] = None):
        """Initialize database connection"""
        if db_path is None:
            # Use backend/poker_tracker.db by default
            db_path = os.path.join(os.path.dirname(__file__), 'poker_tracker.db')
        
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._initialize_tables()
    
    def get_connection(self):
        """Get the database connection"""
        return self.conn
    
    def _initialize_tables(self):
        """Create database tables if they don't exist"""
        cursor = self.conn.cursor()
        
        # Config table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        
        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                room TEXT NOT NULL,
                game_type TEXT NOT NULL,
                hands_played INTEGER DEFAULT 0,
                profit REAL DEFAULT 0,
                ev_profit REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Hands table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hands (
                id TEXT PRIMARY KEY,
                session_id INTEGER,
                game_id TEXT,
                hand_id TEXT,
                room TEXT,
                game_mode TEXT,
                game_type TEXT,
                game_name TEXT,
                prize_pool REAL,
                multiplier INTEGER,
                buy_in REAL,
                date_time TEXT,
                table_id TEXT,
                blinds TEXT,
                total_pot REAL,
                rake REAL,
                hero_position TEXT,
                hero_stack INTEGER,
                hero_cards TEXT,
                villain_position TEXT,
                villain_stack INTEGER,
                villain_cards TEXT,
                preflop_action TEXT,
                flop TEXT,
                flop_action TEXT,
                turn TEXT,
                turn_action TEXT,
                river TEXT,
                river_action TEXT,
                showdown TEXT,
                result TEXT,
                hero_profit REAL,
                hero_all_in BOOLEAN DEFAULT 0,
                villain_all_in BOOLEAN DEFAULT 0,
                went_to_showdown BOOLEAN DEFAULT 0,
                leak_detected TEXT,
                error_type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        
        # Hands analytics table - calculated statistics separate from raw hand data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hands_analytics (
                hand_id TEXT PRIMARY KEY,
                ev_chips REAL,
                net_won_adjusted REAL,
                equity_preflop REAL,
                equity_flop REAL,
                equity_turn REAL,
                equity_river REAL,
                chips_won_showdown REAL,
                chips_won_no_showdown REAL,
                cev_contribution REAL,
                calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hand_id) REFERENCES hands(id)
            )
        """)
        
        # Players table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                total_hands INTEGER DEFAULT 0,
                total_profit REAL DEFAULT 0,
                total_ev_profit REAL DEFAULT 0,
                vpip REAL DEFAULT 0,
                pfr REAL DEFAULT 0,
                three_bet REAL DEFAULT 0,
                cbet REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Leaks table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS leaks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hand_id TEXT,
                player_id INTEGER,
                leak_type TEXT,
                severity TEXT,
                description TEXT,
                expected_action TEXT,
                actual_action TEXT,
                ev_loss REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hand_id) REFERENCES hands(id),
                FOREIGN KEY (player_id) REFERENCES players(id)
            )
        """)
        
        # Indexes for performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_hands_session ON hands(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_hands_date ON hands(date_time)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_hands_hero_position ON hands(hero_position)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_hands_game_id ON hands(game_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leaks_hand ON leaks(hand_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leaks_player ON leaks(player_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_analytics_hand ON hands_analytics(hand_id)")
        
        self.conn.commit()
    
    def insert_hand(self, hand: Dict[str, Any]) -> bool:
        """Insert a single hand into the database"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT INTO hands (
                    id, game_id, hand_id, room, game_mode, game_type, game_name,
                    prize_pool, multiplier, buy_in, date_time, table_id, blinds,
                    total_pot, rake, hero_position, hero_stack, hero_cards,
                    villain_position, villain_stack, villain_cards, preflop_action,
                    flop, flop_action, turn, turn_action, river, river_action,
                    showdown, result, hero_profit, hero_all_in, villain_all_in, went_to_showdown
                ) VALUES (
                    :id, :game_id, :hand_id, :room, :game_mode, :game_type, :game_name,
                    :prize_pool, :multiplier, :buy_in, :date_time, :table_id, :blinds,
                    :total_pot, :rake, :hero_position, :hero_stack, :hero_cards,
                    :villain_position, :villain_stack, :villain_cards, :preflop_action,
                    :flop, :flop_action, :turn, :turn_action, :river, :river_action,
                    :showdown, :result, :hero_profit, :hero_all_in, :villain_all_in, :went_to_showdown
                )
            """, {
                'id': hand.get('id'),
                'game_id': hand.get('game_id'),
                'hand_id': hand.get('hand_id'),
                'room': hand.get('room'),
                'game_mode': hand.get('game_mode'),
                'game_type': hand.get('game_type'),
                'game_name': hand.get('game_name'),
                'prize_pool': hand.get('prize_pool', 0),
                'multiplier': hand.get('multiplier', 1),
                'buy_in': hand.get('buy_in', 0),
                'date_time': hand.get('date_time'),
                'table_id': hand.get('table_id'),
                'blinds': hand.get('blinds'),
                'total_pot': hand.get('total_pot', 0),
                'rake': hand.get('rake', 0),
                'hero_position': hand.get('hero_position'),
                'hero_stack': hand.get('hero_stack', 0),
                'hero_cards': hand.get('hero_cards'),
                'villain_position': hand.get('villain_position'),
                'villain_stack': hand.get('villain_stack', 0),
                'villain_cards': hand.get('villain_cards'),
                'preflop_action': hand.get('preflop_action'),
                'flop': hand.get('flop'),
                'flop_action': hand.get('flop_action'),
                'turn': hand.get('turn'),
                'turn_action': hand.get('turn_action'),
                'river': hand.get('river'),
                'river_action': hand.get('river_action'),
                'showdown': hand.get('showdown'),
                'result': hand.get('result'),
                'hero_profit': hand.get('hero_profit', 0),
                'hero_all_in': 1 if hand.get('hero_all_in') else 0,
                'villain_all_in': 1 if hand.get('villain_all_in') else 0,
                'went_to_showdown': 1 if hand.get('went_to_showdown') else 0
            })
            return True
        except sqlite3.IntegrityError:
            # Hand already exists
            return False
    
    def insert_hands_batch(self, hands: List[Dict[str, Any]]) -> int:
        """Insert multiple hands in a transaction"""
        inserted = 0
        cursor = self.conn.cursor()
        
        try:
            cursor.execute("BEGIN TRANSACTION")
            for hand in hands:
                if self.insert_hand(hand):
                    inserted += 1
            cursor.execute("COMMIT")
        except Exception as e:
            cursor.execute("ROLLBACK")
            raise e
        
        return inserted
    
    def get_hand_by_id(self, hand_id: str) -> Optional[Dict[str, Any]]:
        """Get a single hand by ID"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM hands WHERE id = ?", (hand_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def get_hands(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Get hands with pagination and filtering"""
        options = options or {}
        page = options.get('page', 1)
        limit = options.get('limit', 50)
        offset = (page - 1) * limit
        
        cursor = self.conn.cursor()
        
        # Build WHERE clause
        where_clauses = []
        params = []
        
        if options.get('dateFrom'):
            where_clauses.append("date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) >= ?")
            params.append(options['dateFrom'])
        
        if options.get('dateTo'):
            where_clauses.append("date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) <= ?")
            params.append(options['dateTo'])
        
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        # Get total count
        cursor.execute(f"SELECT COUNT(*) as count FROM hands {where_sql}", params)
        total = cursor.fetchone()['count']
        
        # Get hands
        cursor.execute(f"""
            SELECT * FROM hands {where_sql}
            ORDER BY date_time DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset])
        
        hands = [dict(row) for row in cursor.fetchall()]
        
        return {
            'hands': hands,
            'total': total,
            'page': page,
            'totalPages': (total + limit - 1) // limit
        }
    
    def get_dashboard_stats(self) -> Dict[str, Any]:
        """Get dashboard statistics"""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                COUNT(*) as total_hands,
                COALESCE(SUM(hero_profit), 0) as total_profit,
                COALESCE(AVG(hero_profit), 0) as avg_profit,
                SUM(CASE WHEN hero_profit > 0 THEN 1 ELSE 0 END) as hands_won,
                SUM(CASE WHEN hero_profit < 0 THEN 1 ELSE 0 END) as hands_lost
            FROM hands
        """)
        stats = dict(cursor.fetchone())
        
        cursor.execute("""
            SELECT date_time, hero_profit, total_pot, hero_position, villain_position
            FROM hands
            ORDER BY date_time DESC
            LIMIT 100
        """)
        stats['recent_hands'] = [dict(row) for row in cursor.fetchall()]
        
        return stats
    
    def get_session_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get session history grouped by date"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT 
                date(date_time) as session_date,
                COUNT(*) as hands_played,
                SUM(hero_profit) as profit,
                room,
                game_type
            FROM hands
            GROUP BY date(date_time), room, game_type
            ORDER BY date_time DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_winrate_chart_data(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Get data for winrate chart"""
        options = options or {}
        date_from = options.get('dateFrom')
        date_to = options.get('dateTo')
        
        cursor = self.conn.cursor()
        
        # Build WHERE clause
        where_clauses = []
        params = []
        
        if date_from:
            where_clauses.append("date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) >= ?")
            params.append(date_from)
        
        if date_to:
            where_clauses.append("date(datetime(SUBSTR(date_time, 1, 19), '+1 hour')) <= ?")
            params.append(date_to)
        
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        # Get total hands
        cursor.execute(f"SELECT COUNT(*) as count FROM hands {where_sql}", params)
        total_hands = cursor.fetchone()['count']
        
        if total_hands == 0:
            return {
                'labels': [],
                'wonWithoutShowdown': [],
                'realWin': [],
                'wonWithShowdown': [],
                'theoricalWin': [],
                'stats': {
                    'tournaments': 0,
                    'cevSpinPro': 0,
                    'netWon': 0,
                    'netAdjusted': 0
                }
            }
        
        # Get hands ordered by date with analytics
        cursor.execute(f"""
            SELECT 
                h.id, h.hand_id, h.hero_profit, h.showdown, h.went_to_showdown, h.hero_position, h.hero_cards,
                h.villain_cards, h.total_pot, h.rake, h.preflop_action, h.flop, h.flop_action,
                h.turn, h.turn_action, h.river, h.river_action, h.hero_all_in, h.game_id,
                h.buy_in, h.prize_pool, h.result,
                a.ev_chips, a.net_won_adjusted, a.chips_won_showdown, a.chips_won_no_showdown
            FROM hands h
            LEFT JOIN hands_analytics a ON h.id = a.hand_id
            {where_sql}
            ORDER BY 
                CASE WHEN h.date_time IS NULL OR h.date_time = '' THEN 1 ELSE 0 END,
                h.date_time ASC, h.rowid ASC
        """, params)
        
        labels = []
        won_without_showdown = []
        real_win = []
        won_with_showdown = []
        theorical_win = []
        
        cumulative_real = 0
        cumulative_no_sd = 0
        cumulative_sd = 0
        cumulative_ev = 0
        
        tournaments = set()
        tournament_results = {}
        
        max_points = 2000
        step = max(1, total_hands // max_points)
        processed_count = 0
        
        for row in cursor.fetchall():
            hand = dict(row)
            profit = hand['hero_profit'] or 0
            
            cumulative_real += profit
            
            # Determine if went to showdown (PT4/Hand2Note standard)
            # went_to_showdown = True when hero showed cards at showdown
            is_showdown = bool(hand.get('went_to_showdown'))
            
            # Split chips won by showdown vs no showdown
            if is_showdown:
                cumulative_sd += profit
            else:
                cumulative_no_sd += profit
            
            # For EV calculation (Net Won Adjusted):
            # Use net_won_adjusted from analytics if available, otherwise use actual profit
            # net_won_adjusted already handles:
            # - All-in with known villain cards: EV-based calculation
            # - All-in with unknown villain cards: actual profit
            # - Non all-in: actual profit
            ev_profit = hand['net_won_adjusted'] if hand['net_won_adjusted'] is not None else profit
            
            cumulative_ev += ev_profit
            
            # Only push data points according to step
            if processed_count % step == 0 or processed_count == total_hands - 1:
                labels.append(processed_count + 1)
                real_win.append(cumulative_real)
                won_without_showdown.append(cumulative_no_sd)
                won_with_showdown.append(cumulative_sd)
                theorical_win.append(cumulative_ev)
            
            # Tournament tracking
            if hand['game_id']:
                tournaments.add(hand['game_id'])
                if hand['game_id'] not in tournament_results:
                    tournament_results[hand['game_id']] = {
                        'buyIn': hand['buy_in'] or 0,
                        'prizePool': hand['prize_pool'] or 0,
                        'won': 0,
                        'profitChips': 0,
                        'evChips': 0
                    }
                
                tournament_results[hand['game_id']]['profitChips'] += profit
                tournament_results[hand['game_id']]['evChips'] += ev_profit
            
            processed_count += 1
        
        # Calculate final stats
        total_tournaments = len(tournaments)
        
        # Stats calculation
        # CEV SpinnPro = average EV per tournament
        cev_spin_pro = round(cumulative_ev / total_tournaments) if total_tournaments > 0 else 0
        
        stats = {
            'tournaments': total_tournaments,
            'cevSpinPro': cev_spin_pro,
            'netWon': round(cumulative_real),  # Actual chips won
            'netAdjusted': round(cumulative_ev),  # EV-adjusted chips won
            'chipsWonShowdown': round(cumulative_sd),
            'chipsWonNoShowdown': round(cumulative_no_sd)
        }
        
        return {
            'labels': labels,
            'wonWithoutShowdown': won_without_showdown,
            'realWin': real_win,
            'wonWithShowdown': won_with_showdown,
            'theoricalWin': theorical_win,
            'stats': stats
        }
    
    def get_range_heatmap(self, filters: Dict[str, Any] = None) -> Dict[str, Dict[str, int]]:
        """Generate a 13x13 heatmap of played ranges"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT hero_cards FROM hands WHERE hero_cards IS NOT NULL")
        
        ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
        matrix = {}
        
        for r1 in ranks:
            for r2 in ranks:
                key = f"{r1}{r2}" if r1 >= r2 else f"{r2}{r1}"
                if key not in matrix:
                    matrix[key] = {'suited': 0, 'offsuit': 0, 'pair': 0}
        
        for row in cursor.fetchall():
            hero_cards = row['hero_cards']
            if not hero_cards:
                continue
            
            cards = hero_cards.replace('[', '').replace(']', '').split()
            if len(cards) != 2:
                continue
            
            rank1, suit1 = cards[0][0], cards[0][1]
            rank2, suit2 = cards[1][0], cards[1][1]
            
            key = f"{rank1}{rank2}" if rank1 >= rank2 else f"{rank2}{rank1}"
            
            if rank1 == rank2:
                matrix[key]['pair'] += 1
            elif suit1 == suit2:
                matrix[key]['suited'] += 1
            else:
                matrix[key]['offsuit'] += 1
        
        return matrix
    
    def get_players_overview(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Get overview of all players encountered"""
        options = options or {}
        limit = options.get('limit', 200)
        
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT preflop_action, date_time, hero_profit
            FROM hands
            WHERE preflop_action IS NOT NULL AND preflop_action != ''
        """)
        
        # Find hero name (most frequent player)
        counts = {}
        for row in cursor.fetchall():
            names = self._extract_players_from_preflop(row['preflop_action'])
            for name in names:
                counts[name] = counts.get(name, 0) + 1
        
        if not counts:
            return {'heroName': None, 'players': []}
        
        hero_name = max(counts, key=counts.get)
        
        # Aggregate opponents
        players_map = {}
        
        cursor.execute("""
            SELECT preflop_action, date_time, hero_profit
            FROM hands
            WHERE preflop_action IS NOT NULL AND preflop_action != ''
            ORDER BY date_time DESC
        """)
        
        for row in cursor.fetchall():
            names = self._extract_players_from_preflop(row['preflop_action'])
            is_hu = len(names) == 2
            
            for name in names:
                if name == hero_name:
                    continue
                
                if name not in players_map:
                    players_map[name] = {
                        'name': name,
                        'handsSeen': 0,
                        'handsHu': 0,
                        'profitHu': 0,
                        'lastSeen': None
                    }
                
                players_map[name]['handsSeen'] += 1
                players_map[name]['lastSeen'] = row['date_time']
                
                if is_hu and hero_name in names:
                    players_map[name]['handsHu'] += 1
                    players_map[name]['profitHu'] += row['hero_profit'] or 0
        
        players = sorted(players_map.values(), 
                        key=lambda x: (x['handsSeen'], x['handsHu']), 
                        reverse=True)[:limit]
        
        return {'heroName': hero_name, 'players': players}
    
    def _extract_players_from_preflop(self, preflop_action: str) -> List[str]:
        """Extract player names from preflop action text"""
        import re
        players = set()
        for line in preflop_action.strip().split('\n'):
            match = re.match(r'^\d{2}:\d{2}:\d{2} - (.*?):', line)
            if match:
                players.add(match.group(1).strip())
        return list(players)
    
    def delete_all_hands(self) -> Dict[str, Any]:
        """Delete all hands from the database"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM hands")
            count = cursor.fetchone()['count']
            
            cursor.execute("DELETE FROM hands")
            cursor.execute("DELETE FROM hands_analytics")
            cursor.execute("DELETE FROM sessions")
            cursor.execute("DELETE FROM leaks")
            cursor.execute("""
                UPDATE players 
                SET total_hands = 0, total_profit = 0, total_ev_profit = 0
            """)
            
            self.conn.commit()
            
            return {
                'success': True,
                'deletedCount': count,
                'message': f'{count} mains supprimées avec succès'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def insert_hand_analytics(self, analytics: Dict[str, Any]) -> bool:
        """Insert or update analytics for a hand"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO hands_analytics (
                    hand_id, ev_chips, net_won_adjusted, equity_preflop,
                    equity_flop, equity_turn, equity_river,
                    chips_won_showdown, chips_won_no_showdown, cev_contribution,
                    calculated_at
                ) VALUES (
                    :hand_id, :ev_chips, :net_won_adjusted, :equity_preflop,
                    :equity_flop, :equity_turn, :equity_river,
                    :chips_won_showdown, :chips_won_no_showdown, :cev_contribution,
                    CURRENT_TIMESTAMP
                )
            """, {
                'hand_id': analytics.get('hand_id'),
                'ev_chips': analytics.get('ev_chips'),
                'net_won_adjusted': analytics.get('net_won_adjusted'),
                'equity_preflop': analytics.get('equity_preflop'),
                'equity_flop': analytics.get('equity_flop'),
                'equity_turn': analytics.get('equity_turn'),
                'equity_river': analytics.get('equity_river'),
                'chips_won_showdown': analytics.get('chips_won_showdown'),
                'chips_won_no_showdown': analytics.get('chips_won_no_showdown'),
                'cev_contribution': analytics.get('cev_contribution')
            })
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error inserting analytics: {e}")
            return False
    
    def insert_analytics_batch(self, analytics_list: List[Dict[str, Any]]) -> int:
        """Insert multiple hand analytics in a transaction"""
        inserted = 0
        cursor = self.conn.cursor()
        
        try:
            for analytics in analytics_list:
                cursor.execute("""
                    INSERT OR REPLACE INTO hands_analytics (
                        hand_id, ev_chips, net_won_adjusted, equity_preflop,
                        equity_flop, equity_turn, equity_river,
                        chips_won_showdown, chips_won_no_showdown, cev_contribution,
                        calculated_at
                    ) VALUES (
                        :hand_id, :ev_chips, :net_won_adjusted, :equity_preflop,
                        :equity_flop, :equity_turn, :equity_river,
                        :chips_won_showdown, :chips_won_no_showdown, :cev_contribution,
                        CURRENT_TIMESTAMP
                    )
                """, {
                    'hand_id': analytics.get('hand_id'),
                    'ev_chips': analytics.get('ev_chips'),
                    'net_won_adjusted': analytics.get('net_won_adjusted'),
                    'equity_preflop': analytics.get('equity_preflop'),
                    'equity_flop': analytics.get('equity_flop'),
                    'equity_turn': analytics.get('equity_turn'),
                    'equity_river': analytics.get('equity_river'),
                    'chips_won_showdown': analytics.get('chips_won_showdown'),
                    'chips_won_no_showdown': analytics.get('chips_won_no_showdown'),
                    'cev_contribution': analytics.get('cev_contribution')
                })
                inserted += 1
            self.conn.commit()
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Error inserting analytics batch: {e}")
            raise e
        
        return inserted
    
    def delete_all_analytics(self):
        """Delete all analytics data"""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM hands_analytics")
        self.conn.commit()
    
    def get_all_hands_for_analysis(self) -> List[Dict[str, Any]]:
        """Get all hands for leak analysis"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM hands")
        return [dict(row) for row in cursor.fetchall()]
    
    def close(self):
        """Close database connection"""
        self.conn.close()


# Singleton instance
_db_instance = None

def get_database() -> Database:
    """Get or create database instance"""
    global _db_instance
    if _db_instance is None:
        _db_instance = Database()
    return _db_instance
