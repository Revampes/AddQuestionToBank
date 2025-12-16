// Main Application Logic

let questionQueue = [];
let currentTopicData = null; // { file: "Topic1.json", content: {...}, sha: "..." }
let editingIndex = -1;
let optionCounter = 0;
let cachedTopicFiles = {};
let structuralKeywords = [];
let questionInlineUploads = {}; // uid -> File
let structuralInlineUploads = {}; // uid -> File
let mcqInlineUploads = {}; // uid -> File for MCQ option inline images

// Fixed set of three MCQ templates (global, must be initialized early)
const MCQ_TEMPLATES = [
    {
        id: 'tpl1',
        name: 'Single-statement combos',
        options: [
            '(1) only',
            '(2) only',
            '(1) and (3) only',
            '(2) and (3) only'
        ]
    },
    {
        id: 'tpl2',
        name: 'Pair-wise and all',
        options: [
            '(1) and (2) only',
            '(1) and (3) only',
            '(2) and (3) only',
            '(1), (2) and (3)'
        ]
    },
    {
        id: 'tpl3',
        name: 'Assertion-Reason style',
        options: [
            'Both statements are true and the 2nd statement is a correct explanation of the 1st statement',
            'Both statements are true but the 2nd statement is NOT a correct explanation of the 1st statement',
            'The 1st statement is false but the 2nd statement is true',
            'Both statements are false'
        ]
    }
];

// Initialize
function initApp() {
    initializeTopics();
    initializeMCQ();
    initializeStructural();
    
    // Event Listeners
    get('questionForm').addEventListener('submit', handleFormSubmit);
    get('clearForm').addEventListener('click', clearForm);
    get('syncQueueBtn').addEventListener('click', syncQueue);
    get('loadTopicBtn').addEventListener('click', loadTopicForManager);
    get('deleteSelectedBtn').addEventListener('click', deleteSelectedQuestions);
    get('cancelEditBtn').addEventListener('click', cancelEdit);
    const syncBtn = get('syncQueueBtn');
    if (syncBtn) {
        syncBtn.disabled = true;
    }

    const addKeywordBtn = get('addKeyword');
    if (addKeywordBtn) {
        addKeywordBtn.addEventListener('click', (event) => {
            event.preventDefault();
            addKeywordFromInput();
        });
    }
    const insertQuestionInlineBtn = get('insertQuestionInlineBtn');
    if (insertQuestionInlineBtn) {
        insertQuestionInlineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            insertQuestionImageInline();
        });
    }
    const insertStructuralInlineBtn = get('insertStructuralInlineBtn');
    if (insertStructuralInlineBtn) {
        insertStructuralInlineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            insertStructuralImageInline();
        });
    }
    const keywordInput = get('keywordInput');
    if (keywordInput) {
        keywordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addKeywordFromInput();
            }
        });
    }
    renderKeywordList();
    // Prefill GitHub repo URL and token from localStorage (default to Revampes/ChemQuestion)
    try {
        const savedRepo = localStorage.getItem('qb_repoUrl') || 'https://github.com/Revampes/ChemQuestion';
        const savedToken = localStorage.getItem('qb_githubToken') || '';
        const repoEl = get('repoUrl');
        const tokenEl = get('githubToken');
        if (repoEl && !repoEl.value) repoEl.value = savedRepo;
        if (tokenEl && !tokenEl.value && savedToken) tokenEl.value = savedToken;
        // Auto-connect if token present
        if (savedToken) {
            // Run testConnection to validate and load topics
            setTimeout(() => {
                try { window.testConnection(); } catch (e) { console.warn('Auto testConnection failed:', e); }
            }, 200);
        }
    } catch (e) { console.warn('Failed to load saved GitHub credentials:', e); }
    
    // Input listeners for preview
    document.querySelectorAll('#questionForm input, #questionForm select, #questionForm textarea').forEach(element => {
        element.addEventListener('input', updatePreview);
        element.addEventListener('change', updatePreview);
    });
    
    // Initial Status
    get('connectionStatus').className = 'status-dot offline';
    get('connectionText').textContent = 'Disconnected from GitHub';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // If scripts are loaded dynamically after DOMContentLoaded, run init immediately
    initApp();
}

// Tab Switching
window.showTab = function(tabId) {
    switchToTab(tabId);
}

// MCQ Logic
function initializeMCQ() {
    const questionType = get('questionType');
    const mcqSection = get('mcqSection');
    const mcqOptions = get('mcqOptions');
    const addOptionBtn = get('addOption');
    const structuralSection = get('structuralSection');

    const toggleSections = (type) => {
        const isMCQ = type === 'Multiple-choice';
        const isStructural = type === 'Structural question';

        if (mcqSection) {
            mcqSection.style.display = isMCQ ? 'block' : 'none';
        }
        if (structuralSection) {
            structuralSection.style.display = isStructural ? 'block' : 'none';
        }

        if (isMCQ && mcqOptions && mcqOptions.children.length === 0) {
            // Default to 4 options (A-D)
            optionCounter = 0;
            addMCQOption();
            addMCQOption();
            addMCQOption();
            addMCQOption();
        }

        if (!isMCQ) {
            document.querySelectorAll('input[name="correctOption"]').forEach(radio => {
                radio.checked = false;
            });
        }
    };

    questionType.addEventListener('change', function() {
        toggleSections(this.value);
        updatePreview();
    });

    addOptionBtn.addEventListener('click', addMCQOption);
    const applyTplBtn = get('applyMCQTemplateBtn');
    if (applyTplBtn) {
        applyTplBtn.addEventListener('click', () => {
            const sel = get('mcqTemplateSelect');
            if (!sel) return;
            const id = sel.value;
            if (!id) return showNotification('Please select a template first', 'warning');
            applyMCQTemplateById(id);
        });
    }
    toggleSections(questionType.value);
}



