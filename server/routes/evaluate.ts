import { Router } from 'express';
import { Type } from '@google/genai';
import {
  assessDraftIntegrity,
  calibrateEvaluationScores,
  filterGroundedGrammarFixes,
  filterGroundedPinpointedRewrites,
  filterGroundedVocabUpgrades,
  sanitizeCoachProse,
  sanitizeFeedbackCheck,
  sanitizeMetricNotes,
  sanitizeRewrittenSample,
  sanitizeWhatImprovedPoints,
} from '../../src/utils/evaluationCalibration';
import { selectDynamicEvaluationRoute } from '../../src/utils/evaluationRouter';
import {
  aggregateConversationTelemetry,
  calibrateConversationBenchmark,
} from '../../src/utils/conversationBenchmark';
import {
  buildFencedCoachPreferences,
  computeProseDiagnostics,
} from '../../src/utils/proseDiagnostics';
import type {
  CalqueFix,
  CoachPresetId,
  ConversationBenchmarkScores,
  ConversationMessage,
  ConversationPace,
  ConversationScenario,
  DrillVerdict,
} from '../../src/types';
import {
  buildServerQueuedEvaluation,
  clampPercentage,
  clampScore,
  executeDynamicEvaluationCall,
  getRemainingCooldownSeconds,
  isQuotaOrOverloadError,
  isTimeoutError,
  makeCacheKey,
  modelCooldownUntil,
  modelUnsupportedUntil,
} from '../lib/geminiCascade';
import {
  EvaluateRequestSchema,
  buildErrorEnvelope,
  createRequestId,
} from '../lib/validation';

function buildDrillInstructionBlock(drillContext?: {
  drillType?: string;
  drillPayload?: Record<string, unknown>;
}): string {
  if (!drillContext || !drillContext.drillType || drillContext.drillType === 'standard') {
    const payload = drillContext?.drillPayload;
    if (payload?.constraintLabel) {
      const scoreTag =
        typeof payload.constraintAdherenceScore === 'number'
          ? `, Adherence ${payload.constraintAdherenceScore}%`
          : '';
      const excerpts =
        Array.isArray(payload.constraintExcerpts) &&
        payload.constraintExcerpts.length > 0
          ? ` Flagged spans: ${(payload.constraintExcerpts as string[])
              .slice(0, 4)
              .join('; ')}.`
          : '';
      const ruleNote = payload.constraintRule
        ? ` Rule: ${String(payload.constraintRule)}.`
        : '';
      return `\nACTIVE CONSTRAINT MICRO-CHALLENGE: "${String(payload.constraintLabel)}"${ruleNote} (Deterministic check: ${
        payload.constraintPassed
          ? `PASSED · 0 violations${scoreTag}`
          : `${Number(payload.constraintViolations || 1)} violation(s)${scoreTag}`
      }).${excerpts} Briefly acknowledge their exact constraint discipline in drillVerdict without inflating or distorting the 6 core scores.`;
    }
    return '';
  }

  const p = drillContext.drillPayload ?? {};

  if (drillContext.drillType === 'compression-432') {
    const counts = Array.isArray(p.roundWordCounts) ? p.roundWordCounts : [];
    const rounds = Array.isArray(p.rounds) ? p.rounds : [];
    return `\nDRILL CONTEXT (4/3/2 COMPRESSION SPRINT):
The writer explained the same idea across 3 shrinking rounds (${counts.join('w -> ') || 'R1 -> R2 -> R3'}).
Round 1 (Explore): ${String(rounds[0] || '').slice(0, 900)}
Round 2 (Tighten): ${String(rounds[1] || '').slice(0, 700)}
Primary Graded Draft below is Round 3 (Pure Signal).
Grade how cleanly Round 3 kept the core logic while stripping filler, and fill drillVerdict with a sharp headline + 1-2 sentence comparisonNote.`;
  }

  if (drillContext.drillType === 'skeleton') {
    return `\nDRILL CONTEXT (BENJAMIN FRANKLIN SKELETON RECONSTRUCTION):
Master Model Passage ("${String(p.skeletonTitle || 'Model')}"):
"""
${String(p.masterPassage || '').slice(0, 1200)}
"""
Compare verb precision, cadence, and sentence-ending punch between the writer's reconstruction (Draft below) and the Master Model without rewarding rote copying. Fill drillVerdict.headline and drillVerdict.summary with the sharpest structural takeaway.`;
  }

  if (drillContext.drillType === 'three-rooms') {
    return `\nDRILL CONTEXT (3 ROOMS AUDIENCE LADDER):
Room A (Curious 10-Year-Old — plain analogy, zero jargon):
"""
${String(p.roomA || '').slice(0, 1200)}
"""
Room B (Skeptical Senior Interviewer — crisp mechanism & trade-off):
"""
${String(p.roomB || '').slice(0, 1200)}
"""
Evaluate BOTH clarity and genuine register contrast. Return drillVerdict with registerShiftScore (0-100 integer confirming whether they adapted voice rather than copy-pasting) + concise headline & summary.`;
  }

  if (drillContext.drillType === 'time-capsule') {
    return `\nDRILL CONTEXT (BLIND TIME CAPSULE COMPARATIVE RETEST):
Original Past Draft (${String(p.pastDate || 'earlier')} · previous score ${Number(p.pastScore || 0)}/60):
"""
${String(p.pastDraft || '').slice(0, 1800)}
"""
The writer re-answered this exact past topic blind today (Draft below).
1. Grade today's draft strictly and independently on its own merits (zero score inflation!).
2. Compare the Past Draft vs. Today's Rewrite across writing aesthetics: sentence cadence & rhythm, clarity & conciseness, vocabulary precision, structural flow, and natural voice confidence.
3. Populate drillVerdict with:
   - badge: crisp 2-4 word aesthetic evolution label (e.g. "Sharper Cadence", "Cleaner Restraint", "Stronger Voice")
   - headline: one punchy sentence naming the clearest aesthetic shift between the past draft and today's rewrite
   - summary: 2-3 specific, grounded sentences comparing how today's writing aesthetics (rhythm, word choice, clarity, or restraint) improved or regressed relative to the original draft, citing concrete differences.`;
  }

  return '';
}

