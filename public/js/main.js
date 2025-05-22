// --- IndexedDB Helper Functions ---
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

        // This event is only triggered if the version number changes
        // or if the database is created for the first time.
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                // Create an index to sort by timestamp efficiently
                store.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('IndexedDB object store created:', STORE_NAME);
            }
        };
    });
}

async function addResearchToDB(research) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(research); // put = add or update

        request.onsuccess = () => {
            console.log('Research added/updated in DB:', research.id);
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
        const index = store.index('timestamp'); // Use the timestamp index
        const request = index.getAll(); // Get all records using the index

        request.onsuccess = (event) => {
            // Sort descending (newest first)
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
            console.log('Research deleted from DB:', id);
            resolve();
        };
        request.onerror = (event) => {
            console.error('Error deleting research from DB:', event.target.error);
            reject(event.target.error);
        };
    });
}

// --- End IndexedDB Helper Functions ---


// --- Utility Functions ---

// Function to escape HTML special characters
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// --- End Utility Functions ---


// --- Rendering Functions ---

// Function to render history items in the sidebar
function renderHistory(historyItems) {
    const historyList = document.getElementById('history-list');
    if (!historyList) {
        console.warn('History list element not found.');
        return;
    }

    historyList.innerHTML = ''; // Clear existing items

    if (!historyItems || historyItems.length === 0) {
        historyList.innerHTML = '<li style="color: #888; cursor: default;">No history yet.</li>';
        return;
    }

    historyItems.forEach(item => {
        const li = document.createElement('li');
        li.dataset.id = item.id; // Store the ID on the list item

        // Create a container for the text to handle clicks separately
        const textSpan = document.createElement('span');
        textSpan.textContent = item.query;
        textSpan.title = item.query; // Show full query on hover
        textSpan.style.cursor = 'pointer'; // Indicate it's clickable
        textSpan.style.marginRight = '20px'; // Add space before the delete button
        textSpan.addEventListener('click', () => {
            window.location.href = `/research/${item.id}`; // Navigate on text click
        });

        // Create the delete button
        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = 'X';
        deleteBtn.className = 'delete-history'; // Class for styling and event delegation
        deleteBtn.title = 'Delete this item';
        deleteBtn.style.cursor = 'pointer';
        // Styles will be added via CSS later, but basic cursor pointer is helpful

        li.appendChild(textSpan);
        li.appendChild(deleteBtn);
        historyList.appendChild(li);
    });
}

// Function to load and display history
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

// --- End Rendering Functions ---