function applyMCQTemplateById(id) {
    const tpl = MCQ_TEMPLATES.find(t => t.id === id);
    if (!tpl) return showNotification('Template not found', 'error');

    // Ensure at least 4 option rows
    const mcqOptions = get('mcqOptions');
    if (!mcqOptions) return;
    while (mcqOptions.children.length < 4) {
        addMCQOption();
    }

    // Apply template texts to first four options (A-D)
    const rows = Array.from(mcqOptions.querySelectorAll('.mcq-option'));
    for (let i = 0; i < 4; i++) {
        const row = rows[i];
        if (!row) continue;
        const textarea = row.querySelector('.mcq-option-input');
        if (textarea) {
            textarea.value = tpl.options[i] || '';
        } else {
            const input = row.querySelector('.mcq-option-input');
            if (input) input.value = tpl.options[i] || '';
        }
    }
    updatePreview();
}

function initializeStructural() {
    const addSubQuestionBtn = get('addSubQuestionBtn');
    if (addSubQuestionBtn) {
        addSubQuestionBtn.addEventListener('click', () => addSubQuestion());
    }
}

function addSubQuestion(data = null) {
    const container = get('subQuestionsContainer');
    if (!container) return;
    
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    const div = document.createElement('div');
    div.className = 'sub-question-item';
    div.style.cssText = 'border: 1px solid #3a3f47; padding: 10px; margin-bottom: 10px; background: #4a5568; border-radius: 4px; position: relative;';
    div.dataset.id = id;
    
    const labelVal = data ? data.subLabel : '';
    const questionVal = data ? data.subQuestion : '';
    const answerVal = data ? data.subAnswer : '';
    
    div.innerHTML = `
        <button type="button" class="remove-option" onclick="removeSubQuestion(this)" style="position:absolute; top:5px; right:5px; background:none; border:none; font-size:1.2em; cursor:pointer;">×</button>
        <div style="display:flex; gap:10px; margin-bottom:8px;">
            <div style="width:80px;">
                <label style="font-size:0.8em; display:block;">Label</label>
                <input type="text" class="sub-label" placeholder="a, b, i..." value="${labelVal}" style="width:100%; padding:4px;">
            </div>
            <div style="flex:1;">
                <label style="font-size:0.8em; display:block;">Sub-question Text</label>
                <div class="rich-text-toolbar" style="margin-bottom:2px;">
                    <button type="button" class="rich-text-btn" onclick="insertTag('subq-${id}', 'b')">B</button>
                    <button type="button" class="rich-text-btn" onclick="insertTag('subq-${id}', 'u')">U</button>
                    <button type="button" class="rich-text-btn" onclick="insertTag('subq-${id}', 'sup')">x²</button>
                    <button type="button" class="rich-text-btn" onclick="insertTag('subq-${id}', 'sub')">x₂</button>
                </div>
                <textarea id="subq-${id}" class="sub-question-text" rows="2" style="width:100%;">${questionVal}</textarea>
            </div>
        </div>
        <div>
            <label style="font-size:0.8em; display:block;">Answer</label>
            <div class="rich-text-toolbar" style="margin-bottom:2px;">
                <button type="button" class="rich-text-btn" onclick="insertTag('suba-${id}', 'b')">B</button>
                <button type="button" class="rich-text-btn" onclick="insertTag('suba-${id}', 'u')">U</button>
                <button type="button" class="rich-text-btn" onclick="insertTag('suba-${id}', 'sup')">x²</button>
                <button type="button" class="rich-text-btn" onclick="insertTag('suba-${id}', 'sub')">x₂</button>
            </div>
            <textarea id="suba-${id}" class="sub-answer-text" rows="2" style="width:100%;">${answerVal}</textarea>
            <div style="display:flex; gap:8px; margin-top:6px; align-items:center;">
                <input type="file" class="sub-answer-image-file file-input" accept="image/*">
                <button type="button" class="btn btn-secondary btn-sm" onclick="insertInlineSubImage('suba-${id}')">Insert image inline</button>
            </div>
        </div>
    `;
    
    container.appendChild(div);
    
    div.querySelectorAll('input, textarea').forEach(el => {
        el.addEventListener('input', updatePreview);
    });
    
    updatePreview();
}

window.removeSubQuestion = function(btn) {
    btn.closest('.sub-question-item').remove();
    updatePreview();
}

function addMCQOption() {
    const mcqOptions = get('mcqOptions');
    if (!mcqOptions) return;
    optionCounter++;
    const optionLetter = String.fromCharCode(64 + optionCounter);
    
    const div = document.createElement('div');
    div.className = 'mcq-option';
    div.innerHTML = `
        <div class="mcq-option-select">
            <input type="radio" name="correctOption" value="${optionLetter}" class="correct-option-radio">
            <span class="option-letter">${optionLetter}.</span>
        </div>
        <div class="mcq-option-body">
            <div class="rich-text-toolbar" style="margin-bottom:6px;">
                <button type="button" class="rich-text-btn" onclick="insertTag('mcq-opt-${optionCounter}', 'b')">B</button>
                <button type="button" class="rich-text-btn" onclick="insertTag('mcq-opt-${optionCounter}', 'u')">U</button>
                <button type="button" class="rich-text-btn" onclick="insertTag('mcq-opt-${optionCounter}', 'sup')">x²</button>
                <button type="button" class="rich-text-btn" onclick="insertTag('mcq-opt-${optionCounter}', 'sub')">x₂</button>
            </div>
            <textarea id="mcq-opt-${optionCounter}" class="mcq-option-input" placeholder="Option text (supports formatting)" rows="2" style="width:100%;"></textarea>
            <input type="file" class="mcq-option-image file-input" accept="image/*">
            <button type="button" class="btn btn-sm" onclick="insertInlineOptionImage('mcq-opt-${optionCounter}', this)">Insert image inline</button>
        </div>
        <button type="button" class="remove-option" onclick="removeMCQOption(this)">×</button>
    `;
    mcqOptions.appendChild(div);

    // Wire up events for inputs
    div.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('change', updatePreview);
        if (input.tagName.toLowerCase() === 'textarea' || input.type === 'text') {
            input.addEventListener('input', updatePreview);
        }
    });

    const radio = div.querySelector('.correct-option-radio');
    if (radio && !document.querySelector('input[name="correctOption"]:checked')) {
        radio.checked = true;
    }
    updatePreview();
}