function mergeCalqueFixes(
  localFixes: CalqueFix[],
  aiRaw: unknown
): CalqueFix[] {
  const merged: CalqueFix[] = [...localFixes];
  const seen = new Set(localFixes.map((f) => f.phrase.toLowerCase()));

  if (Array.isArray(aiRaw)) {
    for (const item of aiRaw) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const phrase = String(obj.phrase ?? '').trim();
      const naturalAlternative = sanitizeCoachProse(
        String(obj.naturalAlternative ?? '')
      );
      const reason = sanitizeCoachProse(String(obj.reason ?? ''));
      if (!phrase || !naturalAlternative) continue;
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        phrase,
        naturalAlternative,
        reason: reason || 'More natural everyday English phrasing.',
      });
      if (merged.length >= 6) break;
    }
  }

  return merged;
}

export function createEvaluateRouter(): Router {
  const router = Router();

  router.post('/api/evaluate', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const validated = EvaluateRequestSchema.safeParse(req.body ?? {});

    if (!validated.success) {
      const msg =
        validated.error.issues[0]?.message ||
        'Please write at least 20 characters before requesting an evaluation.';
      res.status(400).json(
        buildErrorEnvelope({
          code: 'INVALID_INPUT',
          message: msg,
          retryable: false,
          requestId,
          startedAtMs: startedAt,
        })
      );
      return;
    }

    const {
      content: trimmedContent,
      mode,
      tone,
      topic: rawTopic,
      needsAutoTitle,
      previousSessionSummary,
      practicingVocab,
      topicPrimer,
      studentProfile,
      conversationContext,
      audience,
      customCoachPrompt,
      coachPresets,
      drillContext,
    } = validated.data;

    const trimmedTopic = rawTopic.trim();
    const shouldInferTitle = Boolean(needsAutoTitle) || trimmedTopic.length === 0;
    const integrity = assessDraftIntegrity(trimmedContent);
    const localDiagnostics = computeProseDiagnostics(trimmedContent);
    const wordCount = integrity.wordCount;
    const vocabList = practicingVocab.slice(0, 12).map(String);
    const targetAudience =
      audience ||
      (mode.toLowerCase().includes('technical')
        ? 'Interviewer'
        : mode.toLowerCase().includes('linkedin')
          ? 'LinkedIn Reader'
          : mode.toLowerCase().includes('email')
            ? 'Hiring Manager'
            : mode.toLowerCase().includes('friend')
              ? 'Friend'
              : 'Interviewer');

    const fencedPreferences = buildFencedCoachPreferences({
      customCoachPrompt,
      coachPresets: coachPresets as CoachPresetId[] | undefined,
    });

    const drillInstructionBlock = buildDrillInstructionBlock(drillContext);

    const studentDescriptor =
      studentProfile && typeof studentProfile.collegeDegree === 'string' && studentProfile.collegeDegree
        ? `${String(studentProfile.semester || 'college')} ${studentProfile.collegeDegree} student${studentProfile.collegeName ? ` at ${String(studentProfile.collegeName)}` : ''}`
        : 'focused writer';

    const routePlan = selectDynamicEvaluationRoute({
      wordCount,
      mode: String(mode),
      tone: String(tone),
      topic: trimmedTopic,
      topicPrimer: typeof topicPrimer === 'string' ? topicPrimer : '',
      longestSentenceWords: integrity.longestSentenceWords,
      hasPreviousSessionSummary: previousSessionSummary.trim().length > 0,
      practicingVocabCount: vocabList.length,
      isGibberishOrLowEffort: integrity.isGibberishOrLowEffort,
      cooldownUntil: modelCooldownUntil,
      unsupportedUntil: modelUnsupportedUntil,
    });

    const cacheKey = makeCacheKey('evaluate-coach-v7', {
      content: trimmedContent,
      mode,
      tone,
      topic: trimmedTopic,
      targetAudience,
      shouldInferTitle,
      previousSessionSummary: previousSessionSummary.slice(0, 260),
      vocabList,
      studentDescriptor,
      fencedPreferences,
      drillType: drillContext?.drillType || 'standard',
      routePrimary: `${routePlan.primary.model}:${routePlan.primary.thinkingLabel}`,
    });

    const systemInstruction = `You are a strict, perceptive senior writing coach and spoken-English fluency mentor evaluating a ${studentDescriptor}.
Deliver an authoritative, deeply insightful editorial critique in the exact caliber of a top human writing mentor—never generic, never robotic, and never inflated.

EVALUATION PRIORITY & WEIGHTAGE ORDER:
1. SCORECARD & RUBRIC ACCURACY (Highest Weightage): Natural Voice & Flow, Clarity & Simplicity, Grammar & Mechanics, Tone & Engagement, Sentence Variety & Cadence, and Conciseness & Directness. Plain, crisp, natural spoken English scores HIGH.
2. PINPOINTED GRAMMAR FLAWS, ERROR CORRECTIONS & SENTENCE REWRITES (Primary Coaching Value): Catch real subject-verb agreement errors, wrong word usage (e.g., "improvise" instead of "improve/stabilize"), compound-word/spacing typos, missing articles, tense breaks, 40-50 word breathless run-ons, and phrase repetition. Quote the writer's exact flawed sentences and provide natural spoken-ready rewrites + crystal-clear grammar/cadence rules.
3. SPOKEN-READINESS, CALQUES & READER GUT-REACTION:
   - spokenReadinessScore (0-100 integer): How natural, confident, and idiomatic this sounds spoken out loud. Deduct for stiff textbook transitions, robotic phrasing, or literal/regional calques (e.g., "revert back", "discuss about", "do a mistake", "prepone", "cope up with").
   - calqueFixes: Flag any stiff textbook phrases or non-native calques verbatim from the draft with crisp idiomatic alternatives (return [] if none exist).
   - audienceReaction: Exactly ONE sharp, honest 1-sentence gut-reaction from the perspective of a real **${targetAudience}** reading or hearing this draft right now (concrete, specific to this text, zero generic praise).
4. ALTERNATIVE VOCABULARY & PHRASING UPGRADES (LOWEST WEIGHTAGE): Vocabulary polish is a bonus layer ONLY. Never penalize clear plain English for not using fancy words. Suggest 2-4 crisp, natural real-world upgrades for vague/wordy phrases that actually appear in the draft. STRICTLY BANNED thesaurus-slop words: utilize, delve, tapestry, myriad, plethora, endeavor, commence, facilitate, synergy, leverage, paramount.

SCORING RUBRIC (1-10 integers, honest strict grading with ZERO score inflation):
- 1-2: Gibberish, random keystrokes, spam, or unintelligible fragments.
- 3-4: Severely off-topic, incomplete stub, or broken grammar that obscures meaning.
- 5: Understandable core idea, but flat, repetitive, or heavily error-prone.
- 6: Clear underlying logic and good intent, yet held back by noticeable grammar/agreement slips, breathless 40+ word sentences, or repeated words.
- 7: Solid, well-structured, natural spoken communication with only minor polish needed.
- 8: Crisp, confident, rhythmic prose tailored cleanly to ${mode} (${tone}) that sounds effortless out loud.
- 9-10: Rare, memorable, publication- or executive-interview-ready command of voice and precision.

STRICT OUTPUT REQUIREMENTS:
1. metricNotes: Sharp 1-sentence note for EACH of the 6 metrics referencing specific evidence from THIS draft.
2. feedbackCheck: status ('Baseline' | 'Yes' | 'Partial' | 'No'), implemented, missed.
3. whatImprovedPoints: 2-3 crisp highlight bullets (title + detail quoting draft) plus summary in whatImproved.
4. pinpointedRewrites: 2-5 verbatim sentence-level critique blocks (original copied verbatim, rewrite, rule, category).
5. grammarFixes: Up to 6 surgical verbatim substring fixes (original MUST exist verbatim in draft). If clean, return [].
6. rewrittenSample: Mirror the #1 highest-impact item from pinpointedRewrites into { original, improved, why }.
7. strictImprovements: 1-2 tight imperative coaching priorities.
8. vocabUpgrades: 2-4 grounded pairs from the draft (lowest weightage).
9. Title: ${shouldInferTitle ? 'The writer left the title blank: craft a sharp 3-7 word editorial title in suggestedTitle.' : 'Echo or lightly sharpen the existing topic in suggestedTitle.'}
10. Benchmarks: Keep cefrLevel, ieltsBand (4.0-9.0 in 0.5 steps), toeflEquivalent (8-30), lexicalResource, coherenceCohesion, taskAchievement, and registerControl mathematically aligned with the 6 scores.
${drillInstructionBlock}
${fencedPreferences ? `\n${fencedPreferences}` : ''}`;

    const convContextBlock =
      conversationContext &&
      typeof conversationContext === 'object' &&
      typeof conversationContext.dialogueTranscript === 'string' &&
      conversationContext.dialogueTranscript.trim().length > 0
        ? `LIVE CONVERSATION CONTEXT: This session is a real-time ${Number(conversationContext.turnCount) || 2}-turn text conversation with ${String(conversationContext.partnerName || 'a conversation partner')} ("${String(conversationContext.scenarioTitle || trimmedTopic)}"). Grade ONLY the learner's own turns in "Draft" below.
Full Dialogue Reference:
"""
${String(conversationContext.dialogueTranscript).slice(0, 3200)}
"""
`
        : '';

    const prompt = `Mode: ${mode} | Tone: ${tone} | Target Audience: ${targetAudience} | Word Count: ${wordCount} | Longest Sentence: ${integrity.longestSentenceWords}w | Local Signal-to-Noise: ${localDiagnostics.signalNoiseRatio}%
Topic: ${trimmedTopic || '(blank - infer sharp editorial title)'}
${topicPrimer ? `Topic Brief: ${topicPrimer}\n` : ''}${previousSessionSummary ? `Previous Coaching Note: ${previousSessionSummary}\n` : ''}${vocabList.length > 0 ? `To Practice Vocabulary Targets: ${vocabList.join(', ')}\n` : ''}${convContextBlock}Draft:
"""
${trimmedContent}
"""`;

    try {
      const { parsed, stepUsed, downgraded, cached, latencyMs } =
        await executeDynamicEvaluationCall({
          cacheKey,
          contents: prompt,
          systemInstruction,
          cascade: routePlan.cascade,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedTitle: { type: Type.STRING },
              spokenReadinessScore: { type: Type.INTEGER },
              audienceReaction: { type: Type.STRING },
              calqueFixes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    phrase: { type: Type.STRING },
                    naturalAlternative: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['phrase', 'naturalAlternative', 'reason'],
                },
              },
              drillVerdict: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  registerShiftScore: { type: Type.INTEGER },
                },
                required: ['headline', 'summary'],
              },
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
              cefrLevel: { type: Type.STRING },
              ieltsBand: { type: Type.NUMBER },
              toeflEquivalent: { type: Type.INTEGER },
              lexicalResource: { type: Type.INTEGER },
              coherenceCohesion: { type: Type.INTEGER },
              taskAchievement: { type: Type.INTEGER },
              registerControl: { type: Type.INTEGER },
              toneVerdict: { type: Type.STRING },
              flowVerdict: { type: Type.STRING },
              feedbackImplemented: { type: Type.STRING },
              feedbackCheck: {
                type: Type.OBJECT,
                properties: {
                  implemented: { type: Type.STRING },
                  missed: { type: Type.STRING },
                },
                required: ['implemented', 'missed'],
              },
              whatImproved: { type: Type.STRING },
              whatImprovedPoints: {
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
              strictImprovements: { type: Type.STRING },
              pinpointedRewrites: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    rewrite: { type: Type.STRING },
                    rule: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['original', 'rewrite', 'rule', 'category'],
                },
              },
              rewrittenSample: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  improved: { type: Type.STRING },
                  why: { type: Type.STRING },
                },
                required: ['original', 'improved', 'why'],
              },
              masteredWordsUsed: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              grammarFixes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    corrected: { type: Type.STRING },
                    rule: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['original', 'corrected', 'rule', 'category'],
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
                    contextSnippet: { type: Type.STRING },
                    contextTag: { type: Type.STRING },
                  },
                  required: [
                    'used',
                    'betterAlternative',
                    'explanation',
                    'contextSnippet',
                    'contextTag',
                  ],
                },
              },
            },
            required: [
              'suggestedTitle',
              'spokenReadinessScore',
              'audienceReaction',
              'scores',
              'metricNotes',
              'cefrLevel',
              'ieltsBand',
              'toeflEquivalent',
              'lexicalResource',
              'coherenceCohesion',
              'taskAchievement',
              'registerControl',
              'toneVerdict',
              'flowVerdict',
              'feedbackImplemented',
              'feedbackCheck',
              'whatImproved',
              'whatImprovedPoints',
              'strictImprovements',
              'pinpointedRewrites',
              'rewrittenSample',
              'grammarFixes',
              'vocabUpgrades',
            ],
          },
        });

      const rawScores = (parsed.scores ?? {}) as Record<string, unknown>;
      const uncalibratedScores = {
        naturalVoiceFlow: clampScore(rawScores.naturalVoiceFlow),
        claritySimplicity: clampScore(rawScores.claritySimplicity),
        grammarMechanics: clampScore(rawScores.grammarMechanics),
        toneEngagement: clampScore(rawScores.toneEngagement),
        sentenceVarietyCadence: clampScore(rawScores.sentenceVarietyCadence),
        concisenessDirectness: clampScore(rawScores.concisenessDirectness),
      };

      const groundedFixes = filterGroundedGrammarFixes(
        trimmedContent,
        Array.isArray(parsed.grammarFixes)
          ? (parsed.grammarFixes as Parameters<typeof filterGroundedGrammarFixes>[1])
          : []
      );

      const groundedPinpoints = filterGroundedPinpointedRewrites(
        trimmedContent,
        Array.isArray(parsed.pinpointedRewrites)
          ? (parsed.pinpointedRewrites as Parameters<
              typeof filterGroundedPinpointedRewrites
            >[1])
          : []
      );

      const groundedVocab = filterGroundedVocabUpgrades(
        trimmedContent,
        Array.isArray(parsed.vocabUpgrades)
          ? (parsed.vocabUpgrades as Parameters<typeof filterGroundedVocabUpgrades>[1])
          : []
      );

      const groundedRewrite =
        sanitizeRewrittenSample(
          trimmedContent,
          parsed.rewrittenSample as
            | { original: string; improved: string; why: string }
            | undefined
        ) ??
        (groundedPinpoints[0]
          ? {
              original: groundedPinpoints[0].original,
              improved: groundedPinpoints[0].rewrite,
              why: groundedPinpoints[0].rule,
            }
          : undefined);

      const calibrated = calibrateEvaluationScores({
        content: trimmedContent,
        scores: uncalibratedScores,
        grammarFixesCount: Math.max(groundedFixes.length, groundedPinpoints.length),
        rawIeltsBand: Number(parsed.ieltsBand),
        rawToefl: Number(parsed.toeflEquivalent),
      });

      const validImpl = (
        ['Baseline', 'Yes', 'Partial', 'No'].includes(
          String(parsed.feedbackImplemented)
        )
          ? String(parsed.feedbackImplemented)
          : previousSessionSummary
            ? 'Partial'
            : 'Baseline'
      ) as 'Baseline' | 'Yes' | 'Partial' | 'No';

      const metricNotes = sanitizeMetricNotes(
        parsed.metricNotes as Record<string, unknown> | undefined
      );
      const whatImprovedPoints = sanitizeWhatImprovedPoints(
        parsed.whatImprovedPoints as
          | Array<{ title?: unknown; detail?: unknown }>
          | undefined
      );
      const feedbackCheck = sanitizeFeedbackCheck({
        status: validImpl,
        raw: parsed.feedbackCheck as
          | { implemented?: unknown; missed?: unknown }
          | undefined,
        fallbackImplemented: String(parsed.whatImproved || ''),
      });

      const suggestedTitle = sanitizeCoachProse(
        String(parsed.suggestedTitle || '')
          .replace(/^["']+|["']+$/g, '')
          .trim()
      ).slice(0, 72);

      const isGibberish = calibrated.integrity.isGibberishOrLowEffort;

      // Blend AI spoken-readiness (75%) with deterministic local spoken-readiness (25%)
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

      const calqueFixes = mergeCalqueFixes(
        localDiagnostics.calqueFixes,
        parsed.calqueFixes
      );

      const audienceReaction = sanitizeCoachProse(
        String(parsed.audienceReaction || '')
      ).slice(0, 380);

      let drillVerdict: DrillVerdict | undefined;
      if (
        drillContext &&
        (drillContext.drillType && drillContext.drillType !== 'standard' ||
          drillContext.drillPayload?.constraintLabel)
      ) {
        const rawVerdict =
          parsed.drillVerdict && typeof parsed.drillVerdict === 'object'
            ? (parsed.drillVerdict as Record<string, unknown>)
            : null;
        if (rawVerdict && typeof rawVerdict.headline === 'string' && rawVerdict.headline.trim()) {
          drillVerdict = {
            headline: sanitizeCoachProse(rawVerdict.headline).slice(0, 140),
            summary: sanitizeCoachProse(String(rawVerdict.summary || '')).slice(0, 420),
            registerShiftScore:
              typeof rawVerdict.registerShiftScore === 'number'
                ? clampPercentage(rawVerdict.registerShiftScore, 75)
                : undefined,
          };
        }
      }

      res.json({
        ok: true,
        evaluationStatus: 'completed',
        modelUsed: stepUsed.model,
        thinkingLevelUsed: stepUsed.thinkingLabel,
        routingMeta: {
          model: stepUsed.model,
          thinkingLevel: stepUsed.thinkingLabel,
          tierLabel: stepUsed.tierLabel,
          reason: stepUsed.reason,
          latencyMs,
        },
        meta: {
          requestId,
          modelUsed: stepUsed.model,
          latencyMs,
        },
        downgraded,
        cached,
        suggestedTitle,
        spokenReadinessScore,
        signalNoiseRatio: localDiagnostics.signalNoiseRatio,
        audienceReaction:
          audienceReaction ||
          `As a ${targetAudience}, the main point comes through clearly — tightening one or two verbose clauses would make it sound even more effortless.`,
        audience: targetAudience,
        calqueFixes,
        drillVerdict,
        scores: calibrated.scores,
        metricNotes,
        cefrLevel: calibrated.cefrLevel,
        internationalMetrics: {
          ieltsBand: calibrated.ieltsBand,
          toeflEquivalent: calibrated.toeflEquivalent,
          lexicalResource: isGibberish
            ? Math.min(2, clampScore(parsed.lexicalResource))
            : clampScore(parsed.lexicalResource),
          coherenceCohesion: isGibberish
            ? Math.min(2, clampScore(parsed.coherenceCohesion))
            : clampScore(parsed.coherenceCohesion),
          taskAchievement: isGibberish
            ? Math.min(2, clampScore(parsed.taskAchievement))
            : clampScore(parsed.taskAchievement),
          registerControl: isGibberish
            ? Math.min(2, clampScore(parsed.registerControl))
            : clampScore(parsed.registerControl),
          grammarAccuracy: calibrated.scores.grammarMechanics,
          fleschReadingEase: 0,
          fkGradeLevel: 0,
        },
        toneVerdict: sanitizeCoachProse(String(parsed.toneVerdict || '')),
        flowVerdict: sanitizeCoachProse(String(parsed.flowVerdict || '')),
        feedbackImplemented: validImpl,
        feedbackCheck,
        whatImproved: sanitizeCoachProse(String(parsed.whatImproved || '')),
        whatImprovedPoints,
        strictImprovements: sanitizeCoachProse(
          String(parsed.strictImprovements || '')
        ),
        pinpointedRewrites: groundedPinpoints,
        rewrittenSample: groundedRewrite,
        masteredWordsUsed: Array.isArray(parsed.masteredWordsUsed)
          ? parsed.masteredWordsUsed.map(String)
          : [],
        grammarFixes: groundedFixes,
        vocabUpgrades: groundedVocab,
      });
    } catch (err) {
      if (isQuotaOrOverloadError(err) || isTimeoutError(err)) {
        const provisional = buildServerQueuedEvaluation(
          trimmedContent,
          String(mode),
          String(tone)
        );
        const resetSeconds = getRemainingCooldownSeconds();
        res.json({
          ok: true,
          evaluationStatus: 'queued_for_reset',
          modelUsed: 'queued-pending-reset',
          thinkingLevelUsed: 'LOCAL',
          routingMeta: {
            model: 'queued-pending-reset',
            thinkingLevel: 'LOCAL',
            tierLabel: 'Queued (Rate Limit Reset)',
            reason:
              'All live Gemini tiers briefly busy; queued for automatic retry.',
          },
          downgraded: true,
          cached: false,
          quotaResetSeconds: resetSeconds,
          quotaResetAt: new Date(Date.now() + resetSeconds * 1000).toISOString(),
          meta: {
            requestId,
            modelUsed: 'queued-pending-reset',
            latencyMs: Math.max(1, Date.now() - startedAt),
          },
          ...provisional,
        });
        return;
      }

      const raw = err instanceof Error ? err.message : String(err);
      res.status(500).json(
        buildErrorEnvelope({
          code: 'EVALUATION_FAILED',
          message: raw || 'Unable to complete evaluation right now.',
          retryable: true,
          requestId,
          startedAtMs: startedAt,
        })
      );
    }
  });

  router.post('/api/evaluate-conversation', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const {
      scenario,
      pace = 'natural',
      messages = [],
      elapsedSeconds = 0,
      previousSessionSummary = '',
      practicingVocab = [],
      studentProfile,
      customCoachPrompt,
      coachPresets,
    } = req.body ?? {};

    if (
      !scenario ||
      typeof scenario !== 'object' ||
      typeof scenario.title !== 'string'
    ) {
      res.status(400).json(
        buildErrorEnvelope({
          code: 'INVALID_SCENARIO',
          message: 'Valid conversation scenario is required.',
          requestId,
          startedAtMs: startedAt,
        })
      );
      return;
    }

    const typedScenario = scenario as ConversationScenario;
    const safePace: ConversationPace =
      pace === 'relaxed' || pace === 'challenging' ? pace : 'natural';
    const rawMessages: ConversationMessage[] = Array.isArray(messages)
      ? messages.slice(0, 60)
      : [];
    const userMessages = rawMessages.filter(
      (m) => m && m.role === 'user' && typeof m.text === 'string' && m.text.trim().length > 0
    );

    if (userMessages.length < 2) {
      res.status(400).json(
        buildErrorEnvelope({
          code: 'TOO_FEW_TURNS',
          message:
            'Send at least 2 replies before running the conversation benchmark evaluation.',
          requestId,
          startedAtMs: startedAt,
        })
      );
      return;
    }

    const userTurnsText = userMessages.map((m) => m.text.trim()).join('\n\n');
    const integrity = assessDraftIntegrity(userTurnsText);
    const localDiagnostics = computeProseDiagnostics(userTurnsText);
    const vocabList = Array.isArray(practicingVocab)
      ? practicingVocab.slice(0, 12).map(String)
      : [];

    const fencedPreferences = buildFencedCoachPreferences({
      customCoachPrompt:
        typeof customCoachPrompt === 'string' ? customCoachPrompt : undefined,
      coachPresets: Array.isArray(coachPresets)
        ? (coachPresets as CoachPresetId[])
        : undefined,
    });

    const telemetry = aggregateConversationTelemetry({
      messages: rawMessages,
      pace: safePace,
      elapsedSeconds: Number(elapsedSeconds) || 0,
    });

    let userTurnCounter = 0;
    const annotatedDialogue = rawMessages
      .map((m) => {
        if (m.role === 'partner') {
          return `[Partner · ${typedScenario.personaName}]: ${m.text.trim()}`;
        }
        userTurnCounter += 1;
        const respSec = m.telemetry?.responseTimeMs
          ? `${(m.telemetry.responseTimeMs / 1000).toFixed(1)}s reply`
          : 'unmeasured reply';
        const thinkSec =
          typeof m.telemetry?.thinkTimeMs === 'number'
            ? `, ${(m.telemetry.thinkTimeMs / 1000).toFixed(1)}s think`
            : '';
        const wpm = m.telemetry?.wordsPerMinute
          ? `, ${Math.round(m.telemetry.wordsPerMinute)} WPM`
          : '';
        const liveSignal = m.inTimeAnalysis
          ? ` | live-check(ctx:${m.inTimeAnalysis.contextAlignment}, tone:${m.inTimeAnalysis.toneMatch}, gram:${m.inTimeAnalysis.grammarAccuracy}, nat:${m.inTimeAnalysis.naturalness})`
          : '';
        return `[Learner Turn ${userTurnCounter} · ${m.telemetry?.wordCount ?? m.text.trim().split(/\s+/).length}w · ${respSec}${thinkSec}${wpm}${liveSignal}]: ${m.text.trim()}`;
      })
      .join('\n');

    const studentDescriptor =
      studentProfile && studentProfile.collegeDegree
        ? `${studentProfile.semester || 'college'} ${studentProfile.collegeDegree} student`
        : 'focused English speaker';

    const routePlan = selectDynamicEvaluationRoute({
      wordCount: Math.max(integrity.wordCount, telemetry.timingSummary.totalUserWords),
      mode: typedScenario.mode || 'technical',
      tone: typedScenario.tone || 'conversational',
      topic: typedScenario.title,
      topicPrimer: typedScenario.settingBrief,
      longestSentenceWords: integrity.longestSentenceWords,
      hasPreviousSessionSummary: Boolean(
        typeof previousSessionSummary === 'string' &&
          previousSessionSummary.trim().length > 0
      ),
      practicingVocabCount: vocabList.length,
      isGibberishOrLowEffort: integrity.isGibberishOrLowEffort,
      cooldownUntil: modelCooldownUntil,
      unsupportedUntil: modelUnsupportedUntil,
    });

    const cacheKey = makeCacheKey('evaluate-converse-benchmark-v2', {
      scenarioId: typedScenario.id,
      pace: safePace,
      annotatedDialogue: annotatedDialogue.slice(0, 6000),
      vocabList,
      fencedPreferences,
      routePrimary: `${routePlan.primary.model}:${routePlan.primary.thinkingLabel}`,
    });

    const systemInstruction = `You are a senior conversational-fluency assessor delivering the **Quillit Conversational Fluency Benchmark** for a ${studentDescriptor} practicing live real-time text dialogue.
Unlike static essay grading, you evaluate HOW the learner performs LIVE across turns: contextual listening, tone adaptation, real-time response tempo, conversational initiative, spoken grammar under pressure, clarity, and natural phrasing.

8 BENCHMARK PARAMETERS (1-10 integers, honest strict grading, ZERO inflation):
1. contextCoherence (18% weight): Did every learner turn directly answer, track, and build on what ${typedScenario.personaName} just asked or said without drifting off-topic?
2. naturalnessSpokenFlow (16% weight): Does the learner sound like an authentic, natural human conversationalist vs stiff textbook prose?
3. grammarMechanics (16% weight): Subject-verb agreement, verb tense accuracy, word choice, punctuation, and sentence control under live pressure.
4. toneRegister (14% weight): Did tone and register fit "${typedScenario.title}" with ${typedScenario.personaName} (${typedScenario.personaRole}) at ${safePace} pace?
5. responsivenessTempo (12% weight): Factor in measured reply times, think-to-type latency, and live WPM relative to turn length.
6. conversationalInitiative (10% weight): Did the learner carry momentum with concrete details, examples, or natural follow-ups?
7. clarityConciseness (8% weight): Crisp, readable messages free of breathless run-ons or repetition.
8. vocabularyPrecision (6% — LOWEST WEIGHTAGE): Bonus layer ONLY. Never penalize crisp plain spoken English. STRICTLY BANNED thesaurus-slop: utilize, delve, tapestry, myriad, plethora, endeavor, commence, facilitate, synergy, leverage, paramount.

CRITICAL VERBATIM GROUNDING RULES:
- Quote ONLY from the LEARNER'S own turns (never quote ${typedScenario.personaName}!) for pinpointedRewrites, grammarFixes, and vocabUpgrades.
- In parameterNotes, write 1 crisp evidence-grounded sentence per parameter citing specific turns, phrases, or measured response times.
${fencedPreferences ? `\n${fencedPreferences}` : ''}`;

    const tSum = telemetry.timingSummary;
    const prompt = `SCENARIO: ${typedScenario.title} — ${typedScenario.settingBrief}
PARTNER: ${typedScenario.personaName} (${typedScenario.personaRole}) | PACE: ${safePace.toUpperCase()}
MEASURED LIVE TELEMETRY:
- Turns: ${tSum.turnCount} learner replies · ${tSum.totalUserWords} words (${tSum.avgWordsPerTurn} words/turn) · Session duration: ${tSum.totalDurationSec}s
- Response Time: ${tSum.avgResponseTimeSec !== null ? `avg ${tSum.avgResponseTimeSec}s (median ${tSum.medianResponseTimeSec}s, fastest ${tSum.fastestTurnSec}s, slowest ${tSum.slowestTurnSec}s)` : 'not measured'}
- Formulation & Speed: ${tSum.avgThinkTimeSec !== null ? `avg ${tSum.avgThinkTimeSec}s think-to-type` : 'unmeasured'}${tSum.avgWpm !== null ? ` · ${tSum.avgWpm} WPM typing` : ''} · Objective Tempo Band: ${tSum.tempoBand} (${tSum.timingCalibrationScore}/10)
- Live In-Time Averages: ctx=${telemetry.inTimeAverages.contextAlignment ?? 'n/a'}, tone=${telemetry.inTimeAverages.toneMatch ?? 'n/a'}, gram=${telemetry.inTimeAverages.grammarAccuracy ?? 'n/a'}, nat=${telemetry.inTimeAverages.naturalness ?? 'n/a'}, vocab=${telemetry.inTimeAverages.vocabQuality ?? 'n/a'}
${previousSessionSummary ? `Previous Coaching Note: ${previousSessionSummary}\n` : ''}${vocabList.length > 0 ? `Target Practicing Vocabulary: ${vocabList.join(', ')}\n` : ''}
TIME-ANNOTATED CONVERSATION TRANSCRIPT:
"""
${annotatedDialogue.slice(0, 5600)}
"""

LEARNER-ONLY TEXT (for strict verbatim quotes):
"""
${userTurnsText.slice(0, 3600)}
"""`;

    try {
      const { parsed, stepUsed, downgraded, cached, latencyMs } =
        await executeDynamicEvaluationCall({
          cacheKey,
          contents: prompt,
          systemInstruction,
          cascade: routePlan.cascade,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedTitle: { type: Type.STRING },
              parameters: {
                type: Type.OBJECT,
                properties: {
                  contextCoherence: { type: Type.INTEGER },
                  naturalnessSpokenFlow: { type: Type.INTEGER },
                  grammarMechanics: { type: Type.INTEGER },
                  toneRegister: { type: Type.INTEGER },
                  responsivenessTempo: { type: Type.INTEGER },
                  conversationalInitiative: { type: Type.INTEGER },
                  clarityConciseness: { type: Type.INTEGER },
                  vocabularyPrecision: { type: Type.INTEGER },
                },
                required: [
                  'contextCoherence',
                  'naturalnessSpokenFlow',
                  'grammarMechanics',
                  'toneRegister',
                  'responsivenessTempo',
                  'conversationalInitiative',
                  'clarityConciseness',
                  'vocabularyPrecision',
                ],
              },
              parameterNotes: {
                type: Type.OBJECT,
                properties: {
                  contextCoherence: { type: Type.STRING },
                  naturalnessSpokenFlow: { type: Type.STRING },
                  grammarMechanics: { type: Type.STRING },
                  toneRegister: { type: Type.STRING },
                  responsivenessTempo: { type: Type.STRING },
                  conversationalInitiative: { type: Type.STRING },
                  clarityConciseness: { type: Type.STRING },
                  vocabularyPrecision: { type: Type.STRING },
                },
                required: [
                  'contextCoherence',
                  'naturalnessSpokenFlow',
                  'grammarMechanics',
                  'toneRegister',
                  'responsivenessTempo',
                  'conversationalInitiative',
                  'clarityConciseness',
                  'vocabularyPrecision',
                ],
              },
              contextVerdict: { type: Type.STRING },
              toneVerdict: { type: Type.STRING },
              pacingVerdict: { type: Type.STRING },
              feedbackImplemented: { type: Type.STRING },
              feedbackCheck: {
                type: Type.OBJECT,
                properties: {
                  status: { type: Type.STRING },
                  implemented: { type: Type.STRING },
                  missed: { type: Type.STRING },
                },
                required: ['status', 'implemented', 'missed'],
              },
              whatImproved: { type: Type.STRING },
              whatImprovedPoints: {
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
              strictImprovements: { type: Type.STRING },
              pinpointedRewrites: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    rewrite: { type: Type.STRING },
                    rule: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['original', 'rewrite', 'rule', 'category'],
                },
              },
              grammarFixes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    corrected: { type: Type.STRING },
                    rule: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['original', 'corrected', 'rule', 'category'],
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
                    contextSnippet: { type: Type.STRING },
                    contextTag: { type: Type.STRING },
                  },
                  required: [
                    'used',
                    'betterAlternative',
                    'explanation',
                    'contextSnippet',
                    'contextTag',
                  ],
                },
              },
              masteredWordsUsed: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'suggestedTitle',
              'parameters',
              'parameterNotes',
              'contextVerdict',
              'toneVerdict',
              'pacingVerdict',
              'feedbackImplemented',
              'feedbackCheck',
              'whatImproved',
              'whatImprovedPoints',
              'strictImprovements',
              'pinpointedRewrites',
              'grammarFixes',
              'vocabUpgrades',
              'masteredWordsUsed',
            ],
          },
        });

      const groundedFixes = filterGroundedGrammarFixes(
        userTurnsText,
        Array.isArray(parsed.grammarFixes)
          ? (parsed.grammarFixes as Parameters<typeof filterGroundedGrammarFixes>[1])
          : []
      );
      const groundedPinpoints = filterGroundedPinpointedRewrites(
        userTurnsText,
        Array.isArray(parsed.pinpointedRewrites)
          ? (parsed.pinpointedRewrites as Parameters<
              typeof filterGroundedPinpointedRewrites
            >[1])
          : []
      );
      const groundedVocab = filterGroundedVocabUpgrades(
        userTurnsText,
        Array.isArray(parsed.vocabUpgrades)
          ? (parsed.vocabUpgrades as Parameters<typeof filterGroundedVocabUpgrades>[1])
          : []
      );

      const calibrated = calibrateConversationBenchmark({
        userTurnsText,
        messages: rawMessages,
        pace: safePace,
        elapsedSeconds: Number(elapsedSeconds) || 0,
        rawParameters: (parsed.parameters || {}) as Partial<ConversationBenchmarkScores>,
        rawParameterNotes:
          parsed.parameterNotes && typeof parsed.parameterNotes === 'object'
            ? (parsed.parameterNotes as Record<string, string>)
            : undefined,
        grammarFixesCount: groundedFixes.length,
        contextVerdict: String(parsed.contextVerdict || ''),
        toneVerdict: String(parsed.toneVerdict || ''),
        pacingVerdict: String(parsed.pacingVerdict || ''),
      });

      const whatImprovedPoints = sanitizeWhatImprovedPoints(
        Array.isArray(parsed.whatImprovedPoints)
          ? (parsed.whatImprovedPoints as Array<{ title?: unknown; detail?: unknown }>)
          : undefined
      );
      const rawFeedbackStatus = String(parsed.feedbackImplemented || 'Baseline');
      const feedbackStatus = (
        ['Yes', 'Partial', 'No', 'Baseline'].includes(rawFeedbackStatus)
          ? rawFeedbackStatus
          : rawFeedbackStatus === 'Partially'
            ? 'Partial'
            : 'Baseline'
      ) as Parameters<typeof sanitizeFeedbackCheck>[0]['status'];
      const feedbackCheck = sanitizeFeedbackCheck({
        status: feedbackStatus,
        raw:
          parsed.feedbackCheck && typeof parsed.feedbackCheck === 'object'
            ? (parsed.feedbackCheck as { implemented?: unknown; missed?: unknown })
            : null,
      });
      const groundedRewrite = sanitizeRewrittenSample(
        userTurnsText,
        groundedPinpoints[0]
          ? {
              original: groundedPinpoints[0].original,
              improved: groundedPinpoints[0].rewrite,
              why: groundedPinpoints[0].rule,
            }
          : null
      );

      const b = calibrated.benchmark;
      res.json({
        ok: true,
        evaluationStatus: 'completed',
        modelUsed: stepUsed.model,
        thinkingLevelUsed: stepUsed.thinkingLabel,
        routingMeta: {
          model: stepUsed.model,
          thinkingLevel: stepUsed.thinkingLabel,
          tierLabel: stepUsed.tierLabel,
          reason: stepUsed.reason,
          latencyMs,
        },
        meta: {
          requestId,
          modelUsed: stepUsed.model,
          latencyMs,
        },
        downgraded,
        cached,
        suggestedTitle:
          sanitizeCoachProse(String(parsed.suggestedTitle || '')).slice(0, 90) ||
          `Live Chat: ${typedScenario.title}`,
        spokenReadinessScore: b.benchmarkIndex,
        signalNoiseRatio: localDiagnostics.signalNoiseRatio,
        calqueFixes: localDiagnostics.calqueFixes,
        scores: calibrated.rubricScores,
        metricNotes: {
          naturalVoiceFlow: b.parameterNotes.naturalnessSpokenFlow,
          claritySimplicity: b.parameterNotes.contextCoherence,
          grammarMechanics: b.parameterNotes.grammarMechanics,
          toneEngagement: b.parameterNotes.toneRegister,
          sentenceVarietyCadence: b.parameterNotes.responsivenessTempo,
          concisenessDirectness: b.parameterNotes.clarityConciseness,
        },
        cefrLevel: calibrated.cefrLevel,
        internationalMetrics: {
          ieltsBand: calibrated.ieltsBand,
          toeflEquivalent: calibrated.toeflEquivalent,
          lexicalResource: b.parameters.vocabularyPrecision,
          coherenceCohesion: b.parameters.contextCoherence,
          taskAchievement: b.parameters.conversationalInitiative,
          registerControl: b.parameters.toneRegister,
          grammarAccuracy: b.parameters.grammarMechanics,
          fleschReadingEase: 0,
          fkGradeLevel: 0,
        },
        toneVerdict: b.toneVerdict,
        flowVerdict: b.pacingVerdict,
        feedbackImplemented: feedbackCheck.status,
        feedbackCheck,
        whatImproved: sanitizeCoachProse(String(parsed.whatImproved || '')),
        whatImprovedPoints,
        strictImprovements: sanitizeCoachProse(
          String(parsed.strictImprovements || '')
        ),
        pinpointedRewrites: groundedPinpoints,
        rewrittenSample: groundedRewrite,
        grammarFixes: groundedFixes,
        vocabUpgrades: groundedVocab,
        masteredWordsUsed: Array.isArray(parsed.masteredWordsUsed)
          ? parsed.masteredWordsUsed.map(String)
          : [],
        conversationBenchmark: b,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      res.status(503).json(
        buildErrorEnvelope({
          code: 'CONVERSATION_EVAL_FAILED',
          message:
            raw || 'Unable to complete conversation benchmark evaluation right now.',
          retryable: true,
          requestId,
          startedAtMs: startedAt,
        })
      );
    }
  });

  return router;
}