// --- Main Application Logic ---

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const searchForm = document.getElementById('search-form'); // Used on main page
    const queryInput = document.getElementById('query-input'); // Used on main page
    const researchButton = document.getElementById('research-button'); // Used on main page
    const resultsDiv = document.getElementById('results'); // Used on main page
    const loadingOverlay = document.getElementById('loading-overlay'); // Used on main page
    const loadingUrlsList = document.getElementById('loading-urls'); // Used on main page
    const loadingSourceCountElement = document.getElementById('loading-source-count'); // Get the new span for mobile count
    const historyList = document.getElementById('history-list'); // Used on all pages
    const sidebarToggle = document.getElementById('sidebar-toggle'); // Used on all pages
    const bodyElement = document.body; // Used on all pages

    // --- Initial Setup ---
    loadAndDisplayHistory(); // Load history on all pages where the script runs

    // --- Event Listeners ---

    // Sidebar Toggle Logic (Applies to all pages)
    if (sidebarToggle && bodyElement) {
        sidebarToggle.addEventListener('click', () => {
            bodyElement.classList.toggle('sidebar-open');
        });
    } else {
        console.warn('Sidebar toggle button or body element not found.');
    }

    // History List Delegation Logic (Applies to all pages)
    if (historyList) {
        historyList.addEventListener('click', async (event) => {
            const target = event.target;
            const listItem = target.closest('li[data-id]'); // Find parent LI with data-id

            if (target.classList.contains('delete-history') && listItem) {
                // Handle Delete Button Click
                event.preventDefault();
                event.stopPropagation();
                const researchId = listItem.getAttribute('data-id');
                const researchQuery = listItem.querySelector('span:first-child')?.textContent || 'this item';
                if (window.confirm(`Are you sure you want to permanently delete the history for "${researchQuery}"?`)) {
                    try {
                        await deleteResearchFromDB(researchId);
                        listItem.remove(); // Remove from UI immediately
                        console.log(`History item ${researchId} deleted successfully.`);
                        if (historyList.children.length === 0) {
                            historyList.innerHTML = '<li style="color: #888; cursor: default;">No history yet.</li>';
                        }
                    } catch (err) {
                        console.error(`Failed to delete history item ${researchId}:`, err);
                        alert('Failed to delete the history item.'); // Inform user
                    }
                }
            } else if (listItem && target.tagName !== 'SPAN') { // Navigate only if clicking the LI itself, not the delete span
                // Handle History Item Click (Navigation)
                const researchId = listItem.getAttribute('data-id');
                if (researchId) {
                    window.location.href = `/research/${researchId}`; // Navigate to the result page
                }
            }
        });
    } else {
        console.warn('History list element not found, cannot attach delete listener.');
    }

    // Main Page Specific Logic (Search Form & SSE Handling)
    // Check if the main search form exists on the current page
    if (searchForm && queryInput && researchButton && resultsDiv && loadingOverlay && loadingUrlsList) {
        console.log('[Client] Main page elements found. Initializing search form logic.');

        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const query = queryInput.value.trim();
            if (!query) {
                resultsDiv.innerHTML = '<p class="placeholder error">Please enter a search query.</p>';
                return;
            }

            // Disable form and show basic loading indicator
            queryInput.disabled = true;
            researchButton.disabled = true;
            resultsDiv.innerHTML = '<p class="placeholder">Initiating research...</p>';
            loadingOverlay.classList.remove('loading-active');
            loadingUrlsList.innerHTML = '';

            let currentResearchId = null;
            let processedSources = [];
            let userQuery = query; // Store query for use in history saving

            try {
                // --- Step 1: Call /search to get URLs and items ---
                console.log(`[main.js] Sending query to /search: ${query}`);
                const searchResponse = await fetch('/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: query }),
                });

                if (!searchResponse.ok) {
                    const errorData = await searchResponse.json().catch(() => ({ error: 'Failed to parse search error response.' }));
                    throw new Error(`Search request failed: ${searchResponse.status} ${searchResponse.statusText} - ${errorData.error || 'Unknown error'}`);
                }

                const searchData = await searchResponse.json();
                console.log('[main.js] Received response from /search:', searchData);

                if (!searchData.urlsToProcess || searchData.urlsToProcess.length === 0) {
                    resultsDiv.innerHTML = '<p class="placeholder">No relevant sources found to process.</p>';
                    queryInput.disabled = false;
                    researchButton.disabled = false;
                    return;
                }

                // --- Show Enhanced Loading Screen ---
                // Update URL list for desktop
                loadingUrlsList.innerHTML = searchData.urlsToProcess.map(url => `<li>${escapeHTML(url)}</li>`).join('');
                // Update source count for mobile
                if (loadingSourceCountElement) {
                    const count = searchData.urlsToProcess.length;
                    loadingSourceCountElement.textContent = `Processing ${count} source${count !== 1 ? 's' : ''}...`;
                }
                loadingOverlay.classList.add('loading-active');

                // --- Step 2: Call /process-and-summarize and handle SSE ---
                console.log('[main.js] Sending data to /process-and-summarize to trigger SSE');
                const processResponse = await fetch('/process-and-summarize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: searchData.query, // Use query from search response
                        urlsToProcess: searchData.urlsToProcess,
                        topItems: searchData.topItems
                    }),
                });

                if (!processResponse.ok || !processResponse.body) {
                    const errorText = await processResponse.text();
                    throw new Error(`Failed to initiate processing stream: ${processResponse.status} - ${errorText}`);
                }

                // --- Process the SSE stream from the response body ---
                console.log('[main.js] Processing SSE stream from response body');
                resultsDiv.innerHTML = `<h2>Research Answer for: ${escapeHTML(searchData.query)}</h2><div id="stream-content"></div><div id="share-link-container"></div><div id="sources-container"></div>`; // Prepare results area
                const streamContentDiv = document.getElementById('stream-content');
                const shareLinkContainer = document.getElementById('share-link-container');
                const sourcesContainer = document.getElementById('sources-container');

                const reader = processResponse.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let currentEvent = 'message'; // Default event type

                function processStreamChunk() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            console.log('[main.js] SSE Stream finished.');
                            handleStreamEnd(false, userQuery, currentResearchId, processedSources, resultsDiv, sourcesContainer); // Pass necessary context
                            return;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        // Process buffer line by line
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
                                    // Handle event based on currentEvent
                                    switch (currentEvent) {
                                        case 'message':
                                            if (data === '[DONE]') {
                                                // This case might not be needed if 'done' flag is reliable
                                                console.log('[main.js] Received [DONE] marker in message event.');
                                            } else if (typeof data === 'string') {
                                                // Reverted: Append raw data directly
                                                streamContentDiv.innerHTML += data;
                                            }
                                            break;
                                        case 'info':
                                            if (data.type === 'sources_processed' && data.sources) {
                                                processedSources = data.sources; // Store sources
                                                // Filter loading URLs
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
                                                currentResearchId = data.link.split('/').pop(); // Extract ID
                                                shareLinkContainer.innerHTML = `<p>Shareable Link: <a href="${escapeHTML(data.link)}" target="_blank">${escapeHTML(data.link)}</a></p>`;

                                                // Display usage information if available (no longer on main page, only on result page)
                                                // if (data.usage) {
                                                //     const usageDiv = document.createElement('div');
                                                //     usageDiv.id = 'token-usage-info';
                                                //     usageDiv.style.marginTop = '10px';
                                                //     usageDiv.style.fontSize = '0.9em';
                                                //     usageDiv.style.color = '#aaa';
                                                //     let usageHtml = `
                                                //         <strong>Token Usage:</strong><br>
                                                //         Prompt: ${data.usage.prompt_tokens || 'N/A'}<br>
                                                //         Completion: ${data.usage.completion_tokens || 'N/A'}<br>
                                                //         Total: ${data.usage.total_tokens || 'N/A'}
                                                //     `;
                                                //     if (data.cost !== undefined && data.cost !== null) {
                                                //         usageHtml += `<br><strong>Estimated Cost:</strong> $${data.cost.toFixed(6)}`;
                                                //     }
                                                //     usageDiv.innerHTML = usageHtml;
                                                //     const resultsContainer = document.getElementById('results');
                                                //     if (shareLinkContainer && shareLinkContainer.parentNode) {
                                                //         shareLinkContainer.parentNode.insertBefore(usageDiv, shareLinkContainer.nextSibling);
                                                //     } else if (resultsContainer) {
                                                //         resultsContainer.appendChild(usageDiv);
                                                //     }
                                                // }

                                                // Show cost popup
                                                if (data.cost !== undefined && data.cost !== null) {
                                                    const costPopup = document.getElementById('cost-popup');
                                                    if (costPopup) {
                                                        costPopup.textContent = `Estimated API Cost: $${data.cost.toFixed(6)}`;
                                                        costPopup.classList.add('show');
                                                        setTimeout(() => {
                                                            costPopup.classList.remove('show');
                                                            costPopup.classList.add('fade-out'); // Start fade-out
                                                            // Optionally, fully hide after animation if CSS doesn't handle it
                                                            setTimeout(() => {
                                                                costPopup.classList.remove('fade-out');
                                                            }, 500); // Match CSS transition duration
                                                        }, 3000); // Display for 3 seconds
                                                    }
                                                }
                                            }
                                            break;
                                        case 'error':
                                            console.error('[main.js] SSE Error Event:', data.message);
                                            streamContentDiv.innerHTML += `<p class="placeholder error">Server error: ${escapeHTML(data.message)}</p>`;
                                            break;
                                        default:
                                            console.warn(`[main.js] Unknown SSE event type: ${currentEvent}`);
                                    }
                                } catch (e) {
                                    console.error('[main.js] Error parsing SSE JSON:', e, 'Data:', jsonData);
                                } finally {
                                     // Reset event type after processing data line, unless it was just set
                                     if (!line.startsWith('event: ')) {
                                         currentEvent = 'message';
                                     }
                                }
                            }
                        }
                        // Continue reading
                        processStreamChunk();
                    }).catch(error => {
                        console.error('[main.js] Error reading SSE stream:', error);
                        resultsDiv.innerHTML += '<p class="placeholder error">Error receiving research data.</p>';
                        handleStreamEnd(true, userQuery, currentResearchId, processedSources, resultsDiv, sourcesContainer); // Pass error flag and context
                    });
                }

                processStreamChunk(); // Start processing the stream

            } catch (error) {
                console.error('[main.js] Error during research process:', error);
                resultsDiv.innerHTML = `<p class="placeholder error">An error occurred: ${escapeHTML(error.message)}</p>`;
                handleStreamEnd(true, userQuery, currentResearchId, processedSources, resultsDiv, sourcesContainer); // Pass error flag and context
            }
        });

    } else {
        console.log('[Client] Main search form elements not found. Skipping main page logic initialization (likely on a result page).');
    }
}); // End of DOMContentLoaded listener

