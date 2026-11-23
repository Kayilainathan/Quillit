/**
 * Conversation Benchmark Evaluation Engine
 *
 * Purpose-built scoring, real-time response-timing fairness model, in-time turn
 * aggregation, and anti-inflation calibration for Live Conversation Practice.
 *
 * Weighted 100-Point Conversational Fluency Benchmark (8 Parameters):
 *   1. Context & Coherence          18%  (tracks & builds on partner's thread)
 *   2. Naturalness & Spoken Flow    16%  (sounds human, rhythmic, spoken-ready)
 *   3. Grammar & Mechanics          16%  (accuracy under real-time pressure)
 *   4. Tone & Register Control      14%  (fits persona, scenario & pace)
 *   5. Responsiveness & Tempo       12%  (grounded in real measured response & think latency)
 *   6. Conversational Initiative    10%  (depth, examples & momentum vs dead-end answers)
 *   7. Clarity & Conciseness         8%  (crisp, readable turns without run-on clutter)
 *   8. Vocabulary & Phrasing         6%  (lowest weightage — optional natural precision)
 */

import type {
  CoachHighlightPoint,
  ConversationBenchmarkNotes,
  ConversationBenchmarkReport,
  ConversationBenchmarkScores,
  ConversationBenchmarkTier,
  ConversationMessage,
  ConversationPace,
  ConversationTempoBand,
  ConversationTimingSummary,
  ConversationTurnArcPoint,
  ConversationTurnInTimeAnalysis,
  FeedbackImplementationDetail,
  FeedbackImplementedStatus,
  GrammarFix,
  PinpointedRewrite,
  RubricScores,
  VocabSuggestion,
} from '../types';
import {
  assessDraftIntegrity,
  deriveConsistentBenchmarksFromTotal,
  sanitizeCoachProse,
} from './evaluationCalibration';

export interface BenchmarkParameterMeta {
  key: keyof ConversationBenchmarkScores;
  label: string;
  shortLabel: string;
  weight: number; // sum = 100
  description: string;
}

export const CONVERSATION_BENCHMARK_PARAMETERS: BenchmarkParameterMeta[] = [
  {
    key: 'contextCoherence',
    label: 'Context & Coherence',
    shortLabel: 'Context',
    weight: 18,
    description: 'Directly answers and builds on the partner’s previous turn.',
  },
  {
    key: 'naturalnessSpokenFlow',
    label: 'Naturalness & Spoken Flow',
    shortLabel: 'Spoken Flow',
    weight: 16,
    description: 'Reads like authentic live dialogue rather than stiff textbook prose.',
  },
  {
    key: 'grammarMechanics',
    label: 'Grammar & Mechanics',
    shortLabel: 'Grammar',
    weight: 16,
    description: 'Verb agreement, tense consistency, and sentence accuracy in real time.',
  },
  {
    key: 'toneRegister',
    label: 'Tone & Register Control',
    shortLabel: 'Tone & Register',
    weight: 14,
    description: 'Matches the persona, setting, and conversational pace cleanly.',
  },
  {
    key: 'responsivenessTempo',
    label: 'Responsiveness & Tempo',
    shortLabel: 'Response Time',
    weight: 12,
    description: 'Length-adjusted reply speed, think latency, and live texting cadence.',
  },
  {
    key: 'conversationalInitiative',
    label: 'Initiative & Depth',
    shortLabel: 'Initiative',
    weight: 10,
    description: 'Advances the exchange with concrete details or natural follow-ups.',
  },
  {
    key: 'clarityConciseness',
    label: 'Clarity & Conciseness',
    shortLabel: 'Clarity',
    weight: 8,
    description: 'Gets ideas across cleanly without bloated or breathless run-ons.',
  },
  {
    key: 'vocabularyPrecision',
    label: 'Vocabulary & Phrasing',
    shortLabel: 'Vocabulary',
    weight: 6,
    description: 'Natural, idiomatic phrasing precision (lowest weightage).',
  },
];

function clampScore(val: unknown, fallback = 6): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes a fair, length- and pace-adjusted timing score (1-10) for a single turn.
 * A substantive 40-word answer typed in 20s scores HIGH (brisk & fluent), whereas a
 * 4-word stub that took 50s reflects real hesitation.
 */
