import { Type } from '@google/genai';
import {
  VALID_ERROR_TAGS,
  calibrateEvaluationScores,
  filterGroundedUnifiedEdits,
  filterGroundedVocabUpgrades,
  sanitizeCoachProse,
  sanitizeFeedbackCheck,
  sanitizeMetricNotes,
  sanitizeWhatImprovedPoints,
} from '../../src/utils/evaluationCalibration';
import { deriveInternationalMetrics } from '../../src/utils/analytics';
import type {
  AudienceOption,
  CalqueFix,
  DrillVerdict,
  EditDimension,
  FeedbackImplementedStatus,
  GrammarFix,
  PinpointedRewrite,
  ProseDiagnosticsResult,
  RewrittenSample,
  ToneCheck,
  UnifiedEdit,
} from '../../src/types';
import { clampPercentage, clampScore } from './geminiCascade';

const DIMENSION_TO_CATEGORY: Record<EditDimension, string> = {
  grammar: 'Grammar & Mechanics',
  tone: 'Tone & Register',
  flow: 'Sentence Flow & Cadence',
  clarity: 'Clarity & Word Choice',
  calque: 'Idiomatic Phrasing',
};

export function buildSlimEvaluateSchema(options: {
  includeSuggestedTitle: boolean;
  includeDrillVerdict: boolean;
  includeFeedbackNote: boolean;
}): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    scores: {
      type: Type.OBJECT,
      properties: {
        naturalVoiceFlow: { type: Type.INTEGER },
        claritySimplicity: { type: Type.INTEGER },
        grammarMechanics: { type: Type.INTEGER },
        toneEngagement: { type: Type.INTEGER },
        sentenceVarietyCadence: { type: Type.INTEGER },
        concisenessDirectness: { type: Type.INTEGER },
      },
      required: [
        'naturalVoiceFlow',
        'claritySimplicity',
        'grammarMechanics',
        'toneEngagement',
        'sentenceVarietyCadence',
        'concisenessDirectness',
      ],
    },
    metricNotes: {
      type: Type.OBJECT,
      properties: {
        naturalVoiceFlow: { type: Type.STRING },
        claritySimplicity: { type: Type.STRING },
        grammarMechanics: { type: Type.STRING },
        toneEngagement: { type: Type.STRING },
        sentenceVarietyCadence: { type: Type.STRING },
        concisenessDirectness: { type: Type.STRING },
      },
      required: [
        'naturalVoiceFlow',
        'claritySimplicity',
        'grammarMechanics',
        'toneEngagement',
        'sentenceVarietyCadence',
        'concisenessDirectness',
      ],
    },
    spokenReadinessScore: { type: Type.INTEGER },
    toneCheck: {
      type: Type.OBJECT,
      properties: {
        match: {
          type: Type.STRING,
          enum: ['On Target', 'Slightly Off', 'Mismatch'],
        },
        audienceReaction: { type: Type.STRING },
        toneFix: { type: Type.STRING },
      },
      required: ['match', 'audienceReaction', 'toneFix'],
    },
    edits: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original: { type: Type.STRING },
          improved: { type: Type.STRING },
          dimension: {
            type: Type.STRING,
            enum: ['grammar', 'tone', 'flow', 'clarity', 'calque'],
          },
          errorTag: {
            type: Type.STRING,
            enum: [...VALID_ERROR_TAGS],
          },
          rule: { type: Type.STRING },
        },
        required: ['original', 'improved', 'dimension', 'errorTag', 'rule'],
      },
    },
    vocabUpgrades: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          used: { type: Type.STRING },
          betterAlternative: { type: Type.STRING },
          explanation: { type: Type.STRING },
          contextTag: { type: Type.STRING },
        },
        required: ['used', 'betterAlternative', 'explanation', 'contextTag'],
      },
    },
    strengths: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ['title', 'detail'],
      },
    },
    nextDraftPriority: { type: Type.STRING },
    feedbackStatus: {
      type: Type.STRING,
      enum: ['Baseline', 'Yes', 'Partial', 'No'],
    },
  };

  const required: string[] = [
    'scores',
    'metricNotes',
    'spokenReadinessScore',
    'toneCheck',
    'edits',
    'vocabUpgrades',
    'strengths',
    'nextDraftPriority',
    'feedbackStatus',
  ];

  if (options.includeFeedbackNote) {
    properties.feedbackNote = { type: Type.STRING };
    required.push('feedbackNote');
  }

  if (options.includeSuggestedTitle) {
    properties.suggestedTitle = { type: Type.STRING };
    required.push('suggestedTitle');
  }

  if (options.includeDrillVerdict) {
    properties.drillVerdict = {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING },
        summary: { type: Type.STRING },
        badge: { type: Type.STRING },
        registerShiftScore: { type: Type.INTEGER },
      },
      required: ['headline', 'summary'],
    };
    required.push('drillVerdict');
  }

  return {
    type: Type.OBJECT,
    properties,
    required,
  };
}

