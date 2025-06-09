# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
```bash
npm start                    # Start the server (main command)
node server.js              # Direct server start
npm install                 # Install dependencies after cloning
```

### Service Management (Windows)
```bash
npm run install-service     # Install as Windows service (requires admin)
npm run uninstall-service   # Uninstall Windows service (requires admin)
```

### Configuration Setup
1. Copy `.env.example` to `.env`
2. Configure required environment variables:
   - `IP_ADDRESS`, `PORT`: Server configuration
   - `OPENROUTER_API_KEY`, `OPENROUTER_API_MODEL`: LLM API access
   - `GOOGLE_API_KEY`, `GOOGLE_CX`: Google Custom Search API
   - `SESSION_SECRET_TOKEN`: Authentication token
   - `NUM_SOURCES`: Number of sources to search

## Architecture Overview

Deep Research is a monolithic Node.js web application using Express.js that performs AI-powered research by crawling web sources and generating LLM summaries.

### Core Data Flow
1. **Search Request** → `server.js` `/search` endpoint
2. **Web Crawling** → `src/crawler.js` (Google Custom Search API)
3. **Content Extraction** → `src/extractor.js` (Cheerio HTML parsing)
4. **LLM Processing** → `src/llm.js` (OpenRouter API with SSE streaming)
5. **Result Storage** → File system (`data/results/[uuid].json`)

### Key Architectural Patterns
- **Authentication**: Session-based middleware protecting all routes
- **Real-time Communication**: Server-Sent Events (SSE) for streaming LLM responses
- **Data Persistence**: File-based JSON storage (no database)
- **Client State**: IndexedDB for history persistence
- **Rate Limiting**: Daily request limits tracked in `data/usage.json`

### Module Responsibilities
- **`server.js`**: Main Express server, routing, authentication, SSE streaming
- **`src/crawler.js`**: Google Custom Search API integration with pagination
- **`src/extractor.js`**: HTML content extraction and text processing
- **`src/llm.js`**: OpenRouter API communication and response formatting
- **`public/js/main.js`**: Frontend SPA logic, IndexedDB, UI interactions

## Data Structures

### Usage Tracking (`data/usage.json`)
```json
{
  "date": "YYYY-MM-DD",
  "count": number
}
```

### Research Results (`data/results/[uuid].json`)
```json
{
  "id": "uuid",
  "query": "search query", 
  "summary": "LLM generated summary",
  "sources": [{"title": "", "url": "", "content": ""}],
  "timestamp": "ISO date",
  "cost": number
}
```

## Important Implementation Details

### Authentication Flow
- Session-based authentication using `SESSION_SECRET_TOKEN`
- All routes protected by authentication middleware
- Login required before accessing any functionality

### SSE Streaming Implementation
- LLM responses stream in real-time via Server-Sent Events
- Client maintains connection for live updates
- Retry logic implemented in `server.js` for API failures

### Rate Limiting System
- Daily limit of 10 requests per user
- Usage tracked in `data/usage.json` with date-based reset
- Frontend displays remaining requests and handles limit exceeded

### File-Based Persistence
- No database required - all data stored as JSON files
- Results saved with UUID filenames for shareable links
- Usage tracking persists across server restarts

## Testing Notes
- No automated test framework currently implemented
- Manual testing required for all features
- Test both desktop and mobile responsive interfaces
- Verify SSE streaming, authentication, and file persistence