from flask import Flask, request, jsonify
from flask_cors import CORS
from questionbankllm import QuestionAnalyzer
import traceback

app = Flask(__name__)
CORS(app)

# Initialize the analyzer
try:
    analyzer = QuestionAnalyzer()
    print("QuestionAnalyzer initialized successfully.")
except Exception as e:
    print(f"Error initializing QuestionAnalyzer: {e}")
    traceback.print_exc()

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        text = data.get('text', '')
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        print(f"Analyzing text: {text[:50]}...")
        result = analyzer.analyze(text)
        
        # Map the result to the format expected by the frontend
        response = {
            'source': result.source,
            'year': result.year,
            'question_number': result.question_number,
            'topic_id': result.topic_id,
            'topic_name': result.topic_name,
            'question_type': result.question_type,
            'correct_option': result.correct_option,
            'correct_option_text': result.correct_option_text,
            'match_confidence': result.match_confidence,
            'prompt': result.prompt,
            'answer_options': [
                {'label': opt.label, 'text': opt.text} for opt in result.answer_options
            ] if result.answer_options else []
        }
        
        return jsonify(response)
    except Exception as e:
        print(f"Error during analysis: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Flask server on port 5000...")
    app.run(port=5000, debug=True)
