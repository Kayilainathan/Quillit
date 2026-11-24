/**
 * Single-Constraint Micro-Challenges (18 curated rules across Anti-Filler, Rhythm, Precision, Clarity)
 * with deterministic real-time violation detection (0 API tokens).
 */

export type ConstraintCategory =
  | 'Anti-Filler'
  | 'Rhythm'
  | 'Precision'
  | 'Clarity';

export interface ConstraintChallenge {
  id: string;
  category: ConstraintCategory;
  shortLabel: string;
  rule: string;
  check: (text: string) => {
    passed: boolean;
    violationCount: number;
    details: string;
  };
}

function getSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[a-zA-Z0-9]/.test(s));
}

function sentenceWordCount(sentence: string): number {
  return (sentence.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
}

function makeWordBanChecker(
  bannedRegex: RegExp,
  label: string
): ConstraintChallenge['check'] {
  return (text: string) => {
    if (!text.trim()) {
      return { passed: true, violationCount: 0, details: `Zero ${label} used.` };
    }
    const matches = text.match(bannedRegex) ?? [];
    if (matches.length === 0) {
      return { passed: true, violationCount: 0, details: `Clean — 0 ${label}.` };
    }
    const sample = Array.from(new Set(matches.map((m) => m.toLowerCase()))).slice(0, 3);
    return {
      passed: false,
      violationCount: matches.length,
      details: `${matches.length} hit${matches.length === 1 ? '' : 's'}: ${sample.join(', ')}`,
    };
  };
}

export const CONSTRAINT_CHALLENGES: readonly ConstraintChallenge[] = [
  // ANTI-FILLER (5)
  {
    id: 'ban-very-really-actually',
    category: 'Anti-Filler',
    shortLabel: 'Zero "very / really / actually"',
    rule: 'Ban "very", "really", "actually", and "basically" — let strong verbs carry the weight.',
    check: makeWordBanChecker(
      /\b(very|really|actually|basically)\b/gi,
      'filler adverbs'
    ),
  },
  {
    id: 'ban-just-simply-literally',
    category: 'Anti-Filler',
    shortLabel: 'Zero "just / simply / literally"',
    rule: 'Cut hedging crutches ("just", "simply", "literally", "honestly").',
    check: makeWordBanChecker(
      /\b(just|simply|literally|honestly)\b/gi,
      'hedge words'
    ),
  },
  {
    id: 'ban-things-stuff',
    category: 'Anti-Filler',
    shortLabel: 'Zero "thing / things / stuff"',
    rule: 'Name concrete nouns — never hide behind "thing", "things", or "stuff".',
    check: makeWordBanChecker(/\b(thing|things|stuff)\b/gi, 'vague nouns'),
  },
  {
    id: 'ban-corporate-slop',
    category: 'Anti-Filler',
    shortLabel: 'Zero Corporate Slop',
    rule: 'Ban "utilize", "leverage", "synergy", "delve", "facilitate", "paramount", "myriad".',
    check: makeWordBanChecker(
      /\b(utilize|utilizes|utilized|utilizing|leverage|leveraging|synergy|delve|facilitate|paramount|myriad|plethora|tapestry)\b/gi,
      'corporate buzzwords'
    ),
  },
  {
    id: 'ban-throat-clearing',
    category: 'Anti-Filler',
    shortLabel: 'No Throat-Clearing Openers',
    rule: 'Never write "in order to", "due to the fact", "it is important to note", or "as we all know".',
    check: makeWordBanChecker(
      /\b(in order to|due to the fact|it is important to note|as we all know|at the end of the day)\b/gi,
      'throat-clearing phrases'
    ),
  },

  // RHYTHM (5)
  {
    id: 'max-18-words-per-sentence',
    category: 'Rhythm',
    shortLabel: 'Max 18 Words / Sentence',
    rule: 'Every sentence must stay at or under 18 words for punchy spoken cadence.',
    check: (text: string) => {
      const sentences = getSentences(text);
      const longOnes = sentences.filter((s) => sentenceWordCount(s) > 18);
      return longOnes.length === 0
        ? { passed: true, violationCount: 0, details: 'All sentences <= 18 words.' }
        : {
            passed: false,
            violationCount: longOnes.length,
            details: `${longOnes.length} sentence${longOnes.length === 1 ? '' : 's'} over 18 words.`,
          };
    },
  },
  {
    id: 'include-5-word-punch',
    category: 'Rhythm',
    shortLabel: 'Include a <= 5-Word Punch',
    rule: 'After 3+ sentences, include at least one crisp impact sentence of 5 words or fewer.',
    check: (text: string) => {
      const sentences = getSentences(text);
      if (sentences.length < 3) {
        return { passed: true, violationCount: 0, details: 'Write 3+ sentences with one <= 5-word beat.' };
      }
      const hasShort = sentences.some((s) => {
        const wc = sentenceWordCount(s);
        return wc >= 2 && wc <= 5;
      });
      return hasShort
        ? { passed: true, violationCount: 0, details: 'Short punch sentence landed.' }
        : { passed: false, violationCount: 1, details: 'Add one 2–5 word punch sentence.' };
    },
  },
  {
    id: 'no-repeated-openers',
    category: 'Rhythm',
    shortLabel: 'No Repeated Sentence Openers',
    rule: 'Never start two consecutive sentences with the exact same first word.',
    check: (text: string) => {
      const sentences = getSentences(text);
      let repeats = 0;
      let prevFirst = '';
      for (const s of sentences) {
        const first = (s.match(/[A-Za-z]+/)?.[0] ?? '').toLowerCase();
        if (first && first === prevFirst) repeats += 1;
        prevFirst = first;
      }
      return repeats === 0
        ? { passed: true, violationCount: 0, details: 'Varied sentence openers.' }
        : {
            passed: false,
            violationCount: repeats,
            details: `${repeats} consecutive repeated opener${repeats === 1 ? '' : 's'}.`,
          };
    },
  },
  {
    id: 'no-run-on-25',
    category: 'Rhythm',
    shortLabel: 'Zero Breathless 25+ Word Lines',
    rule: 'Split every 25+ word run-on into two clean spoken thoughts.',
    check: (text: string) => {
      const sentences = getSentences(text);
      const runOns = sentences.filter((s) => sentenceWordCount(s) >= 25);
      return runOns.length === 0
        ? { passed: true, violationCount: 0, details: 'Zero 25+ word run-ons.' }
        : {
            passed: false,
            violationCount: runOns.length,
            details: `${runOns.length} run-on line${runOns.length === 1 ? '' : 's'} (25+ words).`,
          };
    },
  },
  {
    id: 'ask-one-sharp-question',
    category: 'Rhythm',
    shortLabel: 'Use One Conversational Question',
    rule: 'Include at least one crisp question mark to pull the listener in.',
    check: (text: string) => {
      const sentences = getSentences(text);
      if (sentences.length < 2) {
        return { passed: true, violationCount: 0, details: 'Include 1 sharp question.' };
      }
      const hasQ = text.includes('?');
      return hasQ
        ? { passed: true, violationCount: 0, details: 'Conversational question active.' }
        : { passed: false, violationCount: 1, details: 'Add one engaging question (?).' };
    },
  },

  // PRECISION (4)
  {
    id: 'ban-was-were-passive',
    category: 'Precision',
    shortLabel: 'Zero Passive "was/were + -ed"',
    rule: 'Eliminate passive "was/were/been + verb-ed" constructions; name who did the action.',
    check: makeWordBanChecker(
      /\b(was|were|been|being)\s+[a-z]+(ed|en)\b/gi,
      'passive verbs'
    ),
  },
  {
    id: 'ban-to-be-is-are-was',
    category: 'Precision',
    shortLabel: 'Limit "is / are / was / were"',
    rule: 'Keep weak "to be" verbs (is/are/was/were) to at most 2 in the whole draft.',
    check: (text: string) => {
      const matches = text.match(/\b(is|are|was|were)\b/gi) ?? [];
      if (matches.length <= 2) {
        return {
          passed: true,
          violationCount: 0,
          details: `${matches.length}/2 "to be" verbs used.`,
        };
      }
      return {
        passed: false,
        violationCount: matches.length - 2,
        details: `${matches.length} "to be" verbs (max 2). Swap for active verbs.`,
      };
    },
  },
  {
    id: 'ban-ly-adverbs',
    category: 'Precision',
    shortLabel: 'Max 1 "-ly" Adverb',
    rule: 'Use at most one "-ly" adverb; pick a sharper verb instead of propping up a weak one.',
    check: (text: string) => {
      const matches = (text.match(/\b[a-z]{4,}ly\b/gi) ?? []).filter(
        (w) => !['only', 'early', 'daily', 'family', 'reply', 'apply', 'supply'].includes(w.toLowerCase())
      );
      if (matches.length <= 1) {
        return { passed: true, violationCount: 0, details: `${matches.length}/1 "-ly" adverbs.` };
      }
      return {
        passed: false,
        violationCount: matches.length - 1,
        details: `${matches.length} "-ly" adverbs (${matches.slice(0, 3).join(', ')}).`,
      };
    },
  },
  {
    id: 'anchor-concrete-number',
    category: 'Precision',
    shortLabel: 'Include 1 Concrete Number/Metric',
    rule: 'Ground your claim with at least one real number, measurement, or timeframe.',
    check: (text: string) => {
      if (text.trim().split(/\s+/).filter(Boolean).length < 20) {
        return { passed: true, violationCount: 0, details: 'Include 1 concrete number or metric.' };
      }
      const hasNum = /\b\d+(?:[.,]\d+)?\b|\b(one|two|three|four|five|ten|twenty|fifty|hundred)\b/i.test(
        text
      );
      return hasNum
        ? { passed: true, violationCount: 0, details: 'Concrete number anchored.' }
        : { passed: false, violationCount: 1, details: 'Add at least 1 concrete number or metric.' };
    },
  },

  // CLARITY (4)
  {
    id: 'open-with-verb-or-action',
    category: 'Clarity',
    shortLabel: 'No "I think / In my opinion"',
    rule: 'State claims with conviction — cut "I think", "I believe", "I feel like", and "in my opinion".',
    check: makeWordBanChecker(
      /\b(i think|i believe|i feel like|in my opinion|personally i think)\b/gi,
      'weak qualifiers'
    ),
  },
  {
    id: 'use-natural-contractions',
    category: 'Clarity',
    shortLabel: 'Include Spoken Contractions',
    rule: 'Sound human out loud: include at least 2 natural contractions (don\'t, it\'s, won\'t, we\'re).',
    check: (text: string) => {
      if (text.trim().split(/\s+/).filter(Boolean).length < 25) {
        return { passed: true, violationCount: 0, details: 'Aim for 2+ spoken contractions.' };
      }
      const matches =
        text.match(
          /\b(i'm|don't|doesn't|didn't|won't|can't|it's|that's|we're|you're|isn't|aren't|haven't|hasn't|couldn't|wouldn't|shouldn't|i've|we've|there's)\b/gi
        ) ?? [];
      return matches.length >= 2
        ? { passed: true, violationCount: 0, details: `${matches.length} natural contractions used.` }
        : {
            passed: false,
            violationCount: 2 - matches.length,
            details: `${matches.length}/2 natural contractions used.`,
          };
    },
  },
  {
    id: 'zero-calques',
    category: 'Clarity',
    shortLabel: 'Zero Textbook Calques',
    rule: 'Avoid "revert back", "discuss about", "do the needful", "cope up with", "prepone".',
    check: makeWordBanChecker(
      /\b(revert back|return back|discuss about|explain about|do the needful|cope up with|prepone|do a mistake|passing out from)\b/gi,
      'textbook calques'
    ),
  },
  {
    id: 'direct-first-sentence',
    category: 'Clarity',
    shortLabel: 'Crisp <= 14-Word Opening Line',
    rule: 'Hook the reader immediately: keep your very first sentence to 14 words or fewer.',
    check: (text: string) => {
      const sentences = getSentences(text);
      if (sentences.length === 0) {
        return { passed: true, violationCount: 0, details: 'Keep opening sentence <= 14 words.' };
      }
      const firstCount = sentenceWordCount(sentences[0]);
      return firstCount <= 14
        ? { passed: true, violationCount: 0, details: `Opening hook: ${firstCount}/14 words.` }
        : {
            passed: false,
            violationCount: 1,
            details: `Opening sentence is ${firstCount} words (target <= 14).`,
          };
    },
  },
] as const;

export function getConstraintById(id: string | null | undefined): ConstraintChallenge | null {
  if (!id) return null;
  return CONSTRAINT_CHALLENGES.find((c) => c.id === id) ?? null;
}

export function pickRandomConstraint(excludeId?: string | null): ConstraintChallenge {
  const pool = CONSTRAINT_CHALLENGES.filter((c) => c.id !== excludeId);
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? CONSTRAINT_CHALLENGES[0];
}
