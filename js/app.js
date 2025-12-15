// Main Application Logic

let questionQueue = [];
let currentTopicData = null; // { file: "Topic1.json", content: {...}, sha: "..." }
let editingIndex = -1;
let optionCounter = 0;
let cachedTopicFiles = {};
let structuralKeywords = [];
let questionInlineUploads = {}; // uid -> File
let structuralInlineUploads = {}; // uid -> File

// Initialize
function initApp() {
    initializeTopics();
    initializeMCQ();
    
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
    toggleSections(questionType.value);
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
            <input type="text" class="mcq-option-input" placeholder="Option text">
            <input type="text" class="mcq-option-image-url" placeholder="Image URL or path (optional)">
            <input type="file" class="mcq-option-image file-input" accept="image/*">
        </div>
        <button type="button" class="remove-option" onclick="removeMCQOption(this)">×</button>
    `;
    mcqOptions.appendChild(div);

    div.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', updatePreview);
        if (input.type !== 'file') {
            input.addEventListener('input', updatePreview);
        }
    });

    const radio = div.querySelector('.correct-option-radio');
    if (radio && !document.querySelector('input[name="correctOption"]:checked')) {
        radio.checked = true;
    }
    updatePreview();
}

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
        const hasText = typeof structural.fullAnswer === 'string' && structural.fullAnswer.trim().length > 0;
        const hasImage = Boolean(structural.image);
        const hasUpload = Boolean(uploads.structuralAnswer);
        if (!hasText && !hasImage && !hasUpload) {
            showNotification('Please provide a full answer text or image for structural questions', 'error');
            return;
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
    const questionNumber = get('questionNumber').value;
    const type = get('questionType').value;
    const marksValue = parseInt(get('marks').value, 10);
    const marks = Number.isNaN(marksValue) ? null : marksValue;
    const isStructural = type === 'Structural question';
    const existingId = editingIndex >= 0 && currentTopicData ? currentTopicData.content.questions[editingIndex].id : null;
    const id = existingId || generateQuestionId(source, year, questionNumber);

    return {
        id,
        source,
        year,
        questionNumber,
        type,
        marks,
        topics: getSelectedTopics(), // Names
        question: get('questionText').value,
        image: get('questionImageUrl').value || null,
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
        const imagePath = option.querySelector('.mcq-option-image-url')?.value || null;
        options.push({
            option: letter,
            content: text,
            image: imagePath
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
    const imageField = get('structuralAnswerImageUrl');
    const fullAnswer = textField ? textField.value : '';
    const image = imageField && imageField.value ? imageField.value : null;
    return {
        fullAnswer,
        image,
        keywords: structuralKeywords.slice()
    };
}

function collectImageUploads() {
    const uploads = {
        question: get('questionImageFile')?.files?.[0] || null,
        structuralAnswer: get('structuralAnswerImageFile')?.files?.[0] || null,
        options: {},
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
    get('questionImageUrl').value = question.image || '';
    
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
            const imageInputs = get('mcqOptions').querySelectorAll('.mcq-option-image-url');
            imageInputs[imageInputs.length - 1].value = opt.image || '';
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
    const structuralImageUrl = get('structuralAnswerImageUrl');
    if (normalizedType === 'Structural question') {
        const structural = question.structuralAnswer || {};
        if (structuralText) structuralText.value = structural.fullAnswer || '';
        if (structuralImageUrl) structuralImageUrl.value = structural.image || '';
        structuralKeywords = Array.isArray(structural.keywords) ? [...structural.keywords] : [];
    } else {
        if (structuralText) structuralText.value = '';
        if (structuralImageUrl) structuralImageUrl.value = '';
        structuralKeywords = [];
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
