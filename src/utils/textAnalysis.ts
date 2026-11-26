import type { ToneSetting, VocabEntry, WritingMode } from '../types';
import {
  analyzeDraftLocally,
  computeReadabilityStats,
  MODE_LABELS,
  TONE_LABELS,
} from './analytics';
import {
  assessDraftIntegrity,
  computeTopicOverlap,
  sanitizeCoachProse,
} from './evaluationCalibration';
import { runOfflineProofread } from './offlineProofreader';
import { computeProseDiagnostics, detectCalques } from './proseDiagnostics';
import { classifyVocabEntryLocally } from './vocabCatalog';
import {
  buildVocabCandidateRegex,
  extractVocabCandidates,
} from './vocabMastery';

export interface TextAnalysisInput {
  text: string;
  vocabulary?: VocabEntry[];
  mode?: WritingMode;
  tone?: ToneSetting;
  topic?: string;
}

export interface TextAnalysisPillarScores {
  grammar: number; // 0..100
  tone: number; // 0..100
  clarity: number; // 0..100
}

export interface TextAnalysisSuggestion {
  id: string;
  category: 'grammar' | 'tone' | 'clarity' | 'eie-precision';
  priority: 'high' | 'medium' | 'low';
  title: string;
  excerpt: string;
  suggestion: string;
  educationalNote: string;
}

export interface LibraryVocabMatch {
  entryId: string;
  headword: string;
  usedPhrase: string;
  mastered: boolean;
  categoryLabel: string;
}

export interface LibraryVocabOpportunity {
  entryId: string;
  matchedUsedPhrase: string;
  libraryAlternative: string;
  explanation: string;
  contextTag?: string;
}

export interface ProfessionalVocabAlternative {
  id: string;
  original: string;
  professionalAlternative: string;
  registerTag:
    | 'EIE Domain'
    | 'Technical Precision'
    | 'Executive Email'
    | 'Concise Active';
  educationalNote: string;
  alreadyInLibrary: boolean;
}

export interface VocabularyComparisonReport {
  librarySize: number;
  libraryCoveragePct: number;
  appliedFromLibrary: LibraryVocabMatch[];
  missedLibraryOpportunities: LibraryVocabOpportunity[];
  professionalAlternatives: ProfessionalVocabAlternative[];
}

export interface TextAnalysisReport {
  overallScore: number; // 0..100
  gradeLabel:
    | 'Publication-Ready'
    | 'Strong Technical'
    | 'Solid Working Draft'
    | 'Developing'
    | 'Early Draft'
    | 'Insufficient Sample';
  cefrEstimate: string;
  scores: TextAnalysisPillarScores;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  fleschReadingEase: number;
  fkGradeLevel: number;
  signalNoiseRatio: number;
  detectedRegister: string;
  toneAlignmentNote: string;
  summary: string;
  suggestions: TextAnalysisSuggestion[];
  vocabularyComparison: VocabularyComparisonReport;
}

interface EieGrammarRule {
  id: string;
  regex: RegExp;
  replacement: string;
  title: string;
  educationalNote: string;
}

const EIE_GRAMMAR_RULES: EieGrammarRule[] = [
  {
    id: 'eie-art-an-acronym',
    regex: /\ba\s+(ADC|RTD|MCU|LED|LCD|OP-?AMP|FPGA|ASIC|IC|I2C|SPI|SNR|EMI|FFT|Oscilloscope|instrumentation amplifier)\b/gi,
    replacement: 'use "an" before vowel-sound acronyms/terms',
    title: 'Article before spoken vowel sound ("an")',
    educationalNote:
      'Acronyms starting with spoken vowel sounds—like "ADC" ("ay-dee-see"), "RTD" ("ar-tee-dee"), "MCU" ("em-see-you"), or "LED" ("el-ee-dee")—always take "an", not "a".',
  },
  {
    id: 'eie-art-a-consonant-acronym',
    regex: /\ban\s+(PID|PLC|PCB|PWM|DAC|UART|CAN|USB|DSP|BJT|MOSFET|CPU|GUI)\b/gi,
    replacement: 'use "a" before consonant-sound acronyms',
    title: 'Article before consonant-sound acronym ("a")',
    educationalNote:
      'Acronyms pronounced with an opening consonant sound—like "PID" ("pee-eye-dee"), "PLC", or "PCB"—take "a" rather than "an".',
  },
  {
    id: 'eie-uncountable-nouns',
    regex: /\b(datas|equipments|informations|hardwares|softwares|feedbacks|researches|machineries)\b/gi,
    replacement: 'use singular uncountable form (data, equipment, hardware, feedback)',
    title: 'Uncountable technical noun pluralized',
    educationalNote:
      'In IEEE reports and technical interviews, nouns like "data", "equipment", "hardware", "software", and "feedback" remain uncountable—write "sensor data" or "test equipment", never "datas" or "equipments".',
  },
  {
    id: 'eie-unit-formatting',
    regex: /\b\d+(?:\.\d+)?(?:ma|mv|khz|mhz|ghz|hz|ohm|ohms)\b/g,
    replacement: 'insert a space and standard SI unit capitalization (e.g., 4–20 mA, 50 Hz, 10 kHz)',
    title: 'SI unit spacing & capitalization',
    educationalNote:
      'Engineering specifications separate the numeric value and SI symbol with a space and exact casing (e.g., "50 Hz", "20 mA", "12 kHz") so schematics and lab notes stay unambiguous.',
  },
  {
    id: 'eie-double-modal',
    regex: /\b(can able to|could able to|will gets|does not works|did not worked)\b/gi,
    replacement: 'use one finite verb ("can", "was able to", "will get", "does not work")',
    title: 'Modal / auxiliary verb stacking',
    educationalNote:
      'English pairs modal/auxiliary verbs ("can", "did", "does") directly with the base verb without stacking "able to" or adding past/3rd-person endings.',
  },
];