export function computeTurnTimingScore(params: {
  responseTimeMs?: number;
  thinkTimeMs?: number;
  wordCount: number;
  pace: ConversationPace;
}): number {
  const { responseTimeMs, thinkTimeMs, wordCount, pace } = params;
  if (!responseTimeMs || !Number.isFinite(responseTimeMs) || responseTimeMs <= 0) {
    return 7; // Neutral baseline when timing was not captured (e.g., resumed old thread)
  }

  const actualSec = Math.max(0.5, responseTimeMs / 1000);
  // Expected human baseline: reading partner + formulating thought + natural typing speed
  const baseThinkBudgetSec =
    pace === 'challenging' ? 5.5 : pace === 'relaxed' ? 9.5 : 7.0;
  const targetTypingWpm =
    pace === 'challenging' ? 42 : pace === 'relaxed' ? 28 : 35;
  const typingBudgetSec = (Math.max(1, wordCount) / targetTypingWpm) * 60;
  const expectedSec = baseThinkBudgetSec + typingBudgetSec;

  const ratio = actualSec / expectedSec;

  let score: number;
  if (ratio <= 0.65) score = 10;
  else if (ratio <= 0.95) score = 9;
  else if (ratio <= 1.25) score = 8;
  else if (ratio <= 1.65) score = 7;
  else if (ratio <= 2.15) score = 6;
  else if (ratio <= 2.8) score = 5;
  else if (ratio <= 3.8) score = 4;
  else score = 3;

  // Mild penalty only if the learner sat completely idle (>25s think pause) before typing a tiny turn
  if (
    thinkTimeMs &&
    thinkTimeMs > 25_000 &&
    wordCount < 10 &&
    score > 4
  ) {
    score -= 1;
  }

  return Math.max(1, Math.min(10, score));
}

export function classifyTempoBand(
  timingCalibrationScore: number,
  avgResponseTimeSec: number | null
): ConversationTempoBand {
  if (avgResponseTimeSec === null) return 'Natural';
  if (timingCalibrationScore >= 9 && avgResponseTimeSec <= 12) return 'Snappy';
  if (timingCalibrationScore >= 8) return 'Natural';
  if (timingCalibrationScore >= 6) return 'Measured';
  if (timingCalibrationScore >= 5) return 'Deliberate';
  return 'Hesitant';
}

export function computeInTimeComposite(
  analysis?: ConversationTurnInTimeAnalysis | null
): number | null {
  if (!analysis) return null;
  const weighted =
    clampScore(analysis.contextAlignment) * 0.28 +
    clampScore(analysis.naturalness) * 0.24 +
    clampScore(analysis.grammarAccuracy) * 0.24 +
    clampScore(analysis.toneMatch) * 0.16 +
    clampScore(analysis.vocabQuality) * 0.08;
  return round1(weighted);
}

/**
 * Aggregates real measured turn timing, composition speed, and in-time turn analysis
 * across the entire conversation.
 */
