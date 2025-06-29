import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { searchWeb } from './src/crawler.js';
import { extractContent } from './src/extractor.js';
import { summarizeContentStream } from './src/llm.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const dataDir = path.join(__dirname, 'data', 'results');
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

const usageDir = path.join(__dirname, 'data', 'usage');
fs.mkdir(usageDir, { recursive: true }).catch(console.error);

const PORT = process.env.PORT || 3000;
const HOST = process.env.SERVER_IP || '0.0.0.0';
const NUM_SOURCES_TO_PROCESS = parseInt(process.env.NUM_SOURCES, 10) || 3;
const DAILY_REQUEST_LIMIT = parseInt(process.env.DAILY_REQUEST_LIMIT, 10) || 10;

let AVAILABLE_MODELS = [];
try {
    const envModels = process.env.AVAILABLE_MODELS || '[]';
    AVAILABLE_MODELS = JSON.parse(envModels);
    
    if (!Array.isArray(AVAILABLE_MODELS) || AVAILABLE_MODELS.length === 0) {
        throw new Error('AVAILABLE_MODELS must be a non-empty array');
    }
    
    for (const model of AVAILABLE_MODELS) {
        if (!model.id || !model.name || !model.provider || typeof model.inputPrice !== 'number' || typeof model.outputPrice !== 'number') {
            throw new Error('Invalid model structure found in AVAILABLE_MODELS');
        }
    }
    
    console.log(`✓ Successfully loaded ${AVAILABLE_MODELS.length} models from environment configuration`);
} catch (error) {
    console.error('❌ Error parsing AVAILABLE_MODELS from .env:', error.message);
    console.log('⚠️  Falling back to default model configuration');
    AVAILABLE_MODELS = [{
        id: "google/gemini-2.5-flash-preview-05-20:thinking",
        name: "Gemini 2.5 Flash Thinking", 
        provider: "Google",
        inputPrice: 0.15,
        outputPrice: 0.60,
        description: "Thinking mode, best value",
        isDefault: true
    }];
}

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || AVAILABLE_MODELS.find(m => m.isDefault)?.id || AVAILABLE_MODELS[0]?.id;

app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_SECRET = process.env.SESSION_SECRET_TOKEN;
const ONE_YEAR_MS = 31536000000;

if (!SESSION_SECRET) {
    console.error("FATAL ERROR: SESSION_SECRET_TOKEN is not defined in .env file. Authentication cannot work.");
    process.exit(1);
}

