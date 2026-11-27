export interface FocusSegment {
  text: string;
  active: boolean;
}

/**
 * Splits a draft into paragraph segments and marks the paragraph containing
 * `caretIndex` as active so Sentence/Paragraph Focus Mode can softly dim
 * surrounding text without mutating the underlying textarea value.
 */
export function splitParagraphFocusSegments(
  text: string,
  caretIndex: number
): FocusSegment[] {
  if (!text) return [];
  const safeCaret = Math.max(0, Math.min(text.length, caretIndex));

  // Split preserving newline separators so exact character offsets align 1:1 with the textarea
  const parts = text.split(/(\n+)/);
  const segments: FocusSegment[] = [];
  let cursor = 0;
  let activeAssigned = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 0) continue;
    const start = cursor;
    const end = cursor + part.length;
    cursor = end;

    const isNewlineOnly = /^\n+$/.test(part);
    const containsCaret =
      !isNewlineOnly && safeCaret >= start && safeCaret <= end;

    if (containsCaret && !activeAssigned) {
      activeAssigned = true;
      segments.push({ text: part, active: true });
    } else {
      segments.push({ text: part, active: false });
    }
  }

  // If caret sat inside blank lines, highlight the nearest non-empty paragraph
  if (!activeAssigned) {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (!/^\n+$/.test(segments[i].text)) {
        segments[i].active = true;
        break;
      }
    }
  }

  return segments;
}

/**
 * Finds the start/end character offsets of `phrase` inside `draft` (case-insensitive fallback).
 */
export function findPhraseRangeInDraft(
  draft: string,
  phrase: string
): { start: number; end: number } | null {
  const needle = phrase.trim();
  if (!draft || !needle) return null;
  const exactIdx = draft.indexOf(needle);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + needle.length };
  }
  const lowerIdx = draft.toLowerCase().indexOf(needle.toLowerCase());
  if (lowerIdx !== -1) {
    return { start: lowerIdx, end: lowerIdx + needle.length };
  }
  return null;
}
