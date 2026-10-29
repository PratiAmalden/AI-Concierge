// Focused checks for privacy redaction and safe routing.
import assert from "node:assert/strict";
import test from "node:test";
import { redactPii } from "../utils/piiScanner.js";
import {
	CONFIDENCE_THRESHOLD,
	HUMAN_HANDOFF_REPLY,
	routeAssessment,
	safeFallback,
} from "../utils/stateMachine.js";

test("redacts email addresses and phone numbers", () => {
	const result = redactPii("Email me at learner@example.org or call +44 7777 55557");

	assert.equal(result.redacted, true);
	assert.equal(result.text.includes("learner@example.org"), false);
	assert.equal(result.text.includes("555"), false);
	assert.deepEqual(result.categories, ["email", "phone"]);
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
