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
	getConversationalReply,
	getConversationAudience,
	getPolicyBoundaryReply,
} from "../services/concierge.matchers.js";
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

test("handles greetings, acknowledgements, and concierge introductions directly", () => {
	const greeting = getConversationalReply("Hi there!");
	const acknowledgement = getConversationalReply("Thanks, that helps!");
	const introduction = getConversationalReply("what do you do?");
	const traineeDefinition = getConversationalReply("What is a trainee?");
	const employmentClarification = getConversationalReply("Can I get a job with you?");
	const eligibility = getConversationalReply("Can you help me find out if I'm eligible?");
	const locationEligibility = getConversationalReply("I live in Wales. Am I eligible?");
	const locationCourseQuestion = getConversationalReply("I live in Turkey. Can I get in your course?");
	const unemployment = getConversationalReply("I am unemployed");
	const householdIncome = getConversationalReply("My wife makes [REDACTED FINANCIAL DETAIL]");

	assert.equal(greeting?.handoff, false);
	assert.match(greeting?.reply ?? "", /Hello!/);
	assert.equal(acknowledgement?.handoff, false);
	assert.match(acknowledgement?.reply ?? "", /You're welcome/);
	assert.equal(introduction?.handoff, false);
	assert.match(introduction?.reply ?? "", /CodeYourFuture \(CYF\) concierge/);
	assert.match(introduction?.reply ?? "", /training, volunteering, tech careers/);
	assert.match(traineeDefinition?.reply ?? "", /taking part in one of CodeYourFuture's courses/);
	assert.match(employmentClarification?.reply ?? "", /employee, volunteering.*course/);
	assert.equal(eligibility?.topic, "cyf-training");
	assert.equal(locationEligibility?.handoff, false);
	assert.equal(locationCourseQuestion?.handoff, false);
	assert.equal(unemployment?.handoff, false);
	assert.match(eligibility?.reply ?? "", /within 90 minutes by public transport/);
	assert.match(eligibility?.reply ?? "", /I can't decide whether an individual qualifies/);
	assert.equal(householdIncome?.topic, "cyf-training");
	assert.doesNotMatch(householdIncome?.reply ?? "", /salary|£|financial detail/i);
	assert.equal(getConversationalReply("Am I eligible to volunteer?"), undefined);
	assert.equal(getConversationalReply("Can I volunteer remotely?"), undefined);
});

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
	assert.match(instructions, /Questions about course eligibility, admission, course schedules, or course formats are about joining as a prospective trainee/);
	assert.match(instructions, /published policies, including course fees and published eligibility\/right-to-work requirements/);
	assert.match(instructions, /Do not give individualized medical, legal, immigration, financial, or crisis advice/);
	assert.match(instructions, /Ask a clarification question only when a specific missing detail materially changes the answer/);
	assert.match(instructions, /Do not ask whether the user means trainee or volunteer just because their question could relate to either/);
	assert.doesNotMatch(instructions, /embedContent|embedding/i);
});

test("no-evidence instructions do not invite unnecessary broad clarification", () => {
	const instructions = buildSystemInstructions("(No matching FAQ evidence was found.)");

	assert.match(instructions, /Do not ask a broad clarification question just because no FAQ matched/);
	assert.match(instructions, /ask only for a specific detail that is necessary to answer/);
});

test("carries a trainee choice from a clarification into later questions", () => {
	const history = [
		{ role: "user" as const, content: "I'm currently receiving Universal Credit. Can I apply?" },
		{ role: "assistant" as const, content: "Are you asking about joining CYF as a trainee, or about volunteering?" },
		{ role: "user" as const, content: "trainee" },
		{ role: "assistant" as const, content: "Receiving Universal Credit means you meet our low-income eligibility criteria." },
	];
	const audience = getConversationAudience(history);

	assert.equal(audience, "trainee");
	assert.match(
		buildSystemInstructions("(No matching FAQ evidence was found.)", audience),
		/The user has clarified that they are asking as a prospective trainee/,
	);
	assert.equal(
		getConversationAudience([
			...history,
			{ role: "user" as const, content: "I want to volunteer as a mentor." },
		]),
		"volunteer",
	);
});

test("handles uncertain tablet, laptop-support, and child-attendance policies without guessing", () => {
	const tablet = getPolicyBoundaryReply("Can I use a tablet instead of a laptop?");
	const laptopFault = getPolicyBoundaryReply("What happens if my CYF laptop stops working?");
	const technicalContact = getPolicyBoundaryReply("Who should I contact if I have technical problems?");
	const childAttendance = getPolicyBoundaryReply("Can I bring my baby to class?");
	const childcareCosts = getPolicyBoundaryReply("Can I claim childcare expenses?");

	assert.match(tablet?.reply ?? "", /FAQ says you need a laptop or computer.*does not say whether a tablet is compatible/i);
	assert.equal(tablet?.handoff, false);
	assert.match(laptopFault?.reply ?? "", /doesn't specify what to do or who to contact/i);
	assert.equal(laptopFault?.handoff, true);
	assert.match(technicalContact?.reply ?? "", /doesn't specify what to do or who to contact/i);
	assert.equal(childAttendance?.handoff, true);
	assert.match(childAttendance?.reply ?? "", /childcare-expense rules are separate/i);
	assert.equal(childcareCosts, undefined);
});

test("retrieves approved evidence for laptop, CV, and expense questions", async () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const [trainee, volunteer] = await Promise.all([
		readFile(join(root, "Trainee FAQ.md"), "utf8"),
		readFile(join(root, "Volunteer FAQ.md"), "utf8"),
	]);
	const entries: FaqEntry[] = [
		...parseFaqMarkdown(trainee, "Trainee FAQ.md"),
		...parseFaqMarkdown(volunteer, "Volunteer FAQ.md"),
	];
	const cases = [
		{
			question: "Do I need my own laptop to join?",
			expectedQuestion: "I don’t have access to a computer or a laptop. Can I still take this course?",
		},
		{
			question: "What laptop specifications do I need?",
			expectedQuestion: "Laptop specification for the course",
		},
		{
			question: "Can I get a laptop from CodeYourFuture?",
			expectedQuestion: "I need a laptop for Intro to Programming. How can I request it, and what is the process?",
		},
		{
			question: "Do I have to return the laptop after the course?",
			expectedQuestion: "How do I return my CYF laptop?",
		},
		{
			question: "Will CYF help me prepare my CV?",
			expectedQuestion: "How does CYF help me in my job search",
		},
		{
			question: "Childcare will cost more than £100 per day. Can CYF reimburse it?",
			expectedQuestion: "I need financial support with barriers (laptops, transport (bus/ train), and childcare)",
		},
		{
			question: "When will I get my expenses reimbursed?",
			expectedQuestion: "I need financial support with barriers (laptops, transport (bus/ train), and childcare)",
		},
		{
			question: "What is the expense limit for travel to London class?",
			expectedQuestion: "I need financial support with barriers (laptops, transport (bus/ train), and childcare)",
		},
		{
			question: "Where is the expenses form?",
			expectedQuestion: "I need financial support with barriers (laptops, transport (bus/ train), and childcare)",
		},
	];

	for (const { question, expectedQuestion } of cases) {
		const results = searchFaqEntries(entries, question, 5);
		assert.ok(
			results.some((entry) => entry.question === expectedQuestion),
			`Did not retrieve "${expectedQuestion}" for "${question}". Results: ${
				results.map((entry) => entry.question).join(" | ")
			}`,
		);
	}
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

test("retrieves representative real-user questions in the top ten", async () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const [trainee, volunteer] = await Promise.all([
		readFile(join(root, "Trainee FAQ.md"), "utf8"),
		readFile(join(root, "Volunteer FAQ.md"), "utf8"),
	]);
	const entries: FaqEntry[] = [
		...parseFaqMarkdown(trainee, "Trainee FAQ.md"),
		...parseFaqMarkdown(volunteer, "Volunteer FAQ.md"),
	];
	const representativeCases = [
		{
			question: "Are the courses free?",
			target: { source: "Trainee FAQ.md", question: "Are your courses free?" },
		},
		{
			question: "Can I sign up if I can't work in the UK?",
			target: { source: "Trainee FAQ.md", question: "Do applicants need to have the right to work in the UK?" },
		},
		{
			question: "How do I get started as a volunteer?",
			target: { source: "Volunteer FAQ.md", question: "I want to volunteer. Where do I start?" },
		},
		{
			question: "Can I volunteer online?",
			target: { source: "Volunteer FAQ.md", question: "I can only volunteer remotely." },
		},
		{
			question: "How many hours a week should I expect to study?",
			target: { source: "Trainee FAQ.md", question: "What is the weekly commitment to do your courses?" },
		},
		{
			question: "Do I need to attend classes in person?",
			target: { source: "Trainee FAQ.md", question: "Are the courses online or in-person?" },
		},
		{
			question: "Can CYF guarantee me a job when I finish?",
			target: { source: "Trainee FAQ.md", question: "Is a job guaranteed at the end of the course?" },
		},
		{
			question: "I am unemployed",
			target: { source: "Trainee FAQ.md", question: "Am I eligible for the CodeYourFuture (CYF) courses?" },
		},
		{
			question: "My wife makes £30k/year",
			target: { source: "Trainee FAQ.md", question: "Am I eligible for the CodeYourFuture (CYF) courses?" },
		},
		{
			question: "Can you help me find out if I'm eligible?",
			target: { source: "Trainee FAQ.md", question: "Am I eligible for the CodeYourFuture (CYF) courses?" },
		},
		{
			question: "Am I eligible?",
			target: { source: "Trainee FAQ.md", question: "Am I eligible for the CodeYourFuture (CYF) courses?" },
		},
		{
			question: "I live in Turkey. Can I get in your course?",
			target: { source: "Trainee FAQ.md", question: "Which regions/cities are you located in?" },
		},
		{
			question: "I live in Wales. Am I eligible?",
			target: { source: "Trainee FAQ.md", question: "Am I eligible for the CodeYourFuture (CYF) courses?" },
		},
		{
			question: "I'm working. When do I have to go to classes?",
			target: { source: "Trainee FAQ.md", question: "Which day and time are the classes?" },
		},
		{
			question: "Can I do it online?",
			target: { source: "Trainee FAQ.md", question: "Are the courses online or in-person?" },
		},
	];

	for (const { question, target } of representativeCases) {
		const results = searchFaqEntries(entries, question, 10);
		const matchedTarget = results.some((entry) => (
			entry.source === target.source && entry.question === target.question
		));
		const matchedEquivalentRemoteAdvice = target.question === "I can only volunteer remotely."
			&& results.some((entry) => (
				entry.source === target.source
				&& /\b(remote|online|home)\b/i.test(`${entry.question}\n${entry.answer}`)
			));
		assert.ok(
			matchedTarget || matchedEquivalentRemoteAdvice,
			`Top-ten search missed "${target.question}" for "${question}". Results: ${
				results.map((entry) => entry.question).join(" | ")
			}`,
		);
	}
});

test("lexical search returns no evidence for a query with no FAQ matches", () => {
	const entries: FaqEntry[] = [
		...parseFaqMarkdown(traineeFaq, "Trainee FAQ.md"),
	];

	assert.deepEqual(searchFaqEntries(entries, "weather forecast"), []);
});

test("expands multi-word synonyms into searchable FAQ terms", () => {
	const entries: FaqEntry[] = [
		{
			source: "Trainee FAQ.md",
			section: "Expenses",
			question: "How are care costs covered?",
			answer: "Childcare must be provided by a registered provider.",
		},
	];

	assert.equal(searchFaqEntries(entries, "childcare").length, 1);
});

test("keeps CYF and CodeYourFuture as searchable query terms", () => {
	const entries: FaqEntry[] = [
		...parseFaqMarkdown(
			"# FAQ\n\n- **What is CYF?**\n\nCYF is CodeYourFuture.\n\n- **Where is CYF?**\n\nCYF operates in several regions.",
			"Trainee FAQ.md",
		),
	];
	const cyfResults = searchFaqEntries(entries, "What's CYF?", 5);
	const fullNameResults = searchFaqEntries(entries, "What is CodeYourFuture?", 5);
	const whereResults = searchFaqEntries(entries, "Where CYF?", 5);

	assert.ok(cyfResults.length > 0);
	assert.ok(fullNameResults.length > 0);
	assert.ok(whereResults.length > 0);
	assert.equal(cyfResults[0]?.question, "What is CYF?");
	assert.equal(fullNameResults[0]?.question, "What is CYF?");
	assert.equal(whereResults[0]?.question, "Where is CYF?");
});

test("creates multiple realistic query forms including incomplete, informal, typo, and follow-up variants", () => {
	const variants = createQuestionVariants(
		"Can I volunteer remotely?",
		"How do I start?",
	);

	assert.equal(variants.length, 8);
	assert.ok(variants.some((variant) => variant.startsWith("hey,")));
	assert.ok(variants.some((variant) => variant.endsWith("...")));
	assert.ok(variants.some((variant) => variant.includes("could you explain?")));
	assert.ok(variants.some((variant) => variant.includes("help out from home")));
	assert.ok(variants.some((variant) => variant.includes("How do I start?")));
	assert.ok(variants.some((variant) => variant !== "Can I volunteer remotely?"));
});
