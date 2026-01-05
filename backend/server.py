"""
Poker Tracker Pro - Python Backend
Fast equity calculations, database operations, and hand parsing
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from equity_calculator import EquityCalculator
from analysis_engine import AnalysisEngine
from database import get_database
from parsers import ParserFactory

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Initialize components
equity_calc = EquityCalculator()
analysis_engine = AnalysisEngine()

# Thread pool for parallel EV calculations
ev_executor = ThreadPoolExecutor(max_workers=8)


def get_db():
    """Get database instance"""
    return get_database()


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'status': 'running',
        'version': '2.0.0',
        'features': {
            'database': True,
            'parsers': ['Betclic'],
            'equity': True,
            'analysis': True
        }
    })


# ============ Parser Endpoints ============

@app.route('/parse/file', methods=['POST'])
def parse_file():
    """Parse a hand history file"""
    try:
        data = request.json
        content = data.get('content', '')
        room = data.get('room')
        
        if not content:
            return jsonify({'success': False, 'error': 'No content provided'}), 400
        
        if room:
            parser = ParserFactory.get_parser_by_room(room)
        else:
            parser = ParserFactory.get_parser(content)
        
        if not parser:
            return jsonify({'success': False, 'error': 'Could not detect hand history format'}), 400
        
        result = parser.parse_file(content)
        
        return jsonify({
            'success': result['success'],
            'room': parser.ROOM_NAME,
            'hands': result.get('hands', []),
            'count': result.get('count', 0),
            'error': result.get('error')
        })
    except Exception as e:
        logger.error(f"Parse error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/parse/detect', methods=['POST'])
def detect_format():
    """Detect the format of a hand history file"""
    try:
        data = request.json
        content = data.get('content', '')
        
        parser = ParserFactory.get_parser(content)
        
        if parser:
            return jsonify({'success': True, 'room': parser.ROOM_NAME, 'version': parser.PARSER_VERSION})
        else:
            return jsonify({'success': False, 'error': 'Unknown format'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _calculate_ev_for_hand(hand: dict) -> dict:
    """Calculate EV for a single hand (for parallel processing)"""
    # Skip if already calculated
    if hand.get('ev_chips') is not None:
        return hand

    if (hand.get('hero_all_in') or hand.get('villain_all_in')):
        if hand.get('hero_cards') and hand.get('villain_cards'):
            ev = equity_calc.calculate_all_in_ev(hand)
            hand['ev_chips'] = ev
    return hand


# ============ Database Endpoints ============

@app.route('/db/insert-hands', methods=['POST'])
def insert_hands():
    """Insert hands into database with parallel EV calculation"""
    try:
        data = request.json
        hands = data.get('hands', [])
        
        if not hands:
            return jsonify({'success': True, 'inserted': 0})
        
        # Filter hands that need EV calculation
        all_in_hands = [h for h in hands if 
                        (h.get('hero_all_in') or h.get('villain_all_in')) and
                        h.get('hero_cards') and h.get('villain_cards') and
                        h.get('ev_chips') is None]
        
        # Calculate EV in parallel for all-in hands
        if all_in_hands:
            # Process in batches for better memory management
            batch_size = 500
            for i in range(0, len(all_in_hands), batch_size):
                batch = all_in_hands[i:i + batch_size]
                futures = {ev_executor.submit(_calculate_ev_for_hand, h): h for h in batch}
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        logger.warning(f"EV calculation error: {e}")
        
        db = get_db()
        inserted = db.insert_hands_batch(hands)
        
        return jsonify({'success': True, 'inserted': inserted, 'total': len(hands)})
    except Exception as e:
        logger.error(f"Insert error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/hands', methods=['GET', 'POST'])
def get_hands():
    """Get hands with pagination"""
    try:
        if request.method == 'POST':
            options = request.json or {}
        else:
            options = {
                'page': request.args.get('page', 1, type=int),
                'limit': request.args.get('limit', 50, type=int),
                'dateFrom': request.args.get('dateFrom'),
                'dateTo': request.args.get('dateTo')
            }
        
        db = get_db()
        result = db.get_hands(options)
        
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        logger.error(f"Get hands error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/hand/<hand_id>', methods=['GET'])
def get_hand(hand_id: str):
    """Get a single hand by ID"""
    try:
        db = get_db()
        hand = db.get_hand_by_id(hand_id)
        
        if hand:
            return jsonify({'success': True, 'data': hand})
        else:
            return jsonify({'success': False, 'error': 'Hand not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/dashboard-stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        db = get_db()
        stats = db.get_dashboard_stats()
        return jsonify({'success': True, 'data': stats})
    except Exception as e:
        logger.error(f"Dashboard stats error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/session-history', methods=['GET', 'POST'])
def get_session_history():
    """Get session history"""
    try:
        limit = 50
        if request.method == 'POST':
            data = request.json or {}
            limit = data.get('limit', 50)
        else:
            limit = request.args.get('limit', 50, type=int)
        
        db = get_db()
        sessions = db.get_session_history(limit)
        return jsonify({'success': True, 'data': sessions})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/winrate-chart', methods=['GET', 'POST'])
def get_winrate_chart():
    """Get winrate chart data"""
    try:
        if request.method == 'POST':
            options = request.json or {}
        else:
            options = {
                'dateFrom': request.args.get('dateFrom'),
                'dateTo': request.args.get('dateTo')
            }
        
        db = get_db()
        data = db.get_winrate_chart_data(options)
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        logger.error(f"Winrate chart error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/range-heatmap', methods=['GET', 'POST'])
def get_range_heatmap():
    """Get range heatmap data"""
    try:
        filters = {}
        if request.method == 'POST':
            filters = request.json or {}
        
        db = get_db()
        heatmap = db.get_range_heatmap(filters)
        return jsonify({'success': True, 'data': heatmap})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/players', methods=['GET', 'POST'])
def get_players():
    """Get players overview"""
    try:
        options = {}
        if request.method == 'POST':
            options = request.json or {}
        else:
            limit = request.args.get('limit', type=int)
            if limit:
                options['limit'] = limit
        
        db = get_db()
        data = db.get_players_overview(options)
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/db/delete-all', methods=['POST'])
def delete_all_hands():
    """Delete all hands from database"""
    try:
        db = get_db()
        result = db.delete_all_hands()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============ Equity Endpoints ============

@app.route('/equity', methods=['POST'])
def calculate_equity():
    """Calculate equity for a given hand situation"""
    try:
        data = request.json
        hero_cards = data.get('heroCards')
        villain_cards = data.get('villainCards')
        board = data.get('board', '')
        iterations = data.get('iterations', 10000)
        
        if not hero_cards or not villain_cards:
            return jsonify({
                'success': False,
                'error': 'heroCards and villainCards are required'
            }), 400
        
        result = equity_calc.calculate(
            hero_cards=hero_cards,
            villain_cards=villain_cards,
            board=board,
            iterations=iterations
        )
        
        return jsonify({
            'success': True,
            'data': result
        })
        
    except Exception as e:
        logger.error(f"Equity calculation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/equity/batch', methods=['POST'])
def calculate_equity_batch():
    """Calculate equity for multiple hands at once"""
    try:
        data = request.json
        hands = data.get('hands', [])
        iterations = data.get('iterations', 5000)
        
        results = []
        total = len(hands)
        
        for i, hand in enumerate(hands):
            result = equity_calc.calculate(
                hero_cards=hand.get('heroCards'),
                villain_cards=hand.get('villainCards'),
                board=hand.get('board', ''),
                iterations=iterations
            )
            results.append({
                'id': hand.get('id'),
                **result
            })
            
            # Report progress
            progress = ((i + 1) / total) * 100
            logger.info(f"Batch progress: {progress:.1f}%")
        
        return jsonify({
            'success': True,
            'data': results,
            'processed': len(results)
        })
        
    except Exception as e:
        logger.error(f"Batch equity calculation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/analyze/leaks', methods=['POST'])
def analyze_leaks():
    """Run leak analysis on hand history"""
    try:
        data = request.json
        options = data.get('options', {})
        
        db = get_db()
        hands = db.get_all_hands_for_analysis()
        
        result = analysis_engine.detect_leaks(hands, options)
        
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        logger.error(f"Leak analysis error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/analyze/range', methods=['POST'])
def analyze_range():
    """Analyze range composition"""
    try:
        data = request.json
        position = data.get('position')
        action = data.get('action')
        stack = data.get('stack', 20)
        
        result = analysis_engine.analyze_range(position, action, stack)
        
        return jsonify({
            'success': True,
            'data': result
        })
        
    except Exception as e:
        logger.error(f"Range analysis error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def _recalc_ev_batch(hands_batch: list, db) -> list:
    """Recalculate EV for a batch of hands"""
    results = []
    for hand in hands_batch:
        if hand.get('hero_all_in') or hand.get('villain_all_in'):
            if hand.get('hero_cards') and hand.get('villain_cards'):
                ev = equity_calc.calculate_all_in_ev(hand)
                if ev is not None:
                    results.append({'id': hand['id'], 'ev_chips': ev})
    return results


@app.route('/recalculate-ev', methods=['POST'])
def recalculate_ev():
    """Recalculate EV for all hands with parallel processing"""
    try:
        db = get_db()
        hands = db.get_all_hands_for_analysis()
        
        # Filter hands that need EV calculation
        all_in_hands = [h for h in hands if 
                        (h.get('hero_all_in') or h.get('villain_all_in')) and
                        h.get('hero_cards') and h.get('villain_cards')]
        
        if not all_in_hands:
            return jsonify({'success': True, 'data': [], 'processed': 0})
        
        results = []
        
        # Process in parallel batches
        batch_size = 200
        futures = []
        
        for i in range(0, len(all_in_hands), batch_size):
            batch = all_in_hands[i:i + batch_size]
            future = ev_executor.submit(_recalc_ev_batch, batch, db)
            futures.append(future)
        
        # Collect results
        for future in as_completed(futures):
            try:
                batch_results = future.result()
                results.extend(batch_results)
            except Exception as e:
                logger.warning(f"Batch EV recalc error: {e}")
        
        # Update database
        for result in results:
            db.update_hand_ev(result['id'], result['ev_chips'])
        
        return jsonify({'success': True, 'data': results, 'processed': len(results)})
    except Exception as e:
        logger.error(f"EV recalculation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    logger.info(f"Starting Python backend on port {port}")
    logger.info("Available parsers: Betclic")
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)