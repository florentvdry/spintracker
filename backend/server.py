"""
Poker Tracker Pro - Python Backend
Fast equity calculations, database operations, and hand parsing
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from equity_calculator import EquityCalculator
from analytics_calculator import AnalyticsCalculator
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
analytics_calc = AnalyticsCalculator()
analysis_engine = AnalysisEngine()

# Thread pool for parallel calculations
calc_executor = ThreadPoolExecutor(max_workers=8)


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


def _calculate_analytics_for_hand(hand: dict) -> dict:
    """Calculate analytics for a single hand (for parallel processing)"""
    return analytics_calc.calculate_hand_analytics(hand)


# ============ Database Endpoints ============

@app.route('/db/insert-hands', methods=['POST'])
def insert_hands():
    """Insert hands into database and calculate analytics in parallel"""
    try:
        data = request.json
        hands = data.get('hands', [])
        
        if not hands:
            return jsonify({'success': True, 'inserted': 0})
        
        # First, insert raw hand data (parsing results only)
        db = get_db()
        inserted = db.insert_hands_batch(hands)
        
        # Then calculate and insert analytics separately
        # This allows us to recalculate analytics later without re-parsing
        analytics_list = []
        
        # Calculate analytics in parallel
        batch_size = 100
        for i in range(0, len(hands), batch_size):
            batch = hands[i:i + batch_size]
            futures = {calc_executor.submit(_calculate_analytics_for_hand, h): h for h in batch}
            for future in as_completed(futures):
                try:
                    analytics = future.result()
                    analytics_list.append(analytics)
                except Exception as e:
                    logger.warning(f"Analytics calculation error: {e}")
        
        # Insert analytics
        if analytics_list:
            db.insert_analytics_batch(analytics_list)
        
        return jsonify({
            'success': True,
            'inserted': inserted,
            'total': len(hands),
            'analytics_calculated': len(analytics_list)
        })
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


@app.route('/recalculate-analytics', methods=['POST'])
def recalculate_analytics():
    """Recalculate all analytics from raw hand data with parallel processing"""
    try:
        db = get_db()
        
        # Delete existing analytics
        db.delete_all_analytics()
        
        # Get all raw hands
        hands = db.get_all_hands_for_analysis()
        
        if not hands:
            return jsonify({'success': True, 'data': [], 'processed': 0})
        
        logger.info(f"Recalculating analytics for {len(hands)} hands...")
        
        analytics_list = []
        
        # Process in parallel batches
        batch_size = 100
        processed = 0
        
        for i in range(0, len(hands), batch_size):
            batch = hands[i:i + batch_size]
            futures = {calc_executor.submit(_calculate_analytics_for_hand, h): h for h in batch}
            
            for future in as_completed(futures):
                try:
                    analytics = future.result()
                    analytics_list.append(analytics)
                    processed += 1
                    
                    # Log progress every 100 hands
                    if processed % 100 == 0:
                        logger.info(f"Progress: {processed}/{len(hands)} hands processed")
                except Exception as e:
                    logger.warning(f"Analytics calculation error: {e}")
        
        # Insert all analytics
        if analytics_list:
            inserted = db.insert_analytics_batch(analytics_list)
            logger.info(f"Inserted {inserted} analytics records")
        
        return jsonify({
            'success': True,
            'processed': len(analytics_list),
            'total_hands': len(hands)
        })
    except Exception as e:
        logger.error(f"Analytics recalculation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    logger.info(f"Starting Python backend on port {port}")
    logger.info("Available parsers: Betclic")
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)