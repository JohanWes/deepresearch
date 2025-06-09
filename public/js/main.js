const DB_NAME = 'deepResearchHistoryDB';
const STORE_NAME = 'researches';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject("IndexedDB error: " + event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

async function addResearchToDB(research) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(research);

        request.onsuccess = () => {
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error adding/updating research in DB:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function getAllResearchesSorted() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const request = index.getAll();

        request.onsuccess = (event) => {
            const sortedResults = event.target.result.sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            resolve(sortedResults);
        };
        request.onerror = (event) => {
            console.error('Error getting researches from DB:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function deleteResearchFromDB(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error deleting research from DB:', event.target.error);
            reject(event.target.error);
        };
    });
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function renderHistory(historyItems) {
    const historyList = document.getElementById('history-list');
    if (!historyList) {
        return;
    }

    historyList.innerHTML = '';

    if (!historyItems || historyItems.length === 0) {
        historyList.innerHTML = '<li style="color: #888; cursor: default;">No history yet.</li>';
        return;
    }

    historyItems.forEach(item => {
        const li = document.createElement('li');
        li.dataset.id = item.id;

        const textSpan = document.createElement('span');
        textSpan.textContent = item.query;
        textSpan.title = item.query;
        textSpan.style.cursor = 'pointer';
        textSpan.style.marginRight = '20px';
        textSpan.addEventListener('click', () => {
            window.location.href = `/research/${item.id}`;
        });

        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = 'X';
        deleteBtn.className = 'delete-history';
        deleteBtn.title = 'Delete this item';
        deleteBtn.style.cursor = 'pointer';

        li.appendChild(textSpan);
        li.appendChild(deleteBtn);
        historyList.appendChild(li);
    });
}

