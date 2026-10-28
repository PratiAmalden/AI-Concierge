export type FaqSource = "Trainee FAQ.md" | "Volunteer FAQ.md";

export interface FaqEntry {
	readonly source: FaqSource;
	readonly section: string;
	readonly question: string;
	readonly answer: string;
}

const MAX_PASSAGE_CHARS = 3200;
interface ScoredFaqEntry {
	readonly entry: FaqEntry;
	readonly score: number;
}

const STOP_WORDS = new Set([
	"a", "about", "am", "an", "and", "are", "as", "at", "be", "can", "could",
	"do", "does", "for", "from", "get", "how", "i", "if", "in", "is", "it",
	"me", "my", "of", "on", "or", "the", "to", "what", "when", "where", "who",
	"why", "with", "would", "you", "your",
]);

const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
	apply: ["join", "signup", "register"],
	application: ["apply", "sign", "signup", "register"],
	course: ["programme", "program", "training"],
	cost: ["free", "price", "fee"],
	help: ["support", "assist"],
	join: ["apply", "signup", "register"],
	leave: ["withdraw", "defer", "stop"],
	location: ["region", "city", "area"],
	remote: ["online", "virtual", "home"],
	salary: ["pay", "earn", "wage"],
	sign: ["apply", "join", "signup", "register"],
	signup: ["apply", "join", "register"],
	time: ["hours", "commitment"],
	volunteer: ["volunteering", "volunteers"],
};

/** Extracts FAQ question-and-answer passages while retaining their section context. */
export function parseFaqMarkdown(markdown: string, source: FaqSource): FaqEntry[] {
	const entries: FaqEntry[] = [];
	const headings: string[] = [];
	let activeQuestion: string | undefined;
	let activeSection = "";
	let activeQuestionSection = "";
	let answerLines: string[] = [];

	const saveEntry = (): void => {
		if (activeQuestion === undefined) return;
		const answer = answerLines.join("\n").trim();
		for (const answerChunk of splitAnswerIntoChunks(answer)) {
			entries.push({
				source,
				section: activeQuestionSection,
				question: activeQuestion,
				answer: answerChunk,
			});
		}
	};

	for (const line of markdown.split(/\r?\n/)) {
		const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
		if (heading !== null) {
			if (activeQuestion !== undefined) answerLines.push(line);
			const level = heading[1]?.length ?? 1;
			const text = stripMarkdown(heading[2] ?? "");
			headings.length = level - 1;
			headings.push(text);
			activeSection = headings.join(" / ");
			continue;
		}

		const question = /^\s*-\s+\*\*(.+?)\*\*\s*$/.exec(line);
		const questionText = question === null ? undefined : stripMarkdown(question[1] ?? "");
		if (questionText !== undefined && isFaqQuestion(questionText)) {
			saveEntry();
			activeQuestion = questionText;
			activeQuestionSection = activeSection;
			answerLines = [];
			continue;
		}

		if (activeQuestion !== undefined) answerLines.push(line);
	}

	saveEntry();
	return entries;
}

/** Ranks FAQ entries using lexical matching over headings, questions, and answer text. */
export function searchFaqEntries(entries: readonly FaqEntry[], query: string, limit = 5): readonly FaqEntry[] {
	const queries = splitQuery(query);
	if (isAmbiguousParticipationQuery(query)) {
		queries.push("trainee course sign up", "volunteer start");
	}

	const combined = new Map<string, ScoredFaqEntry>();
	for (const searchQuery of queries) {
		for (const [rank, result] of rankFaqEntries(entries, searchQuery, limit).entries()) {
			const key = `${result.entry.source}\n${result.entry.question}\n${result.entry.answer}`;
			const previous = combined.get(key);
			combined.set(key, { entry: result.entry, score: (previous?.score ?? 0) + 1 / (50 + rank + 1) });
		}
	}
	return [...combined.values()]
		.sort((first, second) => second.score - first.score)
		.slice(0, Math.max(1, limit))
		.map(({ entry }) => entry);
}