// --- Utility Functions --- (Adding footnote processing here)

// --- Stream Handling Function ---
// Moved outside DOMContentLoaded as it's called asynchronously
async function handleStreamEnd(isError = false, query, researchId, sources, resultsDisplayDiv, sourcesDisplayContainer) {
    console.log('[main.js] Cleaning up after stream end.');
    const loadingOverlay = document.getElementById('loading-overlay');
    const queryInput = document.getElementById('query-input');
    const researchButton = document.getElementById('research-button');

    // --- "Refresh" Logic ---
    // Fetch the final content from the shareable link page if successful
    if (!isError && researchId) {
        try {
            console.log(`[main.js] Fetching final content from /research/${researchId}`);
            const response = await fetch(`/research/${researchId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch final result page: ${response.status} ${response.statusText}`);
            }
            const finalHtml = await response.text();

            // Parse the fetched HTML
            const parser = new DOMParser();
            const finalDoc = parser.parseFromString(finalHtml, 'text/html');

            // Find the clean answer content using the ID we added
            const cleanAnswerDiv = finalDoc.getElementById('result-answer-content');
            const streamContentDiv = document.getElementById('stream-content'); // Get the target div on the current page

            if (cleanAnswerDiv && streamContentDiv) {
                console.log('[main.js] Replacing streamed content with final fetched content.');
                // Replace the potentially messy streamed content with the clean HTML
                streamContentDiv.innerHTML = cleanAnswerDiv.innerHTML;
            } else {
                console.warn('[main.js] Could not find clean answer content or target div for replacement.');
                // Fallback: leave the streamed content as is
            }
        } catch (fetchError) {
            console.error('[main.js] Error fetching or processing final result page:', fetchError);
            // Fallback: leave the streamed content as is
        }
    }
    // --- End Refresh Logic ---


    // Hide loading overlay and re-enable form AFTER potential refresh
    if (loadingOverlay) loadingOverlay.classList.remove('loading-active');
    if (queryInput) queryInput.disabled = false;
    if (researchButton) researchButton.disabled = false;


    // Append sources if available and no error occurred (do this AFTER replacing content)
    if (!isError && sources && sources.length > 0 && sourcesDisplayContainer) {
        let sourceListItems = '';
        // Add index to forEach to generate IDs
        sources.forEach((source, index) => {
            const link = source.link ? escapeHTML(source.link) : '#';
            const title = source.title ? escapeHTML(source.title) : link;
            // Add id="source-X" to the list item (using 1-based index)
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

    // Save to history if successful and ID received
    if (!isError && researchId && query) {
        try {
            const researchEntry = {
                id: researchId,
                query: query,
                timestamp: new Date().toISOString()
            };
            await addResearchToDB(researchEntry);
            console.log('[main.js] Research saved to history.');
            await loadAndDisplayHistory(); // Refresh history list
        } catch (err) {
            console.error('[main.js] Failed to save research to history:', err);
        }
    } else if (!isError) {
        console.warn('[main.js] Could not save to history: Missing research ID or query.');
    }
}
