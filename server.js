import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url'; // Needed for __dirname equivalent
import cookieParser from 'cookie-parser'; // Import cookie-parser
import fs from 'fs/promises'; // Import fs promises for async file operations
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import { searchWeb } from './src/crawler.js'; // Use .js extension
import { extractContent } from './src/extractor.js'; // Import the new extractor function
// Import both the original and the new streaming function from llm.js
import { summarizeContent, summarizeContentStream, testOpenRouterNonStreaming } from './src/llm.js';

// Load environment variables from .env file
dotenv.config();

// Replicate __dirname functionality in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data', 'results');
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

// Configuration from environment variables
const PORT = process.env.PORT || 3000; // Keep port 3000 default
const HOST = process.env.SERVER_IP || '0.0.0.0'; // Default to listen on all interfaces
const NUM_SOURCES_TO_PROCESS = parseInt(process.env.NUM_SOURCES, 10) || 3; // Default to 3 sources if not set or invalid

// Middleware to parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));
// Middleware to parse JSON bodies
app.use(express.json());
// Middleware to parse cookies
app.use(cookieParser());
// Middleware to serve static files (like CSS, client-side JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Authentication Logic ---

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_SECRET = process.env.SESSION_SECRET_TOKEN;
const ONE_YEAR_MS = 31536000000; // 1 year in milliseconds

if (!SESSION_SECRET) {
    console.error("FATAL ERROR: SESSION_SECRET_TOKEN is not defined in .env file. Authentication cannot work.");
    process.exit(1); // Exit if the secret is missing
}

// Middleware function to check authentication
const checkAuthentication = (req, res, next) => {
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];
    if (sessionToken && sessionToken === SESSION_SECRET) {
        // User is authenticated
        next(); // Proceed to the next middleware or route handler
    } else {
        // User is not authenticated, redirect to login (which is handled by the '/' route)
        // For API endpoints, we should return an error instead of redirecting HTML
        if (req.path.startsWith('/search') || req.path.startsWith('/process-and-summarize')) {
             console.log(`[Auth] Denied API access to ${req.path} - No valid session cookie.`);
             res.status(401).json({ error: 'Unauthorized. Please log in.' });
        } else {
             // For other paths (like potentially future pages), redirect might be okay,
             // but for now, the '/' route handles showing the login page.
             // Let the '/' route handle the check for non-API requests.
             next();
        }
    }
};

// Simple HTML escaping function (similar to client-side)
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function (match) {
        switch (match) {
            case '&': return '&';
            case '<': return '<';
            case '>': return '>';
            case '"': return '"';
            case "'": return '&#39;'; // or '
            default: return match;
        }
    });
}

// HTML for the Login Page
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
    <meta name="theme-color" content="#222222"> <!-- Add theme color meta tag -->
    <link rel="stylesheet" href="/css/style.css">
</head>
<body class="login-page"> <!-- Added class for CSS targeting -->
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

// --- Routes ---

// Login POST route
app.post('/login', (req, res) => {
    const submittedToken = req.body.token;
    if (submittedToken === SESSION_SECRET) {
        console.log('[Auth] Successful login.');
        res.cookie(SESSION_COOKIE_NAME, submittedToken, {
            httpOnly: true, // Prevent client-side JS access
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (requires HTTPS)
            maxAge: ONE_YEAR_MS, // Set cookie expiry to 1 year
            sameSite: 'strict' // Protect against CSRF
        });
        res.redirect('/'); // Redirect to the main page after successful login
    } else {
        console.log('[Auth] Failed login attempt.');
        // Re-render login page with an error message
        res.status(401).send(loginPageHtml('Invalid session token. Please try again.'));
    }
});