// removed per-option template helpers (using global fixed templates only)

window.removeMCQOption = function(button) {
    const optionRow = button.closest('.mcq-option');
    const wasChecked = optionRow?.querySelector('.correct-option-radio')?.checked;
    if (optionRow) {
        optionRow.remove();
    }
    const options = get('mcqOptions').querySelectorAll('.mcq-option');
    options.forEach((option, index) => {
        const letter = String.fromCharCode(65 + index);
        const labelEl = option.querySelector('.option-letter');
        if (labelEl) {
            labelEl.textContent = `${letter}.`;
        }
        const radio = option.querySelector('.correct-option-radio');
        if (radio) {
            radio.value = letter;
        }
    });
    optionCounter = options.length;
    if (wasChecked && options.length > 0) {
        const firstRadio = options[0].querySelector('.correct-option-radio');
        if (firstRadio) {
            firstRadio.checked = true;
        }
    }
    updatePreview();
}

function addKeywordFromInput() {
    const input = get('keywordInput');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;
    structuralKeywords.push(value);
    input.value = '';
    renderKeywordList();
    updatePreview();
}

function generateInlineUid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random()*10000)}`;
}

window.insertTag = function(elementId, tag) {
    const textarea = get(elementId);
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    const replacement = `<${tag}>${selectedText}</${tag}>`;
    
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    
    textarea.value = before + replacement + after;
    
    // Restore selection or place cursor inside tag if empty
    if (selectedText.length > 0) {
        textarea.selectionStart = start;
        textarea.selectionEnd = start + replacement.length;
    } else {
        // Cursor between tags
        const newPos = start + tag.length + 2; // <tag> is length+2
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
    }
    
    updatePreview();
}

function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    // place cursor after inserted text
    const pos = before.length + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
}

function insertQuestionImageInline() {
    const fileInput = get('questionImageFile');
    const textarea = get('questionText');
    if (!fileInput || !textarea) return showNotification('Question image input or text not found', 'error');
    const file = fileInput.files?.[0];
    if (!file) return showNotification('Please choose a question image file first', 'error');
    const uid = generateInlineUid('qimg');
    questionInlineUploads[uid] = file;
    // Insert placeholder that will be replaced during upload: {{INLINE_IMG:uid}}
    insertAtCursor(textarea, `\n{{INLINE_IMG:${uid}}}\n`);
    fileInput.value = '';
    updatePreview();
}

function insertStructuralImageInline() {
    const fileInput = get('structuralAnswerImageFile');
    const textarea = get('structuralAnswerText');
    if (!fileInput || !textarea) return showNotification('Structural image input or text not found', 'error');
    const file = fileInput.files?.[0];
    if (!file) return showNotification('Please choose a structural answer image file first', 'error');
    const uid = generateInlineUid('simg');
    structuralInlineUploads[uid] = file;
    insertAtCursor(textarea, `\n{{INLINE_IMG:${uid}}}\n`);
    fileInput.value = '';
    updatePreview();
}

function insertInlineSubImage(textareaId) {
    const textarea = get(textareaId);
    if (!textarea) return showNotification('Textarea not found for inline image insertion', 'error');
    const container = textarea.closest('.sub-question-item');
    if (!container) return showNotification('Sub-question container not found', 'error');
    const fileInput = container.querySelector('.sub-answer-image-file');
    if (!fileInput) return showNotification('Please choose a sub-question image file first', 'error');
    const file = fileInput.files?.[0];
    if (!file) return showNotification('No file selected for sub-question image', 'error');
    const uid = generateInlineUid('simg');
    structuralInlineUploads[uid] = file;
    insertAtCursor(textarea, `\n{{INLINE_IMG:${uid}}}\n`);
    fileInput.value = '';
    updatePreview();
}

function insertInlineOptionImage(textareaId, btn) {
    const textarea = get(textareaId);
    if (!textarea) return showNotification('Option textarea not found for inline image insertion', 'error');
    const row = btn.closest('.mcq-option');
    if (!row) return showNotification('Option row not found', 'error');
    const fileInput = row.querySelector('.mcq-option-image');
    if (!fileInput) return showNotification('Please choose an option image file first', 'error');
    const file = fileInput.files?.[0];
    if (!file) return showNotification('No file selected for option image', 'error');
    const uid = generateInlineUid('optimg');
    mcqInlineUploads[uid] = file;
    insertAtCursor(textarea, `\n{{INLINE_IMG:${uid}}}\n`);
    fileInput.value = '';
    updatePreview();
}

function renderKeywordList() {
    const list = get('keywordList');
    if (!list) return;
    list.innerHTML = '';
    if (structuralKeywords.length === 0) {
        list.classList.add('empty');
        list.innerHTML = '<span class="keyword-placeholder">No keywords yet.</span>';
        return;
    }
    list.classList.remove('empty');
    structuralKeywords.forEach((keyword, index) => {
        const chip = document.createElement('div');
        chip.className = 'keyword-chip';
        chip.innerHTML = `
            <span>${keyword}</span>
            <button type="button" aria-label="Remove keyword" onclick="removeKeyword(${index})">×</button>
        `;
        list.appendChild(chip);
    });
}

window.removeKeyword = function(index) {
    if (index < 0 || index >= structuralKeywords.length) return;
    structuralKeywords.splice(index, 1);
    renderKeywordList();
    updatePreview();
}

// Form Handling
function handleFormSubmit(event) {
    event.preventDefault();
    
    const questionData = collectQuestionData();
    const selectedFiles = getSelectedTopicFiles();
    const uploads = collectImageUploads();
    
    if (selectedFiles.length === 0) {
        showNotification('Please select at least one topic', 'error');
        return;
    }

    // Prevent duplicates for certain official sources (DSE, AL, CE) when adding new questions:
    // Do not allow adding a question with the same source+year+questionNumber
    // to any selected topic if that combination already exists in the repo or queue.
    const DUP_SOURCES = ['DSE', 'AL', 'CE'];
    function findDuplicatesForFiles(qData, files) {
        const dupFiles = [];
        const s = (qData.source || '').toString();
        const y = (qData.year || '').toString();
        const num = (qData.questionNumber || '').toString();

        if (!DUP_SOURCES.includes(s) || !y) return dupFiles;

        files.forEach(file => {
            // check cached topic files (from GitHub)
            const topic = cachedTopicFiles[file]?.content;
            if (topic && Array.isArray(topic.questions)) {
                const found = topic.questions.find(q => (q.source||'').toString() === s && (q.year||'').toString() === y && (q.questionNumber||'').toString() === num);
                if (found) {
                    dupFiles.push(file);
                    return;
                }
            }
            // also check queued items that target this file
            const queuedDup = questionQueue.find(qi => {
                const targets = qi.targetFiles || [];
                if (!targets.includes(file)) return false;
                return (qi.source||'').toString() === s && (qi.year||'').toString() === y && (qi.questionNumber||'').toString() === num;
            });
            if (queuedDup && !dupFiles.includes(file)) {
                dupFiles.push(file);
            }
        });
        return dupFiles;
    }

    // Only check duplicates when adding a new question (not when editing an existing one)
    if (editingIndex < 0) {
        const duplicateFiles = findDuplicatesForFiles(questionData, selectedFiles);
        if (duplicateFiles.length > 0) {
            showNotification(`Duplicate found for ${questionData.source} ${questionData.year} ${questionData.questionNumber} in: ${duplicateFiles.join(', ')}`, 'error');
            return;
        }
    }

    // Validate question number is integer
    if (questionData.questionNumber === null || !Number.isInteger(questionData.questionNumber) || questionData.questionNumber <= 0) {
        showNotification('Please enter a valid question number (positive integer)', 'error');
        return;
    }

    if (!Number.isInteger(questionData.marks)) {
        showNotification('Please enter marks as a whole number', 'error');
        return;
    }

    if (questionData.marks < 0) {
        showNotification('Marks must be zero or greater', 'error');
        return;
    }

    if (questionData.type === 'Multiple-choice') {
        if (!questionData.options || questionData.options.length < 2) {
            showNotification('Please provide at least two options for MCQ questions', 'error');
            return;
        }
        if (!questionData.correctOption) {
            showNotification('Please select the correct option for the MCQ question', 'error');
            return;
        }
    }

    if (questionData.type === 'Structural question') {
        const structural = questionData.structuralAnswer || {};
        const subQs = structural.subQuestions || [];
        // If there are no sub-questions, require full answer or image; if sub-questions are present, full answer is optional
        if (!subQs || subQs.length === 0) {
            const hasText = typeof structural.fullAnswer === 'string' && structural.fullAnswer.trim().length > 0;
            const hasImage = Boolean(structural.image);
            const hasUpload = Boolean(uploads.structuralAnswer);
            if (!hasText && !hasImage && !hasUpload) {
                showNotification('Please provide a full answer text or image for structural questions (or add sub-questions)', 'error');
                return;
            }
        }
    }

    if (editingIndex >= 0) {
        // We are editing an existing question
        saveEditedQuestion(questionData, uploads);
    } else {
        // We are adding a new question
        addToQueue(questionData, selectedFiles, uploads);
    }
}

function collectQuestionData() {
    const source = get('source').value;
    const year = get('year').value || null;
    const paper = get('paper') ? get('paper').value || null : null;
    const qnVal = get('questionNumber').value;
    const questionNumber = qnVal === '' ? null : parseInt(qnVal, 10);
    const type = get('questionType').value;
    const marksValue = parseInt(get('marks').value, 10);
    const marks = Number.isNaN(marksValue) ? null : marksValue;
    const isStructural = type === 'Structural question';
    const existingId = editingIndex >= 0 && currentTopicData ? currentTopicData.content.questions[editingIndex].id : null;
    const id = existingId || generateQuestionId(source, year, questionNumber);

    return {
        id,
        source,
        paper,
        year,
        questionNumber,
        type,
        marks,
        topics: getSelectedTopics(), // Names
        question: get('questionText').value,
        image: null,
        options: getMCQOptions(),
        correctOption: getCorrectOption(),
        structuralAnswer: isStructural ? getStructuralAnswerData() : null,
        timestamp: new Date().toISOString()
    };
}

function getSelectedTopics() {
    const selected = [];
    document.querySelectorAll('#topicCheckboxes input:checked').forEach(checkbox => {
        const topicName = TOPICS.find(t => t.file === checkbox.value)?.name || checkbox.value;
        selected.push(topicName);
    });
    return selected;
}

function getSelectedTopicFiles() {
    const selected = [];
    document.querySelectorAll('#topicCheckboxes input:checked').forEach(checkbox => {
        selected.push(checkbox.value);
    });
    return selected;
}

function getMCQOptions() {
    if (get('questionType').value !== 'Multiple-choice') {
        return null;
    }
    
    const options = [];
    get('mcqOptions').querySelectorAll('.mcq-option').forEach((option, index) => {
        const letter = String.fromCharCode(65 + index);
        const text = option.querySelector('.mcq-option-input').value;
        options.push({
            option: letter,
            content: text,
            image: null
        });
    });
    return options;
}

function getCorrectOption() {
    if (get('questionType').value !== 'Multiple-choice') {
        return null;
    }
    const selected = document.querySelector('input[name="correctOption"]:checked');
    return selected ? selected.value : null;
}

function getStructuralAnswerData() {
    const textField = get('structuralAnswerText');
    const fullAnswer = textField ? textField.value : '';
    const image = null; // image path/url removed; use file uploads/inline instead
    
    const subQuestions = [];
    const container = get('subQuestionsContainer');
    if (container) {
        container.querySelectorAll('.sub-question-item').forEach(item => {
            subQuestions.push({
                subLabel: item.querySelector('.sub-label').value,
                subQuestion: item.querySelector('.sub-question-text').value,
                subAnswer: item.querySelector('.sub-answer-text').value
            });
        });
    }

    return {
        fullAnswer,
        image,
        keywords: structuralKeywords.slice(),
        subQuestions: subQuestions.length > 0 ? subQuestions : undefined
    };
}

function collectImageUploads() {
    const uploads = {
        question: get('questionImageFile')?.files?.[0] || null,
        structuralAnswer: get('structuralAnswerImageFile')?.files?.[0] || null,
        options: {},
        subAnswers: {},
        inlineOptions: {...mcqInlineUploads},
        inlineQuestion: {...questionInlineUploads},
        inlineStructural: {...structuralInlineUploads}
    };

    const optionNodes = get('mcqOptions').querySelectorAll('.mcq-option');
    optionNodes.forEach((option, index) => {
        const fileInput = option.querySelector('.mcq-option-image');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            uploads.options[index] = fileInput.files[0];
        }
    });

    // Collect sub-question image files
    const subItems = get('subQuestionsContainer')?.querySelectorAll('.sub-question-item') || [];
    subItems.forEach((item, idx) => {
        const fileInput = item.querySelector('.sub-answer-image-file');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            uploads.subAnswers[idx] = fileInput.files[0];
        }
    });

    return uploads;
}

async function prepareQuestionForTopic(queueItem, topicFile) {
    const { targetFiles, uploads, ...questionBase } = queueItem;
    const clonedQuestion = JSON.parse(JSON.stringify(questionBase));
    await applyImageUploads(clonedQuestion, uploads || { question: null, options: {} }, topicFile);
    return clonedQuestion;
}

async function applyImageUploads(question, uploads, topicFile) {
    if (!uploads) {
        return question;
    }

    const folder = getTopicFolderName(topicFile);
    if (!folder) {
        return question;
    }

    if (uploads.question) {
        question.image = await uploadSingleImage(uploads.question, question.id, 'stem', folder);
    }

    if (question.options && uploads.options) {
        for (const [indexStr, file] of Object.entries(uploads.options)) {
            const index = parseInt(indexStr, 10);
            if (Number.isNaN(index) || !question.options[index]) continue;
            const letter = question.options[index].option || String.fromCharCode(65 + index);
            question.options[index].image = await uploadSingleImage(file, question.id, `option${letter}`, folder);
        }
    }

    if (uploads.structuralAnswer && question.structuralAnswer) {
        question.structuralAnswer.image = await uploadSingleImage(uploads.structuralAnswer, question.id, 'full-answer', folder);
    }

    // Handle inline question images: placeholders in question.question like {{INLINE_IMG:uid}}
    if (uploads.inlineQuestion) {
        for (const [uid, file] of Object.entries(uploads.inlineQuestion)) {
            if (!file) continue;
            const uploadedPath = await uploadSingleImage(file, question.id, `inline-q-${uid}`, folder);
            const placeholder = `{{INLINE_IMG:${uid}}}`;
            if (typeof question.question === 'string') {
                question.question = question.question.split(placeholder).join(`![](${uploadedPath})`);
            }
        }
    }

    // Handle inline structural images
    if (uploads.inlineStructural && question.structuralAnswer) {
        for (const [uid, file] of Object.entries(uploads.inlineStructural)) {
            if (!file) continue;
            const uploadedPath = await uploadSingleImage(file, question.id, `inline-s-${uid}`, folder);
            const placeholder = `{{INLINE_IMG:${uid}}}`;
            if (typeof question.structuralAnswer.fullAnswer === 'string') {
                question.structuralAnswer.fullAnswer = question.structuralAnswer.fullAnswer.split(placeholder).join(`![](${uploadedPath})`);
            }
        }
    }

    // Replace inline placeholders in sub-question answers
    if (uploads.inlineStructural && question.structuralAnswer && Array.isArray(question.structuralAnswer.subQuestions)) {
        for (const [uid, file] of Object.entries(uploads.inlineStructural)) {
            if (!file) continue;
            const uploadedPath = await uploadSingleImage(file, question.id, `inline-s-${uid}`, folder);
            const placeholder = `{{INLINE_IMG:${uid}}}`;
            question.structuralAnswer.subQuestions.forEach((sq) => {
                if (typeof sq.subAnswer === 'string') {
                    sq.subAnswer = sq.subAnswer.split(placeholder).join(`![](${uploadedPath})`);
                }
            });
        }
    }

    // Upload explicit sub-question image files (uploads.subAnswers keyed by index)
    if (uploads.subAnswers && question.structuralAnswer && Array.isArray(question.structuralAnswer.subQuestions)) {
        for (const [indexStr, file] of Object.entries(uploads.subAnswers)) {
            const idx = parseInt(indexStr, 10);
            if (Number.isNaN(idx) || !question.structuralAnswer.subQuestions[idx]) continue;
            const uploadedPath = await uploadSingleImage(file, question.id, `subq${idx+1}`, folder);
            // Append the uploaded image to the subAnswer field (so it renders via processQuestionContent)
            const sq = question.structuralAnswer.subQuestions[idx];
            const existing = typeof sq.subAnswer === 'string' ? sq.subAnswer : '';
            // Add newline image at end
            sq.subAnswer = (existing.trim() ? existing + '\n' : '') + `![](${uploadedPath})`;
        }
    }

    // Handle inline option images (uploads.inlineOptions)
    if (uploads.inlineOptions && question.options && Array.isArray(question.options)) {
        for (const [uid, file] of Object.entries(uploads.inlineOptions)) {
            if (!file) continue;
            const uploadedPath = await uploadSingleImage(file, question.id, `inline-opt-${uid}`, folder);
            const placeholder = `{{INLINE_IMG:${uid}}}`;
            question.options.forEach(opt => {
                if (typeof opt.content === 'string') {
                    opt.content = opt.content.split(placeholder).join(`![](${uploadedPath})`);
                }
            });
        }
    }

    return question;
}

async function uploadSingleImage(file, questionId, suffix, folder) {
    const base64 = await fileToBase64(file);
    const ext = getFileExtension(file.name);
    const safeId = slugifyFileComponent(questionId);
    const safeSuffix = slugifyFileComponent(suffix);
    const fileName = `${safeId}-${safeSuffix}${ext}`;
    const relativePath = `images/${folder}/${fileName}`;
    await createOrUpdateFile(
        relativePath,
        base64,
        `Add image ${fileName}`,
        null,
        { isBase64: true }
    );
    return relativePath;
}

function getTopicFolderName(topicFile) {
    if (!topicFile) return 'images';
    return topicFile.replace(/\.json$/i, '');
}

function slugifyFileComponent(value) {
    return (value || 'image')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'image';
}

function getFileExtension(fileName = '') {
    const match = fileName.match(/\.([a-z0-9]+)$/i);
    const ext = match ? match[1].toLowerCase() : 'png';
    return `.${ext}`;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function updatePreview() {
    const questionData = collectQuestionData();
    get('jsonPreview').textContent = JSON.stringify(questionData, null, 2);
}

// Queue Management
function addToQueue(questionData, files, uploads) {
    // Add a copy of the question for each topic file it belongs to
    // Actually, better to store it once and list the files
    
    // For simplicity, let's just store the question object and the target files
    const queueItem = {
        ...questionData,
        targetFiles: files,
        uploads: uploads || { question: null, options: {} }
    };
    
    questionQueue.push(queueItem);
    renderQueue(questionQueue);
    showNotification('Question added to queue');
    clearForm();
}

window.removeFromQueue = function(index) {
    questionQueue.splice(index, 1);
    renderQueue(questionQueue);
}

async function syncQueue() {
    if (!repoInfo) {
        showNotification('Please connect to GitHub first', 'error');
        return;
    }
    
    if (questionQueue.length === 0) {
        showNotification('Queue is empty', 'warning');
        return;
    }
    
    updateProgress(10, 'Starting sync...');
    
    try {
        const filesToUpdate = {};

        for (const queueItem of questionQueue) {
            const targetFiles = queueItem.targetFiles || [];
            for (const file of targetFiles) {
                if (!filesToUpdate[file]) {
                    const fileData = await fetchTopicFile(file);
                    filesToUpdate[file] = {
                        content: fileData ? fileData.content : createEmptyTopic(TOPICS.find(t => t.file === file)?.name || file),
                        sha: fileData ? fileData.sha : null,
                        added: 0
                    };
                }

                const preparedQuestion = await prepareQuestionForTopic(queueItem, file);
                filesToUpdate[file].content.questions.push(preparedQuestion);
                filesToUpdate[file].content.metadata.totalQuestions = filesToUpdate[file].content.questions.length;
                filesToUpdate[file].content.metadata.lastUpdated = new Date().toISOString();
                filesToUpdate[file].added += 1;
            }
        }

        const files = Object.keys(filesToUpdate);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            updateProgress(10 + (i / files.length) * 80, `Updating ${file}...`);
            const fileInfo = filesToUpdate[file];
            const newSha = await createOrUpdateFile(
                `topics/${file}`,
                JSON.stringify(fileInfo.content, null, 2),
                `Add ${fileInfo.added} question(s) to ${file}`,
                fileInfo.sha
            );

            fileInfo.sha = newSha;
            cachedTopicFiles[file] = {
                sha: newSha,
                content: fileInfo.content
            };
        }

        // Refresh remote topic files to ensure manager can load latest content
        try {
            const freshFiles = await loadExistingTopics();
            // Merge freshFiles into cache (freshFiles may contain parsed content)
            cachedTopicFiles = { ...cachedTopicFiles, ...freshFiles };
            // Ensure manager select has options (in case it was cleared)
            if (typeof populateManagerSelect === 'function') {
                populateManagerSelect();
            }
        } catch (err) {
            console.warn('Failed to refresh topics after sync:', err);
        }

        questionQueue = [];
        renderQueue(questionQueue);
        updateFileStatus(cachedTopicFiles);
        updateProgress(100, 'Sync complete!');
        showNotification('All queued questions synced successfully!');
        
    } catch (error) {
        updateProgress(0);
        showNotification(`Sync failed: ${error.message}`, 'error');
        console.error(error);
    }
}

// Manager Functions
async function loadTopicForManager() {
    if (!repoInfo) {
        showNotification('Please connect to GitHub first', 'error');
        return;
    }
    
    const file = get('managerTopicSelect').value;
    if (!file) return;
    
    get('loadTopicBtn').disabled = true;
    get('loadTopicBtn').textContent = 'Loading...';
    
    try {
        const fileData = await fetchTopicFile(file);
        if (!fileData) {
            throw new Error('File not found');
        }
        
        currentTopicData = {
            file: file,
            ...fileData
        };
        cachedTopicFiles[file] = fileData;
        updateFileStatus(cachedTopicFiles);
        
        renderQuestionList(currentTopicData.content.questions, file);
        
    } catch (error) {
        showNotification(`Error loading topic: ${error.message}`, 'error');
    } finally {
        get('loadTopicBtn').disabled = false;
        get('loadTopicBtn').textContent = 'Load Questions';
    }
}

async function deleteSelectedQuestions() {
    if (!currentTopicData) return;
    
    const selectedIndices = Array.from(document.querySelectorAll('.question-select:checked'))
        .map(cb => parseInt(cb.value))
        .sort((a, b) => b - a); // Sort descending to delete from end
        
    if (selectedIndices.length === 0) {
        showNotification('No questions selected', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedIndices.length} questions?`)) {
        return;
    }
    
    updateProgress(20, 'Deleting questions...');
    
    try {
        // Remove questions locally
        selectedIndices.forEach(index => {
            currentTopicData.content.questions.splice(index, 1);
        });
        
        currentTopicData.content.metadata.totalQuestions = currentTopicData.content.questions.length;
        currentTopicData.content.metadata.lastUpdated = new Date().toISOString();
        
        // Save to GitHub
        const newSha = await createOrUpdateFile(
            `topics/${currentTopicData.file}`,
            JSON.stringify(currentTopicData.content, null, 2),
            `Delete ${selectedIndices.length} questions from ${currentTopicData.file}`,
            currentTopicData.sha
        );
        
        currentTopicData.sha = newSha;
        cachedTopicFiles[currentTopicData.file] = {
            sha: newSha,
            content: currentTopicData.content
        };
        updateFileStatus(cachedTopicFiles);
        renderQuestionList(currentTopicData.content.questions, currentTopicData.file);
        updateProgress(100, 'Questions deleted!');
        showNotification('Questions deleted successfully');
        
    } catch (error) {
        updateProgress(0);
        showNotification(`Delete failed: ${error.message}`, 'error');
    }
}

