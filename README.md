# Deep Research

A web application that allows users to quickly search the web using a built-in crawler. The application collects news, research papers, and credible sources, then uses an AI/LLM to summarize the information and generate a comprehensive research answer with sources.

## Features

- Web crawling using Google Custom Search API
- Content extraction from various sources
- AI-powered summarization and answer generation
- Real-time streaming of AI responses
- Shareable research results
- History tracking
- Responsive design for desktop and mobile
- Session-based authentication

## Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Copy `.env.example` to `.env` and fill in your configuration values
4. Run `npm start` to start the server

## Environment Variables

See `.env.example` for required environment variables.

## Running as a Windows Service

The application includes scripts to install/uninstall as a Windows service:

- Install: `npm run install-service`
- Uninstall: `npm run uninstall-service`

Note: Running these scripts requires Administrator privileges.

## Technologies

- Node.js
- Express.js
- Axios
- Cheerio
- Server-Sent Events (SSE)
- IndexedDB (client-side storage)