function getUserFingerprint(req) {
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}_${userAgent.substring(0, 50)}`;
}

const checkAuthentication = (req, res, next) => {
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];
    if (sessionToken && sessionToken === SESSION_SECRET) {
        next();
    } else {
        if (req.path.startsWith('/search') || req.path.startsWith('/process-and-summarize') || req.path.startsWith('/api/')) {
             console.log(`[Auth] Denied API access to ${req.path} - No valid session cookie.`);
             res.status(401).json({ error: 'Unauthorized. Please log in.' });
        } else {
             next();
        }
    }
};

async function getUsageData(userFingerprint) {
    const today = new Date().toISOString().split('T')[0];
    const usageFilePath = path.join(usageDir, `${today}.json`);
    
    try {
        const data = await fs.readFile(usageFilePath, 'utf-8');
        const usageData = JSON.parse(data);
        return usageData[userFingerprint] || { count: 0 };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { count: 0 };
        }
        console.error('Error reading usage data:', error);
        return { count: 0 };
    }
}

async function updateUsageData(userFingerprint, userUsageData) {
    const today = new Date().toISOString().split('T')[0];
    const usageFilePath = path.join(usageDir, `${today}.json`);
    
    try {
        let allUsageData = {};
        try {
            const existingData = await fs.readFile(usageFilePath, 'utf-8');
            allUsageData = JSON.parse(existingData);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error reading existing usage data:', error);
            }
        }
        
        allUsageData[userFingerprint] = userUsageData;
        await fs.writeFile(usageFilePath, JSON.stringify(allUsageData, null, 2));
    } catch (error) {
        console.error('Error writing usage data:', error);
    }
}

const rateLimitMiddleware = async (req, res, next) => {
    const userFingerprint = getUserFingerprint(req);
    let usage = await getUsageData(userFingerprint);

    if (usage.count >= DAILY_REQUEST_LIMIT) {
        console.log(`[Rate Limit] Daily limit reached for user fingerprint: ${userFingerprint}`);
        return res.status(429).json({
            error: `Daily request limit (${DAILY_REQUEST_LIMIT}) reached. Please try again tomorrow.`,
            currentUsage: usage.count,
            limit: DAILY_REQUEST_LIMIT
        });
    }

    usage.count++;
    await updateUsageData(userFingerprint, usage);
    req.currentUsage = usage.count;
    req.dailyLimit = DAILY_REQUEST_LIMIT;
    next();
};

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function (match) {
        switch (match) {
            case '&': return '&';
            case '<': return '<';
            case '>': return '>';
            case '"': return '"';
            case "'": return '&#39;';
            default: return match;
        }
    });
}

const loginPageHtml = (errorMessage = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Deep Research</title>
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="shortcut icon" href="/favicon.ico">
    <meta name="theme-color" content="#222222">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body class="login-page">
    <div class="login-container">
        <h1>Deep Research Login</h1>
        <form action="/login" method="POST">
            <label for="token">Session Token:</label>
            <input type="password" id="token" name="token" required>
            <button type="submit">Login</button>
        </form>
        ${errorMessage ? `<p class="error-message">${errorMessage}</p>` : ''}
    </div>
</body>
</html>
`;

app.post('/login', (req, res) => {
    const submittedToken = req.body.token;
    if (submittedToken === SESSION_SECRET) {
        console.log('[Auth] Successful login.');
        res.cookie(SESSION_COOKIE_NAME, submittedToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: ONE_YEAR_MS,
            sameSite: 'strict'
        });
        res.redirect('/');
    } else {
        console.log('[Auth] Failed login attempt.');
        res.status(401).send(loginPageHtml('Invalid session token. Please try again.'));
    }
});

app.get('/api/models', checkAuthentication, (req, res) => {
    try {
        res.json({
            models: AVAILABLE_MODELS,
            defaultModel: DEFAULT_MODEL
        });
    } catch (error) {
        console.error('Error serving models:', error);
        res.status(500).json({ error: 'Failed to retrieve available models' });
    }
});

