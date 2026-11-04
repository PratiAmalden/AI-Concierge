export interface RedactionResult {
  readonly text: string;
  readonly redacted: boolean;
  readonly categories: readonly ("email" | "phone number" | "name" | "financial")[];
}

type PiiCategory = RedactionResult["categories"][number];
export interface RedactionOptions {
  /** Addresses published in trusted FAQ content; never use user-provided text here. */
  readonly allowedEmails?: readonly string[];
}

const PII_PATTERNS: ReadonlyArray<{
  readonly category: PiiCategory;
  readonly pattern: RegExp;
  readonly replacement: string;
}> = [
  {
    category: "name",
    pattern: /\b(?:[Mm]y name is|[Ii] am|[Ii]'m)\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\b/g,
    replacement: "[REDACTED NAME]",
  },
  {
  // These patterns cover common contact details and full names after common introductions.
    category: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED EMAIL]",
  },
  {
    category: "phone number",
    pattern: /(?<!\w)(?:\+?\d[\d ().-]{6,}\d)(?!\w)/g,
    replacement: "[REDACTED PHONE]",
  },
  {
    // Personal income disclosed about a partner or family member.
    // Example: "My wife makes £30k/year".
    category: "financial",
    pattern:
      /\b(?:my|our)\s+(?:wife|husband|partner|spouse|mother|father|parent|child|son|daughter)\s+(?:earns?|makes?|receives?|gets?\s+paid|is\s+paid)\s+(?:about\s+|approximately\s+|around\s+)?[£€$]\s?\d[\d,]*(?:\.\d{1,2})?\s?[km]?(?:\s*(?:\/|per\s+)(?:year|yr|month|mo|annum|yearly|monthly))?/gi,
    replacement: "[REDACTED PERSONAL FINANCIAL DETAIL]",
  },
  {
    // User's own disclosed income.
    // Example: "I earn £25,000 per year".
    category: "financial",
    pattern:
      /\b(?:i|we)\s+(?:earn|make|receive|get\s+paid|am\s+paid|are\s+paid)\s+(?:about\s+|approximately\s+|around\s+)?[£€$]\s?\d[\d,]*(?:\.\d{1,2})?\s?[km]?(?:\s*(?:\/|per\s+)(?:year|yr|month|mo|annum|yearly|monthly))?/gi,
    replacement: "[REDACTED PERSONAL FINANCIAL DETAIL]",
  },
  {
    // Explicitly disclosed personal salary or income.
    // Example: "My annual salary is £30,000".
    category: "financial",
    pattern:
      /\b(?:my|our|household)\s+(?:(?:annual|monthly)\s+)?(?:salary|income|wages|pay)\s+(?:is|of|comes\s+to)\s+[£€$]\s?\d[\d,]*(?:\.\d{1,2})?\s?[km]?(?:\s*(?:\/|per\s+)(?:year|yr|month|mo|annum|yearly|monthly))?/gi,
    replacement: "[REDACTED PERSONAL FINANCIAL DETAIL]",
  },
  {
    // Personal savings, debt or bank balances.
    category: "financial",
    pattern:
      /\b(?:my|our)\s+(?:savings|bank\s+balance|account\s+balance|debt|loan\s+balance|overdraft)\s+(?:is|are|of|totals?)\s+[£€$]\s?\d[\d,]*(?:\.\d{1,2})?\s?[km]?/gi,
    replacement: "[REDACTED PERSONAL FINANCIAL DETAIL]",
  },
];

/**
 * Redacts recognized contact details,
 * and contextual personal financial disclosures.
 *
 * General costs, prices and expense questions are preserved.
 */
export function redactPii(input: string, options: RedactionOptions = {}): RedactionResult {
  let text = input;
  const categories = new Set<PiiCategory>();
  const allowedEmails = new Set(
    (options.allowedEmails ?? []).map((email) => email.toLowerCase()),
  );

  for (const { category, pattern, replacement } of PII_PATTERNS) {
    pattern.lastIndex = 0;

    const updated = text.replace(pattern, (match) => {
      if (category === "email" && allowedEmails.has(match.toLowerCase())) return match;
      categories.add(category);
      return replacement;
    });

    text = updated;
  }

  return {
    text,
    redacted: categories.size > 0,
    categories: [...categories],
  };
}

/** Extracts canonical addresses published in trusted FAQ text, including `name AT domain` forms. */
export function extractApprovedEmails(approvedText: string): readonly string[] {
  const emails = new Set<string>();
  const publishedAddressPattern =
    /\b([A-Z0-9._%+-]+)\s*(?:@|\bAT\b)\s*([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

  for (const match of approvedText.matchAll(publishedAddressPattern)) {
    const [, localPart, domain] = match;
    if (localPart !== undefined && domain !== undefined) {
      emails.add(`${localPart}@${domain}`.toLowerCase());
    }
  }
  return [...emails];
}