async function loadAndDisplayHistory() {
    try {
        const historyItems = await getAllResearchesSorted();
        renderHistory(historyItems);
    } catch (error) {
        console.error("Failed to load history:", error);
        const historyList = document.getElementById('history-list');
        if (historyList) {
            historyList.innerHTML = '<li style="color: red; cursor: default;">Error loading history.</li>';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('search-form');
    const queryInput = document.getElementById('query-input');
    const researchButton = document.getElementById('research-button');
    const resultsDiv = document.getElementById('results');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingUrlsList = document.getElementById('loading-urls');
    const loadingSourceCountElement = document.getElementById('loading-source-count');
    const historyList = document.getElementById('history-list');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const desktopSidebarToggle = document.getElementById('desktop-sidebar-toggle');
    const bodyElement = document.body;
    const rateLimitPopup = document.getElementById('rate-limit-popup');
    const rateLimitMessage = document.getElementById('rate-limit-message');
    const rateLimitCount = document.getElementById('rate-limit-count');

    loadAndDisplayHistory();

    // Mobile sidebar toggle
    if (sidebarToggle && bodyElement) {
        sidebarToggle.addEventListener('click', () => {
            bodyElement.classList.toggle('sidebar-open');
        });
    }

    // Desktop sidebar toggle
    if (desktopSidebarToggle && bodyElement) {
        desktopSidebarToggle.addEventListener('click', () => {
            bodyElement.classList.toggle('sidebar-collapsed');
        });
    }

    if (historyList) {
        historyList.addEventListener('click', async (event) => {
            const target = event.target;
            const listItem = target.closest('li[data-id]');

            if (target.classList.contains('delete-history') && listItem) {
                event.preventDefault();
                event.stopPropagation();
                const researchId = listItem.getAttribute('data-id');
                const researchQuery = listItem.querySelector('span:first-child')?.textContent || 'this item';
                if (window.confirm(`Are you sure you want to permanently delete the history for "${researchQuery}"?`)) {
                    try {
                        await deleteResearchFromDB(researchId);
                        listItem.remove();
                        if (historyList.children.length === 0) {
                            historyList.innerHTML = '<li style="color: #888; cursor: default;">No history yet.</li>';
                        }
                    } catch (err) {
                        console.error(`Failed to delete history item ${researchId}:`, err);
                        alert('Failed to delete the history item.');
                    }
                }
            } else if (listItem && target.tagName !== 'SPAN') {
                const researchId = listItem.getAttribute('data-id');
                if (researchId) {
                    window.location.href = `/research/${researchId}`;
                }
            }
        });
    }

    if (searchForm && queryInput && researchButton && resultsDiv && loadingOverlay && loadingUrlsList) {
        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const query = queryInput.value.trim();
            if (!query) {
                resultsDiv.innerHTML = '<div class="results-card"><p class="placeholder error">Please enter a search query.</p></div>';
                return;
            }

            queryInput.disabled = true;
            researchButton.disabled = true;
            resultsDiv.innerHTML = '<p class="placeholder">Initiating research...</p>';
            loadingOverlay.classList.remove('loading-active');
            loadingUrlsList.innerHTML = '';

            let currentResearchId = null;
            let processedSources = [];
            let userQuery = query;

            try {
                const searchResponse = await fetch('/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: query }),
                });

                if (!searchResponse.ok) {
                    const errorData = await searchResponse.json().catch(() => ({ error: 'Failed to parse search error response.' }));
                    if (searchResponse.status === 429) {
                        showRateLimitPopup(errorData.error, errorData.currentUsage, errorData.limit, rateLimitPopup, rateLimitMessage, rateLimitCount, queryInput, researchButton);
                        return; // Stop further processing
                    }
                    throw new Error(`Search request failed: ${searchResponse.status} ${searchResponse.statusText} - ${errorData.error || 'Unknown error'}`);
                }

                const searchData = await searchResponse.json();

                if (!searchData.urlsToProcess || searchData.urlsToProcess.length === 0) {
                    resultsDiv.innerHTML = '<div class="results-card"><p class="placeholder">No relevant sources found to process.</p></div>';
                    queryInput.disabled = false;
                    researchButton.disabled = false;
                    return;
                }

                loadingUrlsList.innerHTML = searchData.urlsToProcess.map(url => `<li>${escapeHTML(url)}</li>`).join('');
                if (loadingSourceCountElement) {
                    const count = searchData.urlsToProcess.length;
                    loadingSourceCountElement.textContent = `Processing ${count} source${count !== 1 ? 's' : ''}...`;
                }
                loadingOverlay.classList.add('loading-active');

                const processResponse = await fetch('/process-and-summarize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: searchData.query,
                        urlsToProcess: searchData.urlsToProcess,
                        topItems: searchData.topItems
                    }),
                });

                if (!processResponse.ok || !processResponse.body) {
                    const errorText = await processResponse.text();
                    throw new Error(`Failed to initiate processing stream: ${processResponse.status} - ${errorText}`);
                }

                resultsDiv.innerHTML = `<div class="results-card"><h2>Research Answer for: ${escapeHTML(searchData.query)}</h2><div id="stream-content"></div><div id="share-link-container"></div><div id="sources-container"></div></div>`;
                const streamContentDiv = document.getElementById('stream-content');
                const shareLinkContainer = document.getElementById('share-link-container');
                const sourcesContainer = document.getElementById('sources-container');

                const reader = processResponse.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let currentEvent = 'message';

                function processStreamChunk() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            handleStreamEnd(false, userQuery, currentResearchId, processedSources, resultsDiv, sourcesContainer);
                            return;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        let lineEnd;
                        while ((lineEnd = buffer.indexOf('\n')) !== -1) {
                            const line = buffer.substring(0, lineEnd).trim();
                            buffer = buffer.substring(lineEnd + 1);

                            if (line.startsWith('event: ')) {
                                currentEvent = line.substring(7).trim();
                            } else if (line.startsWith('data: ')) {
                                const jsonData = line.substring(6);
                                try {
                                    const data = JSON.parse(jsonData);
                                    switch (currentEvent) {
                                        case 'message':
                                            if (data === '[DONE]') {
                                            } else if (typeof data === 'string') {
                                                streamContentDiv.innerHTML += data;
                                            }
                                            break;
                                        case 'info':
                                            if (data.type === 'sources_processed' && data.sources) {
                                                processedSources = data.sources;
                                                const processedUrls = new Set(processedSources.map(s => s.link));
                                                const allLoadingLis = loadingUrlsList.querySelectorAll('li');
                                                allLoadingLis.forEach(li => {
                                                    if (!processedUrls.has(li.textContent)) {
                                                        li.remove();
                                                    }
                                                });
                                            }
                                            break;
                                        case 'resultLink':
                                            if (data.link) {
                                                currentResearchId = data.link.split('/').pop();
                                                shareLinkContainer.innerHTML = `<p>Shareable Link: <a href="${escapeHTML(data.link)}" target="_blank">${escapeHTML(data.link)}</a></p>`;

                                                if (data.cost !== undefined && data.cost !== null) {
                                                    const costPopup = document.getElementById('cost-popup');
                                                    if (costPopup) {
                                                        costPopup.textContent = `Estimated API Cost: $${data.cost.toFixed(6)}`;
                                                        costPopup.classList.add('show');
                                                        setTimeout(() => {
                                                            costPopup.classList.remove('show');
                                                            costPopup.classList.add('fade-out');
                                                            setTimeout(() => {
                                                                costPopup.classList.remove('fade-out');
                                                            }, 500);
                                                        }, 3000);
                                                    }
                                                }
                                            }
                                            break;
                                        case 'error':
                                            streamContentDiv.innerHTML += `<p class="placeholder error">Server error: ${escapeHTML(data.message)}</p>`;
                                            break;
                                        default:
                                            break;
                                    }
                                } catch (e) {
                                    console.error('Error parsing SSE JSON:', e, 'Data:', jsonData);
                                } finally {
                                     if (!line.startsWith('event: ')) {
                                         currentEvent = 'message';
                                     }
                                }
                            }
                        }
                        processStreamChunk();
                    }).catch(error => {
                        console.error('Error reading SSE stream:', error);
                        resultsDiv.innerHTML += '<p class="placeholder error">Error receiving research data.</p>';
                        handleStreamEnd(true, userQuery, currentResearchId, processedSources, resultsDiv, sourcesContainer);
                    });
                }

                processStreamChunk();

            } catch (error) {
                console.error('Error during research process:', error);
                resultsDiv.innerHTML = `<div class="results-card"><p class="placeholder error">An error occurred: ${escapeHTML(error.message)}</p></div>`;
                handleStreamEnd(true, userQuery, currentResearchId, processedSources, resultsDiv, sourcesContainer);
            }
        });

    }
});