interface EieVocabRule {
  id: string;
  regex: RegExp;
  alternative: string;
  registerTag: ProfessionalVocabAlternative['registerTag'];
  educationalNote: string;
}

/**
 * Curated EIE-authentic professional alternatives. Deliberately avoids pompous
 * thesaurus-slop ("utilize", "leverage", "delve") in favor of crisp engineering prose.
 */
export const EIE_PROFESSIONAL_ALTERNATIVES: EieVocabRule[] = [
  {
    id: 'eie-fix-problem',
    regex: /\b(?:fix|fixed|fixing)\s+(?:the\s+)?(?:problem|issue|bug|error)\b/gi,
    alternative: 'isolate the root cause / resolve the fault',
    registerTag: 'EIE Domain',
    educationalNote:
      'In instrumentation reviews and interviews, naming how you isolated or resolved a fault proves systematic troubleshooting.',
  },
  {
    id: 'eie-check-signal',
    regex: /\b(?:check|checked|checking)\s+(?:the\s+)?(?:signal|reading|readings|output|voltage|current)\b/gi,
    alternative: 'verify / probe the signal output',
    registerTag: 'EIE Domain',
    educationalNote:
      '"Verify", "probe", or "measure" communicates active bench methodology rather than casual inspection.',
  },
  {
    id: 'eie-very-noisy',
    regex: /\b(?:very\s+noisy|a\s+lot\s+of\s+noise|too\s+much\s+noise)\b/gi,
    alternative: 'high-noise / low-SNR',
    registerTag: 'Technical Precision',
    educationalNote:
      'Replacing "very noisy" with "low-SNR" or quantifying the noise floor signals instrumentation maturity immediately.',
  },
  {
    id: 'eie-make-stable',
    regex: /\b(?:make|made|makes|keep|kept)\s+(?:the\s+|it\s+)?(?:system|loop|signal|output|circuit)?\s*stable\b/gi,
    alternative: 'stabilize / damp the response',
    registerTag: 'EIE Domain',
    educationalNote:
      'One precise verb ("stabilize" or "damp") tightens control-systems descriptions by cutting filler auxiliaries.',
  },
  {
    id: 'eie-analog-to-digital',
    regex: /\b(?:turn|turned|convert|converted)\s+(?:the\s+)?analog\s+(?:signal\s+)?(?:in)?to\s+digital\b/gi,
    alternative: 'digitize via ADC',
    registerTag: 'EIE Domain',
    educationalNote:
      '"Digitize" is the standard signal-conditioning verb across embedded firmware and data acquisition interviews.',
  },
  {
    id: 'eie-big-error',
    regex: /\b(?:big|huge|large)\s+(?:error|mistake|difference|gap)\b/gi,
    alternative: 'significant deviation / steady-state error',
    registerTag: 'Technical Precision',
    educationalNote:
      'Quantifiable terms like "deviation", "offset", or "steady-state error" fit lab analysis far better than "big error".',
  },
  {
    id: 'eie-worked-fine',
    regex: /\b(?:worked\s+fine|works\s+well|good\s+performance|good\s+accuracy)\b/gi,
    alternative: 'held within tolerance / met specification',
    registerTag: 'Technical Precision',
    educationalNote:
      'Engineers evaluate systems against tolerances and specs rather than subjective labels like "worked fine".',
  },
  {
    id: 'eie-got-worse',
    regex: /\b(?:got\s+worse|became\s+bad|went\s+wrong)\b/gi,
    alternative: 'degraded / drifted out of spec',
    registerTag: 'EIE Domain',
    educationalNote:
      '"Degraded" or "drifted" describes sensor/loop behavior cleanly without informal phrasing.',
  },
  {
    id: 'eie-find-out',
    regex: /\b(?:find\s+out|found\s+out|figure\s+out|figured\s+out)\b/gi,
    alternative: 'diagnose / trace',
    registerTag: 'Concise Active',
    educationalNote:
      'Single-word verbs like "diagnose" or "trace" tighten explanations while preserving natural spoken rhythm.',
  },
  {
    id: 'eie-changed-a-lot',
    regex: /\b(?:changed\s+a\s+lot|changing\s+too\s+much|keeps\s+changing)\b/gi,
    alternative: 'fluctuated sharply / drifted',
    registerTag: 'EIE Domain',
    educationalNote:
      '"Fluctuated" indicates rapid oscillation, while "drifted" indicates slow thermal or baseline shift—pick the exact physical behavior.',
  },
  {
    id: 'eie-very-slow',
    regex: /\b(?:very\s+slow|a\s+lot\s+of\s+delay|too\s+much\s+delay)\b/gi,
    alternative: 'high loop latency / slow settling time',
    registerTag: 'EIE Domain',
    educationalNote:
      'Distinguishing latency from settling time shows strong grasp of control and telemetry bottlenecks.',
  },
  {
    id: 'eie-connect-together',
    regex: /\b(?:connect\s+together|connected\s+together|hook\s+up)\b/gi,
    alternative: 'interface / couple',
    registerTag: 'EIE Domain',
    educationalNote:
      'Drop redundant "together" after "connect", or use "interface" when linking sensors, amplifiers, and microcontrollers.',
  },
  {
    id: 'eie-power-drop',
    regex: /\b(?:power\s+goes\s+down|voltage\s+goes\s+down|voltage\s+drops\s+down)\b/gi,
    alternative: 'supply rail sags / voltage attenuates',
    registerTag: 'EIE Domain',
    educationalNote:
      '"Attenuates" or "sags" describes resistive losses cleanly and eliminates redundant "down" particles.',
  },
  {
    id: 'eie-talk-about',
    regex: /\b(?:talk\s+about|talking\s+about)\b/gi,
    alternative: 'walk through / outline',
    registerTag: 'Executive Email',
    educationalNote:
      'In project updates and interviews, "walk through" or "outline" sets a structured expectation for the listener.',
  },
  {
    id: 'eie-make-sure',
    regex: /\b(?:make\s+sure)\b/gi,
    alternative: 'verify / confirm',
    registerTag: 'Executive Email',
    educationalNote:
      '"Confirm" or "verify" adds crisp professional confidence to capstone emails and QA checklists.',
  },
  {
    id: 'eie-use-instead-slop',
    regex: /\b(?:make\s+use\s+of|made\s+use\s+of)\b/gi,
    alternative: 'apply / deploy',
    registerTag: 'Concise Active',
    educationalNote:
      'Replace wordy "make use of" with direct verbs like "apply" or "deploy" (avoid stiff buzzwords like "utilize").',
  },
  {
    id: 'eie-things-stuff',
    regex: /\b(?:things|stuff)\b/gi,
    alternative: 'parameters / subsystems',
    registerTag: 'Technical Precision',
    educationalNote:
      'Concrete nouns ("parameters", "subsystems", "readings") eliminate vagueness in technical and stakeholder writing.',
  },
  {
    id: 'eie-in-order-to',
    regex: /\bin\s+order\s+to\b/gi,
    alternative: 'to',
    registerTag: 'Concise Active',
    educationalNote:
      'Trimming "in order to" down to "to" keeps engineering documentation brisk with zero loss of meaning.',
  },
  {
    id: 'eie-due-to-fact',
    regex: /\bdue\s+to\s+the\s+fact\s+that\b/gi,
    alternative: 'because',
    registerTag: 'Concise Active',
    educationalNote:
      'Replacing 5-word throat-clearing with "because" improves readability and interview tempo immediately.',
  },
];

