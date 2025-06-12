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

        const contentDiv = document.createElement('div');
        contentDiv.style.display = 'flex';
        contentDiv.style.flexDirection = 'column';
        contentDiv.style.gap = '4px';
        contentDiv.style.cursor = 'pointer';
        contentDiv.style.flex = '1';
        contentDiv.addEventListener('click', () => {
            window.location.href = `/research/${item.id}`;
        });

        const textSpan = document.createElement('span');
        textSpan.textContent = item.query;
        textSpan.title = item.query;
        textSpan.style.fontSize = 'var(--text-sm)';
        textSpan.style.color = 'var(--text-secondary)';

        const modelSpan = document.createElement('span');
        if (item.modelUsed) {
            modelSpan.textContent = `${item.modelUsed.name} (${item.modelUsed.provider})`;
            modelSpan.style.fontSize = '10px';
            modelSpan.style.color = 'var(--text-muted)';
            modelSpan.style.fontStyle = 'italic';
        }

        contentDiv.appendChild(textSpan);
        if (item.modelUsed) {
            contentDiv.appendChild(modelSpan);
        }

        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = 'X';
        deleteBtn.className = 'delete-history';
        deleteBtn.title = 'Delete this item';
        deleteBtn.style.cursor = 'pointer';

        li.appendChild(contentDiv);
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

// Model management
let availableModels = [];
let selectedModel = null;
let currentCarouselIndex = 0;


async function loadAvailableModels() {
    try {
        const response = await fetch('/api/models');
        if (!response.ok) {
            throw new Error(`Failed to load models: ${response.status}`);
        }
        const data = await response.json();
        availableModels = data.models;
        
        // Load saved model preference or use default
        const savedModel = localStorage.getItem('preferredLLMModel');
        selectedModel = savedModel && availableModels.find(m => m.id === savedModel) 
            ? savedModel 
            : data.defaultModel;
        
        renderModelSelector();
    } catch (error) {
        console.error('Error loading models:', error);
        // Fallback to basic functionality
        selectedModel = null;
    }
}

function renderModelSelector() {
    const modelCardsContainer = document.getElementById('model-cards');
    if (!modelCardsContainer || !availableModels.length) return;

    currentCarouselIndex = 0;

    if (window.innerWidth > 768) {
        renderDesktopCarousel();
        renderScrollbar(); // New function
    } else {
        renderMobileView();
    }

    updateCarouselButtons();
    updateCarouselTransform(); // Initial position update
}

function renderDesktopCarousel() {
    const modelCardsContainer = document.getElementById('model-cards');
    modelCardsContainer.innerHTML = '';
    
    // Render all cards for desktop, scrolling is handled by transform
    availableModels.forEach(model => {
        const card = createModelCard(model);
        modelCardsContainer.appendChild(card);
    });
}

function renderMobileView() {
    const modelCardsContainer = document.getElementById('model-cards');
    const modelSelectorContainer = document.getElementById('model-selector-container');
    
    if (!modelCardsContainer || !modelSelectorContainer) return;
    
    // Clear existing content
    modelCardsContainer.innerHTML = '';
    
    // Add Swiper container structure
    const swiperContainer = document.createElement('div');
    swiperContainer.className = 'swiper-container mobile-model-swiper';
    
    const swiperWrapper = document.createElement('div');
    swiperWrapper.className = 'swiper-wrapper';
    
    // Create slides for each model
    availableModels.forEach(model => {
        const slide = document.createElement('div');
        slide.className = 'swiper-slide';
        const card = createModelCard(model);
        slide.appendChild(card);
        swiperWrapper.appendChild(slide);
    });
    
    swiperContainer.appendChild(swiperWrapper);
    
    // Add pagination
    const pagination = document.createElement('div');
    pagination.className = 'swiper-pagination';
    swiperContainer.appendChild(pagination);
    
    // Replace model cards container content
    modelCardsContainer.appendChild(swiperContainer);
    
    // Initialize Swiper when ready
    initializeMobileSwiper();
}

let mobileSwiper = null;

