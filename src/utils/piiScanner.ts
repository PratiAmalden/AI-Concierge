export interface RedactionResult {
  readonly text: string;
  readonly redacted: boolean;
  readonly categories: readonly ("email" | "phone" | "name")[];
}

const PII_PATTERNS: ReadonlyArray<{
  readonly category: "email" | "phone" | "name";
  readonly pattern: RegExp;
  readonly replacement: string;
}> = [
  {
  // These patterns cover common contact details and full names after common introductions.
    category: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED EMAIL]",
  },
  {
    category: "phone",
    pattern: /(?<!\w)(?:\+?\d[\d ().-]{6,}\d)(?!\w)/g,
    replacement: "[REDACTED PHONE]",
  },
  {
    category: "name",
    pattern:
      /\b(?:[Mm]y name is|[Ii] am|[Ii]'m|[Tt]his is)\s+([A-Z][a-z'-]{1,})(?:\s+([A-Z][a-z'-]{1,})){1,2}\b/,
    replacement: "[REDACTED NAME]",
  },
];

/** Replaces recognized contact details and introduced full names with placeholders. */
export function redactPii(input: string): RedactionResult {
  let text = input;
  const categories: Array<"email" | "phone" | "name"> = [];

  for (const { category, pattern, replacement } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    const updated = text.replace(pattern, replacement);
    if (updated !== text) {
      categories.push(category);
      text = updated;
    }
  }

  return {
    text,
    redacted: categories.length > 0,
    categories,
  };
}