export function aggregateConversationTelemetry(params: {
  messages: ConversationMessage[];
  pace: ConversationPace;
  elapsedSeconds?: number;
}): {
  timingSummary: ConversationTimingSummary;
  turnArc: ConversationTurnArcPoint[];
  inTimeAverages: ConversationBenchmarkReport['inTimeAverages'];
} {
  const { messages, pace, elapsedSeconds = 0 } = params;
  const userMsgs = messages.filter((m) => m.role === 'user');
  const turnCount = userMsgs.length;

  const responseTimesSec: number[] = [];
  const thinkTimesSec: number[] = [];
  const wpms: number[] = [];
  const timingScores: number[] = [];

  const inTimeBuckets = {
    contextAlignment: [] as number[],
    toneMatch: [] as number[],
    grammarAccuracy: [] as number[],
    naturalness: [] as number[],
    vocabQuality: [] as number[],
  };

  let totalUserWords = 0;
  const turnArc: ConversationTurnArcPoint[] = [];

  userMsgs.forEach((msg, idx) => {
    const words =
      msg.telemetry?.wordCount ??
      msg.text
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
    totalUserWords += words;

    const respMs = msg.telemetry?.responseTimeMs;
    const thinkMs = msg.telemetry?.thinkTimeMs;
    const respSec =
      respMs && Number.isFinite(respMs) && respMs > 0
        ? round1(respMs / 1000)
        : null;
    const thinkSec =
      thinkMs && Number.isFinite(thinkMs) && thinkMs >= 0
        ? round1(thinkMs / 1000)
        : null;

    if (respSec !== null) {
      responseTimesSec.push(respSec);
    }
    if (thinkSec !== null) {
      thinkTimesSec.push(thinkSec);
    }
    if (
      msg.telemetry?.wordsPerMinute &&
      Number.isFinite(msg.telemetry.wordsPerMinute) &&
      msg.telemetry.wordsPerMinute > 0
    ) {
      wpms.push(Math.min(180, Math.round(msg.telemetry.wordsPerMinute)));
    }

    timingScores.push(
      computeTurnTimingScore({
        responseTimeMs: respMs,
        thinkTimeMs: thinkMs,
        wordCount: words,
        pace,
      })
    );

    if (msg.inTimeAnalysis) {
      inTimeBuckets.contextAlignment.push(
        clampScore(msg.inTimeAnalysis.contextAlignment)
      );
      inTimeBuckets.toneMatch.push(clampScore(msg.inTimeAnalysis.toneMatch));
      inTimeBuckets.grammarAccuracy.push(
        clampScore(msg.inTimeAnalysis.grammarAccuracy)
      );
      inTimeBuckets.naturalness.push(clampScore(msg.inTimeAnalysis.naturalness));
      inTimeBuckets.vocabQuality.push(clampScore(msg.inTimeAnalysis.vocabQuality));
    }

    const excerpt =
      msg.text.trim().length > 96
        ? `${msg.text.trim().slice(0, 93).trimEnd()}...`
        : msg.text.trim();

    turnArc.push({
      turnNumber: idx + 1,
      excerpt,
      wordCount: words,
      responseTimeSec: respSec,
      thinkTimeSec: thinkSec,
      inTimeScore: computeInTimeComposite(msg.inTimeAnalysis),
      turnNote:
        msg.inTimeAnalysis?.turnNote?.trim() ||
        (msg.recast
          ? `Phrasing opportunity noted: "${msg.recast.original}".`
          : words >= 14
            ? 'Clear, substantive conversational turn.'
            : 'Brief live reply.'),
      hasRecast: Boolean(msg.recast),
    });
  });

  const avg = (arr: number[]): number | null =>
    arr.length > 0
      ? round1(arr.reduce((a, b) => a + b, 0) / arr.length)
      : null;

  const avgResponseTimeSec = avg(responseTimesSec);
  const medianResponseTimeSec =
    responseTimesSec.length > 0 ? round1(median(responseTimesSec) ?? 0) : null;
  const fastestTurnSec =
    responseTimesSec.length > 0 ? round1(Math.min(...responseTimesSec)) : null;
  const slowestTurnSec =
    responseTimesSec.length > 0 ? round1(Math.max(...responseTimesSec)) : null;
  const avgThinkTimeSec = avg(thinkTimesSec);
  const avgWpm =
    wpms.length > 0
      ? Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length)
      : null;

  const timingCalibrationScore =
    timingScores.length > 0
      ? clampScore(
          timingScores.reduce((a, b) => a + b, 0) / timingScores.length,
          7
        )
      : 7;

  const totalDurationSec =
    elapsedSeconds > 0
      ? Math.round(elapsedSeconds)
      : Math.round(responseTimesSec.reduce((a, b) => a + b, 0));

  return {
    timingSummary: {
      turnCount,
      totalUserWords,
      avgWordsPerTurn: turnCount > 0 ? round1(totalUserWords / turnCount) : 0,
      totalDurationSec,
      avgResponseTimeSec,
      medianResponseTimeSec,
      fastestTurnSec,
      slowestTurnSec,
      avgThinkTimeSec,
      avgWpm,
      tempoBand: classifyTempoBand(timingCalibrationScore, avgResponseTimeSec),
      timingCalibrationScore,
    },
    turnArc,
    inTimeAverages: {
      contextAlignment: avg(inTimeBuckets.contextAlignment),
      toneMatch: avg(inTimeBuckets.toneMatch),
      grammarAccuracy: avg(inTimeBuckets.grammarAccuracy),
      naturalness: avg(inTimeBuckets.naturalness),
      vocabQuality: avg(inTimeBuckets.vocabQuality),
    },
  };
}

