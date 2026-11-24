/**
 * Single-Constraint Micro-Challenges (18 curated rules across Anti-Filler, Rhythm, Precision, Clarity)
 * with QuillBot-grade deterministic technical evaluation, exact character violation spans,
 * adherence scoring (0–100%), and mode-aware recommendations (0 API tokens).
 */

import type { WritingMode } from '../types';

export type ConstraintCategory =
  | 'Anti-Filler'
  | 'Rhythm'
  | 'Precision'
  | 'Clarity';

export interface ConstraintViolationMatch {
  /** Exact offending word, phrase, or sentence snippet */
  excerpt: string;
  /** Character start index in the draft (for click-to-highlight in editor) */
  start: number;
  /** Character end index in the draft */
  end: number;
  /** Concrete editorial action hint */
  fixHint: string;
}

export interface ConstraintCheckResult {
  passed: boolean;
  violationCount: number;
  /** 0–100 deterministic adherence score for technical tracking */
  adherenceScore: number;
  details: string;
  /** Exact offending spans for QuillBot-style inline jump & highlight */
  matches: ConstraintViolationMatch[];
}

export interface ConstraintChallenge {
  id: string;
  category: ConstraintCategory;
  shortLabel: string;
  rule: string;
  /** Concise tip shown in the live adherence bar */
  whyItMatters: string;
  /** Modes where this rule delivers the highest impact */
  recommendedModes: readonly WritingMode[];
  check: (text: string) => ConstraintCheckResult;
}

interface SentenceSpan {
  text: string;
  start: number;
  end: number;
  wordCount: number;
}

const ABBREVIATIONS = new Set([
  'dr',
  'mr',
  'mrs',
  'ms',
  'prof',
  'sr',
  'jr',
  'vs',
  'etc',
  'eg',
  'ie',
  'fig',
  'no',
  'st',
  'approx',
  'dept',
  'est',
  'inc',
  'ltd',
  'co',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
]);

// Common predicate adjectives that follow was/were/been/being without being passive voice
const PASSIVE_ADJECTIVE_EXCLUSIONS = new Set([
  'amazed',
  'annoyed',
  'ashamed',
  'balanced',
  'bored',
  'broken',
  'calm',
  'closed',
  'concerned',
  'confused',
  'convinced',
  'crowded',
  'delighted',
  'depressed',
  'determined',
  'disappointed',
  'drunk',
  'embarrassed',
  'engaged',
  'excited',
  'exhausted',
  'experienced',
  'fascinated',
  'focused',
  'frightened',
  'frustrated',
  'golden',
  'green',
  'interested',
  'involved',
  'keen',
  'married',
  'motivated',
  'open',
  'organized',
  'overwhelmed',
  'pleased',
  'prepared',
  'proud',
  'qualified',
  'relaxed',
  'relieved',
  'satisfied',
  'scared',
  'shocked',
  'stressed',
  'surprised',
  'thrilled',
  'tired',
  'united',
  'upset',
  'wooden',
  'worried',
]);

// Irregular past participles missed by simple -(ed|en) regexes
const IRREGULAR_PARTICIPLES = new Set([
  'begun',
  'bent',
  'bitten',
  'blown',
  'bought',
  'brought',
  'built',
  'burnt',
  'caught',
  'chosen',
  'cut',
  'dealt',
  'done',
  'drawn',
  'driven',
  'eaten',
  'fallen',
  'fed',
  'felt',
  'fought',
  'found',
  'flown',
  'forgotten',
  'forgiven',
  'frozen',
  'given',
  'gone',
  'grown',
  'heard',
  'held',
  'hidden',
  'hit',
  'hurt',
  'kept',
  'known',
  'laid',
  'led',
  'left',
  'lent',
  'let',
  'lit',
  'lost',
  'made',
  'meant',
  'met',
  'paid',
  'proven',
  'put',
  'read',
  'ridden',
  'rung',
  'risen',
  'run',
  'said',
  'seen',
  'sent',
  'set',
  'shaken',
  'shot',
  'shown',
  'shut',
  'slept',
  'sold',
  'spent',
  'spoken',
  'spread',
  'stood',
  'stolen',
  'stuck',
  'struck',
  'sworn',
  'taken',
  'taught',
  'thought',
  'thrown',
  'told',
  'torn',
  'understood',
  'woken',
  'won',
  'worn',
  'written',
]);

