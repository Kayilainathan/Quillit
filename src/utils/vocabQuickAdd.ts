import type { VocabEntry, WritingMode } from '../types';

export const MAX_QUICK_WORD_LENGTH = 160;
export const MAX_QUICK_DEFINITION_LENGTH = 500;

export interface QuickVocabInput {
  word: string;
  definition: string;
  mode: WritingMode;
  todayISO: string;
  existingVocabulary?: VocabEntry[];
}

export interface QuickVocabValidationResult {
  ok: boolean;
  error?: string;
  entry?: VocabEntry;
}

/**
 * Validates and constructs a Firestore-rules-compliant VocabEntry from the
 * Write Studio Quick Add modal ("Word" and "Definition" fields).
 */
export function buildQuickAddVocabEntry({
  word,
  definition,
  mode,
  todayISO,
  existingVocabulary = [],
}: QuickVocabInput): QuickVocabValidationResult {
  const trimmedWord = word.trim().replace(/\s+/g, ' ');
  const trimmedDefinition = definition.trim().replace(/\s+/g, ' ');

  if (!trimmedWord) {
    return { ok: false, error: 'Enter a word or phrase to save.' };
  }
  if (trimmedWord.length > MAX_QUICK_WORD_LENGTH) {
    return {
      ok: false,
      error: `Keep the word under ${MAX_QUICK_WORD_LENGTH} characters.`,
    };
  }
  if (!trimmedDefinition) {
    return { ok: false, error: 'Enter a short definition or usage note.' };
  }
  if (trimmedDefinition.length > MAX_QUICK_DEFINITION_LENGTH) {
    return {
      ok: false,
      error: `Keep the definition under ${MAX_QUICK_DEFINITION_LENGTH} characters.`,
    };
  }

  const normalizedLower = trimmedWord.toLowerCase();
  const duplicate = existingVocabulary.find(
    (item) => item.betterAlternative.trim().toLowerCase() === normalizedLower
  );
  if (duplicate) {
    return {
      ok: false,
      error: `"${trimmedWord}" is already in your vocabulary library.`,
    };
  }

  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(todayISO)
    ? todayISO
    : new Date().toISOString().slice(0, 10);

  const entry: VocabEntry = {
    id: `vocab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    used: trimmedWord,
    betterAlternative: trimmedWord,
    explanation: trimmedDefinition,
    contextSnippet: '',
    mode,
    dateAdded: safeDate,
    mastered: false,
  };

  return { ok: true, entry };
}