/**
 * Computes the weighted 0-100 Conversational Fluency Benchmark Index from 8 parameters.
 */
export function computeBenchmarkIndex(
  scores: ConversationBenchmarkScores
): number {
  let weightedSum = 0;
  for (const param of CONVERSATION_BENCHMARK_PARAMETERS) {
    weightedSum += clampScore(scores[param.key]) * param.weight;
  }
  // Each parameter is 1-10 and weights sum to 100, so max = 1000 -> divide by 10 for 0-100
  return Math.max(0, Math.min(100, Math.round(weightedSum / 10)));
}

export function deriveBenchmarkTier(
  benchmarkIndex: number
): ConversationBenchmarkTier {
  if (benchmarkIndex >= 88) return 'Mastery';
  if (benchmarkIndex >= 76) return 'Proficient';
  if (benchmarkIndex >= 64) return 'Operational';
  if (benchmarkIndex >= 50) return 'Developing';
  return 'Foundational';
}

/**
 * Maps the 8-parameter conversational benchmark cleanly into the core 60-point RubricScores
 * so Dashboard charts, streaks, CEFR/IELTS/TOEFL trends, and Vocabulary Mastery stay 100% unified.
 */
export function mapBenchmarkToRubricScores(
  params: ConversationBenchmarkScores
): RubricScores {
  return {
    naturalVoiceFlow: clampScore(
      Math.round(
        params.naturalnessSpokenFlow * 0.65 + params.responsivenessTempo * 0.35
      )
    ),
    claritySimplicity: clampScore(
      Math.round(
        params.contextCoherence * 0.65 + params.clarityConciseness * 0.35
      )
    ),
    grammarMechanics: clampScore(params.grammarMechanics),
    toneEngagement: clampScore(
      Math.round(
        params.toneRegister * 0.6 + params.conversationalInitiative * 0.4
      )
    ),
    sentenceVarietyCadence: clampScore(
      Math.round(
        params.naturalnessSpokenFlow * 0.55 +
          params.responsivenessTempo * 0.25 +
          params.vocabularyPrecision * 0.2
      )
    ),
    concisenessDirectness: clampScore(
      Math.round(
        params.clarityConciseness * 0.7 + params.contextCoherence * 0.3
      )
    ),
  };
}

/**
 * Calibrates AI-produced 8-parameter conversation benchmark scores against:
 * 1. Real measured response timing telemetry (grounds responsivenessTempo objectively)
 * 2. Real in-time per-turn averages collected during the live chat
 * 3. Draft integrity & anti-inflation caps (catches gibberish, spam, or tiny low-effort replies)
 */