// Root route - Serves main app or login page
app.get('/', (req, res) => {
    const sessionToken = req.cookies[SESSION_COOKIE_NAME];
    if (sessionToken && sessionToken === SESSION_SECRET) {
        // User is authenticated, send the main application page
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
    <meta name="theme-color" content="#222222"> <!-- Add theme color meta tag -->
    <link rel="stylesheet" href="/css/style.css">
</head>
    <body>
        <div id="mobile-header">
             <button id="sidebar-toggle">☰</button>
             <!-- Maybe add a title here later -->
        </div>
        <aside id="history-sidebar">
            <h2>History</h2>
            <ul id="history-list">
                <!-- History items will be loaded here by JS -->
            </ul>
        </aside>
        <main>
            <h1>Deep Research</h1>
            <form id="search-form"> <!-- Added ID for JS targeting -->
                <input type="text" id="query-input" name="query" placeholder="Enter your research topic..." required> <!-- Added ID -->
            <button type="submit" id="research-button">Research</button> <!-- Added ID -->
        </form>
        <div id="results">
            <p class="placeholder">Search results will appear here.</p>
            <!-- Results will be loaded here -->
        </div>
        </main>

        <!-- Loading Overlay -->
        <div id="loading-overlay">
          <div class="loading-content">
            <div class="spinner"></div> <!-- Basic CSS spinner -->
            <span id="loading-source-count"></span> <!-- Source count for mobile -->
            <p>Deep Research in Progress...</p>
            <p id="loading-urls-label">Processing content from:</p> <!-- Added ID -->
            <ul id="loading-urls">
              <!-- URLs will be dynamically added here -->
            </ul>
          </div>
        </div>

        <div id="cost-popup"></div> <!-- Added for API cost popup -->

        <script src="/js/main.js" defer></script>
    </body>
    </html>
  `);
    } else {
        // User is not authenticated, send the login page
        console.log('[Auth] No valid session cookie found for / route. Serving login page.');
        res.send(loginPageHtml());
    }
});

// API endpoint for handling the search form submission - Apply authentication check
app.post('/search', checkAuthentication, async (req, res) => { // Added checkAuthentication middleware
    console.log('[Server] /search endpoint hit.'); // Log endpoint entry
    const query = req.body.query;
    console.log(`[Server] Search query received: ${query}`);

    if (!query) {
        console.log('[Server] Query is empty, sending error response.');
        return res.status(400).json({ error: 'Search query cannot be empty.' });
    }

    try {
        console.log(`[Server] Calling searchWeb with query: "${query}"`);
        // Call the API function - now returns full items
        const searchItems = await searchWeb(query);
        console.log(`[Server] searchWeb returned ${searchItems ? searchItems.length : 'undefined/null'} items.`);

        if (!searchItems || searchItems.length === 0) {
            return res.json({ results: [], extractedText: "No results found by search API." });
        }

        // --- Score and Sort Results ---
        const preferredDomains = ['.edu', '.gov', 'wikipedia.org', 'scholar.google.com', 'bbc.', 'reuters.', 'nytimes.', 'arxiv.org']; // Added common TLDs/sites
        const lessPreferredDomains = ['amazon.', 'walmart.', 'bestbuy.', 'ebay.', 'target.', 'shopping.', '.shop', '.store']; // Commercial/shopping
        const relevantKeywords = ['research', 'study', 'abstract', 'thesis', 'paper', 'journal', 'news', 'report', 'article', 'analysis', 'findings', 'university', 'institute'];

        const scoredItems = searchItems.map(item => {
            let score = 0;
            const url = item.link || '';
            const title = (item.title || '').toLowerCase();
            const snippet = (item.snippet || '').toLowerCase();
            const textToCheck = `${title} ${snippet} ${url}`; // Combine text fields for keyword check

            try {
                const domain = new URL(url).hostname.toLowerCase();

                // Score based on domain
                if (preferredDomains.some(pd => domain.includes(pd))) score += 5;
                if (lessPreferredDomains.some(lpd => domain.includes(lpd))) score -= 5;

                // Score based on keywords
                relevantKeywords.forEach(kw => {
                    if (textToCheck.includes(kw)) score += 1;
                });

            } catch (e) {
                console.warn(`[Server Scoring] Could not parse URL for scoring: ${url}`);
                score = -10; // Penalize invalid URLs
            }

            item.score = score; // Add score to the item object
            console.log(`[Server Scoring] URL: ${url}, Score: ${score}`);
            return item;
        });

        // Sort by score descending
        scoredItems.sort((a, b) => b.score - a.score);

        // --- Select Top N Scored URLs ---
        const topItems = scoredItems.slice(0, NUM_SOURCES_TO_PROCESS);
        // Extract just the URLs to send back for the loading screen
        const urlsToProcess = topItems.map(item => item.link).filter(link => !!link);

        console.log(`[Server /search] Top ${urlsToProcess.length} URLs selected after scoring:`, urlsToProcess);

        // --- Return query, URLs, and items ---
        // The client will display URLs and then call /process-and-summarize with all three
        res.json({
            query: query, // Include the original query
            urlsToProcess: urlsToProcess,
            topItems: topItems // Include topItems for citation context
        });

    } catch (error) {
        console.error('[Server /search] Error:', error); // Log error
        res.status(500).json({ error: 'Failed to perform initial search and scoring.' });
    }
});

// --- Helper function for LLM stream processing with retry ---
async function processLlmStreamWithRetry(
    { query, combinedText, successfulSourceItems, apiKey, modelName, res, sendSseMessage, resultId }, // Pass resultId
    attempt = 1,
    maxAttempts = 3,
    retryDelay = 5000
) {
    console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}/${maxAttempts}] Calling summarizeContentStream...`);
    let llmStream;
    let streamErrorOccurred = false; // Flag to track if an error occurred that should prevent 'end' processing

    try {
        llmStream = await summarizeContentStream(
            query,
            combinedText,
            successfulSourceItems,
            apiKey,
            modelName
        );
        console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}] summarizeContentStream returned stream.`);

        let buffer = '';
        let fullAnswer = ''; // Accumulate the full answer for this attempt
        let usageData = null; // Variable to store usage data

        // Use promises to handle stream events completion
        await new Promise((resolve, reject) => {
            llmStream.on('data', (chunk) => {
                // If an error already occurred in this stream attempt, ignore further data
                if (streamErrorOccurred) return;

                const rawChunk = chunk.toString();
                console.log('[RAW LLM CHUNK]', rawChunk);
                buffer += rawChunk;
                let lineEnd;
                while ((lineEnd = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, lineEnd).trim();
                    buffer = buffer.substring(lineEnd + 1);

                    if (line.startsWith('data: ')) {
                        const dataContent = line.substring(6);
                        if (dataContent === '[DONE]') {
                            console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}] Received [DONE] marker from OpenRouter stream.`);
                            continue;
                        }
                        try {
                            const dataObj = JSON.parse(dataContent);
                            // --- Check for error within the stream data ---
                            if (dataObj.error) {
                                console.error(`[Server processLlmStreamWithRetry Attempt ${attempt}] Error received in LLM stream data:`, JSON.stringify(dataObj.error));
                                streamErrorOccurred = true; // Set flag
                                llmStream.destroy(); // Stop processing this stream
                                reject(new Error(`LLM Error: ${dataObj.error.message || 'Unknown error'}`)); // Reject the promise with the error
                                return; // Exit handler
                            }
                            // --- End error check ---

                            const contentDelta = dataObj?.choices?.[0]?.delta?.content;
                            if (contentDelta) {
                                fullAnswer += contentDelta; // Append to full answer for this attempt
                                sendSseMessage(contentDelta); // Forward delta to client
                            }

                            // Check for usage data in the chunk
                            if (dataObj.usage) {
                                usageData = dataObj.usage;
                                console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}] Received usage data:`, usageData);
                            }
                        } catch (parseError) {
                            console.error(`[Server processLlmStreamWithRetry Attempt ${attempt}] Error parsing OpenRouter SSE data line:`, parseError, 'Line:', line);
                            // Don't trigger retry for parsing errors, but log it. Maybe send client error?
                            // For now, just log and continue processing other lines.
                        }
                    }
                }
            });

            llmStream.on('end', async () => {
                console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}] LLM stream ended.`);
                if (streamErrorOccurred) {
                    console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}] Stream ended, but an error was detected earlier. Skipping final processing for this attempt.`);
                    // Error handled by reject in 'data' or 'error' handler
                    resolve(); // Resolve the promise, but error flag prevents saving
                    return;
                }

                // --- Save Result and Send Link (only on successful stream end) ---
                try {
                    let cost = null;
                    const inputPrice = parseFloat(process.env.OPENROUTER_INPUT_PRICE_PER_MILLION);
                    const outputPrice = parseFloat(process.env.OPENROUTER_OUTPUT_PRICE_PER_MILLION);

                    if (usageData && usageData.prompt_tokens && usageData.completion_tokens && !isNaN(inputPrice) && !isNaN(outputPrice)) {
                        const promptCost = (usageData.prompt_tokens / 1000000) * inputPrice;
                        const completionCost = (usageData.completion_tokens / 1000000) * outputPrice;
                        cost = parseFloat((promptCost + completionCost).toFixed(6)); // toFixed(6) for precision up to $0.000001
                    } else {
                        console.warn('[Server processLlmStreamWithRetry] Could not calculate cost: Missing usage data or pricing info in .env');
                    }

                    const resultData = {
                        id: resultId, // Use the passed resultId
                        query: query,
                        answerHtml: fullAnswer, // Save the accumulated HTML answer
                        sources: successfulSourceItems, // Save the sources used
                        timestamp: new Date().toISOString(),
                        usage: usageData, // Add usage data to the saved result
                        cost: cost // Add calculated cost
                    };
                    const filePath = path.join(dataDir, `${resultId}.json`);

                    await fs.writeFile(filePath, JSON.stringify(resultData, null, 2));
                    console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}] Result saved to ${filePath}`);

                    const shareableLink = `/research/${resultId}`;
                    // Send usage data and cost along with the link if available
                    const linkData = { link: shareableLink };
                    if (usageData) {
                        linkData.usage = usageData;
                    }
                    if (cost !== null) {
                        linkData.cost = cost;
                    }
                    sendSseMessage(linkData, 'resultLink');
                    sendSseMessage('[DONE]'); // Send final DONE only on complete success
                    resolve({ success: true }); // Indicate success

                } catch (saveError) {
                    console.error(`[Server processLlmStreamWithRetry Attempt ${attempt}] Error saving result:`, saveError);
                    sendSseMessage({ message: 'Failed to save result for sharing.' }, 'error');
                    reject(saveError); // Reject on save error
                } finally {
                     if (!res.writableEnded) {
                         res.end(); // Ensure connection is closed after successful end or save error
                     }
                }
            });

            llmStream.on('error', (error) => {
                console.error(`[Server processLlmStreamWithRetry Attempt ${attempt}] LLM stream connection error:`, error);
                streamErrorOccurred = true; // Set flag
                reject(error); // Reject the promise on stream connection error
            });
        });

        // If we reached here without rejecting, it means the stream ended successfully
        return { success: true };

    } catch (error) { // Catches initial connection error from summarizeContentStream OR errors rejected by stream handlers
        console.error(`[Server processLlmStreamWithRetry Attempt ${attempt}] Caught error:`, error.message);
        if (attempt < maxAttempts) {
            console.log(`[Server processLlmStreamWithRetry Attempt ${attempt}] Retrying in ${retryDelay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            // Recursively call self for the next attempt, passing the same resultId
            return processLlmStreamWithRetry({ query, combinedText, successfulSourceItems, apiKey, modelName, res, sendSseMessage, resultId }, attempt + 1, maxAttempts, retryDelay);
        } else {
            console.error(`[Server processLlmStreamWithRetry Attempt ${attempt}] Failed permanently after ${maxAttempts} attempts.`);
            // Send final error message to client
            sendSseMessage({ message: `Failed after ${maxAttempts} attempts. Last error: ${error.message || 'Unknown stream error'}` }, 'error');
             if (!res.writableEnded) {
                 res.end(); // Ensure connection is closed on final failure
             }
            return { success: false, error: error }; // Indicate final failure
        }
    }
}
// --- End Helper function ---


// API endpoint for processing URLs and generating summary/answer via SSE stream - Apply authentication check
app.post('/process-and-summarize', checkAuthentication, async (req, res) => { // Added checkAuthentication middleware
    console.log('[Server /process-and-summarize SSE] Endpoint hit.');
    console.log('[Server /process-and-summarize SSE] Received body:', JSON.stringify(req.body, null, 2)); // Log the received body
    // Expecting query, URLs, and the corresponding items
    const { query, urlsToProcess, topItems } = req.body;

    if (!query || !urlsToProcess || !Array.isArray(urlsToProcess) || urlsToProcess.length === 0 || !topItems || !Array.isArray(topItems)) {
        console.log('[Server /process-and-summarize SSE] Invalid input received (query, urls, or items missing/invalid).');
        // For SSE, we can't send a JSON error easily after headers are sent.
        // We'll set headers first, then check. If invalid, send an error event.
        res.writeHead(200, { // Still send 200 OK for SSE, error is in the stream
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write('event: error\ndata: {"message": "Missing or invalid query, URLs, or source items to process."}\n\n');
        res.end();
        return;
    }

    // Set SSE headers *before* any async operations that might fail after headers are sent
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    console.log(`[Server /process-and-summarize SSE] Received ${urlsToProcess.length} URLs to process.`);

    // Function to send SSE messages
    const sendSseMessage = (data, event = 'message') => {
        // Stringify data to handle potential special characters/newlines correctly
        const dataString = JSON.stringify(data);
        res.write(`event: ${event}\ndata: ${dataString}\n\n`);
    };

    try {
        // --- Extract content ---
        console.log(`[Server /process-and-summarize SSE] Attempting to extract content.`);
        // Use Promise.allSettled to handle individual failures
        const extractionResults = await Promise.allSettled(
            urlsToProcess.map(url => extractContent(url))
        );

        const successfulExtractions = [];
        const successfulSourceItems = []; // Keep track of items corresponding to successful extractions

        extractionResults.forEach((result, index) => {
            const url = urlsToProcess[index];
            if (result.status === 'fulfilled' && result.value !== null) {
                successfulExtractions.push(result.value);
                const originalItem = topItems.find(item => item.link === url);
                if (originalItem) {
                    successfulSourceItems.push(originalItem);
                } else {
                     console.warn(`[Server /process-and-summarize SSE] Could not find original item for successfully extracted URL: ${url}`);
                }
            } else {
                const reason = result.reason || 'Extraction returned null';
                console.error(`[Server /process-and-summarize SSE] Failed to extract content from ${url}:`, reason);
                // Optionally send an SSE event about the failure
                // sendSseMessage({ type: 'extraction_failed', url: url, reason: String(reason) }, 'info');
            }
        });

        if (successfulExtractions.length === 0) {
            console.log('[Server /process-and-summarize SSE] No content could be extracted.');
            sendSseMessage({ message: 'Failed to extract content from any sources.' }, 'error');
            res.end(); // Close the connection
            return;
        }

        const combinedText = successfulExtractions.join('\n\n---\n\n');
        console.log(`[Server /process-and-summarize SSE] Finished extraction. Successfully extracted from ${successfulExtractions.length} sources. Total combined text length: ${combinedText.length}`);
        // Send info about successful sources before starting LLM
        sendSseMessage({ type: 'sources_processed', count: successfulSourceItems.length, sources: successfulSourceItems }, 'info');

        // --- Generate Answer using LLM Stream with Retry ---
        const resultId = uuidv4(); // Generate UUID once before starting attempts
        await processLlmStreamWithRetry({
            query,
            combinedText,
            successfulSourceItems,
            apiKey: process.env.OPENROUTER_API_KEY,
            modelName: process.env.OPENROUTER_MODEL,
            res, // Pass response object for ending connection
            sendSseMessage, // Pass SSE helper
            resultId // Pass the generated ID for saving
        });
        // The processLlmStreamWithRetry function now handles sending [DONE] or error messages and ending the response.

    } catch (error) { // This outer catch handles errors *before* the stream starts (e.g., extraction failure)
        console.error('[Server /process-and-summarize SSE] Pre-stream Error:', error);
        // Try to send an error event if headers were already sent
        if (!res.headersSent) {
             // If headers not sent, we can still send a normal error response (though unlikely path now)
             res.status(500).json({ error: 'Failed to process content and summarize due to an internal server error.' });
        } else {
            // Headers sent, use SSE error event
            try {
                 sendSseMessage({ message: error.message || 'Internal server error during processing.' }, 'error');
                 res.end(); // Close the connection
            } catch (sseError) {
                console.error('[Server /process-and-summarize SSE] Error sending SSE error message:', sseError);
                res.end(); // Ensure connection is closed anyway
            }
        }
    }
});

// --- Retrieval Route ---
app.get('/research/:id', async (req, res) => {
    const resultId = req.params.id;
    // Basic validation for UUID format (optional but good practice)
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(resultId)) {
        return res.status(400).send('Invalid ID format.');
    }

    const filePath = path.join(dataDir, `${resultId}.json`);

    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const result = JSON.parse(data);

        // Generate toggleable sources HTML
        let sourcesToggleHtml = '';
        if (result.sources && result.sources.length > 0) {
            let sourceListItems = '';
            result.sources.forEach((source) => {
                 // Escape title and link properly for HTML attributes and content
                 const link = source.link ? escapeHTML(source.link) : '#';
                 const title = source.title ? escapeHTML(source.title) : link;
                 sourceListItems += `<li><a href="${link}" target="_blank">${title}</a></li>`;
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
                <title>Deep Research Result: ${escapeHTML(result.query)}</title> <!-- Escaped query -->
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="shortcut icon" href="/favicon.ico">
    <meta name="theme-color" content="#222222"> <!-- Add theme color meta tag -->
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
                <aside id="history-sidebar">
                    <h2>History</h2>
                    <ul id="history-list">
                        <!-- History items will be loaded here by JS -->
                    </ul>
                </aside>
                <main class="container">
                    <!-- Home icon moved to mobile header for mobile view -->
                    <a href="/" class="home-icon-link desktop-only" title="Go to Home Page"> <!-- Add class to hide on mobile if needed, or adjust CSS -->
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                          <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                    </a>
                    <h1>Deep Research Result</h1>
                    <p><strong>Query:</strong> ${escapeHTML(result.query)}</p>
                    <p class="timestamp">Generated: ${new Date(result.timestamp).toLocaleString()}</p>

                    <h2>Answer</h2>
                    <div id="result-answer-content">${result.answerHtml}</div> <!-- Added ID -->

                    ${sourcesToggleHtml}

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
                <script src="/js/main.js" defer></script> <!-- Ensure main.js is loaded -->
            </body>
            </html>
        `);

    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).send('Research result not found.');
        } else {
            console.error(`[Server /research/:id] Error reading result ${resultId}:`, error);
            res.status(500).send('Error retrieving research result.');
        }
    }
});


// Start the server
// Listen on 0.0.0.0 to accept connections on all available network interfaces
app.listen(PORT, '0.0.0.0', () => {
  // Still log the configured HOST IP for user information if available, otherwise localhost
  const displayHost = HOST !== '0.0.0.0' ? HOST : 'localhost';
  console.log(`Server listening on http://${displayHost}:${PORT}`);
  console.log(`Also accessible via http://localhost:${PORT}`);
  console.log('*** Server startup complete. Ready for requests. ***'); // Added basic startup log
});
