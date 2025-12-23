(function () {
    class QuestionAIClient {
        constructor() {
            this.apiUrl = 'http://localhost:5000';
        }

        async analyze(text) {
            try {
                const response = await fetch(`${this.apiUrl}/analyze`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text })
                });
                
                if (!response.ok) {
                    throw new Error(`API Error: ${response.statusText}`);
                }
                
                const data = await response.json();
                return this.adaptResponse(data);
            } catch (error) {
                console.error('Analysis failed:', error);
                throw error;
            }
        }

        setDatasetFromCache(cache) {
            // The backend currently handles its own dataset or doesn't support dynamic updates yet.
            // This is a no-op to satisfy the interface expected by app.js.
            console.log('setDatasetFromCache called - using backend QuestionAnalyzer');
        }

        adaptResponse(data) {
            // Adapt backend response to match what app.js expects
            return {
                source: data.source,
                year: data.year,
                paper: null, // Backend might not return paper, or it's part of source?
                questionNumber: data.question_number,
                topicName: data.topic_name,
                questionType: data.question_type,
                prompt: data.prompt,
                answerOptions: data.answer_options,
                correctOption: data.correct_option,
                structuredAnswer: null, // Backend doesn't seem to return structured answer for non-MCQ yet
                matchedDatasetId: null, // Backend handles matching internally
                matchConfidence: data.match_confidence
            };
        }
    }

    // Expose the client to the window
    window.QuestionAIClient = QuestionAIClient;
    window.questionAI = new QuestionAIClient();
})();