export function calibrateConversationBenchmark(input: {
  userTurnsText: string;
  messages: ConversationMessage[];
  pace: ConversationPace;
  elapsedSeconds?: number;
  rawParameters: Partial<ConversationBenchmarkScores>;
  rawParameterNotes?: ConversationBenchmarkNotes;
  grammarFixesCount: number;
  contextVerdict?: string;
  toneVerdict?: string;
  pacingVerdict?: string;
}): {
  benchmark: ConversationBenchmarkReport;
  rubricScores: RubricScores;
  totalScore: number;
  cefrLevel: string;
  ieltsBand: number;
  toeflEquivalent: number;
  integrity: ReturnType<typeof assessDraftIntegrity>;
} {
  const integrity = assessDraftIntegrity(input.userTurnsText);
  const { timingSummary, turnArc, inTimeAverages } =
    aggregateConversationTelemetry({
      messages: input.messages,
      pace: input.pace,
      elapsedSeconds: input.elapsedSeconds,
    });

  const cap = integrity.isGibberishOrLowEffort
    ? 3
    : integrity.isUltraShort
      ? 7
      : 10;
  const applyCap = (v: number): number => {
    if (!Number.isFinite(v)) return Math.min(cap, 6);
    return Math.max(1, Math.min(cap, Math.round(v)));
  };

  // Blend AI responsiveness judgment (40%) with measured objective timing score (60%)
  const aiResp = clampScore(
    input.rawParameters.responsivenessTempo,
    timingSummary.timingCalibrationScore
  );
  const calibratedResp =
    timingSummary.avgResponseTimeSec !== null
      ? Math.round(aiResp * 0.4 + timingSummary.timingCalibrationScore * 0.6)
      : aiResp;

  // Gently anchor holistic AI scores with real in-time turn averages (80% holistic / 20% live in-time)
  const anchorWithInTime = (
    aiVal: unknown,
    inTimeAvg: number | null,
    fallback = 6
  ): number => {
    const base = clampScore(aiVal, inTimeAvg ? Math.round(inTimeAvg) : fallback);
    if (inTimeAvg === null) return base;
    return Math.round(base * 0.8 + inTimeAvg * 0.2);
  };

  let grammar = anchorWithInTime(
    input.rawParameters.grammarMechanics,
    inTimeAverages.grammarAccuracy
  );
  if (input.grammarFixesCount >= 4 && grammar > 7) {
    grammar = 7;
  } else if (input.grammarFixesCount >= 2 && grammar > 8) {
    grammar = 8;
  }

  const parameters: ConversationBenchmarkScores = {
    contextCoherence: applyCap(
      anchorWithInTime(
        input.rawParameters.contextCoherence,
        inTimeAverages.contextAlignment
      )
    ),
    naturalnessSpokenFlow: applyCap(
      anchorWithInTime(
        input.rawParameters.naturalnessSpokenFlow,
        inTimeAverages.naturalness
      )
    ),
    grammarMechanics: applyCap(grammar),
    toneRegister: applyCap(
      anchorWithInTime(input.rawParameters.toneRegister, inTimeAverages.toneMatch)
    ),
    responsivenessTempo: applyCap(calibratedResp),
    conversationalInitiative: applyCap(
      clampScore(
        input.rawParameters.conversationalInitiative,
        timingSummary.avgWordsPerTurn >= 18 ? 7 : 6
      )
    ),
    clarityConciseness: applyCap(
      clampScore(input.rawParameters.clarityConciseness, 7)
    ),
    vocabularyPrecision: applyCap(
      anchorWithInTime(
        input.rawParameters.vocabularyPrecision,
        inTimeAverages.vocabQuality
      )
    ),
  };

  const benchmarkIndex = computeBenchmarkIndex(parameters);
  const benchmarkTier = deriveBenchmarkTier(benchmarkIndex);
  const rubricScores = mapBenchmarkToRubricScores(parameters);
  const totalScore = Object.values(rubricScores).reduce((a, b) => a + b, 0);
  const { cefrLevel, ieltsBand, toeflEquivalent } =
    deriveConsistentBenchmarksFromTotal(totalScore);

  const defaultNotes: ConversationBenchmarkNotes = {
    contextCoherence:
      'Tracked the partner’s prompts and maintained conversational continuity across turns.',
    naturalnessSpokenFlow:
      'Delivered natural spoken-style replies suited for real-time text exchange.',
    grammarMechanics:
      input.grammarFixesCount > 0
        ? `Caught ${input.grammarFixesCount} real-time grammar slip${input.grammarFixesCount === 1 ? '' : 's'} worth tightening.`
        : 'Clean real-time sentence mechanics and agreement.',
    toneRegister: `Held an appropriate register for the ${input.pace} conversational pace.`,
    responsivenessTempo:
      timingSummary.avgResponseTimeSec !== null
        ? `Averaged ${timingSummary.avgResponseTimeSec}s per reply (${timingSummary.tempoBand} tempo${timingSummary.avgWpm ? ` at ${timingSummary.avgWpm} WPM` : ''}).`
        : 'Maintained steady conversational turn-taking rhythm.',
    conversationalInitiative: `Averaged ${timingSummary.avgWordsPerTurn} words across ${timingSummary.turnCount} turns.`,
    clarityConciseness: 'Kept live messages scannable and direct.',
    vocabularyPrecision:
      'Used clear everyday phrasing (vocabulary carries the lowest benchmark weightage).',
  };

  const parameterNotes: ConversationBenchmarkNotes = {};
  for (const meta of CONVERSATION_BENCHMARK_PARAMETERS) {
    const rawNote = input.rawParameterNotes?.[meta.key];
    parameterNotes[meta.key] =
      rawNote && rawNote.trim().length >= 8
        ? sanitizeCoachProse(rawNote)
        : defaultNotes[meta.key];
  }

  const pacingVerdict =
    input.pacingVerdict && input.pacingVerdict.trim().length >= 10
      ? sanitizeCoachProse(input.pacingVerdict)
      : timingSummary.avgResponseTimeSec !== null
        ? `${timingSummary.tempoBand} live pacing: averaged ${timingSummary.avgResponseTimeSec}s per reply${timingSummary.avgThinkTimeSec !== null ? ` (${timingSummary.avgThinkTimeSec}s think-to-type)` : ''}${timingSummary.avgWpm ? ` at ${timingSummary.avgWpm} WPM` : ''}.`
        : `Completed ${timingSummary.turnCount} turns totaling ${timingSummary.totalUserWords} words.`;

  const contextVerdict =
    input.contextVerdict && input.contextVerdict.trim().length >= 10
      ? sanitizeCoachProse(input.contextVerdict)
      : parameterNotes.contextCoherence || defaultNotes.contextCoherence!;

  const toneVerdict =
    input.toneVerdict && input.toneVerdict.trim().length >= 10
      ? sanitizeCoachProse(input.toneVerdict)
      : parameterNotes.toneRegister || defaultNotes.toneRegister!;

  return {
    benchmark: {
      benchmarkIndex,
      benchmarkTier,
      spokenInteractionCefr: cefrLevel,
      parameters,
      parameterNotes,
      timingSummary,
      contextVerdict,
      toneVerdict,
      pacingVerdict,
      turnArc,
      inTimeAverages,
    },
    rubricScores,
    totalScore,
    cefrLevel,
    ieltsBand,
    toeflEquivalent,
    integrity,
  };
}

