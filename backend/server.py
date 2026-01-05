"""
Poker Tracker Pro - Python Backend
Fast equity calculations using optimized libraries
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from equity_calculator import EquityCalculator
from analysis_engine import AnalysisEngine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Initialize calculators
equity_calc = EquityCalculator()
analysis_engine = AnalysisEngine()

# Progress callback for long operations
progress_callbacks = {}

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'status': 'running',
        'version': '1.0.0',
        'libraries': {
            'treys': True,
            'numpy': True
        }
    })

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
        hands = data.get('hands', [])
        options = data.get('options', {})
        
        result = analysis_engine.detect_leaks(hands, options)
        
        return jsonify({
            'success': True,
            'data': result
        })
        
    except Exception as e:
        logger.error(f"Leak analysis error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

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

@app.route('/recalculate-ev', methods=['POST'])
def recalculate_ev():
    """Recalculate EV for all hands"""
    try:
        data = request.json
        hands = data.get('hands', [])
        
        results = []
        total = len(hands)
        
        for i, hand in enumerate(hands):
            if hand.get('hero_all_in') or hand.get('villain_all_in'):
                # Calculate EV for all-in situations
                ev = equity_calc.calculate_all_in_ev(hand)
                results.append({
                    'id': hand.get('id'),
                    'ev_chips': ev
                })
            
            # Progress logging
            if (i + 1) % 100 == 0:
                progress = ((i + 1) / total) * 100
                logger.info(f"EV recalculation: {progress:.1f}% ({i+1}/{total})")
        
        return jsonify({
            'success': True,
            'data': results,
            'processed': len(results)
        })
        
    except Exception as e:
        logger.error(f"EV recalculation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    logger.info(f"Starting Python backend on port {port}")
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)
