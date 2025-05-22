import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Fetches a URL and extracts meaningful text content from its HTML.
 * @param {string} url The URL of the page to process.
 * @returns {Promise<string|null>} A promise that resolves to the extracted text, or null on error.
 */
async function extractContent(url) {
    console.log(`[Extractor] Attempting to extract content from: ${url}`);
    try {
        // Fetch HTML content - set timeout
        const response = await axios.get(url, {
            timeout: 10000, // 10 second timeout
            headers: { // Add a basic user-agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Check for successful status code and content type
        const contentType = response.headers['content-type'];
        if (response.status !== 200 || !contentType || !contentType.includes('text/html')) {
            console.warn(`[Extractor] Skipping non-HTML or error page: ${url} (Status: ${response.status}, Type: ${contentType})`);
            return null;
        }

        // Load HTML into Cheerio
        const $ = cheerio.load(response.data);

        // Remove common non-content elements first to clean up
        $('script, style, noscript, iframe, header, footer, nav, aside, form, [aria-hidden="true"]').remove();

        // Select common content-holding elements. Prioritize main/article if they exist.
        let contentContainer = $('article, main, [role="main"]');
        if (contentContainer.length === 0) {
            // Fallback to body if no specific container found
            contentContainer = $('body');
        }

        // Extract text from relevant tags within the container
        // Join paragraphs with double newlines for better readability later
        let extractedText = contentContainer.find('p, h1, h2, h3, h4, h5, h6, li, td, pre')
            .map((i, el) => {
                const text = $(el).text().trim();
                // Add double newline after paragraphs for separation
                return $(el).is('p') ? text + '\n\n' : text;
            })
            .get()
            .join('\n') // Join different elements with single newline
            .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with just 2
            .trim(); // Trim leading/trailing whitespace

        if (!extractedText) {
             console.warn(`[Extractor] No significant text content found on: ${url}`);
             // Maybe try extracting just body text as a last resort?
             extractedText = $('body').text().replace(/\s+/g, ' ').trim(); // Basic text extraction
        }

        console.log(`[Extractor] Successfully extracted ~${extractedText.length} chars from: ${url}`);
        return extractedText;

    } catch (error) {
        console.error(`[Extractor] Error fetching or processing ${url}:`, error.message);
        // Log status code if available
        if (error.response) {
            console.error(`[Extractor] Status Code: ${error.response.status}`);
        }
        return null; // Return null on error
    }
}

export { extractContent };
