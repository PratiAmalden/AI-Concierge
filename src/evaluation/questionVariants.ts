/** Creates informal, partial, typo, and follow-up-style test questions. */
export function createQuestionVariants(question: string, companionQuestion?: string): string[] {
	const clean = question.replace(/[?.!]+$/, "").trim();
	const words = clean.split(/\s+/);
	const partial = words.slice(0, Math.max(3, Math.ceil(words.length * 0.65))).join(" ");
	const synonyms: readonly (readonly [RegExp, string])[] = [
		[/\bvolunteer remotely\b/i, "help out from home"],
		[/\bright to work\b/i, "work authorization"],
		[/\beligible\b/i, "qualified"],
		[/\bjoin\b/i, "apply for"],
		[/\bcourses?\b/i, "programme"],
		[/\bjobs?\b/i, "work"],
		[/\bwithdraw\b/i, "leave"],
		[/\bhelp\b/i, "support"],
	];
	const synonym = synonyms.find(([pattern]) => pattern.test(question));
	const match = /\b[a-z]{5,}\b/i.exec(clean);
	const typo = match === null
		? `${clean} pls`
		: `${clean.slice(0, match.index)}${transposeMiddle(match[0])}${clean.slice(match.index + match[0].length)}`;

	return [
		question,
		synonym === undefined
			? `What's the process for ${clean.toLowerCase()}?`
			: question.replace(synonym[0], synonym[1]),
		`Quick question, ${clean.toLowerCase()}?`,
		`hey, ${clean.toLowerCase()}?`,
		`${partial}...`,
		`I'm asking about ${clean.toLowerCase()}; what should I do next?`,
		typo,
		...(companionQuestion === undefined ? [] : [`${question} Also, ${companionQuestion}`]),
	];
}

function transposeMiddle(word: string): string {
	const index = Math.floor(word.length / 2);
	return `${word.slice(0, index)}${word[index + 1] ?? ""}${word[index] ?? ""}${word.slice(index + 2)}`;
}
