// UI Functions

function initializeTopics() {
    const container = get('topicCheckboxes');
    container.innerHTML = '';
    TOPICS.forEach(topic => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="${topic.id}" value="${topic.file}">
            <label for="${topic.id}">${topic.name}</label>
        `;
        container.appendChild(div);
    });

    // Also initialize topic selector for Manager
    populateManagerSelect();
}

function populateManagerSelect() {
    const selector = get('managerTopicSelect');
    if (!selector) return;
    // Preserve current selection if possible
    const current = selector.value;
    selector.innerHTML = '<option value="">Select a Topic...</option>';
    TOPICS.forEach(topic => {
        const option = document.createElement('option');
        option.value = topic.file;
        option.textContent = topic.name;
        selector.appendChild(option);
    });
    if (current) {
        const exists = Array.from(selector.options).some(o => o.value === current);
        if (exists) selector.value = current;
    }
}

// Format question ID as [source][year][questionNumber]
function formatQuestionId(q) {
    const src = (q.source || '').toString().trim() || 'Unknown';
    const yr = (q.year || '').toString().trim() || '----';
    const paper = (q.paper || '').toString().trim();
    const num = (q.questionNumber || '').toString().trim() || '';
    return paper ? `[${src}][${yr}][${paper}][${num}]` : `[${src}][${yr}][${num}]`;
}

function renderQueue(queue) {
    const container = get('queueList');
    const countBadge = get('queueCount');
    
    countBadge.textContent = queue.length;
    container.innerHTML = '';
    
    if (queue.length === 0) {
        container.innerHTML = '<div class="empty-state">Queue is empty</div>';
        return;
    }
    
    queue.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        const hasUploads = Boolean(
            (item.uploads && (
                item.uploads.question ||
                item.uploads.structuralAnswer ||
                (item.uploads.options && Object.keys(item.uploads.options).length > 0)
            )) ||
            item.image ||
            (item.options && item.options.some(opt => opt.image)) ||
            (item.structuralAnswer && item.structuralAnswer.image)
        );
        const mediaBadge = hasUploads ? '<span>•</span><span>📷 media</span>' : '';
        const marksValue = Number.parseInt(item.marks, 10);
        const marksBadge = Number.isNaN(marksValue) ? '' : `<span>•</span><span>${marksValue} marks</span>`;
        const snippet = (item.question || '').substring(0, 50);
        const isMCQ = item.type === 'Multiple-choice';
        const typeLabel = isMCQ ? 'Multiple-choice' : 'Structural question';
        div.innerHTML = `
            <div class="queue-item-content">
                <div class="queue-item-title">${item.questionNumber}. ${snippet}...</div>
                <div class="queue-item-meta">
                    <span>${typeLabel}</span>
                    <span>•</span>
                    <span>${item.topics.length} topics</span>
                    ${marksBadge}
                    ${mediaBadge}
                </div>
            </div>
            <div class="queue-item-actions">
                <button class="btn btn-sm btn-danger" onclick="removeFromQueue(${index})">×</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderQuestionList(questions, topicFile) {
    const container = get('questionList');
    container.innerHTML = '';
    
    if (!questions || questions.length === 0) {
        container.innerHTML = '<div class="empty-state">No questions found in this topic.</div>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'question-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width: 40px"><input type="checkbox" id="selectAllQuestions"></th>
                <th style="width: 80px">ID</th>
                <th style="width: 80px">Marks</th>
                <th>Question</th>
                <th style="width: 100px">Type</th>
                <th style="width: 100px">Actions</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    
    questions.forEach((q, index) => {
        const tr = document.createElement('tr');
        const marksValue = Number.parseInt(q.marks, 10);
        const isMCQ = q.type === 'Multiple-choice';
        const typeClass = isMCQ ? 'badge-mcq' : 'badge-struct';
        const typeLabel = isMCQ ? 'Multiple-choice' : 'Structural question';
        
        tr.innerHTML = `
            <td><input type="checkbox" class="question-select" value="${index}"></td>
            <td>${formatQuestionId(q)}</td>
            <td>${Number.isNaN(marksValue) ? '-' : marksValue}</td>
            <td>${q.question.substring(0, 100)}${q.question.length > 100 ? '...' : ''}</td>
            <td><span class="badge ${typeClass}">${typeLabel}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editQuestion('${topicFile}', ${index})">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    container.appendChild(table);
    
    // Handle Select All
    get('selectAllQuestions').addEventListener('change', (e) => {
        document.querySelectorAll('.question-select').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });
}

function updateFileStatus(files) {
    const fileList = get('fileStatus');
    fileList.innerHTML = '';
    
    TOPICS.forEach(topic => {
        const fileData = files[topic.file];
        if (fileData) {
            fileList.innerHTML += `
                <div class="file-item">
                    <span>📄 ${topic.file}</span>
                    <span class="status" style="color: #48bb78">${fileData.content.questions.length} questions</span>
                </div>
            `;
        } else {
            fileList.innerHTML += `
                <div class="file-item">
                    <span>📄 ${topic.file}</span>
                    <span class="status" style="color: #ed8936;">Not loaded</span>
                </div>
            `;
        }
    });
}

function switchToTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    get(tabId).classList.add('active');
    document.querySelector(`.tab-btn[onclick="showTab('${tabId}')"]`).classList.add('active');
}
