import axios from 'axios';

/**
 * Generates an answer to a query using the OpenRouter API, based on provided text and sources.
 *
 * @param {string} query The original user query to answer.
 * @param {string} text The combined text extracted from sources.
 * @param {Array<object>} sources An array of source objects, each with at least 'title' and 'link'.
 * @param {string} apiKey The OpenRouter API key.
 * @param {string} modelName The name of the LLM model to use (e.g., 'google/gemini-flash-1.5').
 * @returns {Promise<import('stream').Readable>} A promise that resolves to the readable stream from the OpenRouter API response.
 * @throws {Error} Throws an error if the API call fails or configuration is missing.
 */
async function summarizeContentStream(query, text, sources, apiKey, modelName) { // Renamed for clarity
  if (!apiKey) {
    console.error('OpenRouter API key is missing.');
    throw new Error('OpenRouter API key not configured.');
  }
  if (!modelName) {
    console.error('OpenRouter model name is missing.');
    throw new Error('OpenRouter model name not configured.');
  }
  if (!text || text.trim().length === 0) {
    console.warn('No text provided for answering.');
    throw new Error('No content available to answer the query.');
  }
  // Note: Proceeding without sources might affect citation quality, but shouldn't stop the stream.
  if (!sources || sources.length === 0) {
    console.warn('No sources provided for citation.');
  }

  // Construct the source list for the prompt context
  const sourceListText = sources && sources.length > 0
    ? sources.map((src, index) => `${index + 1}. Title: ${src.title}\n   URL: ${src.link}`).join('\n')
    : 'No specific sources provided.';

  // --- Construct the detailed prompt in parts ---
  const promptIntro = `You are an AI research assistant. Your primary task is to answer the user's query based mainly on the provided text content extracted from the sources.`;

  const promptQuery = `
**User Query:**
---
${query}
---
`;

  const promptInstructions = `
**Instructions:**
1.  Carefully read the **User Query** and the **Extracted Text Content**.
2.  Formulate a **detailed and comprehensive** answer to the **User Query**, using *only* information present in the **Extracted Text Content**.
3.  **Structure, Length, and Tone:** Write the answer in a formal, objective, and academic tone suitable for a research paper. Structure the answer into **3 to 4 distinct paragraphs**. The total length of the main answer (these 3-4 paragraphs, excluding the TL;DR and Sources list) **MUST be between 500 and 700 words**. Use HTML '<p>' tags to separate the paragraphs clearly. Do **NOT** refer to the process of using the provided text (e.g., avoid phrases like "Based on the provided text," "The sources indicate," etc.). Present the information directly as findings.
4.  **Citations:** Cite the information used in your answer by referencing the sources. Incorporate citations *within* the answer text where appropriate using HTML superscript tags containing HTML anchor tags. The anchor tag's 'href' attribute must point to a corresponding source ID in the final list (e.g., '#source-1', '#source-2'). The visible text of the anchor tag must be the superscript number (e.g., 1, 2).
5.  **Source List:** After the answer, include an HTML ordered list ('<ol>') titled "**Sources:**". Each list item ('<li>') MUST have an 'id' attribute matching the anchor used in the superscript links (e.g., id="source-1", id="source-2"). Inside each list item, provide **only the source title** as the visible text of the HTML anchor tag ('<a>') linking to the source URL, with the 'target="_blank"' attribute. Do **NOT** include the prefix "Title:" before the source title.
6.  **TL;DR Summary:** After the main answer (the 3 paragraphs) and *before* the "**Sources:**" list, add a concise 1-2 sentence summary of the main answer, prefixed with "**To summarize:** ".
7.  **Formatting & Constraints:** Ensure the final output (answer, TL;DR, and source list) is well-structured, valid HTML, and easy to read. Do NOT use Markdown formatting for links. Do NOT include information not found in the provided text content.
`;

  const promptContent = `
**Extracted Text Content:**
---
${text}
---
`;

  const promptSources = `
**Sources Used (for context and citation numbering, format output as per instruction #5 and #6):** 
---
${sourceListText}
---
`; // Updated instruction reference

  const promptOutro = `
**Generated Answer, TLDR, and Sources (HTML format as requested):** 
`; // Updated outro

  // Combine the parts correctly
  const prompt = promptIntro + promptQuery + promptInstructions + promptContent + promptSources + promptOutro;
  // --- End Prompt Construction ---


  const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    // Recommended headers by OpenRouter
    'HTTP-Referer': `http://localhost:${process.env.PORT || 3000}`, // Adjust if deployed elsewhere
    'X-Title': 'Deep Research', // Your app name
  };

  const data = {
    model: modelName,
    messages: [
      { role: 'user', content: prompt },
    ],
    stream: true, // <<< Enable streaming
  };

  try {
    console.log(`Sending streaming request to OpenRouter with model: ${modelName}`);
    // Request the stream
    const response = await axios.post(openRouterUrl, data, {
      headers,
      responseType: 'stream' // <<< Get response as a stream
    });

    console.log('Received stream response from OpenRouter.');
    // Return the stream object itself
    return response.data;

  } catch (error) {
    console.error('Error calling OpenRouter API for stream:', error.response ? `${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message);
    // Throw an error that the calling function (in server.js) can catch
    let errorMessage = 'Error: Failed to get stream from the AI.';
    if (error.response) {
        // Attempt to read error details from the stream if available
        // This might be complex, so keeping it simple for now.
        errorMessage += ` Status: ${error.response.status}. Check server logs for details.`;
    } else if (error.request) {
        errorMessage += ' No response received from the server.';
    } else {
        errorMessage += ` Request setup error: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
}

// Keep the old function for potential fallback or other uses if needed,
// but the primary export for streaming will be the new one.
// Or remove the old one if it's definitely not needed.
// For now, exporting both with distinct names.
async function summarizeContent(query, text, sources, apiKey, modelName) { // Function name kept for compatibility
  if (!apiKey) {
    console.error('OpenRouter API key is missing.');
    return 'Error: OpenRouter API key not configured.';
  }
  if (!modelName) {
    console.error('OpenRouter model name is missing.');
    return 'Error: OpenRouter model name not configured.';
  }
  if (!text || text.trim().length === 0) {
    console.warn('No text provided for answering.');
    return 'No content available to answer the query.';
  }
  if (!sources || sources.length === 0) {
    console.warn('No sources provided for citation.');
    // Proceed without sources if necessary, but log it.
  }

  // Construct the source list for the prompt context
  const sourceListText = sources && sources.length > 0
    ? sources.map((src, index) => `${index + 1}. Title: ${src.title}\n   URL: ${src.link}`).join('\n')
    : 'No specific sources provided.';

  // --- Construct the detailed prompt in parts ---
  const promptIntro = `You are an AI research assistant. Your primary task is to answer the user's query based *only* on the provided text content extracted from the sources.`;

  const promptQuery = `
**User Query:**
---
${query}
---
`;

  const promptInstructions = `
**Instructions:**
1.  Carefully read the **User Query** and the **Extracted Text Content**.
2.  Formulate a comprehensive answer to the **User Query**, using *only* information present in the **Extracted Text Content**.
3.  **Structure and Tone:** Write the answer in a formal, objective, and academic tone suitable for a research paper. Structure the answer into **exactly 3 distinct paragraphs**, using HTML '<p>' tags to separate them clearly. Do **NOT** refer to the process of using the provided text (e.g., avoid phrases like "Based on the provided text," "The sources indicate," etc.). Present the information directly as findings.
4.  **Citations:** Cite the information used in your answer by referencing the sources. Incorporate citations *within* the answer text where appropriate using HTML superscript tags containing HTML anchor tags. The anchor tag's 'href' attribute must point to a corresponding source ID in the final list (e.g., '#source-1', '#source-2'). The visible text of the anchor tag must be the superscript number (e.g., 1, 2).
5.  **Source List:** After the answer, include an HTML ordered list ('<ol>') titled "**Sources:**". Each list item ('<li>') MUST have an 'id' attribute matching the anchor used in the superscript links (e.g., id="source-1", id="source-2"). Inside each list item, provide **only the source title** as the visible text of the HTML anchor tag ('<a>') linking to the source URL, with the 'target="_blank"' attribute. Do **NOT** include the prefix "Title:" before the source title.
6.  **TL;DR Summary:** After the main answer (the 3 paragraphs) and *before* the "**Sources:**" list, add a concise 1-2 sentence summary of the main answer, prefixed with "**To summarize:** ".
7.  **Formatting & Constraints:** Ensure the final output (answer, TL;DR, and source list) is well-structured, valid HTML, and easy to read. Do NOT use Markdown formatting for links. Do NOT include information not found in the provided text content.
`;

  const promptContent = `
**Extracted Text Content:**
---
${text}
---
`;

  const promptSources = `
**Sources Used (for context and citation numbering, format output as per instruction #5 and #6):**
---
${sourceListText}
---
`; // Updated instruction reference

  const promptOutro = `
**Generated Answer, TLDR, and Sources (HTML format as requested):**
`; // Updated outro

  // Combine the parts correctly
  const prompt = promptIntro + promptQuery + promptInstructions + promptContent + promptSources + promptOutro;
  // --- End Prompt Construction ---


  const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    // Recommended headers by OpenRouter
    'HTTP-Referer': `http://localhost:${process.env.PORT || 3000}`, // Adjust if deployed elsewhere
    'X-Title': 'Deep Research', // Your app name
  };

  const data = {
    model: modelName,
    messages: [
      { role: 'user', content: prompt },
    ],
  };

  try {
    console.log(`Sending request to OpenRouter with model: ${modelName}`);
    const response = await axios.post(openRouterUrl, data, { headers });

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const answer = response.data.choices[0].message.content.trim();
      console.log('Received answer from OpenRouter.');
      return answer; // Return the answer (which includes TLDR and HTML source list)
    } else {
      console.error('Invalid response structure from OpenRouter:', response.data);
      return 'Error: Failed to get a valid answer from the AI. Invalid response structure.';
    }
  } catch (error) {
    console.error('Error calling OpenRouter API:', error.response ? error.response.data : error.message);
    // Provide more specific feedback if possible
    let errorMessage = 'Error: Failed to get answer from the AI.';
    if (error.response) {
        errorMessage += ` Status: ${error.response.status}. Message: ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
        errorMessage += ' No response received from the server.';
    } else {
        errorMessage += ` Request setup error: ${error.message}`;
    }
    return errorMessage;
  }
}


export { summarizeContent, summarizeContentStream };
