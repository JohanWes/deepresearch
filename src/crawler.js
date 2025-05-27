import axios from 'axios';

async function searchWeb(query) {
    if (!query) {
        return [];
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const GOOGLE_CX = process.env.GOOGLE_CX;
    const totalSourcesToFetch = parseInt(process.env.NUM_SOURCES, 10) || 20;
    const resultsPerPage = 10;

    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
        console.error('Missing Google API Key or CX ID in environment variables.');
        return [];
    }

    const searchUrl = 'https://www.googleapis.com/customsearch/v1';
    const numPages = Math.ceil(totalSourcesToFetch / resultsPerPage);
    const apiPromises = [];

    for (let i = 0; i < numPages; i++) {
        const startIndex = i * resultsPerPage + 1;
        const params = {
            key: GOOGLE_API_KEY,
            cx: GOOGLE_CX,
            q: query,
            num: resultsPerPage,
            start: startIndex,
        };

        apiPromises.push(
            axios.get(searchUrl, { params })
                .catch(error => {
                    console.error(`Error calling Google API for page ${i + 1}:`);
                    if (error.response) {
                        console.error(`Status: ${error.response.status}`);
                        console.error('Data:', JSON.stringify(error.response.data, null, 2));
                    } else if (error.request) {
                        console.error('Request Error:', error.request);
                    } else {
                        console.error('Error Message:', error.message);
                    }
                    return { error: true, page: i + 1, reason: error.message };
                })
        );
    }

    const results = await Promise.allSettled(apiPromises);

    let combinedItems = [];

    results.forEach((result, index) => {
        const pageNum = index + 1;
        if (result.status === 'fulfilled') {
            const response = result.value;
            if (response && !response.error) {
                if (response.data && response.data.items) {
                    combinedItems = combinedItems.concat(response.data.items);
                } else {
                    console.warn(`No items found in API response for page ${pageNum}.`);
                }
            } else if (response && response.error) {
                console.error(`Pre-caught error for page ${pageNum}: ${response.reason}`);
            }
        } else {
            console.error(`Promise rejected for page ${pageNum}:`, result.reason);
        }
    });

    return combinedItems.slice(0, totalSourcesToFetch);
}

export { searchWeb };