app.get('/', (req, res) => {
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];
    if (sessionToken && sessionToken === SESSION_SECRET) {
        res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deep Research</title>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="shortcut icon" href="/favicon.ico">
    <meta name="theme-color" content="#222222">
    <link rel="stylesheet" href="/css/style.css">
</head>
            <body>
                 <div id="mobile-header">
                     <button id="sidebar-toggle">☰</button>
             <a href="/" class="home-icon-link" title="Go to Home Page">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
            </a>
        </div>
        <button id="desktop-sidebar-toggle">☰</button>
        <aside id="history-sidebar">
            <h2>History</h2>
            <ul id="history-list">
            </ul>
        </aside>
        <main>
            <a href="/" class="home-icon-link desktop-only" title="Go to Home Page">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
            </a>
            <div class="hero-section">
                <h1>Deep Research</h1>
                <p class="hero-subtitle">AI-powered research with comprehensive source analysis</p>
            </div>
            
            <!-- Model Selector Section -->
            <div id="model-selector-section">
                <h3 id="model-selector-title">Choose AI Model</h3>
                <div id="model-selector-container">
                    <button class="scroll-button scroll-button-left" id="scroll-left" type="button" aria-label="Scroll left">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
                        </svg>
                    </button>
                    <div id="model-cards-container">
                        <div id="model-cards">
                                        </div>
                    </div>
                    <button class="scroll-button scroll-button-right" id="scroll-right" type="button" aria-label="Scroll right">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                        </svg>
                    </button>
                </div>
                <div id="carousel-scrollbar">
                    <div id="scrollbar-thumb"></div>
                </div>
            </div>
            
            <form id="search-form">
                <input type="text" id="query-input" name="query" placeholder="Enter your research topic..." required>
                <button type="submit" id="research-button">Research</button>
            </form>
            <div id="results">
                <p class="placeholder">Search results will appear here.</p>
            </div>
        </main>

        <div id="loading-overlay">
          <div class="loading-content">
            <div class="spinner"></div>
            <span id="loading-source-count"></span>
            <p>Deep Research in Progress...</p>
            <p id="loading-urls-label">Processing content from:</p>
            <ul id="loading-urls">
            </ul>
          </div>
        </div>

        <div id="cost-popup"></div>
        <div id="rate-limit-popup" class="popup">
            <p id="rate-limit-message"></p>
            <p id="rate-limit-count"></p>
        </div>

        <script>
if (window.innerWidth <= 768) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js';
    script.onload = function() {
        window.swiperLoaded = true;
        window.dispatchEvent(new Event('swiperready'));
    };
    document.head.appendChild(script);
}
</script>
        <script src="/js/main.js" defer></script>
    </body>
    </html>
  `);
    } else {
        console.log('[Auth] No valid session cookie found for / route. Serving login page.');
        res.send(loginPageHtml());
    }
});

app.post('/search', checkAuthentication, rateLimitMiddleware, async (req, res) => {
    const query = req.body.query;

    if (!query) {
        return res.status(400).json({ error: 'Search query cannot be empty.' });
    }

    try {
        const searchItems = await searchWeb(query);

        if (!searchItems || searchItems.length === 0) {
            return res.json({ results: [], extractedText: "No results found by search API." });
        }

        const preferredDomains = ['.edu', '.gov', 'wikipedia.org', 'scholar.google.com', 'bbc.', 'reuters.', 'nytimes.', 'arxiv.org'];
        const lessPreferredDomains = ['amazon.', 'walmart.', 'bestbuy.', 'ebay.', 'target.', 'shopping.', '.shop', '.store'];
        const relevantKeywords = ['research', 'study', 'abstract', 'thesis', 'paper', 'journal', 'news', 'report', 'article', 'analysis', 'findings', 'university', 'institute'];

        const scoredItems = searchItems.map(item => {
            let score = 0;
            const url = item.link || '';
            const title = (item.title || '').toLowerCase();
            const snippet = (item.snippet || '').toLowerCase();
            const textToCheck = `${title} ${snippet} ${url}`;

            try {
                const domain = new URL(url).hostname.toLowerCase();

                if (preferredDomains.some(pd => domain.includes(pd))) score += 5;
                if (lessPreferredDomains.some(lpd => domain.includes(lpd))) score -= 5;

                relevantKeywords.forEach(kw => {
                    if (textToCheck.includes(kw)) score += 1;
                });

            } catch (e) {
                console.warn(`[Server Scoring] Could not parse URL for scoring: ${url}`);
                score = -10;
            }

            item.score = score;
            return item;
        });

        scoredItems.sort((a, b) => b.score - a.score);

        const topItems = scoredItems.slice(0, NUM_SOURCES_TO_PROCESS);
        const urlsToProcess = topItems.map(item => item.link).filter(link => !!link);

        res.json({
            query: query,
            urlsToProcess: urlsToProcess,
            topItems: topItems
        });

    } catch (error) {
        console.error('[Server /search] Error:', error);
        res.status(500).json({ error: 'Failed to perform initial search and scoring.' });
    }
});

async function processLlmStreamWithRetry(
    { query, combinedText, successfulSourceItems, apiKey, modelName, modelConfig, res, sendSseMessage, resultId },
    attempt = 1,
    maxAttempts = 3,
    retryDelay = 5000
) {
    let llmStream;
    let streamErrorOccurred = false;

    try {
        llmStream = await summarizeContentStream(
            query,
            combinedText,
            successfulSourceItems,
            apiKey,
            modelName
        );

        let buffer = '';
        let fullAnswer = '';
        let usageData = null;

        await new Promise((resolve, reject) => {
            llmStream.on('data', (chunk) => {
                if (streamErrorOccurred) return;

                const rawChunk = chunk.toString();
                buffer += rawChunk;
                let lineEnd;
                while ((lineEnd = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, lineEnd).trim();
                    buffer = buffer.substring(lineEnd + 1);

                    if (line.startsWith('data: ')) {
                        const dataContent = line.substring(6);
                        if (dataContent === '[DONE]') {
                            continue;
                        }
                        try {
                            const dataObj = JSON.parse(dataContent);
                            if (dataObj.error) {
                                streamErrorOccurred = true;
                                llmStream.destroy();
                                reject(new Error(`LLM Error: ${dataObj.error.message || 'Unknown error'}`));
                                return;
                            }

                            const contentDelta = dataObj?.choices?.[0]?.delta?.content;
                            if (contentDelta) {
                                fullAnswer += contentDelta;
                                sendSseMessage(contentDelta);
                            }

                            if (dataObj.usage) {
                                usageData = dataObj.usage;
                            }
                        } catch (parseError) {
                            console.error(`Error parsing OpenRouter SSE data line:`, parseError, 'Line:', line);
                        }
                    }
                }
            });

            llmStream.on('end', async () => {
                if (streamErrorOccurred) {
                    resolve();
                    return;
                }

                try {
                    let cost = null;
                    const inputPrice = modelConfig?.inputPrice;
                    const outputPrice = modelConfig?.outputPrice;

                    if (usageData && usageData.prompt_tokens && usageData.completion_tokens && inputPrice !== undefined && outputPrice !== undefined) {
                        const promptCost = (usageData.prompt_tokens / 1000000) * inputPrice;
                        const completionCost = (usageData.completion_tokens / 1000000) * outputPrice;
                        cost = parseFloat((promptCost + completionCost).toFixed(6));
                    } else {
                        console.warn('Could not calculate cost: Missing usage data or model pricing info');
                    }

                    const resultData = {
                        id: resultId,
                        query: query,
                        answerHtml: fullAnswer,
                        sources: successfulSourceItems,
                        timestamp: new Date().toISOString(),
                        usage: usageData,
                        cost: cost,
                        modelUsed: {
                            id: modelConfig.id,
                            name: modelConfig.name,
                            provider: modelConfig.provider
                        }
                    };
                    const filePath = path.join(dataDir, `${resultId}.json`);

                    await fs.writeFile(filePath, JSON.stringify(resultData, null, 2));

                    const shareableLink = `/research/${resultId}`;
                    const linkData = { link: shareableLink };
                    if (usageData) {
                        linkData.usage = usageData;
                    }
                    if (cost !== null) {
                        linkData.cost = cost;
                    }
                    sendSseMessage(linkData, 'resultLink');
                    sendSseMessage('[DONE]');
                    resolve({ success: true });

                } catch (saveError) {
                    console.error('Error saving result:', saveError);
                    sendSseMessage({ message: 'Failed to save result for sharing.' }, 'error');
                    reject(saveError);
                } finally {
                     if (!res.writableEnded) {
                         res.end();
                     }
                }
            });

            llmStream.on('error', (error) => {
                streamErrorOccurred = true;
                reject(error);
            });
        });

        return { success: true };

    } catch (error) {
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return processLlmStreamWithRetry({ query, combinedText, successfulSourceItems, apiKey, modelName, modelConfig, res, sendSseMessage, resultId }, attempt + 1, maxAttempts, retryDelay);
        } else {
            sendSseMessage({ message: `Failed after ${maxAttempts} attempts. Last error: ${error.message || 'Unknown stream error'}` }, 'error');
             if (!res.writableEnded) {
                 res.end();
             }
            return { success: false, error: error };
        }
    }
}

app.post('/process-and-summarize', checkAuthentication, async (req, res) => {
    const { query, urlsToProcess, topItems, selectedModel } = req.body;

    if (!query || !urlsToProcess || !Array.isArray(urlsToProcess) || urlsToProcess.length === 0 || !topItems || !Array.isArray(topItems)) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write('event: error\ndata: {"message": "Missing or invalid query, URLs, or source items to process."}\n\n');
        res.end();
        return;
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const sendSseMessage = (data, event = 'message') => {
        const dataString = JSON.stringify(data);
        res.write(`event: ${event}\ndata: ${dataString}\n\n`);
    };

    try {
        const extractionResults = await Promise.allSettled(
            urlsToProcess.map(url => extractContent(url))
        );

        const successfulExtractions = [];
        const successfulSourceItems = [];

        extractionResults.forEach((result, index) => {
            const url = urlsToProcess[index];
            if (result.status === 'fulfilled' && result.value !== null) {
                successfulExtractions.push(result.value);
                const originalItem = topItems.find(item => item.link === url);
                if (originalItem) {
                    successfulSourceItems.push(originalItem);
                } else {
                     console.warn(`Could not find original item for successfully extracted URL: ${url}`);
                }
            } else {
                const reason = result.reason || 'Extraction returned null';
                console.error(`Failed to extract content from ${url}:`, reason);
            }
        });

        if (successfulExtractions.length === 0) {
            sendSseMessage({ message: 'Failed to extract content from any sources.' }, 'error');
            res.end();
            return;
        }

        const combinedText = successfulExtractions.join('\n\n---\n\n');
        sendSseMessage({ type: 'sources_processed', count: successfulSourceItems.length, sources: successfulSourceItems }, 'info');

        const modelToUse = selectedModel || DEFAULT_MODEL;
        const modelConfig = AVAILABLE_MODELS.find(m => m.id === modelToUse);
        
        if (!modelConfig) {
            sendSseMessage({ message: `Invalid model selected: ${modelToUse}. Using default model.` }, 'info');
            modelConfig = AVAILABLE_MODELS.find(m => m.isDefault) || AVAILABLE_MODELS[0];
        }

        const resultId = uuidv4();
        await processLlmStreamWithRetry({
            query,
            combinedText,
            successfulSourceItems,
            apiKey: process.env.OPENROUTER_API_KEY,
            modelName: modelConfig.id,
            modelConfig: modelConfig,
            res,
            sendSseMessage,
            resultId
        });

    } catch (error) {
        console.error('Pre-stream Error:', error);
        if (!res.headersSent) {
             res.status(500).json({ error: 'Failed to process content and summarize due to an internal server error.' });
        } else {
            try {
                 sendSseMessage({ message: error.message || 'Internal server error during processing.' }, 'error');
                 res.end();
            } catch (sseError) {
                console.error('Error sending SSE error message:', sseError);
                res.end();
            }
        }
    }
});

app.get('/research/:id', async (req, res) => {
    const resultId = req.params.id;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(resultId)) {
        return res.status(400).send('Invalid ID format.');
    }

    const filePath = path.join(dataDir, `${resultId}.json`);

    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const result = JSON.parse(data);

        let sourcesToggleHtml = '';
        if (result.sources && result.sources.length > 0) {
            let sourceListItems = '';
            result.sources.forEach((source, index) => {
                 const link = source.link ? escapeHTML(source.link) : '#';
                 const title = source.title ? escapeHTML(source.title) : link;
                 sourceListItems += `<li id="source-${index + 1}"><a href="${link}" target="_blank">${title}</a></li>`;
            });
            sourcesToggleHtml = `
                <details style="margin-top: 20px;">
                    <summary style="cursor: pointer; font-weight: bold; color: #ccc;">Show sources used (${result.sources.length})</summary>
                    <ul style="margin-top: 10px;">${sourceListItems}</ul>
                </details>
            `;
        } else {
             sourcesToggleHtml = '<p style="margin-top: 20px; color: #aaa;">No sources were recorded for this result.</p>';
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Deep Research Result: ${escapeHTML(result.query)}</title>
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="shortcut icon" href="/favicon.ico">
    <meta name="theme-color" content="#222222">
    <link rel="stylesheet" href="/css/style.css">
</head>
            <body>
                 <div id="mobile-header">
                     <button id="sidebar-toggle">☰</button>
                     <a href="/" class="home-icon-link" title="Go to Home Page">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                          <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                    </a>
                 </div>
                <button id="desktop-sidebar-toggle">☰</button>
                <aside id="history-sidebar">
                    <h2>History</h2>
                    <ul id="history-list">
                    </ul>
                </aside>
                <main class="container">
                    <a href="/" class="home-icon-link desktop-only" title="Go to Home Page">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                          <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                    </a>
                    <h1>Deep Research Result</h1>
                    <p><strong>Query:</strong> ${escapeHTML(result.query)}</p>
                    <p class="timestamp">Generated: ${new Date(result.timestamp).toLocaleString()}</p>

                    <h2>Answer</h2>
                    <div id="result-answer-content">${result.answerHtml}</div>

                    ${sourcesToggleHtml}

                    ${result.modelUsed ? `
                    <div style="margin-top: 20px; font-size: 0.9em; color: #aaa;">
                        <strong>Model Used:</strong> ${escapeHTML(result.modelUsed.name)} (${escapeHTML(result.modelUsed.provider)})
                    </div>
                    ` : ''}
                    
                    ${result.usage ? `
                    <div style="margin-top: 20px; font-size: 0.9em; color: #aaa;">
                        <strong>Token Usage:</strong><br>
                        Prompt: ${result.usage.prompt_tokens || 'N/A'}<br>
                        Completion: ${result.usage.completion_tokens || 'N/A'}<br>
                        Total: ${result.usage.total_tokens || 'N/A'}
                        ${result.cost !== undefined && result.cost !== null ? `<br><strong>Estimated Cost:</strong> $${result.cost.toFixed(6)}` : ''}
                    </div>
                    ` : ''}
                </main>
                <script src="/js/main.js" defer></script>
            </body>
            </html>
        `);

    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).send('Research result not found.');
        } else {
            console.error(`Error retrieving research result:`, error);
            res.status(500).send('Error retrieving research result.');
        }
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        // This is a body-parser error, likely PayloadTooLargeError
        console.error('Bad JSON or Payload Too Large Error:', err.message);
        if (!res.headersSent) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            const sendSseMessage = (data, event = 'message') => {
                const dataString = JSON.stringify(data);
                res.write(`event: ${event}\ndata: ${dataString}\n\n`);
            };
            if (err.type === 'entity.too.large') {
                sendSseMessage({ message: 'Request too large. Please try a shorter query or fewer sources.' }, 'error');
            } else {
                sendSseMessage({ message: 'Invalid request format. Please check your input.' }, 'error');
            }
            sendSseMessage('[DONE]');
            res.end();
        }
    } else {
        console.error('Unhandled server error:', err);
        if (!res.headersSent) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            const sendSseMessage = (data, event = 'message') => {
                const dataString = JSON.stringify(data);
                res.write(`event: ${event}\ndata: ${dataString}\n\n`);
            };
            sendSseMessage({ message: 'An unexpected server error occurred. Please contact the system administrator.' }, 'error');
            sendSseMessage('[DONE]');
            res.end();
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
  const displayHost = HOST !== '0.0.0.0' ? HOST : 'localhost';
  console.log(`Server listening on http://${displayHost}:${PORT}`);
  console.log(`Also accessible via http://localhost:${PORT}`);
  console.log('*** Server startup complete. Ready for requests. ***');
});
