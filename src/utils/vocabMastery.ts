import type { GrammarFix, VocabEntry, WritingSession } from '../types';

export type VocabMasteryTier = 'new' | 'emerging' | 'familiar' | 'mastered';

export const MASTERY_TARGET_USES = 3;

export interface VocabMasterySummary {
  tier: VocabMasteryTier;
  label: 'New' | 'Emerging' | 'Familiar' | 'Mastered';
  correctUses: number;
  sessionCount: number;
  filledSegments: 0 | 1 | 2 | 3;
  reachedUsageThreshold: boolean;
  manualMastered: boolean;
  matchedSessionDates: string[];
  tooltip: string;
}

const OPTIONAL_CONNECTORS = new Set([
  'a',
  'an',
  'the',
  'its',
  'their',
  'our',
  'your',
  'my',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts normalized candidate words or multi-word expressions from a VocabEntry's
 * `betterAlternative` field. Handles slash/comma/semicolon/"or" lists and strips
 * parenthetical glosses (e.g., "mitigate (risk) / stabilize" -> ["mitigate", "stabilize"]).
 */
export function extractVocabCandidates(entry: VocabEntry): string[] {
  const raw = (entry.betterAlternative || '').trim();
  if (!raw) return [];

  // Remove parenthetical notes like "(verb)" or "(technical)"
  const withoutParens = raw.replace(/\([^)]*\)/g, ' ');
  const parts = withoutParens.split(/\s*(?:\/|;|,|\bor\b)\s*/i);

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const part of parts) {
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
 * Builds a bidirectional inflection-tolerant regex fragment for a single word.
 * Matches base <-> past (-ed/-ied) <-> gerund (-ing) <-> plural/3rd-person (-s/-es/-ies)
 * regardless of which tense/form is stored in `betterAlternative`.
 */
function buildSingleWordPattern(rawWord: string): string {
  const word = rawWord.trim().toLowerCase();

  // Handle hyphenated words cleanly (e.g. "closed-loop" matches "closed-loop" or "closed loop")
  if (word.includes('-')) {
    const segments = word.split('-').filter(Boolean);
    if (segments.length > 1) {
      return segments.map((seg) => buildSingleWordPattern(seg)).join('[\\s-]+');
    }
  }

  // Keep short words / function words exact to avoid false positives
  if (word.length < 4) {
    return escapeRegExp(word);
  }

  // Consonant + ied / ies (e.g., "quantified", "applies", "clarifies", "stabilizes")
  if (/(?:ied|ies)$/.test(word) && word.length >= 5) {
    const stem = escapeRegExp(word.slice(0, -3));
    return `${stem}(?:y|ies|ied|ying)`;
  }

  // -ing form (e.g., "stabilizing", "running", "calibrating")
  if (word.endsWith('ing') && word.length >= 6) {
    const base = word.slice(0, -3);
    // Doubled trailing consonant like "mapping" -> "map"
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      const shortStem = escapeRegExp(base.slice(0, -1));
      const dbl = escapeRegExp(base[base.length - 1]);
      return `${shortStem}(?:${dbl}(?:ed|ing)|e|es|ed|ing|s)?`;
    }
    const stem = escapeRegExp(base);
    return `${stem}(?:e|es|ed|ing|s|y)?`;
  }

  // -ed form (e.g., "stabilized", "resolved", "pinpointed", "mapped")
  if (word.endsWith('ed') && word.length >= 5) {
    const base = word.slice(0, -2);
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      const shortStem = escapeRegExp(base.slice(0, -1));
      const dbl = escapeRegExp(base[base.length - 1]);
      return `${shortStem}(?:${dbl}(?:ed|ing)|e|es|ed|ing|s)?`;
    }
    const stem = escapeRegExp(base);
    return `${stem}(?:e|es|ed|ing|s)?`;
  }

  // -es form (e.g., "compensates", "operates", "reaches", "fixes")
  if (word.endsWith('es') && word.length >= 5) {
    if (/(?:ses|xes|zes|ches|shes)$/.test(word)) {
      const stem = escapeRegExp(word.slice(0, -2));
      return `${stem}(?:s|es|ed|ing)?`;
    }
    // Silent-e verb with -s (e.g. "compensates" -> "compensat" + e|es|ed|ing)
    const stem = escapeRegExp(word.slice(0, -2));
    return `${stem}(?:e|es|ed|ing)`;
  }

  // Trailing -s (excluding -ss, -us, -is like "focus", "basis", "address")
  if (word.endsWith('s') && !/(?:ss|us|is)$/.test(word) && word.length >= 5) {
    const stem = escapeRegExp(word.slice(0, -1));
    return `${stem}(?:s|es|ed|ing)?`;
  }

  // Silent-e base word (e.g., "stabilize", "resolve", "calibrate")
  if (word.endsWith('e') && !word.endsWith('ee') && word.length >= 4) {
    const stem = escapeRegExp(word.slice(0, -1));
    return `${stem}(?:e|es|ed|ing)`;
  }

  // Consonant + y base word (e.g., "clarify", "quantify", "apply")
  if (word.endsWith('y') && !/[aeiou]y$/.test(word) && word.length >= 4) {
    const escaped = escapeRegExp(word);
    const stem = escapeRegExp(word.slice(0, -1));
    return `(?:${escaped}|${stem}(?:ies|ied)|${escaped}ing)`;
  }

  const escaped = escapeRegExp(word);
  return `${escaped}(?:s|es|ed|ing)?`;
}