window.editQuestion = function(file, index) {
    if (!currentTopicData || currentTopicData.file !== file) return;
    
    const question = currentTopicData.content.questions[index];
    editingIndex = index;
    
    // Switch to Add/Edit tab
    showTab('add-tab');
    
    // Populate form
    get('source').value = question.source;
    get('year').value = question.year || '';
    get('questionNumber').value = question.questionNumber;
    const normalizedType = question.type === 'Multiple-choice' ? 'Multiple-choice' : 'Structural question';
    get('questionType').value = normalizedType;
    const parsedMarks = Number.parseInt(question.marks, 10);
    get('marks').value = Number.isNaN(parsedMarks) ? '' : parsedMarks;
    get('questionText').value = question.question;
    
    // Trigger change events
    get('questionType').dispatchEvent(new Event('change'));
    
    // Handle MCQ options
    if (question.options && question.options.length > 0) {
        get('mcqOptions').innerHTML = '';
        optionCounter = 0;
        question.options.forEach(opt => {
            addMCQOption();
            const inputs = get('mcqOptions').querySelectorAll('.mcq-option-input');
            inputs[inputs.length - 1].value = opt.content;
            // option image is handled via file uploads or inline images; no URL field
        });
        if (question.correctOption) {
            const normalizedOption = question.correctOption.toString().toUpperCase();
            const radio = document.querySelector(`input[name="correctOption"][value="${normalizedOption}"]`);
            if (radio) {
                radio.checked = true;
            }
        }
    } else {
        get('mcqOptions').innerHTML = '';
        optionCounter = 0;
    }

    const structuralText = get('structuralAnswerText');
    const subQContainer = get('subQuestionsContainer');

    if (normalizedType === 'Structural question') {
        const structural = question.structuralAnswer || {};
        if (structuralText) structuralText.value = structural.fullAnswer || '';
        structuralKeywords = Array.isArray(structural.keywords) ? [...structural.keywords] : [];
        
        if (subQContainer) {
            subQContainer.innerHTML = '';
            if (structural.subQuestions && Array.isArray(structural.subQuestions)) {
                structural.subQuestions.forEach(sq => addSubQuestion(sq));
            }
        }
    } else {
        if (structuralText) structuralText.value = '';
        if (structuralImageUrl) structuralImageUrl.value = '';
        structuralKeywords = [];
        if (subQContainer) subQContainer.innerHTML = '';
    }
    renderKeywordList();
    const structuralFileInput = get('structuralAnswerImageFile');
    if (structuralFileInput) {
        structuralFileInput.value = '';
    }
    
    // Handle Topics
    // We only check the box for the current file we are editing from
    // Because moving questions between topics is complex (requires delete + add)
    // For now, we lock the topic selection to the current file
    document.querySelectorAll('#topicCheckboxes input').forEach(cb => {
        cb.checked = cb.value === file;
        cb.disabled = true; // Lock topics during edit
    });
    
    // UI Updates
    get('submitQuestion').innerHTML = '💾 Update Question';
    get('editModeIndicator').style.display = 'flex';
    get('editModeText').textContent = `Editing Question ${question.questionNumber} from ${file}`;
    
    updatePreview();
}