function initializeMobileSwiper() {
    // Wait for Swiper to load
    if (!window.Swiper) {
        if (window.swiperLoaded) {
            // Swiper loaded but not available yet, wait a bit
            setTimeout(initializeMobileSwiper, 50);
        } else {
            // Wait for swiper to load
            window.addEventListener('swiperready', initializeMobileSwiper);
        }
        return;
    }
    
    // Destroy existing instance if any
    if (mobileSwiper) {
        mobileSwiper.destroy(true, true);
        mobileSwiper = null;
    }
    
    // Find initial slide index based on selected model
    const initialSlide = availableModels.findIndex(m => m.id === selectedModel);
    
    // Initialize Swiper
    mobileSwiper = new Swiper('.mobile-model-swiper', {
        slidesPerView: 'auto',
        centeredSlides: true,
        spaceBetween: 16,
        initialSlide: initialSlide >= 0 ? initialSlide : 0,
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
            dynamicBullets: true,
            dynamicMainBullets: 3
        },
        speed: 300,
        threshold: 10,
        resistanceRatio: 0.85,
        grabCursor: true,
        on: {
            click: function(swiper, event) {
                // Handle card selection
                const clickedSlide = swiper.slides[swiper.clickedIndex];
                if (clickedSlide) {
                    const modelCard = clickedSlide.querySelector('.model-card');
                    if (modelCard) {
                        const modelId = modelCard.dataset.modelId;
                        selectModel(modelId);
                        
                        // Center the selected card
                        if (swiper.clickedIndex !== swiper.activeIndex) {
                            swiper.slideTo(swiper.clickedIndex);
                        }
                    }
                }
            }
        }
    });
}

