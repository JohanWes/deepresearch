import axios from 'axios';

async function summarizeContentStream(query, text, sources, apiKey, modelName) {
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured.');
  }
  if (!modelName) {
    throw new Error('OpenRouter model name not configured.');
  }
  if (!text || text.trim().length === 0) {
    throw new Error('No content available to answer the query.');
  }

  const sourceListText = sources && sources.length > 0
    ? sources.map((src, index) => `${index + 1}. Title: ${src.title}\n   URL: ${src.link}`).join('\n')
    : 'No specific sources provided.';

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
`;

  const promptOutro = `
**Generated Answer, TLDR, and Sources (HTML format as requested):** 
`;

  const prompt = promptIntro + promptQuery + promptInstructions + promptContent + promptSources + promptOutro;

  const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': `http://localhost:${process.env.PORT || 3000}`,
    'X-Title': 'Deep Research',
  };

  const data = {
    model: modelName,
    messages: [
      { role: 'user', content: prompt },
    ],
    stream: true,
  };

  try {
    const response = await axios.post(openRouterUrl, data, {
      headers,
      responseType: 'stream'
    });

    return response.data;

  } catch (error) {
    let errorMessage = 'Error: Failed to get stream from the AI.';
    if (error.response) {
        errorMessage += ` Status: ${error.response.status}. Check server logs for details.`;
    } else if (error.request) {
        errorMessage += ' No response received from the server.';
    } else {
        errorMessage += ` Request setup error: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
}

export { summarizeContentStream };
