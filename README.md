# AI Concierge

CodeYourFuture (CYF) learning concierge for trainees, prospective trainees, volunteers, and people exploring digital learning and tech careers. It reads the project FAQ files, finds the most relevant entries by lexical matching, and sends a prompt to Google Gemini. If the answer is low confidence, off-topic, explicitly escalated, it falls back to a fixed human-support reply instead of guessing.

## Local setup

Requirements: Node.js 22 or newer and a Google AI Studio API key.

```sh
npm ci
```

Create a `.env` file in the project root with the values you need:

```sh
GEMINI_API_KEY=your_google_ai_studio_key
PORT=3000
GEMINI_MODEL=gemini-3.5-flash-lite
```

Then run the app:

```sh
npm run dev
```

Open `http://localhost:3000` in the browser.

If `GEMINI_API_KEY` is missing, the UI still loads but every chat request routes to a human-support fallback instead of calling Gemini.

## Runtime behaviour

The actual runtime flow is:

- The browser sends `POST /api/chat` with `{ message, history }`.
- The server validates the payload, limits the JSON body, and rejects oversized or replies containing detected personal information.
- The message and recent history are redacted for email, phone, and common introduced names before they are sent to the model.
- The service keeps only the most recent 12 messages in browser memory and trims message text to 2,000 characters before model submission.
- At startup it reads both FAQ files and parses them into question/answer entries with their section context.
- Retrieval is lexical: it tokenises the query, expands a small synonym list (for example `join`, `apply`, `signup`, `volunteer`), and ranks the most relevant FAQ entries. It does not use embeddings or PostgreSQL/vector storage.
- The prompt includes only the retrieved evidence (default mode) or the full FAQ text in evaluation mode. The default production path uses retrieved context, not the full document.
- The model must return structured JSON matching a schema with `reply`, `confidence`, `topic`, and `handoff`.
- Unsupported topics, low confidence (< 0.78), explicit handoff flags, or Gemini failures route to a fixed human-support reply.

## Useful commands

```sh
npm run dev      # local development server with hot reload
npm run build    # compile TypeScript to dist/
npm start        # run the built server
npm test         # project test suite
npm run typecheck
```
Run the live FAQ evaluation (requires a configured Gemini API key):

```sh
npm run evaluate:faq
```
