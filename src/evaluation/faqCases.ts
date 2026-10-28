import type { FaqSource } from "../services/faqKnowledge.js";

export type ExpectedAction = "answer" | "clarify" | "abstain";

export interface AnswerCase {
	readonly id: string;
	readonly question: string;
	readonly expectedAction: ExpectedAction;
	readonly expectedFacts: string;
	readonly expectedFaqEntries: readonly {
		readonly source: FaqSource;
		readonly question: string;
	}[];
}

export const answerCases: readonly AnswerCase[] = [
	{
		id: "trainee-work-rights",
		question: "Can I take a CYF course if I don't have the right to work in the UK?",
		expectedAction: "answer",
		expectedFacts: "Having the right to work in the UK is not a requirement to sign up for CYF vocational courses.",
		expectedFaqEntries: [{
			source: "Trainee FAQ.md",
			question: "Do applicants need to have the right to work in the UK?",
		}],
	},
	{
		id: "trainee-multiple-topics",
		question: "Are the courses free, and which regions are they in?",
		expectedAction: "answer",
		expectedFacts: "CYF courses are free. The FAQ lists the regions and links to the regions page.",
		expectedFaqEntries: [
			{ source: "Trainee FAQ.md", question: "Are your courses free?" },
			{ source: "Trainee FAQ.md", question: "Which regions/cities are you located in?" },
		],
	},
	{
		id: "volunteer-commitment",
		question: "How much time do I need to give as a volunteer?",
		expectedAction: "answer",
		expectedFacts: "Volunteers are expected to commit at least 4 hours a week; some roles may have reduced hours or meet every other month.",
		expectedFaqEntries: [{
			source: "Volunteer FAQ.md",
			question: "I can only volunteer for a few hours. What’s the minimum expected commitment?",
		}],
	},
	{
		id: "volunteer-remote-roles",
		question: "I have about 3 years' experience and can only help remotely. What roles might fit?",
		expectedAction: "answer",
		expectedFacts: "The volunteer FAQ describes roles for people with 2-5 years' experience and identifies some roles that can be done remotely; do not promise every role is remote.",
		expectedFaqEntries: [
			{ source: "Volunteer FAQ.md", question: "How can I help as a volunteer?" },
			{ source: "Volunteer FAQ.md", question: "I can only volunteer remotely." },
		],
	},
	{
		id: "trainee-next-course",
		question: "I've finished Intro to Programming. What should I do next?",
		expectedAction: "answer",
		expectedFacts: "The FAQ explains the next step after Intro to Programming, including applying for Checkpoint if continuing.",
		expectedFaqEntries: [{
			source: "Trainee FAQ.md",
			question: "What should I do when I finish Intro to Programming?",
		}],
	},
	{
		id: "trainee-withdrawal",
		question: "I need to stop my course. How do I withdraw or defer?",
		expectedAction: "answer",
		expectedFacts: "The FAQ distinguishes deferring to a later cohort from withdrawing and links to the relevant process/form.",
		expectedFaqEntries: [{
			source: "Trainee FAQ.md",
			question: "I have to withdraw from or defer because I can’t or don’t want to do the course anymore",
		}],
	},
	{
		id: "ambiguous-joining",
		question: "I want to join CYF. What do I need to do?",
		expectedAction: "clarify",
		expectedFacts: "Joining could mean applying as a trainee or joining as a volunteer; ask which the user means before giving role-specific steps.",
		expectedFaqEntries: [
			{ source: "Trainee FAQ.md", question: "I want to sign up for the CYF programme. What should I do?" },
			{ source: "Volunteer FAQ.md", question: "I want to volunteer. Where do I start?" },
		],
	},
	{
		id: "unsupported-salary-promise",
		question: "What salary will I definitely earn after graduating from CYF?",
		expectedAction: "abstain",
		expectedFacts: "The FAQs do not guarantee a job or salary; say this cannot be confirmed and direct the user to an appropriate human or official CYF resource.",
		expectedFaqEntries: [],
	},
];
