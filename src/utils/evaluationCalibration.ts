import type {
  GrammarFix,
  RewrittenSample,
  RubricScores,
  VocabSuggestion,
} from '../types';

export interface DraftIntegrityReport {
  wordCount: number;
  sentenceCount: number;
  uniqueWordRatio: number;
  realWordRatio: number;
  sentenceLengthStdDev: number;
  longestSentenceWords: number;
  longestSentence: string;
  isGibberishOrLowEffort: boolean;
  isUltraShort: boolean;
  reason: string | null;
}

const THESAURUS_SLOP_BANLIST = new Set([
  'utilize',
  'utilizes',
  'utilized',
  'utilizing',
  'delve',
  'delves',
  'delving',
  'tapestry',
  'plethora',
  'myriad',
  'aforementioned',
  'heretofore',
  'endeavor',
  'endeavors',
  'commence',
  'commences',
  'facilitate',
  'synergy',
  'leverage',
  'leveraging',
  'paramount',
]);

const SHORT_VALID_WORDS = new Set([
  'a', 'i', 'an', 'am', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if',
  'in', 'is', 'it', 'me', 'my', 'no', 'of', 'ok', 'on', 'or', 'so', 'to', 'up',
  'us', 'we', 'dc', 'ac', 'rf', 'ic', 'io', 'ui', 'ux', 'ai', 'ml', 'os', 'id',
  'hz', 'kv', 'mv', 'ma', 'db', 'op', 'vs', 'tx', 'rx', 'spi', 'i2c', 'adc',
  'dac', 'pwm', 'pid', 'pcb', 'mcu', 'cpu', 'led', 'rtd', 'ecg', 'eie', 'api',
]);

const TOPIC_STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'about', 'into',
  'what', 'when', 'where', 'which', 'while', 'over', 'under', 'after', 'before',
  'how', 'why', 'you', 'out', 'loud', 'plain', 'english', 'explain', 'write',
  'draft', 'story', 'note', 'email', 'post', 'like', 'just', 'make', 'more',
  'than', 'then', 'they', 'them', 'their', 'there', 'have', 'has', 'had', 'not',
  'but', 'are', 'was', 'were', 'been', 'will', 'would', 'could', 'should',
]);

function looksLikePlausibleWord(rawToken: string): boolean {
  const clean = rawToken.toLowerCase().replace(/^'+|'+$/g, '');
  if (!clean) return false;
  if (/^\d+([.,]\d+)?(%|v|mv|ma|hz|khz|mhz|ms|us|s|w|k|m)?$/i.test(clean)) {
    return true;
  }
  if (SHORT_VALID_WORDS.has(clean)) return true;
  if (clean.length === 1) return false;
  // Reject 3+ identical consecutive characters like "aaaa" or "zzzz"
  if (/(.)\1\1/.test(clean)) return false;
  // Reject long consonant-only runs (>= 5 consonants in a row, e.g. "asdfgh", "qwrtyp")
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(clean)) return false;
  // Reject very long vowel-less words (unless known tech acronym <= 4 chars)
  if (!/[aeiouy]/.test(clean)) {
    return clean.length <= 4 && rawToken === rawToken.toUpperCase();
  }
  // Reject keyboard row mash sequences
  if (/(asdf|qwer|zxcv|hjkl|uiop|fghj|dfgh|jkl;|lkjh|poiu)/i.test(clean)) {
    return false;
  }
  return clean.length <= 28;
}

/**
 * Inspects a draft's structural and lexical integrity so neither the AI coach
 * nor the local fallback hands out inflated grades to gibberish, keyboard mash,
 * or 1-line stubs.
 */
