from flask import Flask, request, jsonify
from flask_cors import CORS
from questionbankllm import QuestionAnalyzer
import traceback


def extract_field(record, *names):
    """Attempt to pull the first non-None attribute/key from the record."""

    for name in names:
        value = None
        if isinstance(record, dict) and name in record:
            value = record[name]
        elif hasattr(record, name):
            value = getattr(record, name)
        if value is not None:
            return value
    return None


def serialize_answer_options(record):
    raw = extract_field(record, 'answer_options', 'answerOptions') or []
    serialized = []
    for idx, option in enumerate(raw):
        if option is None:
            continue
        label = extract_field(option, 'label', 'option', 'id', 'key')
        text = extract_field(option, 'text', 'value', 'content', 'body')
        serialized.append({
            'label': label or chr(ord('A') + idx),
            'text': (text or '').strip()
        })
    return serialized


def serialize_question(record):
    if record is None:
        return {}

    return {
        'source': extract_field(record, 'source', 'Source'),
        'year': extract_field(record, 'year', 'Year'),
        'paper': extract_field(record, 'paper', 'Paper'),
        'question_number': extract_field(record, 'question_number', 'questionNumber'),
        'topic_id': extract_field(record, 'topic_id', 'topicId'),
        'topic_name': extract_field(record, 'topic_name', 'topicName'),
        'question_type': extract_field(record, 'question_type', 'questionType'),
        'correct_option': extract_field(record, 'correct_option', 'correctOption'),
        'correct_option_text': extract_field(record, 'correct_option_text', 'correctOptionText'),
        'match_confidence': extract_field(record, 'match_confidence', 'matchConfidence'),
        'matched_dataset_id': extract_field(record, 'matched_dataset_id', 'matchedDatasetId'),
        'prompt': extract_field(record, 'prompt', 'question', 'rawPrompt'),
        'answer_options': serialize_answer_options(record),
        'structured_answer': extract_field(record, 'structured_answer', 'structuredAnswer'),
        'dataset_topics': extract_field(record, 'dataset_topics', 'datasetTopics')
    }


def coerce_question_sequence(result):
    if result is None:
        return []
    if isinstance(result, (list, tuple)):
        return list(result)
    container = extract_field(result, 'questions', 'items', 'results', 'entries')
    if isinstance(container, (list, tuple)):
        return list(container)
    return [result]

app = Flask(__name__)
CORS(app)

analyzer = None
try:
    analyzer = QuestionAnalyzer()
    print("QuestionAnalyzer initialized successfully.")
except Exception as e:
    print(f"Error initializing QuestionAnalyzer: {e}")
    traceback.print_exc()

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        if analyzer is None:
            return jsonify({'error': 'Analyzer is not ready on the server. Check server logs for initialization errors.'}), 503
        data = request.json
        text = data.get('text', '')
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        print(f"Analyzing text: {text[:50]}...")
        result = analyzer.analyze(text)
        return jsonify(serialize_question(result))
    except Exception as e:
        print(f"Error during analysis: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/analyze-file', methods=['POST'])
def analyze_file():
    try:
        if analyzer is None:
            return jsonify({'error': 'Analyzer is not ready on the server. Check server logs for initialization errors.'}), 503
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        uploaded = request.files['file']
        filename = uploaded.filename or 'uploaded-file'
        payload = uploaded.read()

        if not payload:
            return jsonify({'error': 'Uploaded file is empty'}), 400

        if not hasattr(analyzer, 'analyze_file_content'):
            return jsonify({
                'error': 'analyze_file_content is unavailable in this QuestionAnalyzer build. '
                         'Please upgrade the QuestionBankLLM package or run pip install --upgrade '
                         'git+https://github.com/Revampes/QuestionBankLLM.git',
                'requires_update': True
            }), 501

        print(f"Analyzing file upload: {filename} ({len(payload)} bytes)")
        raw_result = analyzer.analyze_file_content(payload, filename)
        questions = [serialize_question(item) for item in coerce_question_sequence(raw_result)]

        return jsonify({
            'file_name': filename,
            'question_count': len(questions),
            'questions': questions
        })
    except Exception as e:
        print(f"Error during file analysis: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Flask server on port 5000...")
    app.run(port=5000, debug=True)
