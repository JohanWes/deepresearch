import axios from 'axios';

// Note: Environment variables are loaded in server.js via dotenv.config()
// We access them inside the function to ensure they are loaded.

/**
 * Performs multiple web searches using the Google Custom Search JSON API with pagination
 * to retrieve a specified total number of results.
 * @param {string} query The search query.
 * @returns {Promise<object[]>} A promise that resolves to an array of combined result items from the API (or an empty array).
 */
async function searchWeb(query) {
    if (!query) {
        console.error('[API Search] Search query cannot be empty.');
        return [];
    }

    // Access environment variables inside the function
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const GOOGLE_CX = process.env.GOOGLE_CX;
    // Read total desired sources, default to 20 if not set/invalid
    const totalSourcesToFetch = parseInt(process.env.NUM_SOURCES, 10) || 20;
    const resultsPerPage = 10; // Google API limit per request

    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
        console.error('[API Search] Missing Google API Key or CX ID in environment variables.');
        return [];
    }

    const searchUrl = 'https://www.googleapis.com/customsearch/v1';
    const numPages = Math.ceil(totalSourcesToFetch / resultsPerPage);
    const apiPromises = [];

    console.log(`[API Search] Planning to fetch ${totalSourcesToFetch} results for "${query}" across ${numPages} pages.`);

    // Create promises for each API call page
    for (let i = 0; i < numPages; i++) {
        const startIndex = i * resultsPerPage + 1;
        const params = {
            key: GOOGLE_API_KEY,
            cx: GOOGLE_CX,
            q: query,
            num: resultsPerPage, // Request max 10 per page
            start: startIndex,   // Start index for pagination
        };

        console.log(`[API Search] Creating promise for page ${i + 1} (start index: ${startIndex})`);
        apiPromises.push(
            axios.get(searchUrl, { params })
                .catch(error => {
                    // Catch individual errors to allow Promise.allSettled to work
                    console.error(`[API Search] Error calling Google API for page ${i + 1}:`);
                    if (error.response) {
                        console.error(`Status: ${error.response.status}`);
                        console.error('Data:', JSON.stringify(error.response.data, null, 2));
                    } else if (error.request) {
                        console.error('Request Error:', error.request);
                    } else {
                        console.error('Error Message:', error.message);
                    }
                    // Return a specific marker for failed requests
                    return { error: true, page: i + 1, reason: error.message };
                })
        );
    }

    // Execute all API calls concurrently and wait for all to settle
    const results = await Promise.allSettled(apiPromises);

    let combinedItems = [];
    let successfulPages = 0;

    results.forEach((result, index) => {
        const pageNum = index + 1;
        if (result.status === 'fulfilled') {
            const response = result.value;
            // Check if it was a successful API call or our error marker
            if (response && !response.error) {
                if (response.data && response.data.items) {
                    console.log(`[API Search] Successfully fetched ${response.data.items.length} items from page ${pageNum}.`);
                    combinedItems = combinedItems.concat(response.data.items);
                    successfulPages++;
                } else {
                    console.warn(`[API Search] No items found in API response for page ${pageNum}.`);
                    if (response.data) {
                        console.log(`[API Search] Response data structure for page ${pageNum}:`, JSON.stringify(response.data, null, 2));
                    }
                }
            } else if (response && response.error) {
                // Log the pre-caught error reason
                console.error(`[API Search] Pre-caught error for page ${pageNum}: ${response.reason}`);
            }
        } else {
            // Promise was rejected (shouldn't happen often with the .catch above, but handle just in case)
            console.error(`[API Search] Promise rejected for page ${pageNum}:`, result.reason);
        }
    });

    console.log(`[API Search] Finished all API calls. Successfully fetched from ${successfulPages} pages. Total items combined: ${combinedItems.length}`);

    // Return only up to the originally requested total number, in case API returned slightly more/less per page somehow
    return combinedItems.slice(0, totalSourcesToFetch);
}

export { searchWeb };