function cancelEdit() {
    clearForm(true);
    finishEditingState();
}

async function saveEditedQuestion(questionData, uploads) {
    updateProgress(20, 'Updating question...');
    
    try {
        const processedQuestion = JSON.parse(JSON.stringify(questionData));
        await applyImageUploads(processedQuestion, uploads, currentTopicData.file);

        // Update local data
        currentTopicData.content.questions[editingIndex] = processedQuestion;
        currentTopicData.content.metadata.lastUpdated = new Date().toISOString();
        currentTopicData.content.metadata.totalQuestions = currentTopicData.content.questions.length;
        
        // Save to GitHub
        const newSha = await createOrUpdateFile(
            `topics/${currentTopicData.file}`,
            JSON.stringify(currentTopicData.content, null, 2),
            `Update question ${processedQuestion.questionNumber} in ${currentTopicData.file}`,
            currentTopicData.sha
        );
        
        currentTopicData.sha = newSha;
        cachedTopicFiles[currentTopicData.file] = {
            sha: newSha,
            content: currentTopicData.content
        };
        updateFileStatus(cachedTopicFiles);
        
        updateProgress(100, 'Question updated!');
        showNotification('Question updated successfully');
        
        // Reset UI
        cancelEdit();
        
        // If we were in manager, refresh list
        if (get('manager-tab').classList.contains('active')) {
            renderQuestionList(currentTopicData.content.questions, currentTopicData.file);
        } else {
            // Switch back to manager to show result
            showTab('manager-tab');
            renderQuestionList(currentTopicData.content.questions, currentTopicData.file);
        }
        
    } catch (error) {
        updateProgress(0);
        showNotification(`Update failed: ${error.message}`, 'error');
    }
}