/**
 * Deterministic offline conversation benchmark fallback (used strictly if backend API is unreachable).
 */
export function buildOfflineConversationBenchmark(params: {
  messages: ConversationMessage[];
  userTurnsText: string;
  pace: ConversationPace;
  elapsedSeconds: number;
  grammarFixes: GrammarFix[];
}): ReturnType<typeof calibrateConversationBenchmark> {
  const { messages, userTurnsText, pace, elapsedSeconds, grammarFixes } = params;
  const wordCount = userTurnsText.trim().split(/\s+/).filter(Boolean).length;
  const userTurnCount = messages.filter((m) => m.role === 'user').length;
  const avgWords = userTurnCount > 0 ? wordCount / userTurnCount : 0;

  const lengthBonus = avgWords >= 18 ? 1 : 0;
  const grammarPenalty = Math.min(3, grammarFixes.length);

  return calibrateConversationBenchmark({
    userTurnsText,
    messages,
    pace,
    elapsedSeconds,
    grammarFixesCount: grammarFixes.length,
    rawParameters: {
      contextCoherence: 7 + lengthBonus,
      naturalnessSpokenFlow: 7,
      grammarMechanics: Math.max(4, 8 - grammarPenalty),
      toneRegister: 7,
      conversationalInitiative: avgWords >= 16 ? 7 : 6,
      clarityConciseness: 7,
      vocabularyPrecision: 6 + lengthBonus,
    },
  });
}

/**
 * Formats the complete Conversation Benchmark Report as clean, copy-ready Markdown.
 */
