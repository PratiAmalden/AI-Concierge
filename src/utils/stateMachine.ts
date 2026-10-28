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

/** Sends uncertain, out-of-scope, or explicitly escalated answers to human support. */
export function routeAssessment(assessment: ModelAssessment): ConciergeReply {
	if (
		assessment.handoff ||
		assessment.topic === "outside-scope" ||
		assessment.confidence < CONFIDENCE_THRESHOLD
	) {
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