export function buildSlimEvaluateSystemInstruction(params: {
  studentDescriptor: string;
  mode: string;
  tone: string;
  targetAudience: string;
  shouldInferTitle: boolean;
  hasPreviousSummary: boolean;
  drillInstructionBlock: string;
  fencedPreferences: string;
}): string {
  return `Strict senior writing & spoken-English coach evaluating a ${params.studentDescriptor} (${params.mode} · ${params.tone} · Audience: ${params.targetAudience}). Honest, uninflated human-editor judgment.

RUBRIC (1-10 integers, ZERO inflation):
| Band | Standard |
| 1-2 | Gibberish, spam, or broken fragments |
| 3-4 | Off-topic stub or grammar obscuring meaning |
| 5 | Understandable core idea; flat, repetitive, or error-prone |
| 6 | Clear logic held back by agreement slips, 40+ word run-ons, or wordiness |
| 7 | Solid, natural spoken communication; minor polish only |
| 8 | Crisp, rhythmic prose tailored cleanly to ${params.mode} (${params.tone}) |
| 9-10 | Rare, executive-interview or publication-grade voice |

OUTPUT CONTRACT (compact, verbatim-grounded):
1. scores + metricNotes: 1-10 integers; <=14-word draft-specific note per metric.
2. spokenReadinessScore (0-100): Natural spoken cadence; deduct for stiff textbook phrasing or calques ("revert back", "discuss about", "prepone", "cope up with").
3. toneCheck: match ('On Target'|'Slightly Off'|'Mismatch'), 1 sharp audienceReaction from a real ${params.targetAudience}, 1 concrete toneFix.
4. edits (2-6 items): Exact VERBATIM substring from draft -> natural spoken improved rewrite, dimension, standardized errorTag, and 1-sentence transferable rule. Catch subject-verb slips, tense shifts, wrong word choice, articles, run-ons, fillers, and calques.
5. vocabUpgrades (2-3 items, LOWEST weightage): Grounded plain-English upgrades only. NEVER penalize clear plain English. STRICTLY BAN: utilize, delve, tapestry, myriad, plethora, endeavor, commence, facilitate, synergy, leverage, paramount.
6. strengths (2 items): { title, detail } quoting what genuinely worked.
7. nextDraftPriority: 1 concrete imperative habit for the very next draft.
8. feedbackStatus: ${params.hasPreviousSummary ? "'Yes'|'Partial'|'No' + concise feedbackNote citing what stuck or slipped." : "'Baseline' (no prior session)."}
${params.shouldInferTitle ? '9. suggestedTitle: Sharp 3-7 word editorial title (no em-dashes).' : ''}${params.drillInstructionBlock}${params.fencedPreferences ? `\n${params.fencedPreferences}` : ''}`;
}

function mergeCalqueFixesFromEdits(
  localFixes: CalqueFix[],
  edits: UnifiedEdit[]
): CalqueFix[] {
  const merged: CalqueFix[] = [...localFixes];
  const seen = new Set(localFixes.map((f) => f.phrase.toLowerCase()));

  for (const edit of edits) {
    if (edit.dimension !== 'calque' && edit.errorTag !== 'regional-calque') continue;
    const key = edit.original.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      phrase: edit.original,
      naturalAlternative: edit.improved,
      reason: edit.rule || 'More natural everyday English phrasing.',
    });
    if (merged.length >= 6) break;
  }

  return merged;
}