export function formatConversationBenchmarkMarkdown(input: {
  scenarioTitle: string;
  partnerName: string;
  pace: ConversationPace;
  benchmark: ConversationBenchmarkReport;
  totalScore: number;
  ieltsBand: number;
  toeflEquivalent: number;
  feedbackImplemented: FeedbackImplementedStatus;
  feedbackCheck?: FeedbackImplementationDetail;
  whatImproved: string;
  whatImprovedPoints?: CoachHighlightPoint[];
  pinpointedRewrites: PinpointedRewrite[];
  vocabUpgrades: VocabSuggestion[];
}): string {
  const { benchmark } = input;
  const lines: string[] = [];

  lines.push(
    `# Conversational Fluency Benchmark: ${input.scenarioTitle} (with ${input.partnerName})`
  );
  lines.push(
    `**Benchmark Index:** ${benchmark.benchmarkIndex} / 100 (${benchmark.benchmarkTier}) · **CEFR Spoken Interaction:** ${benchmark.spokenInteractionCefr} · **IELTS:** ${input.ieltsBand.toFixed(1)} · **TOEFL:** ${input.toeflEquivalent}/30 · **Rubric:** ${input.totalScore} / 60`
  );
  lines.push('');

  const t = benchmark.timingSummary;
  lines.push('## Live Response & Pacing Telemetry');
  lines.push(
    `- **Pace Mode:** ${input.pace} | **Tempo Band:** ${t.tempoBand}`
  );
  lines.push(
    `- **Turns & Volume:** ${t.turnCount} replies · ${t.totalUserWords} words (${t.avgWordsPerTurn} words/turn)`
  );
  if (t.avgResponseTimeSec !== null) {
    lines.push(
      `- **Response Latency:** avg ${t.avgResponseTimeSec}s (median ${t.medianResponseTimeSec}s · fastest ${t.fastestTurnSec}s · slowest ${t.slowestTurnSec}s)`
    );
  }
  if (t.avgThinkTimeSec !== null || t.avgWpm !== null) {
    lines.push(
      `- **Formulation & Speed:** ${t.avgThinkTimeSec !== null ? `avg ${t.avgThinkTimeSec}s think time` : ''}${t.avgThinkTimeSec !== null && t.avgWpm !== null ? ' · ' : ''}${t.avgWpm !== null ? `${t.avgWpm} WPM live typing` : ''}`
    );
  }
  lines.push('');

  lines.push('## 8-Parameter Conversation Benchmark Scorecard');
  lines.push('| Parameter | Weight | Score | Notes |');
  lines.push('| :--- | :---: | :---: | :--- |');
  for (const meta of CONVERSATION_BENCHMARK_PARAMETERS) {
    const sc = benchmark.parameters[meta.key];
    const note = (benchmark.parameterNotes[meta.key] || '').replace(/\|/g, '/');
    lines.push(`| ${meta.label} | ${meta.weight}% | ${sc} / 10 | ${note} |`);
  }
  lines.push('');

  lines.push('## Turn-by-Turn In-Time Arc');
  for (const pt of benchmark.turnArc) {
    const timeTag =
      pt.responseTimeSec !== null ? `${pt.responseTimeSec}s` : 'unmeasured';
    const scoreTag = pt.inTimeScore !== null ? ` · in-time ${pt.inTimeScore}/10` : '';
    lines.push(
      `- **Turn ${pt.turnNumber}** (${pt.wordCount}w · ${timeTag}${scoreTag}): "${pt.excerpt}" — ${pt.turnNote}`
    );
  }
  lines.push('');

  lines.push('## Context, Tone & Pacing Verdicts');
  lines.push(`- **Context:** ${benchmark.contextVerdict}`);
  lines.push(`- **Tone:** ${benchmark.toneVerdict}`);
  lines.push(`- **Pacing:** ${benchmark.pacingVerdict}`);
  lines.push('');

  if (input.whatImprovedPoints && input.whatImprovedPoints.length > 0) {
    lines.push('## What Worked Well');
    for (const pt of input.whatImprovedPoints) {
      lines.push(`- **${pt.title}:** ${pt.detail}`);
    }
    lines.push('');
  } else if (input.whatImproved) {
    lines.push('## What Worked Well');
    lines.push(input.whatImproved);
    lines.push('');
  }

  if (input.pinpointedRewrites.length > 0) {
    lines.push('## Pinpointed Turn Fixes & Natural Rewrites');
    for (const item of input.pinpointedRewrites) {
      lines.push(`- "${item.original}"`);
      lines.push(`  - **Rewrite:** "${item.rewrite}"`);
      lines.push(`  - **Rule:** ${item.rule}`);
    }
    lines.push('');
  }

  if (input.vocabUpgrades.length > 0) {
    lines.push('## Optional Vocabulary & Phrasing Upgrades (Lowest Weightage)');
    for (const v of input.vocabUpgrades) {
      const tag = v.contextTag ? ` (${v.contextTag})` : '';
      lines.push(`- "${v.used}" → **${v.betterAlternative}**${tag}`);
    }
  }

  return lines.join('\n');
}