// Non-adverb words ending in -ly (adjectives, nouns, verbs)
const NON_ADVERB_LY_WORDS = new Set([
  'ally',
  'anomaly',
  'apply',
  'assembly',
  'belly',
  'billy',
  'bodily',
  'bubbly',
  'bully',
  'chilly',
  'comely',
  'comply',
  'costly',
  'curly',
  'daily',
  'deadly',
  'early',
  'earthly',
  'elderly',
  'family',
  'firefly',
  'fly',
  'folly',
  'friendly',
  'ghastly',
  'ghostly',
  'godly',
  'goodly',
  'grizzly',
  'heavenly',
  'hilly',
  'holy',
  'homely',
  'hourly',
  'imply',
  'italy',
  'jelly',
  'jolly',
  'july',
  'kindly',
  'kingly',
  'leisurely',
  'likely',
  'lily',
  'lively',
  'lonely',
  'lovely',
  'lowly',
  'manly',
  'melancholy',
  'monopoly',
  'monthly',
  'multiply',
  'nightly',
  'oily',
  'only',
  'orderly',
  'pebbly',
  'quarterly',
  'rally',
  'rely',
  'reply',
  'saintly',
  'scholarly',
  'shapely',
  'sickly',
  'silly',
  'smelly',
  'sprightly',
  'stately',
  'supply',
  'surly',
  'tally',
  'timely',
  'ugly',
  'unlikely',
  'weekly',
  'wily',
  'worldly',
  'yearly',
]);

