import type { ConciergeReply } from "../types/concierge.js";

export const CONFIDENCE_THRESHOLD = 0.78;

export const HUMAN_HANDOFF_REPLY =
	"I want to make sure you get accurate, personal guidance. A CYF staff member or volunteer can help with this question. Please use the contact options on https://codeyourfuture.io/ or visit Signposts for support.";

/** The model fields used to decide whether an answer can be shown directly. */
export interface ModelAssessment {
	readonly reply: string;
	readonly confidence: number;
	readonly topic: ConciergeReply["topic"];
	readonly handoff: boolean;
}

/** Explains why a model assessment is routed to the fixed human-support reply. */
export function getAssessmentFallbackReasons(assessment: ModelAssessment): string[] {
	const reasons: string[] = [];
	if (assessment.handoff) reasons.push("model_requested_handoff");
	if (assessment.topic === "outside-scope") reasons.push("topic_outside_scope");
	if (!Number.isFinite(assessment.confidence)) reasons.push("invalid_confidence");
	else if (assessment.confidence < CONFIDENCE_THRESHOLD) reasons.push("confidence_below_threshold");
	return reasons;
}

/** Logs a structured fallback diagnostic without logging user or model text. */
export function logFallback(
	reasons: string | readonly string[],
	details: Readonly<Record<string, unknown>> = {},
): void {
	console.warn("[concierge:fallback]", {
		reasons: typeof reasons === "string" ? [reasons] : reasons,
		...details,
	});
}

/** Routes uncertain, unsafe, or out-of-scope answers to support. */
export function routeAssessment(assessment: ModelAssessment): ConciergeReply {
	if (getAssessmentFallbackReasons(assessment).length > 0) {
		return {
			reply: HUMAN_HANDOFF_REPLY,
			confidence: assessment.confidence,
			topic: assessment.topic,
			handoff: true,
		};
	}

	return {
		...assessment,
		handoff: false,
	};
}

/** Creates the fixed support response used when no safe model answer is available. */
export function safeFallback(): ConciergeReply {
	return {
		reply: HUMAN_HANDOFF_REPLY,
		confidence: 0,
		topic: "learning-support",
		handoff: true,
	};
}
