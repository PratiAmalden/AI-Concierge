// Focused checks for privacy redaction and safe routing.
import assert from "node:assert/strict";
import test from "node:test";
import { extractApprovedEmails, redactPii } from "../utils/piiScanner.js";
import {
	CONFIDENCE_THRESHOLD,
	HUMAN_HANDOFF_REPLY,
	getAssessmentFallbackReasons,
	logFallback,
	routeAssessment,
	safeFallback,
} from "../utils/stateMachine.js";

test("redacts email addresses and phone numbers", () => {
	const result = redactPii("Email me at learner@example.org or call +44 7777 55557");

	assert.equal(result.redacted, true);
	assert.equal(result.text.includes("learner@example.org"), false);
	assert.equal(result.text.includes("555"), false);
	assert.deepEqual(result.categories, ["email", "phone number"]);
});

test("redacts volunteered salary amounts before model processing", () => {
	const result = redactPii("My wife makes £30k/year.");

	assert.equal(result.text, "[REDACTED PERSONAL FINANCIAL DETAIL].");
	assert.deepEqual(result.categories, ["financial"]);
});

test("redacts full names shared with an identifying phrase", () => {
	const result = redactPii("My name is Sara Yusuf and I want to learn coding.");

	assert.equal(result.text, "[REDACTED NAME] and I want to learn coding.");
	assert.equal(result.categories.includes("name"), true);
});

test("does not redact ordinary lowercase learning statements as names", () => {
	const sentence = "I am learning digital skills and want to explore tech careers.";

	assert.equal(redactPii(sentence).text, sentence);
});

test("preserves only email addresses published in approved FAQ content", () => {
	const approvedEmails = extractApprovedEmails(
		"Contact laptops@codeyourfuture.io or laptop AT codeyourfuture.io.",
	);
	const officialAddress = redactPii(
		"Contact laptops@codeyourfuture.io for laptop help.",
		{ allowedEmails: approvedEmails },
	);
	const personalAddress = redactPii(
		"Contact learner@example.org.",
		{ allowedEmails: approvedEmails },
	);

	assert.deepEqual(approvedEmails, ["laptops@codeyourfuture.io", "laptop@codeyourfuture.io"]);
	assert.equal(officialAddress.redacted, false);
	assert.match(personalAddress.text, /\[REDACTED EMAIL\]/);
	assert.equal(personalAddress.redacted, true);
});

test("does not redact or require a special allowlist for ordinary expense questions", () => {
	for (const question of [
		"Childcare will cost more than £100 per day. Can I claim it?",
		"When will I get my expenses reimbursed?",
		"What is the expense limit for travel to London class?",
		"Where is the expenses form?",
	]) {
		assert.equal(redactPii(question).redacted, false, question);
	}
});

test("routes low-confidence, out-of-scope, and explicit handoff assessments to staff", () => {
	const lowConfidence = routeAssessment({
		reply: "Possibly.",
		confidence: CONFIDENCE_THRESHOLD - 0.01,
		topic: "cyf-training",
		handoff: false,
	});
	const outOfScope = routeAssessment({
		reply: "I can help with that.",
		confidence: 0.99,
		topic: "outside-scope",
		handoff: false,
	});

	assert.equal(lowConfidence.handoff, true);
	assert.equal(outOfScope.handoff, true);
	assert.equal(lowConfidence.reply, HUMAN_HANDOFF_REPLY);
	assert.equal(safeFallback().handoff, true);
});

test("requires the configured confidence threshold and rejects invalid confidence", () => {
	const belowThreshold = routeAssessment({
		reply: "The FAQ might say this.",
		confidence: CONFIDENCE_THRESHOLD - 0.01,
		topic: "cyf-training",
		handoff: false,
	});
	const atThreshold = routeAssessment({
		reply: "This is directly supported by the FAQ.",
		confidence: CONFIDENCE_THRESHOLD,
		topic: "cyf-training",
		handoff: false,
	});
	const invalidConfidence = routeAssessment({
		reply: "This is directly supported by the FAQ.",
		confidence: Number.NaN,
		topic: "cyf-training",
		handoff: false,
	});

	assert.equal(CONFIDENCE_THRESHOLD, 0.78);
	assert.equal(belowThreshold.handoff, true);
	assert.equal(atThreshold.handoff, false);
	assert.equal(invalidConfidence.handoff, true);
});

test("reports every model-assessment condition that causes a fallback", () => {
	assert.deepEqual(getAssessmentFallbackReasons({
		reply: "I am not sure.",
		confidence: CONFIDENCE_THRESHOLD - 0.01,
		topic: "outside-scope",
		handoff: true,
	}), [
		"model_requested_handoff",
		"topic_outside_scope",
		"confidence_below_threshold",
	]);
	assert.deepEqual(getAssessmentFallbackReasons({
		reply: "Invalid confidence.",
		confidence: Number.NaN,
		topic: "cyf-training",
		handoff: false,
	}), ["invalid_confidence"]);
});

test("writes fallback diagnostics as structured console data", () => {
	const originalWarn = console.warn;
	const logged: unknown[][] = [];
	console.warn = (...args: unknown[]) => logged.push(args);
	try {
		logFallback("model_request_failed", { status: 503, errorType: "ProviderError" });
	} finally {
		console.warn = originalWarn;
	}

	assert.deepEqual(logged, [[
		"[concierge:fallback]",
		{
			reasons: ["model_request_failed"],
			status: 503,
			errorType: "ProviderError",
		},
	]]);
});