/**
 * Builds a word-boundary matcher for either a single word or a multi-word expression.
 * For multi-word phrases, inflects EVERY content word and allows optional articles
 * ("a", "an", "the", "our", "its") to vary naturally.
 */
export function buildVocabCandidateRegex(candidate: string, flags = 'i'): RegExp {
  const normalized = candidate.trim().toLowerCase();

  if (normalized.includes(' ')) {
    const words = normalized.split(/\s+/).filter(Boolean);
    const parts: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const token = words[i];
      const isMiddleConnector =
        i > 0 && i < words.length - 1 && OPTIONAL_CONNECTORS.has(token);
      if (isMiddleConnector) {
        parts.push(`(?:\\s+(?:a|an|the|its|their|our|your|my))?`);
      } else {
        const prefix = parts.length > 0 ? '\\s+' : '';
        parts.push(`${prefix}${buildSingleWordPattern(token)}`);
      }
    }

    return new RegExp(`\\b${parts.join('')}\\b`, flags);
  }

  return new RegExp(`\\b${buildSingleWordPattern(normalized)}\\b`, flags);
}

/**
 * Counts how many occurrences of a candidate phrase were explicitly flagged and
 * replaced away as a misuse in `grammarFixes`.
 */
export function countFlaggedMisuses(
  candidateRegex: RegExp,
  grammarFixes?: GrammarFix[]
): number {
  if (!Array.isArray(grammarFixes) || grammarFixes.length === 0) {
    return 0;
  }

  const testRegex = new RegExp(candidateRegex.source, 'i');
  let misuses = 0;
  for (const fix of grammarFixes) {
    const orig = (fix.original || '').trim();
    const corr = (fix.corrected || '').trim();
    if (!orig) continue;
    if (testRegex.test(orig) && !testRegex.test(corr)) {
      misuses += 1;
    }
  }
  return misuses;
}

/**
 * Backwards-compatible boolean check for whether a candidate was flagged as misused in a session.
 */
export function wasCandidateFlaggedAsError(
  candidateRegex: RegExp,
  session: WritingSession
): boolean {
  return countFlaggedMisuses(candidateRegex, session.grammarFixes) > 0;
}

/**
 * Counts verified correct occurrences of a VocabEntry inside a single text body
 * (deduplicating overlapping candidate spans and subtracting any grammar-flagged misuses).
 */
