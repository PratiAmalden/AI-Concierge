/** Roles allowed in the short conversation history sent with each request. */
export type MessageRole = "user" | "assistant";

/** Topic labels used to decide whether an answer is within the concierge's scope. */
export type ConciergeTopic =
	| "cyf-training"
	| "tech-careers"
	| "learning-support"
	| "outside-scope";

/** A single user or assistant turn. */
export interface ChatMessage {
	readonly role: MessageRole;
	readonly content: string;
}

/** Conversation messages supplied by the browser. */
export interface ConversationHistory {
	readonly messages: readonly ChatMessage[];
}

/** The validated answer shape returned by the concierge service. */
export interface ConciergeReply {
	readonly reply: string;
	readonly confidence: number;
	readonly topic: ConciergeTopic;
	readonly handoff: boolean;
}

/** The browser's chat request payload. */
export interface ChatApiRequest {
	readonly message: string;
	readonly history: ConversationHistory;
}

/** The server's response, including the redacted user message and routing result. */
export interface ChatApiResponse {
	readonly safeUserMessage: string;
	readonly piiRedacted: boolean;
	readonly result: ConciergeReply;
}
