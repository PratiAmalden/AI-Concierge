import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  ChatApiRequest,
  ChatMessage,
} from "./types/concierge.js";
import { ConciergeService, sanitizeHistory, unavailableReply } from "./services/concierge.js";
import { redactPii } from "./utils/piiScanner.js";

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.object({
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    ).max(50),
  }),
});

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = join(projectRoot, "public");
const MAX_BODY_BYTES = 24_000;
const staticFiles: Readonly<Record<string, string>> = {
  "/": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
};

const mimeTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

/** Sends JSON with the privacy and browser-security headers used by the API. */
function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  });
  response.end(JSON.stringify(body));
}

/** Reads and parses a bounded JSON request body. */
async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new RangeError("Request body too large");
    }
  }
  return JSON.parse(body) as unknown;
}

/** Serves one of the explicitly allowed files from the public directory. */
async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const filename = staticFiles[pathname];
  if (filename === undefined) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const filePath = join(publicRoot, filename);
  const content = await readFile(filePath);
  response.writeHead(200, {
    "content-type": mimeTypes[extname(filename)] ?? "application/octet-stream",
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  });
  response.end(content);
}

/** Validates a chat request and returns one safe, structured JSON response. */
async function handleChat(
  request: IncomingMessage,
  response: ServerResponse,
  service: ConciergeService | undefined,
): Promise<void> {
  let rawBody: unknown;
  try {
    rawBody = await readRequestBody(request);
  } catch {
    sendJson(response, 400, { error: "Please send a valid, small JSON message." });
    return;
  }

  const validated = requestSchema.safeParse(rawBody);
  if (!validated.success) {
    sendJson(response, 400, { error: "Please send a message and conversation history." });
    return;
  }

  const input: ChatApiRequest = validated.data;
  const safeUserMessage = redactPii(input.message);
  const safeHistory: readonly ChatMessage[] = sanitizeHistory(input.history).map((item) => ({
    role: item.role,
    content: redactPii(item.content).text,
  }));

  let result;
  try {
    result = service === undefined
      ? unavailableReply()
      : await service.reply(
        safeHistory,
        safeUserMessage.text,
      );
  } catch (error) {
    const status = error instanceof Error
      ? (error as Error & { status?: number }).status
      : undefined;
    sendJson(response, status === 429 ? 429 : 503, {
      error: status === 429
        ? "Gemini is rate-limited or out of quota. Check your Google AI Studio limits, or try again later."
        : "The concierge is temporarily unavailable. Please try again later.",
    });
    return;
  }
  const safeReply = redactPii(result.reply);
  const finalResult = safeReply.redacted ? unavailableReply() : result;
  sendJson(response, 200, {
    safeUserMessage: safeUserMessage.text,
    piiRedacted: safeUserMessage.redacted || safeReply.redacted,
    result: finalResult,
  });
}

const port = Number(process.env["PORT"] ?? "3000");
const apiKey = process.env["GEMINI_API_KEY"]?.trim();
const geminiClient = apiKey === undefined || apiKey.length === 0
  ? undefined
  : new GoogleGenAI({ apiKey });
const [traineeFaq, volunteerFaq] = await Promise.all([
  readFile(join(projectRoot, "Trainee FAQ.md"), "utf8"),
  readFile(join(projectRoot, "Volunteer FAQ.md"), "utf8"),
]);
const service = geminiClient === undefined
  ? undefined
  : new ConciergeService(
    geminiClient,
    traineeFaq,
    volunteerFaq,
    process.env["GEMINI_MODEL"] ?? "gemini-3.5-flash-lite",
  );

if (service === undefined) {
  console.warn("GEMINI_API_KEY is not set. Chat requests will use the human-support fallback.");
}

// Route health checks, chat requests, and static page assets to their handlers.
const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/chat") {
    await handleChat(request, response, service);
    return;
  }

  if (request.method === "GET") {
    await serveStatic(requestUrl.pathname, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(port, "0.0.0.0");