function createModelCard(model) {
    const card = document.createElement('div');
    card.className = `model-card ${model.id === selectedModel ? 'selected' : ''}`;
    card.dataset.modelId = model.id;
    
    card.innerHTML = `
        <div class="model-name">${escapeHTML(model.name)}</div>
        <div class="model-provider">${escapeHTML(model.provider)}</div>
        <div class="model-description">${escapeHTML(model.description)}</div>
        <div class="model-pricing">
            <div class="model-pricing-item">
                <div class="pricing-label">Input</div>
                <div class="pricing-value">$${model.inputPrice.toFixed(2)}</div>
            </div>
            <div class="model-pricing-item">
                <div class="pricing-label">Output</div>
                <div class="pricing-value">$${model.outputPrice.toFixed(2)}</div>
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => selectModel(model.id));
    return card;
}

function updateCarouselTransform() {
    if (window.innerWidth <= 768) return;

    const modelCards = document.getElementById('model-cards');
    if (!modelCards) return;

    const cardWidth = 220; // From CSS
    const gap = 16; // From CSS var(--space-4)
    const scrollAmount = currentCarouselIndex * (cardWidth + gap);

    modelCards.style.transform = `translateX(-${scrollAmount}px)`;
    updateScrollbarThumb();
}

function updateCarouselButtons() {
    const leftBtn = document.getElementById('scroll-left');
    const rightBtn = document.getElementById('scroll-right');

    if (!leftBtn || !rightBtn) return;

    if (window.innerWidth > 768) {
        const container = document.getElementById('model-cards-container');
        const content = document.getElementById('model-cards');
        if (!container || !content) return;

        const maxScroll = content.scrollWidth - container.clientWidth;
        const currentScroll = currentCarouselIndex * (220 + 16);

        leftBtn.disabled = currentCarouselIndex === 0;
        rightBtn.disabled = currentScroll >= maxScroll;

    } else {
        // Hide buttons on mobile
        leftBtn.style.display = 'none';
        rightBtn.style.display = 'none';
    }
}

function setupScrollButtons() {
    const scrollLeftBtn = document.getElementById('scroll-left');
    const scrollRightBtn = document.getElementById('scroll-right');
    
    if (!scrollLeftBtn || !scrollRightBtn) return;
    
    // Set arrow text content directly
    scrollLeftBtn.innerHTML = '‹';
    scrollRightBtn.innerHTML = '›';
    
    scrollLeftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateCarousel('left');
    });
    
    scrollRightBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateCarousel('right');
    });
}

function navigateCarousel(direction) {
    if (window.innerWidth <= 768) return;

    const container = document.getElementById('model-cards-container');
    const content = document.getElementById('model-cards');
    if (!container || !content) return;

    const containerWidth = container.clientWidth;
    const contentWidth = content.scrollWidth;
    const maxScrollIndex = Math.ceil((contentWidth - containerWidth) / (220 + 16));

    if (direction === 'left') {
        currentCarouselIndex = Math.max(0, currentCarouselIndex - 1);
    } else if (direction === 'right') {
        currentCarouselIndex = Math.min(maxScrollIndex, currentCarouselIndex + 1);
    }

    updateCarouselTransform();
    updateCarouselButtons();
}

function renderScrollbar() {
    if (window.innerWidth <= 768) return;
    updateScrollbarThumb();
}

function updateScrollbarThumb() {
    if (window.innerWidth <= 768) return;

    const thumb = document.getElementById('scrollbar-thumb');
    const container = document.getElementById('model-cards-container');
    const content = document.getElementById('model-cards');
    const scrollbar = document.getElementById('carousel-scrollbar');

    if (!thumb || !container || !content || !scrollbar) return;

    const contentWidth = content.scrollWidth;
    const containerWidth = container.clientWidth;

    if (contentWidth <= containerWidth) {
        scrollbar.style.display = 'none';
        return;
    }
    
    scrollbar.style.display = 'block';

    const thumbWidth = (containerWidth / contentWidth) * 100;
    thumb.style.width = `${thumbWidth}%`;

    const scrollPercentage = (currentCarouselIndex * (220 + 16)) / (contentWidth - containerWidth);
    const thumbPosition = scrollPercentage * (100 - thumbWidth);
    thumb.style.left = `${thumbPosition}%`;
}

function selectModel(modelId) {
    selectedModel = modelId;
    localStorage.setItem('preferredLLMModel', modelId);
    
    // Update UI
    document.querySelectorAll('.model-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.modelId === modelId);
    });
    
    // Handle mobile Swiper centering
    if (window.innerWidth <= 768 && mobileSwiper) {
        const selectedIndex = availableModels.findIndex(m => m.id === modelId);
        if (selectedIndex >= 0 && selectedIndex !== mobileSwiper.activeIndex) {
            mobileSwiper.slideTo(selectedIndex);
        }
    } else {
        // Desktop carousel behavior remains unchanged
        ensureModelVisible(modelId);
    }
}

function ensureModelVisible(modelId) {
    if (window.innerWidth <= 768) {
        // Don't move carousel on mobile when selecting a card
        return;
    }

    const modelIndex = availableModels.findIndex(m => m.id === modelId);
    if (modelIndex === -1) return;

    const container = document.getElementById('model-cards-container');
    if (!container) return;

    const cardWidth = 220;
    const gap = 16;
    const cardFullWidth = cardWidth + gap;

    const containerWidth = container.clientWidth;
    const currentScroll = currentCarouselIndex * cardFullWidth;

    const modelLeft = modelIndex * cardFullWidth;
    const modelRight = modelLeft + cardWidth;

    if (modelLeft < currentScroll) {
        currentCarouselIndex = modelIndex;
    } else if (modelRight > currentScroll + containerWidth) {
        const newScrollLeft = modelRight - containerWidth;
        currentCarouselIndex = Math.ceil(newScrollLeft / cardFullWidth);
    }
    
    updateCarouselTransform();
    updateCarouselButtons();
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

    // Load models and history
    loadAvailableModels();
    loadAndDisplayHistory();
    
    // Setup scroll buttons
    setupScrollButtons();
    
    // Handle window resize for responsive carousel
    window.addEventListener('resize', () => {
        const wasMobile = mobileSwiper !== null;
        const isMobile = window.innerWidth <= 768;
        
        if (availableModels.length > 0) {
            // Destroy Swiper if switching from mobile to desktop
            if (wasMobile && !isMobile && mobileSwiper) {
                mobileSwiper.destroy(true, true);
                mobileSwiper = null;
            }
            
            renderModelSelector();
        }
    });

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
                        topItems: searchData.topItems,
                        selectedModel: selectedModel
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
            const selectedModelConfig = availableModels.find(m => m.id === selectedModel);
            const researchEntry = {
                id: researchId,
                query: query,
                timestamp: new Date().toISOString(),
                modelUsed: selectedModelConfig ? {
                    id: selectedModelConfig.id,
                    name: selectedModelConfig.name,
                    provider: selectedModelConfig.provider
                } : null
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
