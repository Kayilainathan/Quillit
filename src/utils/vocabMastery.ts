import type { VocabEntry, WritingSession } from '../types';

export type VocabMasteryTier = 'new' | 'emerging' | 'familiar' | 'mastered';

export const MASTERY_TARGET_USES = 3;

export interface VocabMasterySummary {
  tier: VocabMasteryTier;
  label: 'New' | 'Emerging' | 'Familiar' | 'Mastered';
  correctUses: number;
  filledSegments: 0 | 1 | 2 | 3;
  manualMastered: boolean;
  matchedSessionDates: string[];
  tooltip: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts normalized candidate words or multi-word phrases from a VocabEntry's
 * target `betterAlternative` field (e.g., "stabilize / refine" -> ["stabilize", "refine"]).
 */
export function extractVocabCandidates(entry: VocabEntry): string[] {
  const raw = (entry.betterAlternative || '').trim();
  if (!raw) return [];

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const part of raw.split('/')) {
    const cleaned = part
      .replace(/^["'“”‘’(\[\s]+|["'“”‘’)\]\s.,!?;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (cleaned.length < 3 || seen.has(cleaned)) continue;
    seen.add(cleaned);
    candidates.push(cleaned);
  }

  return candidates;
}

/**
 * Builds a word-boundary matcher that tolerates common English inflections
 * (silent-e, consonant-y, plurals/past/participle) for single words while
 * preventing substring false positives (e.g., "resolve" will not match "unresolved").
 */
export function buildVocabCandidateRegex(candidate: string): RegExp {
  const normalized = candidate.trim().toLowerCase();

  // Multi-word expression: match exact phrase with flexible internal whitespace,
  // allowing simple plural/past inflection on the final word.
  if (normalized.includes(' ')) {
    const words = normalized.split(/\s+/);
    const head = words.slice(0, -1).map(escapeRegExp).join('\\s+');
    const tail = words[words.length - 1];
    const tailPattern = buildSingleWordPattern(tail);
    return new RegExp(`\\b${head}\\s+${tailPattern}\\b`, 'i');
  }

  return new RegExp(`\\b${buildSingleWordPattern(normalized)}\\b`, 'i');
}

function buildSingleWordPattern(word: string): string {
  const escaped = escapeRegExp(word);
  if (word.endsWith('e') && word.length >= 4) {
    const stem = escapeRegExp(word.slice(0, -1));
    return `${stem}(?:e|es|ed|ing)`;
  }
  if (word.endsWith('y') && word.length >= 4 && !/[aeiou]y$/.test(word)) {
    const stem = escapeRegExp(word.slice(0, -1));
    return `(?:${escaped}|${stem}(?:ies|ied)|${escaped}ing)`;
  }
  return `${escaped}(?:s|es|ed|ing)?`;
}

/**
 * Returns true if the session's grammar evaluator explicitly flagged this word/phrase
 * as a misuse and replaced it with something else (so misused occurrences are not
 * counted toward correct mastery).
 */
export function wasCandidateFlaggedAsError(
  candidateRegex: RegExp,
  session: WritingSession
): boolean {
  if (!Array.isArray(session.grammarFixes) || session.grammarFixes.length === 0) {
    return false;
  }

  return session.grammarFixes.some((fix) => {
    const orig = (fix.original || '').trim();
    const corr = (fix.corrected || '').trim();
    if (!orig) return false;
    return candidateRegex.test(orig) && !candidateRegex.test(corr);
  });
}

/**
 * Computes the Mastery Level and verified correct-use count for a single vocabulary
 * entry across all completed writing and live conversation sessions.
 */
export function computeVocabMastery(
  entry: VocabEntry,
  sessions: WritingSession[]
): VocabMasterySummary {
  const candidates = extractVocabCandidates(entry);
  const candidateMatchers = candidates.map((c) => buildVocabCandidateRegex(c));
  const matchedDates: string[] = [];

  if (candidateMatchers.length > 0 && sessions.length > 0) {
    for (const session of sessions) {
      if (session.status !== 'Completed') continue;
      const content = (session.content || '').trim();
      if (!content) continue;

      const usedCorrectly = candidateMatchers.some(
        (regex) => regex.test(content) && !wasCandidateFlaggedAsError(regex, session)
      );

      if (usedCorrectly) {
        matchedDates.push(session.date);
      }
    }
  }

  // Most recent dates first
  matchedDates.sort((a, b) => b.localeCompare(a));

  const correctUses = matchedDates.length;
  const recentSummary =
    matchedDates.length > 0
      ? ` (${matchedDates.slice(0, 3).join(', ')}${matchedDates.length > 3 ? ', ...' : ''})`
      : '';

  if (correctUses >= MASTERY_TARGET_USES) {
    return {
      tier: 'mastered',
      label: 'Mastered',
      correctUses,
      filledSegments: 3,
      manualMastered: false,
      matchedSessionDates: matchedDates,
      tooltip: `Mastery Level: Mastered — Used correctly in ${correctUses} sessions${recentSummary}.`,
    };
  }

  if (correctUses === 2) {
    return {
      tier: 'familiar',
      label: 'Familiar',
      correctUses,
      filledSegments: 2,
      manualMastered: false,
      matchedSessionDates: matchedDates,
      tooltip: `Mastery Level: Familiar — Used correctly in 2 sessions${recentSummary}. Use correctly in 1 more session to reach Mastered.`,
    };
  }

  if (correctUses === 1) {
    return {
      tier: 'emerging',
      label: 'Emerging',
      correctUses,
      filledSegments: 1,
      manualMastered: false,
      matchedSessionDates: matchedDates,
      tooltip: `Mastery Level: Emerging — Used correctly in 1 session${recentSummary}. Use correctly in 2 more sessions to reach Mastered.`,
    };
  }

  if (entry.mastered) {
    return {
      tier: 'mastered',
      label: 'Mastered',
      correctUses: 0,
      filledSegments: 3,
      manualMastered: true,
      matchedSessionDates: [],
      tooltip:
        'Mastery Level: Mastered (marked manually) — 0 verified session uses recorded yet.',
    };
  }

  return {
    tier: 'new',
    label: 'New',
    correctUses: 0,
    filledSegments: 0,
    manualMastered: false,
    matchedSessionDates: [],
    tooltip:
      'Mastery Level: New — Not yet used in a completed session. Use it naturally in 3 sessions to master.',
  };
}

/**
 * Computes mastery summaries for an entire vocabulary bank in one pass.
 */
export function computeVocabularyMasteryMap(
  vocabulary: VocabEntry[],
  sessions: WritingSession[]
): Map<string, VocabMasterySummary> {
  const map = new Map<string, VocabMasterySummary>();
  for (const entry of vocabulary) {
    map.set(entry.id, computeVocabMastery(entry, sessions));
  }
  return map;
}
