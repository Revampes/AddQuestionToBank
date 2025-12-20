(function () {
    const TOPIC_KEYWORDS_URL = 'https://raw.githubusercontent.com/Revampes/QuestionBankLLM/main/data/topics.json';

    class QuestionAIClient {
        constructor() {
            this.topics = [];
            this.topicLookup = {};
            this.datasetRecords = [];
            this.vectorCache = [];
            this.matchThreshold = 0.65;
            this.topicsLoaded = false;
            this.topicsPromise = null;
        }

        async ensureTopicsLoaded() {
            if (this.topicsLoaded) {
                return;
            }
            if (!this.topicsPromise) {
                this.topicsPromise = this.fetchTopics();
            }
            await this.topicsPromise;
        }

        async fetchTopics() {
            try {
                const response = await fetch(TOPIC_KEYWORDS_URL, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const payload = await response.json();
                this.topics = Array.isArray(payload) ? payload : [];
            } catch (error) {
                console.warn('QuestionAIClient: failed to fetch topic keywords, using fallback list only.', error);
                this.topics = (Array.isArray(window.TOPICS) ? window.TOPICS : []).map(topic => ({
                    id: topic.id || topic.file || topic.name,
                    name: topic.name,
                    keywords: [topic.name.toLowerCase()]
                }));
            }
            this.topicLookup = {};
            this.topics.forEach(topic => {
                if (topic && topic.name) {
                    this.topicLookup[topic.name.toLowerCase()] = topic;
                }
            });
            this.topicsLoaded = true;
        }

        setDatasetFromCache(cache) {
            this.datasetRecords = [];
            this.vectorCache = [];
            if (!cache || typeof cache !== 'object') {
                return;
            }
            Object.keys(cache).forEach(fileName => {
                const entry = cache[fileName];
                const content = entry && entry.content;
                if (!content || !Array.isArray(content.questions)) {
                    return;
                }
                const topicName = (content.metadata && content.metadata.topic) || fileName.replace(/\.json$/i, '');
                content.questions.forEach((question, index) => {
                    const record = this.buildRecord(question, topicName, fileName, index);
                    if (record.combinedText) {
                        this.datasetRecords.push(record);
                    }
                });
            });
            this.vectorCache = this.datasetRecords.map(record => ({
                record,
                vector: this.vectorize(record.combinedText)
            }));
        }

        buildRecord(question, topicName, fileName, index) {
            const safeQuestion = question || {};
            const options = Array.isArray(safeQuestion.options)
                ? safeQuestion.options.map(opt => ({
                    label: (opt.option || opt.label || '?').toString().trim().toUpperCase(),
                    text: this.stripHtml((opt.content || opt.text || '').toString().trim())
                }))
                : [];
            const questionText = this.stripHtml((safeQuestion.question || safeQuestion.questionText || '').toString().trim());
            const combinedParts = [];
            if (questionText) {
                combinedParts.push(questionText);
            }
            options.forEach(opt => {
                combinedParts.push(`${opt.label}. ${opt.text}`);
            });
            return {
                id: safeQuestion.id || `${fileName}-${index}`,
                topicName,
                topics: Array.isArray(safeQuestion.topics) && safeQuestion.topics.length > 0 ? safeQuestion.topics : [topicName],
                questionText,
                questionType: safeQuestion.type || null,
                source: safeQuestion.source || null,
                year: safeQuestion.year || null,
                paper: safeQuestion.paper || null,
                questionNumber: safeQuestion.questionNumber ?? safeQuestion.question_number ?? null,
                marks: safeQuestion.marks ?? null,
                options,
                correctOption: (safeQuestion.correctOption || safeQuestion.correct_option || '').toString().trim().toUpperCase() || null,
                structuralAnswer: safeQuestion.structuralAnswer || safeQuestion.structural_answer || null,
                combinedText: combinedParts.join('\n').trim()
            };
        }

        stripHtml(text) {
            if (!text) {
                return '';
            }
            return text.replace(/<[^>]+>/g, ' ');
        }

        async analyze(rawText) {
            await this.ensureTopicsLoaded();
            if (!rawText || !rawText.trim()) {
                throw new Error('Question text is empty');
            }
            const parsed = this.parse(rawText);
            const combined = this.combinePrompt(parsed.prompt, parsed.answerOptions);
            parsed.combinedText = combined;
            const bestMatch = this.findBestMatch(combined);
            if (bestMatch) {
                parsed.matchConfidence = Number(bestMatch.score.toFixed(3));
                parsed.matchedDatasetId = bestMatch.record.id;
                if (bestMatch.score >= this.matchThreshold) {
                    this.applyRecordOverlay(parsed, bestMatch.record);
                }
            }
            return parsed;
        }

        parse(rawText) {
            const normalized = rawText.replace(/\r\n/g, '\n').trim();
            if (!normalized) {
                throw new Error('Question text is empty');
            }
            const lines = normalized.split('\n').map(line => line.replace(/\s+$/g, ''));
            const firstNonEmpty = lines.findIndex(line => line.trim().length > 0);
            if (firstNonEmpty === -1) {
                throw new Error('Question text is empty');
            }
            const header = lines[firstNonEmpty];
            const extractedMetadata = this.extractMetadata(header);
            const metadata = extractedMetadata || { source: null, year: null, questionNumber: null };
            const hasMetadata = Boolean(extractedMetadata);
            const contentLines = hasMetadata ? lines.slice(firstNonEmpty + 1) : lines.slice(firstNonEmpty);
            const split = this.splitPromptAndOptions(contentLines);
            const promptText = split.promptLines.filter(Boolean).join('\n').trim();
            const topicInfo = this.predictTopic(promptText);
            const explicitAnswer = this.extractAnswer(rawText);
            const parsed = {
                source: metadata.source,
                year: metadata.year ? parseInt(metadata.year, 10) : null,
                questionNumber: metadata.questionNumber,
                prompt: promptText,
                rawPrompt: contentLines.join('\n').trim(),
                answerOptions: split.options,
                topicId: topicInfo.id,
                topicName: topicInfo.name,
                questionType: null,
                correctOption: explicitAnswer || null,
                correctOptionText: null,
                structuredAnswer: null,
                matchConfidence: null,
                matchedDatasetId: null,
                marks: null,
                paper: null,
                datasetTopics: []
            };
            if (explicitAnswer) {
                const matchOption = split.options.find(opt => opt.label.toUpperCase() === explicitAnswer.toUpperCase());
                if (matchOption) {
                    parsed.correctOptionText = matchOption.text;
                }
            }
            return parsed;
        }

        extractMetadata(line) {
            if (!line) {
                return null;
            }
            const pattern = /^(?<source>[A-Za-z ]+)\s+(?<year>\d{4})\s+Q(?<number>[A-Za-z0-9]+)/;
            const match = pattern.exec(line.trim());
            if (!match) {
                return null;
            }
            return {
                source: match.groups.source.trim(),
                year: match.groups.year,
                questionNumber: match.groups.number
            };
        }

        splitPromptAndOptions(lines) {
            const promptLines = [];
            const options = [];
            const optionPattern = /^[\(\[]?([A-Ha-h])[\)\].:\-]\s*(.+)$/;
            const optionSpacePattern = /^([A-Ha-h])\s{2,}(.+)$/;
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) {
                    promptLines.push('');
                    return;
                }
                const match = optionPattern.exec(trimmed) || optionSpacePattern.exec(trimmed);
                if (match) {
                    options.push({
                        label: match[1].toUpperCase(),
                        text: match[2].trim()
                    });
                } else {
                    promptLines.push(trimmed);
                }
            });
            if (promptLines.length === 0) {
                promptLines.push('');
            }
            return { promptLines, options };
        }

        predictTopic(text) {
            if (!text) {
                return { id: 'UNKNOWN', name: 'Topic not found' };
            }
            const lowered = text.toLowerCase();
            let bestTopic = null;
            let bestScore = 0;
            this.topics.forEach(topic => {
                const keywords = Array.isArray(topic.keywords) ? topic.keywords : [];
                let score = 0;
                keywords.forEach(keyword => {
                    if (keyword && lowered.includes(keyword.toLowerCase())) {
                        score += 1;
                    }
                });
                if (score > bestScore) {
                    bestScore = score;
                    bestTopic = topic;
                }
            });
            if (!bestTopic) {
                return { id: 'UNKNOWN', name: 'Topic not found' };
            }
            return { id: bestTopic.id, name: bestTopic.name };
        }

        extractAnswer(text) {
            if (!text) {
                return null;
            }
            const patterns = [
                /\banswer\s*(?:is|:)?\s*([A-Ha-h])\b/,
                /\bans(?:wer)?\s*[:\-]?\s*([A-Ha-h])\b/,
                /\bcorrect(?:\soption)?\s*(?:is|:)?\s*([A-Ha-h])\b/,
                /\b([A-Ha-h])\s*(?:is the answer|is correct)\b/,
                /^\s*([A-Ha-h])\s*$/m
            ];
            for (const pattern of patterns) {
                const match = pattern.exec(text);
                if (match) {
                    return match[1].toUpperCase();
                }
            }
            return null;
        }

        combinePrompt(prompt, options) {
            const lines = [];
            if (prompt) {
                lines.push(prompt);
            }
            (options || []).forEach(opt => {
                lines.push(`${opt.label}. ${opt.text}`);
            });
            return lines.join('\n').trim();
        }

        vectorize(text) {
            const counts = new Map();
            const tokens = this.tokenize(text);
            tokens.forEach(token => {
                counts.set(token, (counts.get(token) || 0) + 1);
            });
            let norm = 0;
            counts.forEach(value => {
                norm += value * value;
            });
            return {
                counts,
                norm: norm > 0 ? Math.sqrt(norm) : 1
            };
        }

        tokenize(text) {
            if (!text) {
                return [];
            }
            return text.toLowerCase().match(/[a-z0-9]+/g) || [];
        }

        findBestMatch(text) {
            if (!text || !text.trim() || this.vectorCache.length === 0) {
                return null;
            }
            const queryVector = this.vectorize(text);
            if (queryVector.counts.size === 0) {
                return null;
            }
            let best = null;
            this.vectorCache.forEach(entry => {
                const score = this.cosineSimilarity(queryVector, entry.vector);
                if (!best || score > best.score) {
                    best = { record: entry.record, score };
                }
            });
            return best;
        }

        cosineSimilarity(query, target) {
            const { counts: queryCounts, norm: queryNorm } = query;
            const { counts: targetCounts, norm: targetNorm } = target;
            let dot = 0;
            queryCounts.forEach((value, key) => {
                const other = targetCounts.get(key);
                if (other) {
                    dot += value * other;
                }
            });
            const denom = queryNorm * targetNorm;
            if (denom === 0) {
                return 0;
            }
            return dot / denom;
        }

        applyRecordOverlay(parsed, record) {
            if (!parsed || !record) {
                return;
            }
            parsed.datasetTopics = Array.isArray(record.topics) ? record.topics : [record.topicName];
            const topicName = record.topicName || parsed.topicName;
            if (topicName) {
                const entry = this.topicLookup[topicName.toLowerCase()];
                if (entry) {
                    parsed.topicId = entry.id;
                    parsed.topicName = entry.name;
                } else {
                    parsed.topicName = topicName;
                }
            }
            parsed.questionType = record.questionType || (record.options && record.options.length >= 2 ? 'Multiple-choice' : parsed.questionType);
            parsed.correctOption = record.correctOption || parsed.correctOption;
            if (parsed.correctOption) {
                parsed.correctOption = parsed.correctOption.toUpperCase();
            }
            if (record.options && record.options.length >= 2) {
                parsed.answerOptions = record.options;
                if (parsed.correctOption) {
                    const option = record.options.find(opt => opt.label === parsed.correctOption);
                    if (option) {
                        parsed.correctOptionText = option.text;
                    }
                }
            }
            if (!parsed.prompt && record.questionText) {
                parsed.prompt = record.questionText;
            }
            parsed.structuredAnswer = record.structuralAnswer || parsed.structuredAnswer;
            parsed.marks = record.marks ?? parsed.marks;
            parsed.paper = record.paper ?? parsed.paper;
            parsed.source = record.source || parsed.source;
            parsed.year = record.year || parsed.year;
            parsed.questionNumber = record.questionNumber || parsed.questionNumber;
        }
    }

    window.QuestionAIClient = QuestionAIClient;
    // If an external (imported) QuestionAnalyzer or parse function is available,
    // prefer that by wrapping it in a compatible client. Otherwise use the
    // built-in QuestionAIClient above.
    function createExternalWrapper() {
        const ExternalCtor = window.QuestionAnalyzer || (window.questionbankllm && window.questionbankllm.QuestionAnalyzer);
        const externalParse = window.parse_question || (window.questionbankllm && window.questionbankllm.parse_question);
        if (!ExternalCtor && !externalParse) {
            return null;
        }

        class ExternalQuestionAIClient {
            constructor() {
                this.topics = [];
                this.topicLookup = {};
                this.datasetRecords = [];
                this.vectorCache = [];
                this.matchThreshold = 0.65;
                this.topicsLoaded = false;
                this.topicsPromise = null;
                // If constructor exists, create an instance lazily
                this._analyzerInstance = null;
            }

            async ensureTopicsLoaded() {
                if (this.topicsLoaded) return;
                if (!this.topicsPromise) this.topicsPromise = this.fetchTopics();
                await this.topicsPromise;
            }

            async fetchTopics() {
                // reuse the same remote topics loader as the built-in client
                try {
                    const response = await fetch(TOPIC_KEYWORDS_URL, { cache: 'no-store' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const payload = await response.json();
                    this.topics = Array.isArray(payload) ? payload : [];
                } catch (err) {
                    console.warn('ExternalQuestionAIClient: failed to fetch topic keywords, using fallback list.', err);
                    this.topics = (Array.isArray(window.TOPICS) ? window.TOPICS : []).map(topic => ({
                        id: topic.id || topic.file || topic.name,
                        name: topic.name,
                        keywords: [topic.name.toLowerCase()]
                    }));
                }
                this.topicLookup = {};
                this.topics.forEach(topic => { if (topic && topic.name) this.topicLookup[topic.name.toLowerCase()] = topic; });
                this.topicsLoaded = true;
            }

            setDatasetFromCache(cache) {
                // keep compatibility - we do nothing special here but preserve API
                // so other code can still call this method.
                this.datasetRecords = [];
                this.vectorCache = [];
            }

            _ensureAnalyzerInstance() {
                if (this._analyzerInstance) return;
                const ExternalCtor = window.QuestionAnalyzer || (window.questionbankllm && window.questionbankllm.QuestionAnalyzer);
                if (ExternalCtor) {
                    try { this._analyzerInstance = new ExternalCtor(); } catch(e) { this._analyzerInstance = null; }
                }
            }

            async analyze(rawText) {
                await this.ensureTopicsLoaded();
                if (!rawText || !rawText.trim()) throw new Error('Question text is empty');

                // Prefer an instance method `analyze` if available (like Python port),
                // otherwise try a global parse function.
                this._ensureAnalyzerInstance();
                let res = null;
                if (this._analyzerInstance && typeof this._analyzerInstance.analyze === 'function') {
                    res = await this._analyzerInstance.analyze(rawText);
                } else if (typeof externalParse === 'function') {
                    res = await externalParse(rawText);
                } else if (window.questionbankllm && typeof window.questionbankllm.parse_question === 'function') {
                    res = await window.questionbankllm.parse_question(rawText);
                } else {
                    throw new Error('No external analyzer available');
                }

                // Map flexible external result fields into the expected parsed shape
                const mapped = {
                    source: res.source || res.metadata?.source || null,
                    year: res.year ? Number(res.year) : (res.metadata && res.metadata.year ? Number(res.metadata.year) : null),
                    questionNumber: res.question_number ?? res.questionNumber ?? res.metadata?.questionNumber ?? null,
                    prompt: res.prompt || res.cleaned_prompt || res.questionText || res.question || res.prompt_text || '',
                    rawPrompt: res.rawPrompt || res.raw_prompt || res.prompt || res.question || '',
                    answerOptions: Array.isArray(res.options) ? res.options.map(o => ({ label: (o.label||o.option||'').toString().trim().toUpperCase(), text: (o.text||o.content||'').toString().trim() })) : [],
                    topicId: res.topicId || res.topic_id || null,
                    topicName: res.topicName || res.topic || null,
                    questionType: res.questionType || res.type || null,
                    correctOption: (res.correctOption || res.correct_option || res.answer || '').toString().trim().toUpperCase() || null,
                    correctOptionText: res.correctOptionText || res.correct_option_text || null,
                    structuredAnswer: res.structuralAnswer || res.structuredAnswer || res.structural_answer || null,
                    matchConfidence: res.match_confidence ?? null,
                    matchedDatasetId: res.matchedDatasetId ?? res.matched_dataset_id ?? null,
                    marks: res.marks ?? null,
                    paper: res.paper ?? null,
                    datasetTopics: res.datasetTopics || res.dataset_topics || []
                };

                // If external result doesn't include combinedText, create one from prompt + options
                mapped.combinedText = (mapped.prompt || '') + '\n' + (mapped.answerOptions || []).map(o => `${o.label}. ${o.text}`).join('\n');

                return mapped;
            }
        }

        return ExternalQuestionAIClient;
    }

    const ExternalCtor = createExternalWrapper();
    if (ExternalCtor) {
        window.QuestionAIClient = ExternalCtor;
        try { window.questionAI = new ExternalCtor(); } catch (e) { window.questionAI = new QuestionAIClient(); }
    } else {
        window.questionAI = new QuestionAIClient();
    }
})();