const VAGUE_TECHNICAL_PATTERNS: Array<{
  id: string;
  regex: RegExp;
  title: string;
  suggestion: string;
  educationalNote: string;
}> = [
  {
    id: 'eie-quantify-metrics',
    regex: /\b(?:improves?\s+efficiency|better\s+results?|high\s+accuracy|very\s+accurate|very\s+fast|reduces?\s+noise)\b/gi,
    title: 'Quantify your engineering claim',
    suggestion:
      'Pair qualitative claims with a concrete bound or unit (e.g., "cut 50 Hz ripple by 18 dB", "settled within 120 ms", or "held ±0.2 °C tolerance").',
    educationalNote:
      'Instrumentation interviewers and hiring managers trust bounded numbers over unquantified adjectives.',
  },
  {
    id: 'eie-subjective-padding',
    regex: /\b(?:kindly\s+note|asap|pls|thx|i\s+am\s+writing\s+this\s+mail\s+to)\b/gi,
    title: 'Modernize outreach phrasing',
    suggestion:
      'Open directly with your purpose in one crisp sentence instead of boilerplate templates or texting shorthand.',
    educationalNote:
      'Busy engineers scan messages in seconds—lead with your concrete result or ask in the first line.',
  },
];

const THESAURUS_SLOP_PATTERN =
  /\b(utilize|utilizes|utilized|utilizing|delve|delves|delving|tapestry|plethora|myriad|aforementioned|heretofore|synergy|leverage|leveraging)\b/gi;