export function countCorrectUsesInText(
  entry: VocabEntry,
  text: string,
  grammarFixes?: GrammarFix[]
): number {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;

  const candidates = extractVocabCandidates(entry);
  if (candidates.length === 0) return 0;

  const matchedSpans: Array<[number, number]> = [];
  let flaggedMisuses = 0;

  for (const candidate of candidates) {
    const globalRegex = buildVocabCandidateRegex(candidate, 'gi');
    const localMisuses = countFlaggedMisuses(globalRegex, grammarFixes);
    flaggedMisuses += localMisuses;

    for (const match of trimmed.matchAll(globalRegex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const overlapsExisting = matchedSpans.some(
        ([s, e]) => start < e && end > s
      );
      if (!overlapsExisting) {
        matchedSpans.push([start, end]);
      }
    }
  }

  return Math.max(0, matchedSpans.length - flaggedMisuses);
}

/**
 * Computes the Mastery Level and verified correct-use count for a single vocabulary
 * entry across all completed writing and live conversation sessions.
 */
export function computeVocabMastery(
  entry: VocabEntry,
  sessions: WritingSession[]
): VocabMasterySummary {
  const matchedDates: string[] = [];
  let totalVerifiedUses = 0;

  if (sessions.length > 0) {
    for (const session of sessions) {
      if (session.status === 'Draft') continue;
      const content = (session.content || '').trim();
      if (!content) continue;

      const usesInSession = countCorrectUsesInText(
        entry,
        content,
        session.grammarFixes
      );

      if (usesInSession > 0) {
        totalVerifiedUses += usesInSession;
        matchedDates.push(session.date);
      }
    }
  }

  // Most recent dates first
  matchedDates.sort((a, b) => b.localeCompare(a));

  const persistedFloor =
    typeof entry.correctUseCount === 'number' && Number.isFinite(entry.correctUseCount)
      ? Math.max(0, Math.floor(entry.correctUseCount))
      : 0;

  const correctUses = Math.max(totalVerifiedUses, persistedFloor);
  const sessionCount = matchedDates.length;
  const recentSummary =
    matchedDates.length > 0
      ? ` (${matchedDates.slice(0, 3).join(', ')}${matchedDates.length > 3 ? ', ...' : ''})`
      : '';

  if (correctUses >= MASTERY_TARGET_USES) {
    return {
      tier: 'mastered',
      label: 'Mastered',
      correctUses,
      sessionCount,
      filledSegments: 3,
      reachedUsageThreshold: true,
      manualMastered: false,
      matchedSessionDates: matchedDates,
      tooltip: `Mastery Level: Mastered — Used correctly ${correctUses} times${
        sessionCount > 0
          ? ` across ${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}${recentSummary}`
          : ''
      }.`,
    };
  }

  if (correctUses === 2) {
    return {
      tier: 'familiar',
      label: 'Familiar',
      correctUses,
      sessionCount,
      filledSegments: 2,
      reachedUsageThreshold: false,
      manualMastered: false,
      matchedSessionDates: matchedDates,
      tooltip: `Mastery Level: Familiar — Used correctly 2 times${recentSummary}. 1 more correct use to reach Mastered.`,
    };
  }

  if (correctUses === 1) {
    return {
      tier: 'emerging',
      label: 'Emerging',
      correctUses,
      sessionCount,
      filledSegments: 1,
      reachedUsageThreshold: false,
      manualMastered: false,
      matchedSessionDates: matchedDates,
      tooltip: `Mastery Level: Emerging — Used correctly 1 time${recentSummary}. 2 more correct uses to reach Mastered.`,
    };
  }

  if (entry.mastered) {
    return {
      tier: 'mastered',
      label: 'Mastered',
      correctUses: 0,
      sessionCount: 0,
      filledSegments: 3,
      reachedUsageThreshold: false,
      manualMastered: true,
      matchedSessionDates: [],
      tooltip:
        'Mastery Level: Mastered (marked manually) — Use it in Write or Converse sessions to log verified uses.',
    };
  }

  return {
    tier: 'new',
    label: 'New',
    correctUses: 0,
    sessionCount: 0,
    filledSegments: 0,
    reachedUsageThreshold: false,
    manualMastered: false,
    matchedSessionDates: [],
    tooltip:
      'Mastery Level: New — Not yet used in a completed session. Use it correctly 3 times across writing or live chat sessions to master.',
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
