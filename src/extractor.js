import axios from 'axios';
import * as cheerio from 'cheerio';

async function extractContent(url) {
    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const contentType = response.headers['content-type'];
        if (response.status !== 200 || !contentType || !contentType.includes('text/html')) {
            return null;
        }

        const $ = cheerio.load(response.data);

        $('script, style, noscript, iframe, header, footer, nav, aside, form, [aria-hidden="true"]').remove();

        let contentContainer = $('article, main, [role="main"]');
        if (contentContainer.length === 0) {
            contentContainer = $('body');
        }

        let extractedText = contentContainer.find('p, h1, h2, h3, h4, h5, h6, li, td, pre')
            .map((i, el) => {
                const text = $(el).text().trim();
                return $(el).is('p') ? text + '\n\n' : text;
            })
            .get()
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (!extractedText) {
             extractedText = $('body').text().replace(/\s+/g, ' ').trim();
        }

        return extractedText;

    } catch (error) {
        console.error(`Error fetching or processing ${url}:`, error.message);
        if (error.response) {
            console.error(`Status Code: ${error.response.status}`);
        }
        return null;
    }
}

export { extractContent };