function rankFaqEntries(entries: readonly FaqEntry[], query: string, limit: number): readonly ScoredFaqEntry[] {
	const terms = expandQueryTerms(tokenize(query));
	if (terms.size === 0) return [];

	const normalizedQuery = normalizeText(query);
	const documents = entries.map((entry) => ({
		entry,
		title: new Set(tokenize(`${entry.section} ${entry.question}`)),
		answer: new Set(tokenize(entry.answer)),
	}));
	const inverseFrequency = new Map([...terms.keys()].map((term) => [
		term,
		Math.log(1 + entries.length / (1 + documents.filter(({ title, answer }) => (
			title.has(term) || answer.has(term)
		)).length)),
	]));

	return documents.map(({ entry, title, answer }) => {
		let score = 0;
		for (const [term, weight] of terms) {
			const fieldWeight = title.has(term) ? 3 : answer.has(term) ? 1 : 0;
			score += weight * (inverseFrequency.get(term) ?? 0) * fieldWeight;
		}
		if (normalizedQuery.length > 4 && normalizeText(entry.question).includes(normalizedQuery)) {
			score += 4;
		}
		return { entry, score };
	})
		.filter((item) => item.score > 0)
		.sort((first, second) => second.score - first.score)
		.slice(0, Math.max(1, limit));
}

function splitQuery(query: string): string[] {
	const clauses = query.split(/\b(?:and|also|plus)\b|[,;]|\?/i)
		.map((part) => part.trim())
		.filter((part) => tokenize(part).length > 0);
	return clauses.length > 1 ? clauses : [query];
}

function isAmbiguousParticipationQuery(query: string): boolean {
	const normalized = normalizeText(query);
	return /\b(join|joining|sign up|signup|be part|get started)\b/.test(normalized)
		&& !/\b(trainee|student|volunteer|course|class|programme|program)\b/.test(normalized);
}

function tokenize(text: string): string[] {
	return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
		.map(normalizeToken)
		.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function expandQueryTerms(tokens: readonly string[]): Map<string, number> {
	const expanded = new Map(tokens.map((token) => [normalizeToken(token), 1]));
	for (const token of tokens) {
		for (const synonym of SYNONYMS[token] ?? []) {
			const normalized = normalizeToken(synonym);
			if (!expanded.has(normalized)) expanded.set(normalized, 0.35);
		}
	}
	return expanded;
}

function normalizeToken(token: string): string {
	if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
	if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
	if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
	if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
	return token;
}

function normalizeText(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function splitAnswerIntoChunks(answer: string): string[] {
	if (answer.length <= MAX_PASSAGE_CHARS) return [answer];
	const chunks: string[] = [];
	let current = "";
	const append = (segment: string): void => {
		const candidate = current.length === 0 ? segment : `${current}\n${segment}`;
		if (candidate.length > MAX_PASSAGE_CHARS && current.length > 0) {
			chunks.push(current);
			current = segment;
		} else {
			current = candidate;
		}
	};

	for (const line of answer.split("\n")) {
		if (line.length <= MAX_PASSAGE_CHARS) {
			append(line);
			continue;
		}
		let segment = "";
		for (const word of line.split(/(\s+)/)) {
			if (segment.length > 0 && segment.length + word.length > MAX_PASSAGE_CHARS) {
				append(segment);
				segment = word;
			} else {
				segment += word;
			}
		}
		if (segment.length > 0) append(segment);
	}
	if (current.length > 0 || chunks.length === 0) chunks.push(current);
	return chunks;
}

function stripMarkdown(value: string): string {
	return value
		.replaceAll(/`([^`]+)`/g, "$1")
		.replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function isFaqQuestion(value: string): boolean {
	return value.endsWith("?")
		|| /^(i|we|you|what|when|where|who|why|how|can|could|do|does|is|are|will|should|would)\b/i.test(value);
}