export function assessDraftIntegrity(content: string): DraftIntegrityReport {
  const trimmed = content.trim();
  const rawTokens = trimmed.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  const wordCount = rawTokens.length;

  const sentences = trimmed
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z0-9]/.test(s));
  const sentenceCount = Math.max(1, sentences.length);

  const sentenceLengths = sentences.map(
    (s) => (s.match(/[A-Za-z0-9']+/g) ?? []).length
  );
  const meanLen =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : wordCount;
  const variance =
    sentenceLengths.length > 1
      ? sentenceLengths.reduce((sum, len) => sum + (len - meanLen) ** 2, 0) /
        sentenceLengths.length
      : 0;
  const sentenceLengthStdDev = Number(Math.sqrt(variance).toFixed(2));

  let longestSentence = '';
  let longestSentenceWords = 0;
  sentences.forEach((s, idx) => {
    const len = sentenceLengths[idx] ?? 0;
    if (len > longestSentenceWords) {
      longestSentenceWords = len;
      longestSentence = s;
    }
  });

  const plausibleCount = rawTokens.filter(looksLikePlausibleWord).length;
  const realWordRatio =
    wordCount > 0 ? Number((plausibleCount / wordCount).toFixed(3)) : 0;

  const lowerTokens = rawTokens.map((t) => t.toLowerCase());
  const uniqueWordRatio =
    wordCount > 0
      ? Number((new Set(lowerTokens).size / wordCount).toFixed(3))
      : 0;

  // Detect severe word repetition spam ("test test test test test...")
  const freqMap = new Map<string, number>();
  for (const t of lowerTokens) {
    freqMap.set(t, (freqMap.get(t) ?? 0) + 1);
  }
  const maxSingleWordShare =
    wordCount > 0
      ? Math.max(...Array.from(freqMap.values())) / wordCount
      : 1;

  let isGibberishOrLowEffort = false;
  let reason: string | null = null;

  if (wordCount < 5) {
    isGibberishOrLowEffort = true;
    reason =
      'Draft is too brief to evaluate coherent English expression (fewer than 5 words).';
  } else if (realWordRatio < 0.58) {
    isGibberishOrLowEffort = true;
    reason =
      'Draft contains mostly unrecognizable or random-keystroke text rather than coherent sentences.';
  } else if (wordCount >= 8 && uniqueWordRatio < 0.28 && maxSingleWordShare > 0.35) {
    isGibberishOrLowEffort = true;
    reason =
      'Draft repeats the same words instead of developing an actual thought.';
  }

  return {
    wordCount,
    sentenceCount,
    uniqueWordRatio,
    realWordRatio,
    sentenceLengthStdDev,
    longestSentenceWords,
    longestSentence,
    isGibberishOrLowEffort,
    isUltraShort: !isGibberishOrLowEffort && wordCount < 28,
    reason,
  };
}

/**
 * Estimates topical overlap between the prompt topic and the draft (0..1).
 * Returns null when topic is blank or too generic to measure meaningfully.
 */
export function computeTopicOverlap(content: string, topic?: string): number | null {
  if (!topic || topic.trim().length < 4) return null;
  const topicWords = (topic.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(
    (w) => !TOPIC_STOP_WORDS.has(w)
  );
  const uniqueTopicWords = Array.from(new Set(topicWords));
  if (uniqueTopicWords.length < 2) return null;

  const contentLower = content.toLowerCase();
  let matched = 0;
  for (const w of uniqueTopicWords) {
    const stem = w.length >= 5 ? w.slice(0, w.length - 1) : w;
    if (contentLower.includes(stem)) {
      matched += 1;
    }
  }
  return Number((matched / uniqueTopicWords.length).toFixed(2));
}

export function sanitizeCoachProse(text: string): string {
  return text
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, '-')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Keeps only grammar fixes whose `original` actually exists verbatim inside
 * the writer's draft and meaningfully differs from `corrected`.
 */
export function filterGroundedGrammarFixes(
  content: string,
  fixes: GrammarFix[]
): GrammarFix[] {
  const lowerDraft = content.toLowerCase();
  const seen = new Set<string>();
  const out: GrammarFix[] = [];

  for (const fix of fixes) {
    const orig = String(fix?.original ?? '').trim();
    const corr = String(fix?.corrected ?? '').trim();
    if (!orig || !corr) continue;
    if (orig.toLowerCase() === corr.toLowerCase()) continue;
    if (!lowerDraft.includes(orig.toLowerCase())) continue;

    const key = `${orig.toLowerCase()}->${corr.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      original: orig,
      corrected: corr,
      rule: sanitizeCoachProse(String(fix.rule ?? 'Clarify grammar and flow.')),
      category: sanitizeCoachProse(String(fix.category ?? 'Mechanics')),
    });
    if (out.length >= 6) break;
  }

  return out;
}

/**
 * Keeps only vocabulary upgrades grounded in the writer's actual draft and
 * rejects pompous thesaurus-slop words that ruin natural spoken English.
 */
export function filterGroundedVocabUpgrades(
  content: string,
  upgrades: VocabSuggestion[]
): VocabSuggestion[] {
  const lowerDraft = content.toLowerCase();
  const seen = new Set<string>();
  const out: VocabSuggestion[] = [];

  for (const item of upgrades) {
    const used = String(item?.used ?? '').trim();
    const better = String(item?.betterAlternative ?? '').trim();
    if (!used || !better) continue;
    if (used.toLowerCase() === better.toLowerCase()) continue;
    if (!lowerDraft.includes(used.toLowerCase())) continue;

    const betterTokens = better.toLowerCase().match(/[a-z]+/g) ?? [];
    if (betterTokens.some((tok) => THESAURUS_SLOP_BANLIST.has(tok))) {
      continue;
    }

    const key = `${used.toLowerCase()}->${better.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      used,
      betterAlternative: better,
      explanation: sanitizeCoachProse(
        String(item.explanation ?? 'More precise and natural phrasing.')
      ),
      contextSnippet: item.contextSnippet
        ? sanitizeCoachProse(String(item.contextSnippet))
        : undefined,
    });
    if (out.length >= 4) break;
  }

  return out;
}

export function sanitizeRewrittenSample(
  content: string,
  sample?: RewrittenSample | null
): RewrittenSample | undefined {
  if (!sample) return undefined;
  const original = String(sample.original ?? '').trim();
  const improved = sanitizeCoachProse(String(sample.improved ?? ''));
  const why = sanitizeCoachProse(String(sample.why ?? ''));
  if (!original || !improved || original.toLowerCase() === improved.toLowerCase()) {
    return undefined;
  }
  // Must genuinely reflect text in the draft (at least first 18 chars or full string match)
  const lowerDraft = content.toLowerCase();
  const probe = original.toLowerCase().slice(0, Math.min(original.length, 24));
  if (!lowerDraft.includes(probe)) {
    return undefined;
  }
  return {
    original,
    improved,
    why: why || 'Tighter rhythm and clearer spoken cadence.',
  };
}

function clampInt(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

export function deriveConsistentBenchmarksFromTotal(totalScore: number): {
  cefrLevel: string;
  ieltsBand: number;
  toeflEquivalent: number;
} {
  const pct = Math.max(0, Math.min(100, (totalScore / 60) * 100));

  let cefrLevel = 'B1';
  if (totalScore <= 15) cefrLevel = 'A1';
  else if (totalScore <= 26) cefrLevel = 'A2';
  else if (totalScore <= 35) cefrLevel = 'B1';
  else if (totalScore <= 42) cefrLevel = 'B2';
  else if (totalScore <= 47) cefrLevel = 'B2+';
  else if (totalScore <= 53) cefrLevel = 'C1';
  else cefrLevel = 'C2';

  // Map 0..100% smoothly onto IELTS 4.0..9.0 in 0.5 bands (low gibberish -> 4.0)
  const rawIelts = totalScore <= 18 ? 4.0 : 4.0 + ((pct - 25) / 75) * 5.0;
  const ieltsBand = Math.max(
    4.0,
    Math.min(9.0, Math.round(rawIelts * 2) / 2)
  );

  const toeflEquivalent = clampInt(Math.round((pct / 100) * 30), 8, 30);

  return { cefrLevel, ieltsBand, toeflEquivalent };
}

/**
 * Calibrates raw rubric scores & benchmarks against real draft integrity so
 * gibberish, ultra-short fragments, or contradictory IELTS/CEFR bands can
 * never slip through to the writer.
 */
export function calibrateEvaluationScores(params: {
  content: string;
  scores: RubricScores;
  grammarFixesCount: number;
  rawIeltsBand?: number;
  rawToefl?: number;
}): {
  scores: RubricScores;
  cefrLevel: string;
  ieltsBand: number;
  toeflEquivalent: number;
  integrity: DraftIntegrityReport;
} {
  const integrity = assessDraftIntegrity(params.content);
  let scores: RubricScores = {
    naturalVoiceFlow: clampInt(params.scores.naturalVoiceFlow, 1, 10),
    claritySimplicity: clampInt(params.scores.claritySimplicity, 1, 10),
    grammarMechanics: clampInt(params.scores.grammarMechanics, 1, 10),
    toneEngagement: clampInt(params.scores.toneEngagement, 1, 10),
    sentenceVarietyCadence: clampInt(params.scores.sentenceVarietyCadence, 1, 10),
    concisenessDirectness: clampInt(params.scores.concisenessDirectness, 1, 10),
  };

  if (integrity.isGibberishOrLowEffort) {
    scores = {
      naturalVoiceFlow: Math.min(scores.naturalVoiceFlow, 2),
      claritySimplicity: Math.min(scores.claritySimplicity, 2),
      grammarMechanics: Math.min(scores.grammarMechanics, 2),
      toneEngagement: Math.min(scores.toneEngagement, 2),
      sentenceVarietyCadence: Math.min(scores.sentenceVarietyCadence, 1),
      concisenessDirectness: Math.min(scores.concisenessDirectness, 2),
    };
  } else if (integrity.isUltraShort) {
    // A 10-25 word fragment cannot honestly earn C1/C2 variety or voice mastery
    scores = {
      ...scores,
      naturalVoiceFlow: Math.min(scores.naturalVoiceFlow, 6),
      toneEngagement: Math.min(scores.toneEngagement, 6),
      sentenceVarietyCadence: Math.min(scores.sentenceVarietyCadence, 5),
    };
  }

  // If multiple genuine grammar errors exist in a short/medium draft, cap inflated grammar score
  if (params.grammarFixesCount >= 4 && integrity.wordCount < 160) {
    scores.grammarMechanics = Math.min(scores.grammarMechanics, 6);
  } else if (params.grammarFixesCount >= 2 && integrity.wordCount < 60) {
    scores.grammarMechanics = Math.min(scores.grammarMechanics, 6);
  }

  const totalScore =
    scores.naturalVoiceFlow +
    scores.claritySimplicity +
    scores.grammarMechanics +
    scores.toneEngagement +
    scores.sentenceVarietyCadence +
    scores.concisenessDirectness;

  const consistent = deriveConsistentBenchmarksFromTotal(totalScore);

  // Allow small +/-0.5 IELTS nuance from the model if aligned with total score, otherwise snap
  let ieltsBand = consistent.ieltsBand;
  if (
    !integrity.isGibberishOrLowEffort &&
    typeof params.rawIeltsBand === 'number' &&
    Number.isFinite(params.rawIeltsBand)
  ) {
    const rounded = Math.max(
      4.0,
      Math.min(9.0, Math.round(params.rawIeltsBand * 2) / 2)
    );
    if (Math.abs(rounded - consistent.ieltsBand) <= 0.5) {
      ieltsBand = rounded;
    }
  }

  let toeflEquivalent = consistent.toeflEquivalent;
  if (
    !integrity.isGibberishOrLowEffort &&
    typeof params.rawToefl === 'number' &&
    Number.isFinite(params.rawToefl)
  ) {
    const clamped = clampInt(params.rawToefl, 8, 30);
    if (Math.abs(clamped - consistent.toeflEquivalent) <= 2) {
      toeflEquivalent = clamped;
    }
  }

  return {
    scores,
    cefrLevel: consistent.cefrLevel,
    ieltsBand,
    toeflEquivalent,
    integrity,
  };
}
