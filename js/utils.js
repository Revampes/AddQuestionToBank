// Generate unique question ID
function generateQuestionId(source, year, number) {
    const s = source || 'Q';
    const y = year || 'XX';
    const n = number || '0';
    return `${s}${y}_${n.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Update progress bar
function updateProgress(percent, message = '') {
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    
    if (percent === 0) {
        progressBar.style.display = 'block';
        progressFill.style.width = '0%';
    } else if (percent === 100) {
        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 500);
    }
    progressFill.style.width = `${percent}%`;
    
    if (message) {
        showNotification(message, percent === 100 ? 'success' : 'warning');
    }
}

// Helper to get element by ID
function get(id) {
    return document.getElementById(id);
}
