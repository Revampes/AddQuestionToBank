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
                    const errorText = await response.text();
                    throw new Error(`API Error: ${response.status} ${errorText}`);
                }
                
                const data = await response.json();
                return this.adaptResponse(data);
            } catch (error) {
                console.error('Analysis failed:', error);
                throw error;
            }
        }

        async analyzeFile(file) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(`${this.apiUrl}/analyze-file`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Error: ${response.status} ${errorText}`);
                }

                const data = await response.json();
                const questions = Array.isArray(data.questions)
                    ? data.questions.map((entry) => this.adaptResponse(entry))
                    : [this.adaptResponse(data)];

                return {
                    fileName: data.file_name || file.name,
                    questionCount: data.question_count || questions.length,
                    questions: questions.filter(Boolean)
                };
            } catch (error) {
                console.error('File analysis failed:', error);
                throw error;
            }
        }

        setDatasetFromCache(cache) {
            // The backend currently handles its own dataset or doesn't support dynamic updates yet.
            // This is a no-op to satisfy the interface expected by app.js.
            console.log('setDatasetFromCache called - using backend QuestionAnalyzer');
        }

        adaptResponse(data) {
            if (!data) {
                return null;
            }

            const rawOptions = data.answer_options || data.answerOptions || [];
            const answerOptions = rawOptions.map(option => ({
                label: option.label,
                text: option.text
            }));

            return {
                source: data.source,
                year: data.year,
                paper: data.paper || null,
                questionNumber: data.question_number ?? data.questionNumber ?? null,
                topicId: data.topic_id ?? data.topicId ?? null,
                topicName: data.topic_name ?? data.topicName ?? null,
                questionType: data.question_type ?? data.questionType ?? null,
                prompt: data.prompt || data.rawPrompt || null,
                answerOptions,
                correctOption: data.correct_option ?? data.correctOption ?? null,
                correctOptionText: data.correct_option_text ?? data.correctOptionText ?? null,
                structuredAnswer: data.structured_answer ?? data.structuredAnswer ?? null,
                matchedDatasetId: data.matched_dataset_id ?? data.matchedDatasetId ?? null,
                matchConfidence: data.match_confidence ?? data.matchConfidence ?? null,
                matchMetadata: data.match_metadata ?? data.matchMetadata ?? null,
                datasetTopics: data.dataset_topics ?? data.datasetTopics ?? null
            };
        }
    }

    // Expose the client to the window
    window.QuestionAIClient = QuestionAIClient;
    window.questionAI = new QuestionAIClient();
})();