function clearForm(keepEditing = false) {
    resetFormFields();
    updatePreview();

    if (!keepEditing && editingIndex >= 0) {
        finishEditingState();
    }
}

function resetFormFields() {
    const form = get('questionForm');
    if (form) {
        form.reset();
    }

    const questionImageFileInput = get('questionImageFile');
    if (questionImageFileInput) {
        questionImageFileInput.value = '';
    }
    const structuralImageInput = get('structuralAnswerImageFile');
    if (structuralImageInput) {
        structuralImageInput.value = '';
    }
    const keywordInput = get('keywordInput');
    if (keywordInput) {
        keywordInput.value = '';
    }

    const mcqContainer = get('mcqOptions');
    if (mcqContainer) {
        mcqContainer.innerHTML = '';
    }
    optionCounter = 0;

    const subQContainer = get('subQuestionsContainer');
    if (subQContainer) {
        subQContainer.innerHTML = '';
    }

    structuralKeywords = [];
    renderKeywordList();

    // clear inline upload maps
    questionInlineUploads = {};
    structuralInlineUploads = {};

    const questionTypeSelect = get('questionType');
    if (questionTypeSelect) {
        questionTypeSelect.dispatchEvent(new Event('change'));
    }
}

function finishEditingState() {
    editingIndex = -1;
    get('submitQuestion').innerHTML = '✅ Add to Queue';
    get('editModeIndicator').style.display = 'none';
    document.querySelectorAll('#topicCheckboxes input').forEach(cb => {
        cb.disabled = false;
        cb.checked = false;
    });
    // clear inline uploads when finishing editing
    questionInlineUploads = {};
    structuralInlineUploads = {};
}

