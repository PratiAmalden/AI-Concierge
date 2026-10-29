import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	buildSystemInstructions,
	formatFaqEvidence,
} from "../services/concierge.js";
import {
	parseFaqMarkdown,
	searchFaqEntries,
	type FaqEntry,
} from "../services/faqKnowledge.js";
import { answerCases } from "../evaluation/faqCases.js";
import { createQuestionVariants } from "../evaluation/questionVariants.js";

const traineeFaq = `# Trainee FAQ

## Course questions

- **Can I join the course without coding experience?**

Yes, no coding experience is needed.
`;

test("parses FAQ prompts into question, answer, source, and section records", () => {
	const entries = parseFaqMarkdown(traineeFaq, "Trainee FAQ.md");

	assert.equal(entries.length, 1);
	assert.equal(entries[0]?.question, "Can I join the course without coding experience?");
	assert.equal(entries[0]?.source, "Trainee FAQ.md");
	assert.equal(entries[0]?.section, "Trainee FAQ / Course questions");
	assert.match(entries[0]?.answer ?? "", /no coding experience is needed/i);
});

test("includes retrieved FAQ entries and surrounding source context in system instructions", () => {
	const entry = parseFaqMarkdown(traineeFaq, "Trainee FAQ.md")[0];
	assert.ok(entry);
	const evidence = formatFaqEvidence([entry]);
	const instructions = buildSystemInstructions(evidence);

	assert.match(instructions, /Section: Trainee FAQ \/ Course questions/);
	assert.match(instructions, /Question: Can I join the course without coding experience\?/);
	assert.match(instructions, /Yes, no coding experience is needed\./);
	assert.match(instructions, /Answer only from this supplied evidence/);
	assert.match(instructions, /Never include FAQ file names, source labels, citations, square-bracket references, or source brackets/);
	assert.doesNotMatch(instructions, /embedContent|embedding/i);
});

test("lexical search retrieves expected FAQ entries for the shared realistic answer cases", async () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const [trainee, volunteer] = await Promise.all([
		readFile(join(root, "Trainee FAQ.md"), "utf8"),
		readFile(join(root, "Volunteer FAQ.md"), "utf8"),
	]);
	const entries: FaqEntry[] = [
		...parseFaqMarkdown(trainee, "Trainee FAQ.md"),
		...parseFaqMarkdown(volunteer, "Volunteer FAQ.md"),
	];
	const answerableCases = answerCases.filter((testCase) => testCase.expectedFaqEntries.length > 0);
	let matchedTargets = 0;
	let totalTargets = 0;

	for (const testCase of answerableCases) {
		const results = searchFaqEntries(entries, testCase.question, 5);
		for (const target of testCase.expectedFaqEntries) {
			totalTargets += 1;
			if (results.some((entry) => (
				entry.source === target.source && entry.question === target.question
			))) {
				matchedTargets += 1;
			} else {
				assert.fail(
					`Lexical top-five search missed "${target.question}" for "${testCase.id}". Results: ${
						results.map((entry) => entry.question).join(" | ")
					}`,
				);
			}
		}
	}

	const lexicalRecall = matchedTargets / totalTargets;
	assert.equal(lexicalRecall, 1);
});

test("lexical search returns no evidence for a query with no FAQ matches", () => {
	const entries: FaqEntry[] = [
		...parseFaqMarkdown(traineeFaq, "Trainee FAQ.md"),
	];

	assert.deepEqual(searchFaqEntries(entries, "weather forecast"), []);
});

test("creates multiple realistic query forms including incomplete, informal, typo, and follow-up variants", () => {
	const variants = createQuestionVariants(
		"Can I volunteer remotely?",
		"How do I start?",
	);

	assert.equal(variants.length, 8);
	assert.ok(variants.some((variant) => variant.startsWith("hey,")));
	assert.ok(variants.some((variant) => variant.endsWith("...")));
	assert.ok(variants.some((variant) => variant.includes("what should I do next?")));
	assert.ok(variants.some((variant) => variant.includes("help out from home")));
	assert.ok(variants.some((variant) => variant.includes("How do I start?")));
	assert.ok(variants.some((variant) => variant !== "Can I volunteer remotely?"));
});