const INFORMAL_SLANG_PATTERN =
  /\b(gonna|wanna|gotta|kinda|sorta|tbh|idk|btw|omg|u|ur|pls|thx|asap)\b/gi;

function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUsedPhraseRegex(usedPhrase: string): RegExp | null {
  const cleaned = usedPhrase
    .trim()
    .toLowerCase()
    .replace(/^["'“”‘’(\[]+|["'“”‘’)\]\s.,!?;:]+$/g, '');
  if (cleaned.length < 3) return null;
  const parts = cleaned.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return null;
  return new RegExp(`\\b${parts.join('\\s+')}\\b`, 'i');
}

/**
 * Compares the current writing sample against the user's saved vocabulary library
 * and suggests EIE-authentic professional alternatives where natural precision can improve.
 */
export function compareVocabularyWithLibrary(
  text: string,
  vocabulary: VocabEntry[] = []
): VocabularyComparisonReport {
  const trimmed = text.trim();
  const safeVocab = Array.isArray(vocabulary) ? vocabulary : [];
  const appliedFromLibrary: LibraryVocabMatch[] = [];
  const missedLibraryOpportunities: LibraryVocabOpportunity[] = [];
  const seenAppliedIds = new Set<string>();
  const seenMissedIds = new Set<string>();
  const libraryLowerTerms = new Set<string>();

  for (const entry of safeVocab) {
    const candidates = extractVocabCandidates(entry);
    for (const c of candidates) {
      libraryLowerTerms.add(c.toLowerCase());
    }

    if (!trimmed) continue;

    // 1. Check if the user successfully applied a saved vocabulary term in this draft
    let matchedPhrase: string | null = null;
    for (const candidate of candidates) {
      const regex = buildVocabCandidateRegex(candidate, 'i');
      const match = regex.exec(trimmed);
      if (match && match[0]) {
        matchedPhrase = match[0];
        break;
      }
    }

    if (matchedPhrase && !seenAppliedIds.has(entry.id)) {
      seenAppliedIds.add(entry.id);
      appliedFromLibrary.push({
        entryId: entry.id,
        headword: entry.betterAlternative.split('/')[0]?.trim() || entry.betterAlternative,
        usedPhrase: matchedPhrase,
        mastered: Boolean(entry.mastered),
        categoryLabel: classifyVocabEntryLocally(entry),
      });
      continue;
    }

    // 2. Check if the draft uses the weak phrase (`entry.used`) that this library entry replaces
    const usedRegex = buildUsedPhraseRegex(entry.used || '');
    if (usedRegex) {
      const usedMatch = usedRegex.exec(trimmed);
      if (usedMatch && usedMatch[0] && !seenMissedIds.has(entry.id)) {
        seenMissedIds.add(entry.id);
        missedLibraryOpportunities.push({
          entryId: entry.id,
          matchedUsedPhrase: usedMatch[0],
          libraryAlternative: entry.betterAlternative,
          explanation:
            entry.explanation ||
            `You saved "${entry.betterAlternative}" in your library to replace "${entry.used}".`,
          contextTag:
            entry.category ||
            entry.aiCategory ||
            classifyVocabEntryLocally(entry),
        });
      }
    }
  }

  // 3. Scan for new professional EIE alternatives not already superseded by library reminders
  const missedPhraseSet = new Set(
    missedLibraryOpportunities.map((m) => m.matchedUsedPhrase.toLowerCase())
  );
  const professionalAlternatives: ProfessionalVocabAlternative[] = [];
  const seenAltKeys = new Set<string>();

  if (trimmed.length >= 10) {
    for (const rule of EIE_PROFESSIONAL_ALTERNATIVES) {
      rule.regex.lastIndex = 0;
      const match = rule.regex.exec(trimmed);
      if (!match || !match[0]) continue;
      const matched = match[0].trim();
      const matchedLower = matched.toLowerCase();
      if (missedPhraseSet.has(matchedLower)) continue;

      const altParts = rule.alternative
        .split('/')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      const alreadyInLibrary = altParts.some((p) => libraryLowerTerms.has(p));

      const key = `${matchedLower}->${rule.alternative.toLowerCase()}`;
      if (seenAltKeys.has(key)) continue;
      seenAltKeys.add(key);

      professionalAlternatives.push({
        id: rule.id,
        original: matched,
        professionalAlternative: rule.alternative,
        registerTag: rule.registerTag,
        educationalNote: rule.educationalNote,
        alreadyInLibrary,
      });

      if (professionalAlternatives.length >= 6) break;
    }
  }

  const libraryCoveragePct =
    safeVocab.length > 0
      ? clamp100((appliedFromLibrary.length / Math.min(safeVocab.length, 10)) * 100)
      : 0;

  return {
    librarySize: safeVocab.length,
    libraryCoveragePct,
    appliedFromLibrary: appliedFromLibrary.slice(0, 8),
    missedLibraryOpportunities: missedLibraryOpportunities.slice(0, 5),
    professionalAlternatives,
  };
}

/**
 * Comprehensive, deterministic EIE-aware text analysis engine evaluating:
 * - Grammar & Mechanics (0..100)
 * - Tone & Register Alignment (0..100)
 * - Clarity & Precision (0..100)
 * - Overall Score (0..100) + prioritized educational suggestions
 * - Vocabulary comparison against the user's VocabEntry library
 */
export function analyzeWritingSample(
  input: TextAnalysisInput
): TextAnalysisReport {
  const text = (input.text || '').trim();
  const mode: WritingMode = input.mode ?? 'technical';
  const tone: ToneSetting = input.tone ?? 'academic-technical';
  const vocabulary = input.vocabulary ?? [];

  const vocabularyComparison = compareVocabularyWithLibrary(text, vocabulary);

  if (!text) {
    return {
      overallScore: 0,
      gradeLabel: 'Insufficient Sample',
      cefrEstimate: 'A1',
      scores: { grammar: 0, tone: 0, clarity: 0 },
      wordCount: 0,
      sentenceCount: 0,
      avgWordsPerSentence: 0,
      fleschReadingEase: 0,
      fkGradeLevel: 0,
      signalNoiseRatio: 100,
      detectedRegister: 'No sample provided',
      toneAlignmentNote: 'Write or paste a sample to evaluate grammar, tone, and clarity.',
      summary: 'Enter a writing sample (at least 15 words) to generate a complete analysis.',
      suggestions: [],
      vocabularyComparison,
    };
  }

  const integrity = assessDraftIntegrity(text);
  const draftDiag = analyzeDraftLocally(text);
  const proseDiag = computeProseDiagnostics(text);
  const readability = computeReadabilityStats(text);
  const proofIssues = runOfflineProofread(text);
  const calques = detectCalques(text);
  const topicOverlap = computeTopicOverlap(text, input.topic);

  const suggestions: TextAnalysisSuggestion[] = [];
  const seenSuggestionKeys = new Set<string>();

  const pushSuggestion = (item: TextAnalysisSuggestion) => {
    const key = `${item.category}:${item.excerpt.toLowerCase()}:${item.title.toLowerCase()}`;
    if (seenSuggestionKeys.has(key)) return;
    seenSuggestionKeys.add(key);
    suggestions.push(item);
  };

  // --- 1. GRAMMAR & MECHANICS ---
  let eieGrammarHits = 0;
  for (const rule of EIE_GRAMMAR_RULES) {
    rule.regex.lastIndex = 0;
    const match = rule.regex.exec(text);
    if (match && match[0]) {
      eieGrammarHits += 1;
      pushSuggestion({
        id: `${rule.id}-${eieGrammarHits}`,
        category: 'grammar',
        priority: 'high',
        title: rule.title,
        excerpt: match[0],
        suggestion: rule.replacement,
        educationalNote: rule.educationalNote,
      });
    }
  }

  for (let i = 0; i < Math.min(proofIssues.length, 4); i++) {
    const issue = proofIssues[i];
    pushSuggestion({
      id: `proof-${issue.id}`,
      category: 'grammar',
      priority: issue.category === 'punctuation' ? 'medium' : 'high',
      title: `${issue.category.charAt(0).toUpperCase() + issue.category.slice(1)} check`,
      excerpt: issue.original.trim() || '(spacing)',
      suggestion:
        issue.replacement === ' '
          ? 'Use a single space'
          : `Replace with "${issue.replacement}"`,
      educationalNote: sanitizeCoachProse(issue.rule),
    });
  }

  const spellingCount = proofIssues.filter((i) => i.category === 'spelling').length;
  const grammarErrCount =
    proofIssues.filter((i) => i.category === 'grammar').length + eieGrammarHits;
  const punctCount = proofIssues.filter((i) => i.category === 'punctuation').length;
  const effectiveWords = Math.max(18, draftDiag.wordCount);

  let grammarScore = clamp100(
    96 -
      (spellingCount * 7 + grammarErrCount * 8 + punctCount * 4) *
        (45 / effectiveWords) -
      Math.min(26, grammarErrCount * 5 + spellingCount * 4)
  );

  // --- 2. TONE & REGISTER ALIGNMENT ---
  const slopMatches = text.match(THESAURUS_SLOP_PATTERN) ?? [];
  const slangMatches = text.match(INFORMAL_SLANG_PATTERN) ?? [];
  const isFormalTarget =
    mode === 'technical' ||
    mode === 'email' ||
    mode === 'linkedin' ||
    tone === 'academic-technical' ||
    tone === 'formal-executive';

  for (const calque of calques.slice(0, 3)) {
    pushSuggestion({
      id: `calque-${calque.phrase.toLowerCase()}`,
      category: 'tone',
      priority: 'high',
      title: 'Literal translation / awkward idiom',
      excerpt: calque.phrase,
      suggestion: `Use "${calque.naturalAlternative}"`,
      educationalNote: calque.reason,
    });
  }

  if (slopMatches.length > 0) {
    pushSuggestion({
      id: 'tone-thesaurus-slop',
      category: 'tone',
      priority: 'medium',
      title: 'Avoid inflated thesaurus filler',
      excerpt: slopMatches[0] ?? 'buzzword',
      suggestion: 'Swap for a plain active verb (e.g., "use", "apply", "explore", "combine")',
      educationalNote:
        'Modern IEEE engineering writing and technical interviews reward clear everyday verbs over stiff corporate buzzwords.',
    });
  }

  if (slangMatches.length > 0 && isFormalTarget) {
    pushSuggestion({
      id: 'tone-informal-slang',
      category: 'tone',
      priority: 'high',
      title: 'Informal shorthand in professional register',
      excerpt: slangMatches[0] ?? 'shorthand',
      suggestion: 'Spell out standard forms ("going to", "please", "as soon as possible")',
      educationalNote: `Keep phrasing crisp and interview-ready when writing in ${MODE_LABELS[mode]} mode.`,
    });
  }

  const fillerUnits = proseDiag.fillerCount;
  const fillerPenalty = isFormalTarget
    ? Math.min(24, fillerUnits * 4.5)
    : Math.min(12, fillerUnits * 2.5);
  const slangPenalty = isFormalTarget
    ? Math.min(24, slangMatches.length * 9)
    : Math.min(6, slangMatches.length * 3);
  const calquePenalty = Math.min(24, calques.length * 8);
  const slopPenalty = Math.min(16, slopMatches.length * 6);
  const appliedVocabBonus = Math.min(6, vocabularyComparison.appliedFromLibrary.length * 3);

  let toneScore = clamp100(
    90 +
      appliedVocabBonus -
      fillerPenalty -
      slangPenalty -
      calquePenalty -
      slopPenalty
  );

  let detectedRegister = 'Balanced Professional';
  if (slangMatches.length >= 2) {
    detectedRegister = 'Casual / Texting';
  } else if (slopMatches.length >= 2) {
    detectedRegister = 'Over-Formal / Stiff';
  } else if (mode === 'technical' && calques.length === 0 && fillerUnits <= 1) {
    detectedRegister = 'Crisp Technical & Interview-Ready';
  } else if (mode === 'email') {
    detectedRegister = calques.length > 0 ? 'Dated Template Email' : 'Direct Professional Outreach';
  } else if (mode === 'creative') {
    detectedRegister = 'Expressive Narrative';
  } else if (fillerUnits >= 3) {
    detectedRegister = 'Conversational / Hedged';
  }

  // --- 3. CLARITY & EIE PRECISION ---
  for (const vague of VAGUE_TECHNICAL_PATTERNS) {
    vague.regex.lastIndex = 0;
    const match = vague.regex.exec(text);
    if (match && match[0]) {
      pushSuggestion({
        id: vague.id,
        category: 'eie-precision',
        priority: 'medium',
        title: vague.title,
        excerpt: match[0],
        suggestion: vague.suggestion,
        educationalNote: vague.educationalNote,
      });
    }
  }

  if (integrity.longestSentenceWords > 28 && integrity.longestSentence) {
    const snippet = integrity.longestSentence.split(/\s+/).slice(0, 7).join(' ') + '…';
    pushSuggestion({
      id: 'clarity-long-sentence',
      category: 'clarity',
      priority: integrity.longestSentenceWords > 36 ? 'high' : 'medium',
      title: `Overlong sentence (${integrity.longestSentenceWords} words)`,
      excerpt: snippet,
      suggestion:
        'Split into two 12–18 word sentences: state the cause first, then the measurement or effect.',
      educationalNote:
        'Listeners and technical reviewers lose causal threads once a sentence exceeds ~25 words.',
    });
  }

  if (draftDiag.passiveMarkers >= 2) {
    pushSuggestion({
      id: 'clarity-passive-voice',
      category: 'clarity',
      priority: 'medium',
      title: `Passive voice cluster (${draftDiag.passiveMarkers}×)`,
      excerpt: `${draftDiag.passiveMarkers} passive "was/were/is + past participle" phrases`,
      suggestion:
        'Put the circuit, controller, or engineer in the subject slot (e.g., "The op-amp buffers the sensor" instead of "The sensor is buffered").',
      educationalNote:
        'Active subjects make cause-and-effect chains unmistakable in circuit walkthroughs and capstone demos.',
    });
  }

  if (draftDiag.repeatedOpeners.length > 0) {
    pushSuggestion({
      id: 'clarity-repeated-opener',
      category: 'clarity',
      priority: 'low',
      title: 'Repeated sentence openings',
      excerpt: draftDiag.repeatedOpeners[0].opener,
      suggestion: `Vary how consecutive sentences start instead of repeating "${draftDiag.repeatedOpeners[0].opener}".`,
      educationalNote:
        'Alternating short punchy leads with cause-first clauses keeps spoken explanations engaging.',
    });
  }

  if (topicOverlap !== null && topicOverlap === 0 && draftDiag.wordCount >= 20 && input.topic) {
    pushSuggestion({
      id: 'clarity-topic-alignment',
      category: 'clarity',
      priority: 'high',
      title: 'Low topic alignment',
      excerpt: input.topic.slice(0, 56),
      suggestion: 'Anchor your opening sentence explicitly to the prompt topic.',
      educationalNote:
        'Answering the exact question asked in the first two sentences is essential for technical interviews.',
    });
  }

  // Promote top professional EIE vocabulary alternative into concrete suggestions if room
  if (vocabularyComparison.missedLibraryOpportunities.length > 0) {
    const opp = vocabularyComparison.missedLibraryOpportunities[0];
    pushSuggestion({
      id: `lib-opp-${opp.entryId}`,
      category: 'eie-precision',
      priority: 'medium',
      title: 'Use saved word from your library',
      excerpt: opp.matchedUsedPhrase,
      suggestion: `Replace with "${opp.libraryAlternative}" (already in your Vocabulary Library).`,
      educationalNote: opp.explanation,
    });
  } else if (vocabularyComparison.professionalAlternatives.length > 0) {
    const alt = vocabularyComparison.professionalAlternatives[0];
    pushSuggestion({
      id: `pro-alt-${alt.id}`,
      category: 'eie-precision',
      priority: 'low',
      title: `Sharper ${alt.registerTag.toLowerCase()} phrasing`,
      excerpt: alt.original,
      suggestion: `Try "${alt.professionalAlternative}"`,
      educationalNote: alt.educationalNote,
    });
  }

  const avgLen = draftDiag.avgWordsPerSentence;
  const idealLenBonus =
    avgLen >= 10 && avgLen <= 21 ? 5 : avgLen >= 7 && avgLen <= 25 ? 2 : -8;
  const rhythmBonus =
    integrity.sentenceCount >= 3 && integrity.sentenceLengthStdDev >= 3.2 ? 4 : 0;
  const passivePenalty = Math.min(18, draftDiag.passiveMarkers * 4.5);
  const longPenalty =
    integrity.longestSentenceWords > 30
      ? Math.min(16, (integrity.longestSentenceWords - 28) * 1.1)
      : 0;
  const noisePenalty = Math.max(0, Math.round((100 - proseDiag.signalNoiseRatio) * 0.35));
  const topicPenalty = topicOverlap !== null && topicOverlap === 0 && draftDiag.wordCount >= 20 ? 8 : 0;

  let clarityScore = clamp100(
    84 +
      idealLenBonus +
      rhythmBonus -
      passivePenalty -
      longPenalty -
      noisePenalty -
      topicPenalty -
      Math.min(8, draftDiag.repeatedOpeners.length * 4)
  );

  // --- 4. INTEGRITY CAPS (ANTI-INFLATION) ---
  if (integrity.isGibberishOrLowEffort) {
    grammarScore = Math.min(grammarScore, 24);
    toneScore = Math.min(toneScore, 22);
    clarityScore = Math.min(clarityScore, 18);
  } else if (integrity.isUltraShort) {
    grammarScore = Math.min(grammarScore, 78);
    toneScore = Math.min(toneScore, 70);
    clarityScore = Math.min(clarityScore, 68);
  }

  // Weighted numerical score: Clarity 36%, Grammar 34%, Tone 30%
  const overallScore = clamp100(
    clarityScore * 0.36 + grammarScore * 0.34 + toneScore * 0.3
  );

  let gradeLabel: TextAnalysisReport['gradeLabel'] = 'Developing';
  let cefrEstimate = 'B1';
  if (integrity.isGibberishOrLowEffort) {
    gradeLabel = 'Insufficient Sample';
    cefrEstimate = 'A1';
  } else if (overallScore >= 88) {
    gradeLabel = 'Publication-Ready';
    cefrEstimate = 'C1';
  } else if (overallScore >= 78) {
    gradeLabel = 'Strong Technical';
    cefrEstimate = 'B2+';
  } else if (overallScore >= 66) {
    gradeLabel = 'Solid Working Draft';
    cefrEstimate = 'B2';
  } else if (overallScore >= 52) {
    gradeLabel = 'Developing';
    cefrEstimate = 'B1';
  } else {
    gradeLabel = 'Early Draft';
    cefrEstimate = 'A2';
  }

  // Sort suggestions by priority (high -> medium -> low)
  const priorityWeight: Record<TextAnalysisSuggestion['priority'], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  suggestions.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);

  const toneAlignmentNote =
    integrity.isGibberishOrLowEffort
      ? integrity.reason || 'Sample is too short or fragmented to verify register.'
      : calques.length > 0 || slangMatches.length > 0
        ? `Register leans ${detectedRegister.toLowerCase()}; tighten phrasing to match ${TONE_LABELS[tone] || tone} (${MODE_LABELS[mode]}).`
        : `Aligned cleanly with ${TONE_LABELS[tone] || tone} expectations for ${MODE_LABELS[mode]}.`;

  const summary = integrity.isGibberishOrLowEffort
    ? integrity.reason || 'Write at least 2–3 complete sentences for full grammar, tone, and clarity coaching.'
    : `Overall ${overallScore}/100 (${gradeLabel}): Grammar ${grammarScore}, Tone ${toneScore}, Clarity ${clarityScore} across ${draftDiag.wordCount} words (${avgLen}w/sentence, FK Grade ${readability.fkGradeLevel}).`;

  return {
    overallScore,
    gradeLabel,
    cefrEstimate,
    scores: {
      grammar: grammarScore,
      tone: toneScore,
      clarity: clarityScore,
    },
    wordCount: draftDiag.wordCount,
    sentenceCount: draftDiag.sentenceCount,
    avgWordsPerSentence: avgLen,
    fleschReadingEase: readability.fleschReadingEase,
    fkGradeLevel: readability.fkGradeLevel,
    signalNoiseRatio: proseDiag.signalNoiseRatio,
    detectedRegister,
    toneAlignmentNote,
    summary,
    suggestions: suggestions.slice(0, 8),
    vocabularyComparison,
  };
}