// Expose testConnection to global scope for the button
window.testConnection = async function() {
    const repoUrl = get('repoUrl').value;
    const token = get('githubToken').value;
    
    updateProgress(30, 'Testing connection...');
    
    try {
        const info = await githubTestConnection(repoUrl, token);
        
        get('connectionStatus').className = 'status-dot';
        get('connectionText').textContent = `Connected to ${info.owner}/${info.repo}`;

        // Load topic files and update UI status
        try {
            const files = await loadExistingTopics();
            // files is a map of filename -> { sha, content }
            updateFileStatus(files);
            // store locally for quick access (optional)
            window.currentFiles = files;
            cachedTopicFiles = files;
            // Save credentials locally for convenience (so page can prefill on reload)
            try {
                localStorage.setItem('qb_repoUrl', repoUrl);
                localStorage.setItem('qb_githubToken', token);
            } catch (e) { console.warn('Failed to save GitHub credentials locally:', e); }
        } catch (err) {
            console.warn('Failed to load existing topics after connect:', err);
        }

        showNotification('Connected successfully!');
        updateProgress(100, 'Connected!');
        
        // Enable manager/sync controls
        const syncBtn = get('syncQueueBtn');
        if (syncBtn) syncBtn.disabled = false;
        
    } catch (error) {
        updateProgress(0);
        showNotification(error.message, 'error');
        get('connectionStatus').className = 'status-dot offline';
        get('connectionText').textContent = 'Connection failed';
        const syncBtn = get('syncQueueBtn');
        if (syncBtn) syncBtn.disabled = true;
    }
}