export function sentenceWordCount(sentence: string): number {
  return (sentence.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
}

/**
 * Abbreviation- and decimal-aware sentence segmentation preserving exact character offsets.
 * Avoids splitting on `Dr.`, `e.g.`, `i.e.`, `vs.`, `U.S.`, `v3.1`, or `3.14`.
 */
export function getSentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const len = text.length;
  let segStart = 0;

  const pushSegment = (rawEnd: number) => {
    let s = segStart;
    let e = rawEnd;
    while (s < e && /\s/.test(text[s])) s += 1;
    while (e > s && /\s/.test(text[e - 1])) e -= 1;
    if (e > s) {
      const slice = text.slice(s, e);
      if (/[a-zA-Z0-9]/.test(slice)) {
        spans.push({
          text: slice,
          start: s,
          end: e,
          wordCount: sentenceWordCount(slice),
        });
      }
    }
  };

  for (let i = 0; i < len; i += 1) {
    const ch = text[i];

    // Hard line break ends a sentence/thought
    if (ch === '\n') {
      pushSegment(i);
      segStart = i + 1;
      continue;
    }

    if (ch === '.' || ch === '!' || ch === '?') {
      // Skip decimals & version numbers (e.g., 3.14, v3.1)
      if (
        ch === '.' &&
        i > 0 &&
        i + 1 < len &&
        /\d/.test(text[i - 1]) &&
        /\d/.test(text[i + 1])
      ) {
        continue;
      }

      // Skip dotted initialisms like U.S., e.g., i.e., a.m., p.m.
      if (
        ch === '.' &&
        i > 0 &&
        /[A-Za-z]/.test(text[i - 1]) &&
        (i === 1 || !/[A-Za-z]/.test(text[i - 2])) &&
        i + 2 < len &&
        /[A-Za-z]/.test(text[i + 1]) &&
        text[i + 2] === '.'
      ) {
        continue;
      }

      // Check boundary: punctuation followed by quotes/parens then whitespace or EOF
      let endIdx = i + 1;
      while (endIdx < len && /['"”’)\]]/.test(text[endIdx])) {
        endIdx += 1;
      }
      const followedByBreak = endIdx >= len || /\s/.test(text[endIdx]);
      if (!followedByBreak) continue;

      if (ch === '.') {
        // Extract preceding token to check common abbreviations (Dr., Prof., vs., etc.)
        const before = text.slice(segStart, i);
        const lastWordMatch = before.match(/([A-Za-z.]+)$/);
        if (lastWordMatch) {
          const cleaned = lastWordMatch[1].replace(/\./g, '').toLowerCase();
          if (ABBREVIATIONS.has(cleaned)) {
            continue;
          }
          // Single-letter dotted abbreviation at end of e.g. / i.e. / U.S. when next word is lowercase
          if (
            /^[A-Za-z]\.[A-Za-z]$/.test(lastWordMatch[1]) &&
            endIdx < len
          ) {
            const nextNonSpace = text.slice(endIdx).match(/\S/)?.[0] ?? '';
            if (nextNonSpace && /[a-z0-9]/.test(nextNonSpace)) {
              continue;
            }
          }
        }
      }

      pushSegment(endIdx);
      segStart = endIdx;
      i = endIdx - 1;
    }
  }

  if (segStart < len) {
    pushSegment(len);
  }

  return spans;
}

function scoreFromViolations(
  violationCount: number,
  denominator: number,
  penaltyPerHit = 18
): number {
  if (violationCount <= 0) return 100;
  const scaledPenalty =
    denominator > 0
      ? Math.round((violationCount / denominator) * 100)
      : violationCount * penaltyPerHit;
  return Math.max(
    10,
    Math.min(95, 100 - Math.max(violationCount * Math.round(penaltyPerHit * 0.7), Math.round(scaledPenalty * 0.85)))
  );
}

function truncateExcerpt(s: string, maxLen = 48): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}…`;
}

function makeWordBanChecker(
  bannedRegex: RegExp,
  label: string,
  fixHint: string
): ConstraintChallenge['check'] {
  return (text: string) => {
    if (!text.trim()) {
      return {
        passed: true,
        violationCount: 0,
        adherenceScore: 100,
        details: `Zero ${label} used.`,
        matches: [],
      };
    }

    const flags = bannedRegex.flags.includes('g')
      ? bannedRegex.flags
      : `${bannedRegex.flags}g`;
    const scanner = new RegExp(bannedRegex.source, flags);
    const matches: ConstraintViolationMatch[] = [];
    let m: RegExpExecArray | null;
    while ((m = scanner.exec(text)) !== null) {
      matches.push({
        excerpt: m[0],
        start: m.index,
        end: m.index + m[0].length,
        fixHint,
      });
      if (m[0].length === 0) scanner.lastIndex += 1;
    }

    if (matches.length === 0) {
      return {
        passed: true,
        violationCount: 0,
        adherenceScore: 100,
        details: `Clean — 0 ${label}.`,
        matches: [],
      };
    }

    const sample = Array.from(
      new Set(matches.map((item) => item.excerpt.toLowerCase()))
    ).slice(0, 3);
    const totalWords = Math.max(10, sentenceWordCount(text));
    return {
      passed: false,
      violationCount: matches.length,
      adherenceScore: scoreFromViolations(matches.length, Math.max(6, Math.round(totalWords / 8)), 16),
      details: `${matches.length} hit${matches.length === 1 ? '' : 's'}: ${sample.join(', ')}`,
      matches: matches.slice(0, 12),
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
    whyItMatters: 'Eliminates empty intensifiers so your nouns and verbs sound decisive.',
    recommendedModes: ['technical', 'linkedin', 'friend', 'journal'],
    check: makeWordBanChecker(
      /\b(very|really|actually|basically)\b/gi,
      'filler adverbs',
      'Delete or swap for a stronger verb/adjective'
    ),
  },
  {
    id: 'ban-just-simply-literally',
    category: 'Anti-Filler',
    shortLabel: 'Zero "just / simply / literally"',
    rule: 'Cut hedging crutches ("just", "simply", "literally", "honestly").',
    whyItMatters: 'Removes apologetic padding that weakens executive emails and interviews.',
    recommendedModes: ['email', 'technical', 'linkedin'],
    check: makeWordBanChecker(
      /\b(just|simply|literally|honestly)\b/gi,
      'hedge words',
      'Cut this hedge to state your point directly'
    ),
  },
  {
    id: 'ban-things-stuff',
    category: 'Anti-Filler',
    shortLabel: 'Zero "thing / things / stuff"',
    rule: 'Name concrete nouns — never hide behind "thing", "things", or "stuff".',
    whyItMatters: 'Replaces blurry placeholders with crisp, visual nouns.',
    recommendedModes: ['technical', 'creative', 'journal'],
    check: makeWordBanChecker(
      /\b(thing|things|stuff)\b/gi,
      'vague nouns',
      'Name the specific object, risk, or factor'
    ),
  },
  {
    id: 'ban-corporate-slop',
    category: 'Anti-Filler',
    shortLabel: 'Zero Corporate Slop',
    rule: 'Ban "utilize", "leverage", "synergy", "delve", "facilitate", "paramount", "myriad".',
    whyItMatters: 'Keeps your English human, grounded, and immune to AI-sounding buzzwords.',
    recommendedModes: ['linkedin', 'email', 'technical'],
    check: makeWordBanChecker(
      /\b(utilize|utilizes|utilized|utilizing|leverage|leveraging|leveraged|synergy|delve|delving|facilitate|facilitates|facilitating|paramount|myriad|plethora|tapestry)\b/gi,
      'corporate buzzwords',
      'Swap for a plain verb (use, build, guide, key)'
    ),
  },
  {
    id: 'ban-throat-clearing',
    category: 'Anti-Filler',
    shortLabel: 'No Throat-Clearing Openers',
    rule: 'Never write "in order to", "due to the fact", "it is important to note", or "as we all know".',
    whyItMatters: 'Cuts multi-word boilerplate so every clause starts with meaning.',
    recommendedModes: ['email', 'technical', 'linkedin'],
    check: makeWordBanChecker(
      /\b(in order to|due to the fact that|due to the fact|it is important to note that|it is important to note|as we all know|at the end of the day|needless to say)\b/gi,
      'throat-clearing phrases',
      'Trim to "to", "because", or delete the opener'
    ),
  },

  // RHYTHM (5)
  {
    id: 'max-18-words-per-sentence',
    category: 'Rhythm',
    shortLabel: 'Max 18 Words / Sentence',
    rule: 'Every sentence must stay at or under 18 words for punchy spoken cadence.',
    whyItMatters: 'Prevents breathless clauses and makes technical explanations effortless to follow.',
    recommendedModes: ['technical', 'linkedin', 'email'],
    check: (text: string) => {
      const sentences = getSentenceSpans(text);
      const longOnes = sentences.filter((s) => s.wordCount > 18);
      if (longOnes.length === 0) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'All sentences <= 18 words.',
          matches: [],
        };
      }
      return {
        passed: false,
        violationCount: longOnes.length,
        adherenceScore: scoreFromViolations(longOnes.length, Math.max(1, sentences.length), 22),
        details: `${longOnes.length} sentence${longOnes.length === 1 ? '' : 's'} over 18 words.`,
        matches: longOnes.slice(0, 8).map((s) => ({
          excerpt: `${s.wordCount}w: "${truncateExcerpt(s.text, 40)}"`,
          start: s.start,
          end: s.end,
          fixHint: `Split into two thoughts (currently ${s.wordCount} words, max 18)`,
        })),
      };
    },
  },
  {
    id: 'include-5-word-punch',
    category: 'Rhythm',
    shortLabel: 'Include a <= 5-Word Punch',
    rule: 'After 3+ sentences, include at least one crisp impact sentence of 5 words or fewer.',
    whyItMatters: 'Creates rhythmic contrast that makes key takeaways memorable.',
    recommendedModes: ['linkedin', 'creative', 'journal'],
    check: (text: string) => {
      const sentences = getSentenceSpans(text);
      if (sentences.length < 3) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'Write 3+ sentences with one <= 5-word beat.',
          matches: [],
        };
      }
      const hasShort = sentences.some((s) => s.wordCount >= 2 && s.wordCount <= 5);
      return hasShort
        ? {
            passed: true,
            violationCount: 0,
            adherenceScore: 100,
            details: 'Short punch sentence landed.',
            matches: [],
          }
        : {
            passed: false,
            violationCount: 1,
            adherenceScore: 68,
            details: 'Add one 2–5 word punch sentence.',
            matches: sentences.length
              ? [
                  {
                    excerpt: truncateExcerpt(sentences[sentences.length - 1].text, 42),
                    start: sentences[sentences.length - 1].start,
                    end: sentences[sentences.length - 1].end,
                    fixHint: 'Follow with or tighten a line into a 2–5 word punch',
                  },
                ]
              : [],
          };
    },
  },
  {
    id: 'no-repeated-openers',
    category: 'Rhythm',
    shortLabel: 'No Repeated Sentence Openers',
    rule: 'Never start two consecutive sentences with the exact same first word.',
    whyItMatters: 'Breaks robotic "I... I... I..." or "The... The..." sentence monotony.',
    recommendedModes: ['journal', 'creative', 'linkedin'],
    check: (text: string) => {
      const sentences = getSentenceSpans(text);
      const matches: ConstraintViolationMatch[] = [];
      let prevFirst = '';
      for (const s of sentences) {
        const firstMatch = s.text.match(/[A-Za-z]+/);
        const first = (firstMatch?.[0] ?? '').toLowerCase();
        if (first && first === prevFirst && firstMatch) {
          const wordStart = s.start + (firstMatch.index ?? 0);
          matches.push({
            excerpt: `Repeated "${firstMatch[0]}..."`,
            start: wordStart,
            end: wordStart + firstMatch[0].length,
            fixHint: `Vary this opener instead of repeating "${firstMatch[0]}"`,
          });
        }
        prevFirst = first;
      }
      return matches.length === 0
        ? {
            passed: true,
            violationCount: 0,
            adherenceScore: 100,
            details: 'Varied sentence openers.',
            matches: [],
          }
        : {
            passed: false,
            violationCount: matches.length,
            adherenceScore: scoreFromViolations(matches.length, Math.max(2, sentences.length - 1), 20),
            details: `${matches.length} consecutive repeated opener${matches.length === 1 ? '' : 's'}.`,
            matches: matches.slice(0, 8),
          };
    },
  },
  {
    id: 'no-run-on-25',
    category: 'Rhythm',
    shortLabel: 'Zero Breathless 25+ Word Lines',
    rule: 'Split every 25+ word run-on into two clean spoken thoughts.',
    whyItMatters: 'Guarantees every sentence can be spoken aloud in a single calm breath.',
    recommendedModes: ['technical', 'email', 'journal'],
    check: (text: string) => {
      const sentences = getSentenceSpans(text);
      const runOns = sentences.filter((s) => s.wordCount >= 25);
      return runOns.length === 0
        ? {
            passed: true,
            violationCount: 0,
            adherenceScore: 100,
            details: 'Zero 25+ word run-ons.',
            matches: [],
          }
        : {
            passed: false,
            violationCount: runOns.length,
            adherenceScore: scoreFromViolations(runOns.length, Math.max(1, sentences.length), 24),
            details: `${runOns.length} run-on line${runOns.length === 1 ? '' : 's'} (25+ words).`,
            matches: runOns.slice(0, 8).map((s) => ({
              excerpt: `${s.wordCount}w: "${truncateExcerpt(s.text, 40)}"`,
              start: s.start,
              end: s.end,
              fixHint: `Break this ${s.wordCount}-word run-on into two shorter lines`,
            })),
          };
    },
  },
  {
    id: 'ask-one-sharp-question',
    category: 'Rhythm',
    shortLabel: 'Use One Conversational Question',
    rule: 'Include at least one crisp question mark to pull the listener in.',
    whyItMatters: 'Turns monologues into dialogue for LinkedIn posts and friend messages.',
    recommendedModes: ['linkedin', 'friend'],
    check: (text: string) => {
      const sentences = getSentenceSpans(text);
      if (sentences.length < 2) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'Include 1 sharp question.',
          matches: [],
        };
      }
      const hasQ = text.includes('?');
      return hasQ
        ? {
            passed: true,
            violationCount: 0,
            adherenceScore: 100,
            details: 'Conversational question active.',
            matches: [],
          }
        : {
            passed: false,
            violationCount: 1,
            adherenceScore: 70,
            details: 'Add one engaging question (?).',
            matches: sentences.length
              ? [
                  {
                    excerpt: truncateExcerpt(sentences[sentences.length - 1].text, 42),
                    start: sentences[sentences.length - 1].start,
                    end: sentences[sentences.length - 1].end,
                    fixHint: 'End or pivot with a direct question (?) to engage the reader',
                  },
                ]
              : [],
          };
    },
  },

  // PRECISION (4)
  {
    id: 'ban-was-were-passive',
    category: 'Precision',
    shortLabel: 'Zero Passive Voice',
    rule: 'Eliminate passive "was/were/been + participle" constructions; name who did the action.',
    whyItMatters: 'Assigns clear ownership and energy (ignores predicate adjectives like "was excited").',
    recommendedModes: ['technical', 'email', 'linkedin'],
    check: (text: string) => {
      if (!text.trim()) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'Zero passive constructions.',
          matches: [],
        };
      }
      const scanner = /\b(was|were|been|being)\s+(?:not\s+)?([a-z]{3,})\b/gi;
      const matches: ConstraintViolationMatch[] = [];
      let m: RegExpExecArray | null;
      while ((m = scanner.exec(text)) !== null) {
        const candidate = m[2].toLowerCase();
        if (PASSIVE_ADJECTIVE_EXCLUSIONS.has(candidate)) continue;
        const isRegularParticiple =
          (candidate.endsWith('ed') || candidate.endsWith('en')) &&
          candidate.length >= 4;
        const isIrregularParticiple = IRREGULAR_PARTICIPLES.has(candidate);
        if (isRegularParticiple || isIrregularParticiple) {
          matches.push({
            excerpt: m[0],
            start: m.index,
            end: m.index + m[0].length,
            fixHint: `Rewrite "${m[0]}" in active voice (name the actor + action verb)`,
          });
        }
      }
      if (matches.length === 0) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'Clean — 0 passive voice constructions.',
          matches: [],
        };
      }
      const sample = Array.from(new Set(matches.map((x) => x.excerpt.toLowerCase()))).slice(0, 3);
      return {
        passed: false,
        violationCount: matches.length,
        adherenceScore: scoreFromViolations(matches.length, Math.max(4, getSentenceSpans(text).length), 20),
        details: `${matches.length} passive hit${matches.length === 1 ? '' : 's'}: ${sample.join(', ')}`,
        matches: matches.slice(0, 10),
      };
    },
  },
  {
    id: 'ban-to-be-is-are-was',
    category: 'Precision',
    shortLabel: 'Limit "is / are / was / were"',
    rule: 'Keep weak "to be" verbs (is/are/was/were) to at most 2 in the whole draft.',
    whyItMatters: 'Forces vivid action verbs instead of static state-of-being clauses.',
    recommendedModes: ['creative', 'linkedin', 'journal'],
    check: (text: string) => {
      const scanner = /\b(is|are|was|were)\b/gi;
      const allMatches: ConstraintViolationMatch[] = [];
      let m: RegExpExecArray | null;
      while ((m = scanner.exec(text)) !== null) {
        allMatches.push({
          excerpt: m[0],
          start: m.index,
          end: m.index + m[0].length,
          fixHint: 'Replace with an active verb that shows movement or impact',
        });
      }
      if (allMatches.length <= 2) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: `${allMatches.length}/2 "to be" verbs used.`,
          matches: [],
        };
      }
      const excess = allMatches.length - 2;
      return {
        passed: false,
        violationCount: excess,
        adherenceScore: scoreFromViolations(excess, Math.max(4, allMatches.length), 16),
        details: `${allMatches.length} "to be" verbs (max 2). Swap ${excess} for active verbs.`,
        matches: allMatches.slice(2, 10),
      };
    },
  },
  {
    id: 'ban-ly-adverbs',
    category: 'Precision',
    shortLabel: 'Max 1 "-ly" Adverb',
    rule: 'Use at most one "-ly" adverb; pick a sharper verb instead of propping up a weak one.',
    whyItMatters: 'Replaces "ran quickly" with "sprinted" (ignores adjectives like friendly/monthly).',
    recommendedModes: ['creative', 'linkedin', 'journal'],
    check: (text: string) => {
      const scanner = /\b[a-z]{4,}ly\b/gi;
      const allMatches: ConstraintViolationMatch[] = [];
      let m: RegExpExecArray | null;
      while ((m = scanner.exec(text)) !== null) {
        if (NON_ADVERB_LY_WORDS.has(m[0].toLowerCase())) continue;
        allMatches.push({
          excerpt: m[0],
          start: m.index,
          end: m.index + m[0].length,
          fixHint: `Cut "${m[0]}" and upgrade the verb or adjective it modifies`,
        });
      }
      if (allMatches.length <= 1) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: `${allMatches.length}/1 "-ly" adverbs.`,
          matches: [],
        };
      }
      const excess = allMatches.length - 1;
      return {
        passed: false,
        violationCount: excess,
        adherenceScore: scoreFromViolations(excess, Math.max(3, allMatches.length), 18),
        details: `${allMatches.length} "-ly" adverbs (${allMatches.slice(0, 3).map((x) => x.excerpt).join(', ')}).`,
        matches: allMatches.slice(1, 10),
      };
    },
  },
  {
    id: 'anchor-concrete-number',
    category: 'Precision',
    shortLabel: 'Include 1 Concrete Number/Metric',
    rule: 'Ground your claim with at least one real number, measurement, or timeframe.',
    whyItMatters: 'Specific numbers immediately build credibility in technical and executive writing.',
    recommendedModes: ['technical', 'email', 'linkedin'],
    check: (text: string) => {
      if (sentenceWordCount(text) < 20) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'Include 1 concrete number or metric.',
          matches: [],
        };
      }
      const hasNum =
        /\b\d+(?:[.,]\d+)?%?\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred|thousand|million)\b/i.test(
          text
        );
      const sentences = getSentenceSpans(text);
      return hasNum
        ? {
            passed: true,
            violationCount: 0,
            adherenceScore: 100,
            details: 'Concrete number anchored.',
            matches: [],
          }
        : {
            passed: false,
            violationCount: 1,
            adherenceScore: 68,
            details: 'Add at least 1 concrete number or metric.',
            matches: sentences.length
              ? [
                  {
                    excerpt: truncateExcerpt(sentences[0].text, 42),
                    start: sentences[0].start,
                    end: sentences[0].end,
                    fixHint: 'Anchor a claim with a latency, percentage, count, or timeframe',
                  },
                ]
              : [],
          };
    },
  },

  // CLARITY (4)
  {
    id: 'open-with-verb-or-action',
    category: 'Clarity',
    shortLabel: 'No "I think / In my opinion"',
    rule: 'State claims with conviction — cut "I think", "I believe", "I feel like", and "in my opinion".',
    whyItMatters: 'The reader already knows it is your view—drop the qualifier and sound confident.',
    recommendedModes: ['technical', 'email', 'linkedin'],
    check: makeWordBanChecker(
      /\b(i think|i believe|i feel like|in my opinion|personally i think|from my perspective)\b/gi,
      'weak qualifiers',
      'Remove the qualifier and state the claim directly'
    ),
  },
  {
    id: 'use-natural-contractions',
    category: 'Clarity',
    shortLabel: 'Include Spoken Contractions',
    rule: 'Sound human out loud: include at least 2 natural contractions (don\'t, it\'s, won\'t, we\'re).',
    whyItMatters: 'Prevents stiff textbook phrasing in conversations, journals, and friendly emails.',
    recommendedModes: ['friend', 'journal', 'linkedin'],
    check: (text: string) => {
      if (sentenceWordCount(text) < 25) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'Aim for 2+ spoken contractions.',
          matches: [],
        };
      }
      const matches =
        text.match(
          /\b(i['’]m|i['’]ve|i['’]ll|i['’]d|don['’]t|doesn['’]t|didn['’]t|won['’]t|can['’]t|couldn['’]t|wouldn['’]t|shouldn['’]t|mustn['’]t|it['’]s|it['’]ll|that['’]s|there['’]s|here['’]s|what['’]s|who['’]s|let['’]s|we['’]re|we['’]ve|we['’]ll|you['’]re|you['’]ve|you['’]ll|they['’]re|they['’]ve|they['’]ll|he['’]s|she['’]s|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|haven['’]t|hasn['’]t)\b/gi
        ) ?? [];
      if (matches.length >= 2) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: `${matches.length} natural contractions used.`,
          matches: [],
        };
      }
      // Locate expandable formal pairs to suggest direct fixes!
      const expandableScanner =
        /\b(do not|does not|did not|will not|cannot|can not|it is|that is|we are|you are|they are|i am|is not|are not|have not|has not|would not|could not|should not)\b/gi;
      const suggestions: ConstraintViolationMatch[] = [];
      let m: RegExpExecArray | null;
      while ((m = expandableScanner.exec(text)) !== null) {
        suggestions.push({
          excerpt: m[0],
          start: m.index,
          end: m.index + m[0].length,
          fixHint: `Contract "${m[0]}" for warmer spoken cadence`,
        });
      }
      return {
        passed: false,
        violationCount: 2 - matches.length,
        adherenceScore: matches.length === 1 ? 75 : 55,
        details: `${matches.length}/2 natural contractions used.`,
        matches: suggestions.slice(0, 6),
      };
    },
  },
  {
    id: 'zero-calques',
    category: 'Clarity',
    shortLabel: 'Zero Textbook Calques',
    rule: 'Avoid "revert back", "discuss about", "do the needful", "cope up with", "prepone".',
    whyItMatters: 'Catches literal-translation phrasing traps and builds native idiomatic clarity.',
    recommendedModes: ['email', 'technical', 'friend'],
    check: makeWordBanChecker(
      /\b(revert back|return back|discuss about|explain about|do the needful|cope up with|prepone|do a mistake|passing out from|myself\s+[A-Z][a-z]+)\b/gi,
      'textbook calques',
      'Use the natural idiomatic phrase (reply, discuss, cope with, make a mistake)'
    ),
  },
  {
    id: 'direct-first-sentence',
    category: 'Clarity',
    shortLabel: 'Crisp <= 14-Word Opening Line',
    rule: 'Hook the reader immediately: keep your very first sentence to 14 words or fewer.',
    whyItMatters: 'A sharp opening line wins attention in emails, LinkedIn feeds, and interviews.',
    recommendedModes: ['email', 'linkedin', 'technical', 'creative'],
    check: (text: string) => {
      const sentences = getSentenceSpans(text);
      if (sentences.length === 0) {
        return {
          passed: true,
          violationCount: 0,
          adherenceScore: 100,
          details: 'Keep opening sentence <= 14 words.',
          matches: [],
        };
      }
      const first = sentences[0];
      return first.wordCount <= 14
        ? {
            passed: true,
            violationCount: 0,
            adherenceScore: 100,
            details: `Opening hook: ${first.wordCount}/14 words.`,
            matches: [],
          }
        : {
            passed: false,
            violationCount: 1,
            adherenceScore: Math.max(40, 100 - (first.wordCount - 14) * 5),
            details: `Opening sentence is ${first.wordCount} words (target <= 14).`,
            matches: [
              {
                excerpt: `${first.wordCount}w opening: "${truncateExcerpt(first.text, 40)}"`,
                start: first.start,
                end: first.end,
                fixHint: `Trim ${first.wordCount - 14} word${first.wordCount - 14 === 1 ? '' : 's'} from your opening hook`,
              },
            ],
          };
    },
  },
] as const;

export function getConstraintById(id: string | null | undefined): ConstraintChallenge | null {
  if (!id) return null;
  return CONSTRAINT_CHALLENGES.find((c) => c.id === id) ?? null;
}

export function getRecommendedConstraintsForMode(mode: WritingMode): ConstraintChallenge[] {
  return CONSTRAINT_CHALLENGES.filter((c) => c.recommendedModes.includes(mode));
}

export function pickRandomConstraint(
  excludeId?: string | null,
  preferredMode?: WritingMode
): ConstraintChallenge {
  const modePool = preferredMode
    ? CONSTRAINT_CHALLENGES.filter(
        (c) => c.recommendedModes.includes(preferredMode) && c.id !== excludeId
      )
    : [];
  const pool =
    modePool.length > 0
      ? modePool
      : CONSTRAINT_CHALLENGES.filter((c) => c.id !== excludeId);
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? CONSTRAINT_CHALLENGES[0];
}

/**
 * Evaluates all 18 constraints against the current draft so the QuillBot-inspired
 * Constraint Picker can preview live violation badges on every rule in <1ms.
 */
export function evaluateAllConstraintsPreview(
  text: string
): Record<string, { passed: boolean; violationCount: number; adherenceScore: number }> {
  const result: Record<
    string,
    { passed: boolean; violationCount: number; adherenceScore: number }
  > = {};
  for (const ch of CONSTRAINT_CHALLENGES) {
    const check = ch.check(text);
    result[ch.id] = {
      passed: check.passed,
      violationCount: check.violationCount,
      adherenceScore: check.adherenceScore,
    };
  }
  return result;
}
