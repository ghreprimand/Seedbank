/**
 * Robust extraction of suggestion and rationale from AI responses.
 * Handles fenced JSON, prefixed prose, and malformed JSON.
 */

export interface ParsedSuggestion {
  suggestion: string;
  rationale: string;
}

export function extractSuggestion(text: string): ParsedSuggestion {
  const trimmed = text.trim();
  if (!trimmed) {
    return { suggestion: '', rationale: '' };
  }

  // 1. Attempt to find and extract a JSON block
  // Look for markdown code fences first
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonCandidate = fenceMatch ? fenceMatch[1] : trimmed;

  // Attempt to find the first '{' and last '}' to isolate a potential JSON object
  const firstBrace = jsonCandidate.indexOf('{');
  const lastBrace = jsonCandidate.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = jsonCandidate.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(potentialJson);
      if (parsed && typeof parsed === 'object') {
        const s = typeof parsed.suggestion === 'string' ? parsed.suggestion : undefined;
        const r = typeof parsed.rationale === 'string' ? parsed.rationale : undefined;

        if (s !== undefined || r !== undefined) {
          return {
            suggestion: s ?? '',
            rationale: r ?? '',
          };
        }
      }
    } catch {
      // Fall through to plain text extraction
    }
  }

  // 2. Fallback: treat as plain text
  // If it looks like a JSON object but failed parsing, we still want the text
  // but we should strip fences if they were present.
  const cleanText = fenceMatch ? fenceMatch[1] : trimmed;
  return {
    suggestion: cleanText,
    rationale: '',
  };
}