export function mapSlimEvaluateResponse(params: {
  parsed: Record<string, unknown>;
  trimmedContent: string;
  trimmedTopic: string;
  targetAudience: AudienceOption;
  previousSessionSummary: string;
  localDiagnostics: ProseDiagnosticsResult;
  drillContext?: {
    drillType?: string;
    drillPayload?: Record<string, unknown>;
  };
}) {
  const {
    parsed,
    trimmedContent,
    trimmedTopic,
    targetAudience,
    previousSessionSummary,
    localDiagnostics,
    drillContext,
  } = params;

  const rawScores = (parsed.scores ?? {}) as Record<string, unknown>;
  const uncalibratedScores = {
    naturalVoiceFlow: clampScore(rawScores.naturalVoiceFlow),
    claritySimplicity: clampScore(rawScores.claritySimplicity),
    grammarMechanics: clampScore(rawScores.grammarMechanics),
    toneEngagement: clampScore(rawScores.toneEngagement),
    sentenceVarietyCadence: clampScore(rawScores.sentenceVarietyCadence),
    concisenessDirectness: clampScore(rawScores.concisenessDirectness),
  };

  const rawEdits = Array.isArray(parsed.edits)
    ? (parsed.edits as Array<Partial<UnifiedEdit>>)
    : [];
  const groundedEdits = filterGroundedUnifiedEdits(trimmedContent, rawEdits);

  const groundedVocab = filterGroundedVocabUpgrades(
    trimmedContent,
    Array.isArray(parsed.vocabUpgrades)
      ? (parsed.vocabUpgrades as Parameters<typeof filterGroundedVocabUpgrades>[1])
      : []
  );

  const calibrated = calibrateEvaluationScores({
    content: trimmedContent,
    scores: uncalibratedScores,
    grammarFixesCount: groundedEdits.filter(
      (e) =>
        e.dimension === 'grammar' ||
        e.errorTag === 'subject-verb' ||
        e.errorTag === 'tense-shift' ||
        e.errorTag === 'article-preposition' ||
        e.errorTag === 'punctuation-spacing'
    ).length,
  });

  const isGibberish = calibrated.integrity.isGibberishOrLowEffort;

  // Deterministic server-side derivation of all international benchmarks (zero extra LLM tokens)
  const derivedIntl = deriveInternationalMetrics({
    scores: calibrated.scores,
    content: trimmedContent,
  });

  const internationalMetrics = {
    ...derivedIntl,
    ieltsBand: calibrated.ieltsBand,
    toeflEquivalent: calibrated.toeflEquivalent,
    lexicalResource: isGibberish
      ? Math.min(2, Math.round(derivedIntl.lexicalResource))
      : Math.round(derivedIntl.lexicalResource),
    coherenceCohesion: isGibberish
      ? Math.min(2, Math.round(derivedIntl.coherenceCohesion))
      : Math.round(derivedIntl.coherenceCohesion),
    taskAchievement: isGibberish
      ? Math.min(2, Math.round(derivedIntl.taskAchievement))
      : Math.round(derivedIntl.taskAchievement),
    registerControl: isGibberish
      ? Math.min(2, calibrated.scores.toneEngagement)
      : calibrated.scores.toneEngagement,
    grammarAccuracy: calibrated.scores.grammarMechanics,
  };

  // Backwards-compatible mapping from unified edits[]
  const pinpointedRewrites: PinpointedRewrite[] = groundedEdits.map((e) => ({
    original: e.original,
    rewrite: e.improved,
    rule: e.rule,
    category: DIMENSION_TO_CATEGORY[e.dimension],
    dimension: e.dimension,
    errorTag: e.errorTag,
  }));

  const grammarFixes: GrammarFix[] = groundedEdits.map((e) => ({
    original: e.original,
    corrected: e.improved,
    rule: e.rule,
    category: DIMENSION_TO_CATEGORY[e.dimension],
    errorTag: e.errorTag,
  }));

  const calqueFixes = mergeCalqueFixesFromEdits(
    localDiagnostics.calqueFixes,
    groundedEdits
  );

  const rewrittenSample: RewrittenSample | undefined = groundedEdits[0]
    ? {
        original: groundedEdits[0].original,
        improved: groundedEdits[0].improved,
        why: groundedEdits[0].rule,
      }
    : undefined;

  const metricNotes = sanitizeMetricNotes(
    parsed.metricNotes as Record<string, unknown> | undefined
  );

  const strengths = sanitizeWhatImprovedPoints(
    (Array.isArray(parsed.strengths) ? parsed.strengths : []) as Array<{
      title?: unknown;
      detail?: unknown;
    }>
  );

  const whatImproved =
    strengths.length > 0
      ? strengths.map((s) => `${s.title}: ${s.detail}`).join(' ')
      : isGibberish
        ? 'Draft requires coherent sentences before strengths can be identified.'
        : 'Clear underlying intent; refine the pinpointed lines below to lift cadence and precision.';

  const rawToneCheck =
    parsed.toneCheck && typeof parsed.toneCheck === 'object'
      ? (parsed.toneCheck as Record<string, unknown>)
      : {};
  const toneMatch =
    rawToneCheck.match === 'On Target' ||
    rawToneCheck.match === 'Slightly Off' ||
    rawToneCheck.match === 'Mismatch'
      ? rawToneCheck.match
      : calibrated.scores.toneEngagement >= 7
        ? 'On Target'
        : calibrated.scores.toneEngagement >= 5
          ? 'Slightly Off'
          : 'Mismatch';

  const audienceReaction =
    sanitizeCoachProse(String(rawToneCheck.audienceReaction || '')).slice(0, 380) ||
    `As a ${targetAudience}, the core point lands cleanly, though tightening one or two verbose phrases would sharpen authority.`;
  const toneFix =
    sanitizeCoachProse(String(rawToneCheck.toneFix || '')).slice(0, 240) ||
    'Keep sentence openings direct and match your register to the target reader.';

  const toneCheck: ToneCheck = {
    match: toneMatch,
    audienceReaction,
    toneFix,
  };

  const nextDraftPriority =
    sanitizeCoachProse(String(parsed.nextDraftPriority || '')).slice(0, 360) ||
    (groundedEdits[0]
      ? `Apply this rule on your next draft: ${groundedEdits[0].rule}`
      : 'Keep sentences crisp and concrete with active verbs.');

  const rawFeedbackStatus = String(parsed.feedbackStatus || '');
  const validImpl = (
    ['Baseline', 'Yes', 'Partial', 'No'].includes(rawFeedbackStatus)
      ? rawFeedbackStatus
      : previousSessionSummary.trim()
        ? 'Partial'
        : 'Baseline'
  ) as FeedbackImplementedStatus;

  const feedbackNote = sanitizeCoachProse(String(parsed.feedbackNote || '')).slice(0, 360);
  const feedbackCheck = sanitizeFeedbackCheck({
    status: validImpl,
    raw: {
      implemented:
        validImpl === 'Baseline'
          ? 'Baseline session captured; future drafts will track your follow-through on next-draft priorities.'
          : feedbackNote || whatImproved,
      missed:
        validImpl === 'Yes'
          ? 'Previous priority applied cleanly. Carry your new priority below into the next session.'
          : nextDraftPriority,
    },
    fallbackImplemented: whatImproved,
  });

  const aiSpoken = clampPercentage(
    parsed.spokenReadinessScore,
    localDiagnostics.baselineSpokenReadiness
  );
  const spokenReadinessScore = isGibberish
    ? Math.min(25, aiSpoken)
    : Math.max(
        15,
        Math.min(
          99,
          Math.round(aiSpoken * 0.75 + localDiagnostics.baselineSpokenReadiness * 0.25)
        )
      );

  const suggestedTitle =
    sanitizeCoachProse(
      String(parsed.suggestedTitle || '')
        .replace(/^["']+|["']+$/g, '')
        .trim()
    ).slice(0, 72) || trimmedTopic;

  let drillVerdict: DrillVerdict | undefined;
  const hasDrill = Boolean(
    drillContext &&
      ((drillContext.drillType && drillContext.drillType !== 'standard') ||
        drillContext.drillPayload?.constraintLabel)
  );
  if (hasDrill) {
    const rawVerdict =
      parsed.drillVerdict && typeof parsed.drillVerdict === 'object'
        ? (parsed.drillVerdict as Record<string, unknown>)
        : null;
    if (rawVerdict && typeof rawVerdict.headline === 'string' && rawVerdict.headline.trim()) {
      drillVerdict = {
        headline: sanitizeCoachProse(rawVerdict.headline).slice(0, 140),
        summary: sanitizeCoachProse(String(rawVerdict.summary || '')).slice(0, 420),
        badge:
          typeof rawVerdict.badge === 'string' && rawVerdict.badge.trim()
            ? sanitizeCoachProse(rawVerdict.badge).slice(0, 48)
            : undefined,
        registerShiftScore:
          typeof rawVerdict.registerShiftScore === 'number'
            ? clampPercentage(rawVerdict.registerShiftScore, 75)
            : undefined,
      };
    }
  }

  const toneVerdict = `${toneCheck.match}: ${toneCheck.toneFix}`;
  const flowVerdict =
    metricNotes.naturalVoiceFlow ||
    `${localDiagnostics.wordCount} words across ${localDiagnostics.sentenceCount} sentences (Signal-to-Noise ${localDiagnostics.signalNoiseRatio}%).`;

  return {
    suggestedTitle,
    spokenReadinessScore,
    signalNoiseRatio: localDiagnostics.signalNoiseRatio,
    audienceReaction: toneCheck.audienceReaction,
    audience: targetAudience,
    toneCheck,
    calqueFixes,
    drillVerdict,
    scores: calibrated.scores,
    metricNotes,
    cefrLevel: calibrated.cefrLevel,
    internationalMetrics,
    toneVerdict,
    flowVerdict,
    feedbackImplemented: validImpl,
    feedbackCheck,
    whatImproved,
    whatImprovedPoints: strengths,
    strictImprovements: nextDraftPriority,
    nextDraftPriority,
    edits: groundedEdits,
    pinpointedRewrites,
    rewrittenSample,
    masteredWordsUsed: [] as string[],
    grammarFixes,
    vocabUpgrades: groundedVocab,
  };
}
