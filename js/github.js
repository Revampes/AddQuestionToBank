// GitHub API Functions

let repoInfo = null;

async function fetchGitHub(endpoint, options = {}) {
    if (!repoInfo?.token) {
        throw new Error('GitHub not connected');
    }
    
    const defaultOptions = {
        headers: {
            'Authorization': `token ${repoInfo.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    };
    
    // Build URL without introducing a trailing slash when endpoint is empty
    const repoBase = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`;
    const cleanEndpoint = (endpoint || '').toString().replace(/^\/+/, '');
    const url = cleanEndpoint ? `${repoBase}/${cleanEndpoint}` : repoBase;
    let response;
    try {
        response = await fetch(url, { ...defaultOptions, ...options });
    } catch (err) {
        throw new Error(`Network error fetching ${url}: ${err.message}`);
    }

    if (!response.ok) {
        // Attempt to include response body if available
        let bodyText = '';
        try { bodyText = await response.text(); } catch (e) { /* ignore */ }
        throw new Error(`GitHub API error ${response.status} when fetching ${url}: ${bodyText}`);
    }

    try {
        return await response.json();
    } catch (err) {
        throw new Error(`Failed to parse JSON from ${url}: ${err.message}`);
    }
}

async function githubTestConnection(repoUrl, token) {
    if (!repoUrl || !token) {
        throw new Error('Please enter both repository URL and token');
    }
    
    // Parse repo URL
    const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) {
        throw new Error('Invalid GitHub repository URL');
    }
    
    const [, owner, repo] = repoMatch;
    repoInfo = { owner, repo: repo.replace('.git', ''), token };
    
    // Test API connection
    await fetchGitHub('');
    
    // Check topics directory
    try {
        await fetchGitHub('contents/topics');
    } catch (e) {
        if (e.message.includes('404')) {
            await createTopicsDirectory();
        } else {
            throw e;
        }
    }
    
    return repoInfo;
}

// Persist repository URL and token locally after a successful connection
function saveGitHubCredentials(repoUrl, token) {
    try {
        localStorage.setItem('qb_repoUrl', repoUrl);
        localStorage.setItem('qb_githubToken', token);
    } catch (e) {
        console.warn('Failed to save GitHub credentials locally:', e);
    }
}

async function createTopicsDirectory() {
    try {
        const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/topics`;
        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${repoInfo.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Create topics directory',
                content: btoa('') // Empty directory
            })
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`Failed to create topics directory: ${resp.status} ${txt}`);
        }
    } catch (err) {
        throw new Error(`Network error creating topics directory: ${err.message}`);
    }
    
    // Initialize empty topic files
    for (const topic of TOPICS) {
        const initialContent = {
            metadata: {
                topic: topic.name,
                lastUpdated: new Date().toISOString(),
                totalQuestions: 0
            },
            questions: []
        };
        
        await createOrUpdateFile(
            `topics/${topic.file}`,
            JSON.stringify(initialContent, null, 2),
            'Initialize topic file'
        );
    }
}

async function loadExistingTopics() {
    const files = await fetchGitHub('contents/topics');
    const results = {};
    
    for (const topic of TOPICS) {
        const topicFile = files.find(f => f.name === topic.file);
        
        if (topicFile) {
            // Load file content (handle empty or invalid JSON)
            let content = null;
            try {
                const contentResponse = await fetch(topicFile.download_url);
                if (!contentResponse.ok) {
                    const t = await contentResponse.text().catch(() => '');
                    console.warn(`Failed to fetch ${topic.file} content: ${contentResponse.status} ${t}`);
                    content = createEmptyTopic(topic.name);
                } else {
                    const text = await contentResponse.text();
                    if (!text) {
                        content = createEmptyTopic(topic.name);
                    } else {
                        try {
                            content = JSON.parse(text);
                        } catch (err) {
                            console.error(`Failed to parse ${topic.file}:`, err);
                            content = createEmptyTopic(topic.name);
                        }
                    }
                }
            } catch (err) {
                console.error(`Network error fetching ${topic.file}:`, err);
                content = createEmptyTopic(topic.name);
            }

            results[topic.file] = {
                sha: topicFile.sha,
                content: content
            };
        }
    }
    return results;
}

function createEmptyTopic(name) {
    return {
        metadata: {
            topic: name,
            lastUpdated: new Date().toISOString(),
            totalQuestions: 0
        },
        questions: []
    };
}

async function createOrUpdateFile(path, content, commitMessage, sha = null, options = {}) {
    const { isBase64 = false } = options;
    // If SHA not provided, try to get it
    if (!sha) {
        try {
            const fileData = await fetchGitHub(`contents/${path}`);
            sha = fileData.sha;
        } catch (e) {
            // File doesn't exist
        }
    }
    
    const response = await fetch(
        `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${path}`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `token ${repoInfo.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: commitMessage,
                content: isBase64 ? content : btoa(unescape(encodeURIComponent(content))),
                sha: sha
            })
        }
    );
    try {
        if (!response.ok) {
            const txt = await response.text().catch(() => '');
            throw new Error(`Failed to update file ${path}: ${response.status} ${txt}`);
        }
    } catch (err) {
        throw new Error(`Network error updating file ${path}: ${err.message}`);
    }

    try {
        const result = await response.json();
        return result.content.sha;
    } catch (err) {
        throw new Error(`Failed to parse update response for ${path}: ${err.message}`);
    }
}

async function fetchTopicFile(filename) {
    try {
        const fileData = await fetchGitHub(`contents/topics/${filename}`);
        const contentResponse = await fetch(fileData.download_url);
        const content = await contentResponse.json();
        return {
            sha: fileData.sha,
            content: content
        };
    } catch (error) {
        console.error(`Error fetching ${filename}:`, error);
        return null;
    }
}