async function handleStreamEnd(isError = false, query, researchId, sources, resultsDisplayDiv, sourcesDisplayContainer) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const queryInput = document.getElementById('query-input');
    const researchButton = document.getElementById('research-button');

    if (!isError && researchId) {
        try {
            const response = await fetch(`/research/${researchId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch final result page: ${response.status} ${response.statusText}`);
            }
            const finalHtml = await response.text();

            const parser = new DOMParser();
            const finalDoc = parser.parseFromString(finalHtml, 'text/html');

            const cleanAnswerDiv = finalDoc.getElementById('result-answer-content');
            const streamContentDiv = document.getElementById('stream-content');

            if (cleanAnswerDiv && streamContentDiv) {
                streamContentDiv.innerHTML = cleanAnswerDiv.innerHTML;
            }
        } catch (fetchError) {
            console.error('Error fetching or processing final result page:', fetchError);
        }
    }

    if (loadingOverlay) loadingOverlay.classList.remove('loading-active');
    if (queryInput) queryInput.disabled = false;
    if (researchButton) researchButton.disabled = false;

    if (!isError && sources && sources.length > 0 && sourcesDisplayContainer) {
        let sourceListItems = '';
        sources.forEach((source, index) => {
            const link = source.link ? escapeHTML(source.link) : '#';
            const title = source.title ? escapeHTML(source.title) : link;
            sourceListItems += `<li id="source-${index + 1}"><a href="${link}" target="_blank">${title}</a></li>`;
        });
        sourcesDisplayContainer.innerHTML = `
            <details style="margin-top: 20px;">
                <summary style="cursor: pointer; font-weight: bold; color: #ccc;">Show sources used (${sources.length})</summary>
                <ul style="margin-top: 10px;">${sourceListItems}</ul>
            </details>
        `;
    } else if (!isError && sourcesDisplayContainer) {
         sourcesDisplayContainer.innerHTML = '<p style="margin-top: 20px; color: #aaa;">No sources were processed for this result.</p>';
    }

    if (!isError && researchId && query) {
        try {
            const researchEntry = {
                id: researchId,
                query: query,
                timestamp: new Date().toISOString()
            };
            await addResearchToDB(researchEntry);
            await loadAndDisplayHistory();
        } catch (err) {
            console.error('Failed to save research to history:', err);
        }
    }
}

function showRateLimitPopup(message, currentUsage, limit, popupElement, messageElement, countElement, queryInput, researchButton) {
    if (popupElement && messageElement && countElement) {
        messageElement.textContent = message;
        countElement.textContent = `Requests today: ${currentUsage}/${limit}`;
        popupElement.classList.add('show');
        if (queryInput) queryInput.disabled = true;
        if (researchButton) researchButton.disabled = true;

        setTimeout(() => {
            popupElement.classList.remove('show');
            popupElement.classList.add('fade-out');
            setTimeout(() => {
                popupElement.classList.remove('fade-out');
            }, 500);
        }, 5000); // Popup disappears after 5 seconds
    }
}
