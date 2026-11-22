import crypto from 'crypto';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
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
} from './src/utils/evaluationCalibration';
import {
  selectDynamicEvaluationRoute,
  type ActiveEvalModel,
  type ActiveThinkingLabel,
  type EvaluationRouteStep,
} from './src/utils/evaluationRouter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

/**
 * Ordered model cascade from primary high-speed flash model to ultra-light lower-quota fallback.
 * When a model hits 429/503 or quota limits, the server immediately switches (<5ms) to the next tier
 * and places the rate-limited model on a cooldown timer so subsequent requests skip straight to the available lower model.
 */
const MODEL_TIERS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
type ModelTier = (typeof MODEL_TIERS)[number];
type CoachTaskKind = 'evaluate' | 'realtime' | 'schedule' | 'pivot' | 'topics';

const modelCooldownUntil: Record<ModelTier, number> = {
  'gemini-4-hydrogen': 0,
  'gemini-3.1-flash-lite': 0,
};

let lastSuccessfulModel: ModelTier = 'gemini-4-hydrogen';
let totalCacheHits = 0;
let totalAutoDowngrades = 0;

interface CacheEntry {
  expiresAt: number;
  payload: Record<string, unknown>;
}

const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_CACHE_ENTRIES = 160;
const apiCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<Record<string, unknown>>>();

function makeCacheKey(endpoint: string, payload: unknown): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${endpoint}:${JSON.stringify(payload)}`)
    .digest('hex');
  return `${endpoint}:${hash.slice(0, 24)}`;
}

function getCachedResponse(key: string): Record<string, unknown> | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  totalCacheHits += 1;
  return { ...entry.payload, cached: true };
}

function setCachedResponse(key: string, payload: Record<string, unknown>): void {
  if (apiCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = apiCache.keys().next().value;
    if (oldestKey) apiCache.delete(oldestKey);
  }
  apiCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 5;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function clampIelts(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 6.5;
  const clamped = Math.max(4.0, Math.min(9.0, num));
  return Math.round(clamped * 2) / 2;
}

function clampToefl(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 21;
  return Math.max(8, Math.min(30, Math.round(num)));
}

function isQuotaOrOverloadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('Rate limit') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

function getCandidateModelOrder(): ModelTier[] {
  const now = Date.now();
  const available = MODEL_TIERS.filter((m) => now >= modelCooldownUntil[m]);
  if (available.length > 0) {
    return available;
  }
  return ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
}

function getRemainingCooldownSeconds(): number {
  const now = Date.now();
  const activeCooldowns = MODEL_TIERS.map((m) =>
    Math.max(0, Math.ceil((modelCooldownUntil[m] - now) / 1000))
  ).filter((s) => s > 0);
  if (activeCooldowns.length === 0) return 25;
  return Math.max(10, Math.min(45, Math.min(...activeCooldowns)));
}

function toSdkThinkingLevel(label: ActiveThinkingLabel): ThinkingLevel {
  if (label === 'HIGH') return ThinkingLevel.HIGH;
  if (label === 'MEDIUM') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed') ||
    msg.includes('socket hang up') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('INTERNAL')
  );
}

/**
 * Dynamically adapts thinking depth to draft complexity, prompt size, and active model tier
 * for non-evaluation utility endpoints (schedule, realtime, pivot, topics).
 */
function selectDynamicThinkingProfile(
  task: CoachTaskKind,
  complexityMetric: number,
  model: ModelTier
): { level: ThinkingLevel; label: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' } {
  if (model === 'gemini-4-hydrogen') {
    if (task === 'evaluate') {
      return { level: ThinkingLevel.MEDIUM, label: 'MEDIUM' };
    }
    if (task === 'schedule') {
      return complexityMetric > 4
        ? { level: ThinkingLevel.MEDIUM, label: 'MEDIUM' }
        : { level: ThinkingLevel.LOW, label: 'LOW' };
    }
    return { level: ThinkingLevel.LOW, label: 'LOW' };
  }

  if (task === 'evaluate') {
    return { level: ThinkingLevel.LOW, label: 'LOW' };
  }
  if (task === 'schedule' && complexityMetric > 6) {
    return { level: ThinkingLevel.LOW, label: 'LOW' };
  }
  return { level: ThinkingLevel.MINIMAL, label: 'MINIMAL' };
}

/**
 * Dedicated high-reliability evaluation executor with:
 * - Dynamic per-request (model, thinkingLevel) cascade chosen from word count + topic rigor
 * - SHA-256 response cache & single-flight in-flight deduplication
 * - Single quick backoff retry on transient 5xx/network hiccups before escalating down cascade
 * - Unlimited output token headroom (no artificial maxOutputTokens cap) so deep reasoning + detailed reports never truncate
 */
async function executeDynamicEvaluationCall(params: {
  cacheKey: string;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  cascade: EvaluationRouteStep[];
}): Promise<{
  parsed: Record<string, unknown>;
  stepUsed: EvaluationRouteStep;
  downgraded: boolean;
  cached: boolean;
  latencyMs: number;
}> {
  const { cacheKey, contents, systemInstruction, responseSchema, cascade } =
    params;

  const startedAt = Date.now();
  const cachedHit = getCachedResponse(cacheKey);
  if (cachedHit) {
    return {
      parsed: cachedHit.parsed as Record<string, unknown>,
      stepUsed: (cachedHit.stepUsed as EvaluationRouteStep) || cascade[0],
      downgraded: Boolean(cachedHit.downgraded),
      cached: true,
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  }

  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    const shared = await existingInFlight;
    return {
      parsed: shared.parsed as Record<string, unknown>,
      stepUsed: (shared.stepUsed as EvaluationRouteStep) || cascade[0],
      downgraded: Boolean(shared.downgraded),
      cached: true,
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  }

  const primaryModel: ActiveEvalModel = cascade[0]?.model ?? 'gemini-4-hydrogen';

  const taskPromise = (async () => {
    const ai = getAiClient();
    let lastErr: unknown;

    for (let i = 0; i < cascade.length; i += 1) {
      const step = cascade[i];
      const downgraded = i > 0 || step.model !== primaryModel;
      const maxAttempts = 2;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const response = await ai.models.generateContent({
            model: step.model,
            contents,
            config: {
              systemInstruction,
              seed: 42,
              responseMimeType: 'application/json',
              responseSchema,
              thinkingConfig: {
                thinkingLevel: toSdkThinkingLevel(step.thinkingLabel),
              },
            },
          });

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error(`Empty response from ${step.model}`);
          }

          const parsed = JSON.parse(rawText) as Record<string, unknown>;
          lastSuccessfulModel = step.model;
          if (downgraded) {
            totalAutoDowngrades += 1;
          }

          const resultEnvelope = {
            parsed,
            stepUsed: step,
            modelUsed: step.model,
            thinkingLevelUsed: step.thinkingLabel,
            downgraded,
          };
          setCachedResponse(cacheKey, resultEnvelope);
          return resultEnvelope;
        } catch (err) {
          lastErr = err;
          if (isQuotaOrOverloadError(err)) {
            const msg = err instanceof Error ? err.message : String(err);
            const isRateLimit =
              msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
            modelCooldownUntil[step.model] =
              Date.now() + (isRateLimit ? 38_000 : 15_000);
            break; // Immediately cascade to next available model/tier
          }
          if (attempt === 0 && isTransientNetworkError(err)) {
            await new Promise((r) => setTimeout(r, 350));
            continue;
          }
          break;
        }
      }
    }

    throw lastErr || new Error('All Gemini evaluation tiers are currently busy.');
  })();

  inFlightRequests.set(cacheKey, taskPromise);
  try {
    const out = await taskPromise;
    return {
      parsed: out.parsed as Record<string, unknown>,
      stepUsed: (out.stepUsed as EvaluationRouteStep) || cascade[0],
      downgraded: Boolean(out.downgraded),
      cached: false,
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Executes a Gemini JSON request across MODEL_TIERS with immediate fast fail-over
 * and dynamic thinking budget calibration.
 */
async function executeCascadingJsonCall(params: {
  cacheKey: string;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  allowCache?: boolean;
  task?: CoachTaskKind;
  complexityMetric?: number;
  preferFastTier?: boolean;
}): Promise<{
  parsed: Record<string, unknown>;
  modelUsed: ModelTier;
  thinkingLevelUsed: string;
  downgraded: boolean;
  cached: boolean;
}> {
  const {
    cacheKey,
    contents,
    systemInstruction,
    responseSchema,
    allowCache = true,
    task = 'evaluate',
    complexityMetric = 120,
    preferFastTier = false,
  } = params;

  if (allowCache) {
    const cachedHit = getCachedResponse(cacheKey);
    if (cachedHit) {
      return {
        parsed: cachedHit.parsed as Record<string, unknown>,
        modelUsed: (cachedHit.modelUsed as ModelTier) || lastSuccessfulModel,
        thinkingLevelUsed: String(cachedHit.thinkingLevelUsed || 'LOW'),
        downgraded: Boolean(cachedHit.downgraded),
        cached: true,
      };
    }
  }

  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    const shared = await existingInFlight;
    return {
      parsed: shared.parsed as Record<string, unknown>,
      modelUsed: (shared.modelUsed as ModelTier) || lastSuccessfulModel,
      thinkingLevelUsed: String(shared.thinkingLevelUsed || 'LOW'),
      downgraded: Boolean(shared.downgraded),
      cached: true,
    };
  }

  const taskPromise = (async () => {
    const ai = getAiClient();
    const baseCandidates = getCandidateModelOrder();
    const candidates = preferFastTier
      ? [
          ...baseCandidates.filter((m) => m === 'gemini-3.1-flash-lite'),
          ...baseCandidates.filter((m) => m !== 'gemini-3.1-flash-lite'),
        ]
      : baseCandidates;
    let lastErr: unknown;

    for (let i = 0; i < candidates.length; i += 1) {
      const model = candidates[i];
      const downgraded = !preferFastTier && model !== 'gemini-4-hydrogen';
      const thinking = selectDynamicThinkingProfile(task, complexityMetric, model);

      try {
        const config: Record<string, unknown> = {
          systemInstruction,
          seed: 42,
          responseMimeType: 'application/json',
          responseSchema,
          thinkingConfig: { thinkingLevel: thinking.level },
        };

        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          throw new Error(`Empty response from ${model}`);
        }

        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        lastSuccessfulModel = model;
        if (downgraded) {
          totalAutoDowngrades += 1;
        }

        const resultEnvelope = {
          parsed,
          modelUsed: model,
          thinkingLevelUsed: thinking.label,
          downgraded,
        };

        if (allowCache) {
          setCachedResponse(cacheKey, resultEnvelope);
        }
        return resultEnvelope;
      } catch (err) {
        lastErr = err;
        if (isQuotaOrOverloadError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          const isRateLimit =
            msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
          modelCooldownUntil[model] =
            Date.now() + (isRateLimit ? 38_000 : 15_000);
          continue;
        }
        if (i < candidates.length - 1) {
          continue;
        }
        throw err;
      }
    }

    throw lastErr || new Error('All Gemini model tiers are currently rate-limited.');
  })();

  inFlightRequests.set(cacheKey, taskPromise);
  try {
    const out = await taskPromise;
    return {
      parsed: out.parsed as Record<string, unknown>,
      modelUsed: out.modelUsed as ModelTier,
      thinkingLevelUsed: String(out.thinkingLevelUsed || 'LOW'),
      downgraded: Boolean(out.downgraded),
      cached: false,
    };
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

function buildServerQueuedEvaluation(
  content: string,
  mode: string,
  tone: string
) {
  const words = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const wordCount = words.length;
  const sentences = content
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const sentenceCount = Math.max(1, sentences.length);
  const avgWords = Number((wordCount / sentenceCount).toFixed(1));

  const lower = content.toLowerCase();
  const fillers = ['basically', 'actually', 'literally', 'very', 'really', 'just'];
  const fillerHits = fillers.filter((f) =>
    new RegExp(`\\b${f}\\b`, 'i').test(lower)
  );
  const passiveMatches =
    lower.match(/\b(was|were|been|being|is|are)\s+\w+(ed|en)\b/g) || [];

  const fillerPenalty = Math.min(2, fillerHits.length);
  const passivePenalty = Math.min(2, Math.floor(passiveMatches.length / 2));
  const lengthBonus = wordCount >= 100 ? 1 : 0;

  const rawScores = {
    naturalVoiceFlow: clampScore(6 + lengthBonus - fillerPenalty),
    claritySimplicity: clampScore(7 - passivePenalty),
    grammarMechanics: clampScore(7 - Math.min(1, fillerPenalty)),
    toneEngagement: clampScore(6 + lengthBonus),
    sentenceVarietyCadence: clampScore(
      avgWords >= 10 && avgWords <= 24 ? 7 : 6
    ),
    concisenessDirectness: clampScore(7 - fillerPenalty - passivePenalty),
  };

  const grammarFixes = filterGroundedGrammarFixes(
    content,
    fillerHits.slice(0, 3).map((word) => ({
      original: word,
      corrected: 'remove or use a precise verb',
      rule: `Eliminate filler "${word}" to tighten ${tone} clarity.`,
      category: 'Conciseness & Register',
    }))
  );

  const calibrated = calibrateEvaluationScores({
    content,
    scores: rawScores,
    grammarFixesCount: grammarFixes.length,
  });

  return {
    scores: calibrated.scores,
    cefrLevel: calibrated.cefrLevel,
    internationalMetrics: {
      ieltsBand: calibrated.ieltsBand,
      toeflEquivalent: calibrated.toeflEquivalent,
      lexicalResource: clampScore(
        Math.round(
          (calibrated.scores.claritySimplicity +
            calibrated.scores.concisenessDirectness) /
            2
        )
      ),
      coherenceCohesion: clampScore(
        Math.round(
          (calibrated.scores.naturalVoiceFlow +
            calibrated.scores.sentenceVarietyCadence) /
            2
        )
      ),
      taskAchievement: clampScore(
        Math.round(
          (calibrated.scores.claritySimplicity +
            calibrated.scores.toneEngagement) /
            2
        )
      ),
      registerControl: calibrated.scores.toneEngagement,
      grammarAccuracy: calibrated.scores.grammarMechanics,
      fleschReadingEase: 0,
      fkGradeLevel: 0,
    },
    toneVerdict: calibrated.integrity.isGibberishOrLowEffort
      ? calibrated.integrity.reason ||
        'Draft could not be evaluated as coherent writing.'
      : `Provisional ${mode} (${tone}) check captured while AI Coach quota resets.`,
    flowVerdict: `${wordCount} words across ${sentenceCount} sentences (${avgWords} words/sentence).`,
    feedbackImplemented: 'Partial',
    whatImproved: calibrated.integrity.isGibberishOrLowEffort
      ? 'Session saved. Write at least a few real sentences for meaningful coaching.'
      : 'Your writing session is saved and will receive full AI Coach feedback automatically once quota resets.',
    strictImprovements: calibrated.integrity.isGibberishOrLowEffort
      ? 'Replace placeholder or scrambled text with a genuine paragraph on your topic.'
      : 'Deep AI Coach review is queued and will finalize automatically when the rate limit clears.',
    grammarFixes,
    vocabUpgrades: [],
    masteredWordsUsed: [],
  };
}

interface FallbackSlotTemplate {
  slotLabel: string;
  slotTime: string;
  mode: 'technical' | 'linkedin' | 'email' | 'creative';
  tone: string;
  pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
  promptCategory: string;
  topic: string;
  topicPrimer: string;
  pivotRule: string;
  feedbackReminder: string;
  targetWords: number;
  suggestions: string[];
}

const FALLBACK_POOLS: Record<
  'technical-concept' | 'linkedin-email' | 'creative-story',
  FallbackSlotTemplate[]
> = {
  'technical-concept': [
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '18:19',
      mode: 'technical',
      tone: 'academic-technical',
      pillar: 'technical-concept',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Defend 4–20 mA Current Loops Over 0–10 V Signals in an Interview',
      topicPrimer:
        'Industrial transmitters carry process signals across noisy plant floors where copper resistance drops small voltages. A 4–20 mA loop holds constant current regardless of run length, while the 4 mA live zero separates a true zero from an open wire.',
      pivotRule:
        'Universal Pivot: Swap to any sensor signal-conditioning setup from your 6th-sem EIE lab.',
      feedbackReminder:
        'Add clear spoken transitions and try active verbs like "stabilizes" or "interfaces with".',
      targetWords: 220,
      suggestions: [
        'Contrast voltage drop vs current-loop immunity in plain spoken English.',
        'Explain why 4 mA live zero detects snapped wires immediately.',
        'Anchor with a Process Control transmitter calibration bench example.',
      ],
    },
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '18:19',
      mode: 'technical',
      tone: 'academic-technical',
      pillar: 'technical-concept',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Explain Instrumentation Amplifiers & CMRR in a Wheatstone Bridge',
      topicPrimer:
        'A Wheatstone bridge delivers millivolt differentials riding on large common-mode supply or 50 Hz mains hum. The 3-op-amp instrumentation amplifier buffers both bridge legs equally and amplifies only the true transducer difference.',
      pivotRule:
        'Universal Pivot: Swap to any differential amp, comparator, or ADC front-end you wired in lab.',
      feedbackReminder:
        'Break stacked clauses into 15-word steps; try "diagnosed" and "digitizes".',
      targetWords: 210,
      suggestions: [
        'Define Common-Mode Rejection Ratio (CMRR) without hiding behind algebra.',
        'Walk through input buffering before the difference amplifier.',
        'Tie back to an RTD or strain-gauge bridge demonstration.',
      ],
    },
    {
      slotLabel: 'Domain & Interview',
      slotTime: '18:19',
      mode: 'technical',
      tone: 'academic-technical',
      pillar: 'technical-concept',
      promptCategory: 'Technical & Interview Expression',
      topic:
        'Why You Cannot Wire a Tiny Temperature Sensor Straight Into a Microcontroller',
      topicPrimer:
        'Raw sensor signals are often tiny (millivolts) and buried in electrical noise. Signal conditioning amplifies and filters that signal so the ADC can read it cleanly without losing resolution.',
      pivotRule:
        'Universal Pivot: Swap to any audio mic, ECG, strain gauge, or transducer setup you have worked with in lab.',
      feedbackReminder:
        'Explain it out loud in plain English with zero equations, keeping verbs direct and concrete.',
      targetWords: 200,
      suggestions: [
        'Explain why millivolt outputs get drowned out by noise.',
        'Walk through what amplification and filtering do before the ADC.',
        'Wrap up with one quick bench debugging lesson.',
      ],
    },
  ],
  'linkedin-email': [
    {
      slotLabel: 'LinkedIn, Email & Soft Skills',
      slotTime: '18:19',
      mode: 'email',
      tone: 'formal-executive',
      pillar: 'linkedin-email',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic:
        'Crisp 15-Minute Feedback Email on Your Capstone Hardware Architecture',
      topicPrimer:
        'Strong professional emails respect the reader’s time: lead with brief context, state one specific question or bottleneck you are facing, and make it effortless to say yes.',
      pivotRule:
        'Universal Pivot: Swap to a cold LinkedIn message to a recruiter or a diplomatic note to a teammate about a missed deadline.',
      feedbackReminder:
        'Sound respectful and confident without sounding needy or vague, and cut filler phrases.',
      targetWords: 170,
      suggestions: [
        'Open with one clear sentence of context on your hardware architecture.',
        'Ask one specific technical question they can react to quickly.',
        'Offer two easy 15-minute windows so replying takes ten seconds.',
      ],
    },
    {
      slotLabel: 'LinkedIn, Email & Soft Skills',
      slotTime: '18:19',
      mode: 'linkedin',
      tone: 'professional-warm',
      pillar: 'linkedin-email',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic:
        'LinkedIn Reflection: What Oscilloscope Ringing Taught Me About Ground Loops',
      topicPrimer:
        'Hiring managers remember honest bench debugging notes far more than textbook summaries. Walking readers through one noisy scope trace and how you isolated the return path proves real ownership.',
      pivotRule:
        'Universal Pivot: Swap to any real lab setback (loose jumper, baud mismatch, or op-amp drift) and its lesson.',
      feedbackReminder:
        'Tell it as if sharing a story over coffee with an engineering mentor, eliminating filler words.',
      targetWords: 185,
      suggestions: [
        'Hook with the surprising waveform or failure you first noticed.',
        'Explain one methodical test that isolated the real root cause.',
        'End with a crisp takeaway for fellow builders.',
      ],
    },
    {
      slotLabel: 'LinkedIn, Email & Soft Skills',
      slotTime: '18:19',
      mode: 'email',
      tone: 'professional-warm',
      pillar: 'linkedin-email',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic:
        'Diplomatic Team Update: Explaining a Capstone PCB Delay Without Blame',
      topicPrimer:
        'Owning a schedule delay transparently builds trust faster than excuses. Effective team notes lead with the revised milestone, name the technical blocker cleanly, and propose parallel next steps.',
      pivotRule:
        'Universal Pivot: Swap to any real coordination note (rescheduling a lab demo or dividing sprint tasks).',
      feedbackReminder:
        'Use calm, active ownership verbs instead of defensive excuses.',
      targetWords: 175,
      suggestions: [
        'State the revised test milestone in the opening line.',
        'Describe the technical root cause cleanly without finger-pointing.',
        'Propose two parallel workstreams to recover lab time.',
      ],
    },
  ],
  'creative-story': [
    {
      slotLabel: 'Creative & Storytelling',
      slotTime: '18:19',
      mode: 'creative',
      tone: 'narrative-vivid',
      pillar: 'creative-story',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic:
        'A Veteran Alchemist and a Runaway Apprentice Trapped Inside a Cellar During an Elemental Storm',
      topicPrimer:
        'Keep spoken lines brief and natural, letting pauses, gestures, and background thunder carry the unspoken tension between them. Neither fully trusts the other, yet the cellar door will not hold until dawn.',
      pivotRule:
        'Universal Pivot: Swap to any two contrasting characters stuck together during a crisis.',
      feedbackReminder:
        'Read dialogue aloud in your head so each line carries natural spoken cadence and subtext.',
      targetWords: 220,
      suggestions: [
        'Open mid-gesture as thunder shakes dust from the cellar beams.',
        'Use short, charged dialogue where what they hide matters most.',
        'End on a quiet shift in trust or a revealing gesture.',
      ],
    },
    {
      slotLabel: 'Creative & Storytelling',
      slotTime: '18:19',
      mode: 'creative',
      tone: 'narrative-vivid',
      pillar: 'creative-story',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic:
        'The Clockwork Cartographer: An Irreversible Choice in a Sunken Brass City',
      topicPrimer:
        'Beneath a sea wall, a brass city runs on pressurized brine mains and ticking gear-trains. Tonight an apprentice cartographer discovers an unmapped submerged ward ten minutes before the floodgates open.',
      pivotRule:
        'Universal Pivot: Swap to any character facing a time-critical moral choice in a world you invent.',
      feedbackReminder:
        'Show emotion through physical detail and vocal cadence rather than flat adjectives.',
      targetWords: 230,
      suggestions: [
        'Anchor the opening in two physical textures (salt crust, lantern hiss).',
        'Reveal tension through a short, sharp exchange of dialogue.',
        'End on an irreversible decision.',
      ],
    },
    {
      slotLabel: 'Creative & Storytelling',
      slotTime: '18:19',
      mode: 'creative',
      tone: 'narrative-vivid',
      pillar: 'creative-story',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic: 'Last Watch at the Sky-Lock Lighthouse Before the Iron Storm Arrives',
      topicPrimer:
        'High above a cloud sea, copper mirrors guide iron airships safely past jagged cliffs. With lightning skimming the catwalk and a cargo skiff drifting off-beacon, the retiring keeper hands the shutter lever to a nervous apprentice.',
      pivotRule:
        'Universal Pivot: Swap to any mentor-apprentice handoff under sudden physical pressure.',
      feedbackReminder:
        'Replace passive "was/were" narration with crisp active verbs.',
      targetWords: 235,
      suggestions: [
        'Let dialogue reveal unspoken trust and rivalry.',
        'Pace the scene with wind gusts and copper sparks.',
        'Close on one sharp sensory image.',
      ],
    },
  ],
};

let fallbackRotationCounter = 0;

function pickFallbackTemplate(
  pillar: 'technical-concept' | 'linkedin-email' | 'creative-story',
  offset: number,
  customReminder?: string
): FallbackSlotTemplate & { feedbackReminder: string } {
  const pool = FALLBACK_POOLS[pillar];
  const tpl = pool[(fallbackRotationCounter + offset) % pool.length];
  return {
    ...tpl,
    feedbackReminder: customReminder || tpl.feedbackReminder,
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const now = Date.now();
    const candidates = getCandidateModelOrder();
    res.json({
      ok: true,
      hasKey: Boolean(process.env.GEMINI_API_KEY),
      activeModel: candidates[0],
      lastSuccessfulModel,
      tiers: MODEL_TIERS.map((m) => ({
        model: m,
        cooldownSeconds: Math.max(0, Math.ceil((modelCooldownUntil[m] - now) / 1000)),
      })),
      totalCacheHits,
      totalAutoDowngrades,
    });
  });

  app.post('/api/evaluate', async (req, res) => {
    const {
      content,
      mode = 'Personal Journal',
      tone = 'Professional-Warm',
      topic = '',
      needsAutoTitle = false,
      previousSessionSummary = '',
      practicingVocab = [],
      topicPrimer = '',
      studentProfile,
    } = req.body ?? {};

    if (typeof content !== 'string' || content.trim().length < 20) {
      res.status(400).json({
        error: 'Please write at least 20 characters before requesting an evaluation.',
      });
      return;
    }

    const trimmedContent = content.trim();
    const trimmedTopic = typeof topic === 'string' ? topic.trim() : '';
    const shouldInferTitle = Boolean(needsAutoTitle) || trimmedTopic.length === 0;
    const integrity = assessDraftIntegrity(trimmedContent);
    const wordCount = integrity.wordCount;
    const vocabList = Array.isArray(practicingVocab)
      ? practicingVocab.slice(0, 12).map(String)
      : [];

    const studentDescriptor =
      studentProfile && studentProfile.collegeDegree
        ? `${studentProfile.semester || 'college'} ${studentProfile.collegeDegree} student${studentProfile.collegeName ? ` at ${studentProfile.collegeName}` : ''}`
        : 'focused writer';

    const routePlan = selectDynamicEvaluationRoute({
      wordCount,
      mode: String(mode),
      tone: String(tone),
      topic: trimmedTopic,
      topicPrimer: typeof topicPrimer === 'string' ? topicPrimer : '',
      longestSentenceWords: integrity.longestSentenceWords,
      hasPreviousSessionSummary: Boolean(
        typeof previousSessionSummary === 'string' &&
          previousSessionSummary.trim().length > 0
      ),
      practicingVocabCount: vocabList.length,
      isGibberishOrLowEffort: integrity.isGibberishOrLowEffort,
      cooldownUntil: modelCooldownUntil,
    });

    const cacheKey = makeCacheKey('evaluate-coach-v5', {
      content: trimmedContent,
      mode,
      tone,
      topic: trimmedTopic,
      shouldInferTitle,
      previousSessionSummary: String(previousSessionSummary || '').slice(0, 260),
      vocabList,
      studentDescriptor,
      routePrimary: `${routePlan.primary.model}:${routePlan.primary.thinkingLabel}`,
    });

    const systemInstruction = `You are a strict, perceptive senior writing coach and spoken-English fluency mentor evaluating a ${studentDescriptor}.
Deliver an authoritative, deeply insightful editorial critique in the exact caliber of a top human writing mentor—never generic, never robotic, and never inflated.

EVALUATION PRIORITY & WEIGHTAGE ORDER:
1. SCORECARD & RUBRIC ACCURACY (Highest Weightage): Natural Voice & Flow, Clarity & Simplicity, Grammar & Mechanics, Tone & Engagement, Sentence Variety & Cadence, and Conciseness & Directness. Plain, crisp, natural spoken English scores HIGH.
2. PINPOINTED GRAMMAR FLAWS, ERROR CORRECTIONS & SENTENCE REWRITES (Primary Coaching Value): Catch real subject-verb agreement errors, wrong word usage (e.g., "improvise" instead of "improve/stabilize"), compound-word/spacing typos ("Mean while" -> "Meanwhile"), missing articles, tense breaks, 40-50 word breathless run-ons, and phrase repetition. Quote the writer's exact flawed sentences and provide natural spoken-ready rewrites + crystal-clear grammar/cadence rules.
3. ALTERNATIVE VOCABULARY & PHRASING UPGRADES (LOWEST WEIGHTAGE): Vocabulary polish is a bonus layer ONLY. Never penalize clear plain English for not using fancy words. Suggest 2-4 crisp, natural real-world upgrades for vague/wordy phrases that actually appear in the draft (e.g., "doesn't have a sense of" -> "operates blind to", "does the corrective action" -> "applies a proportional correction"). STRICTLY BANNED thesaurus-slop words: utilize, delve, tapestry, myriad, plethora, endeavor, commence, facilitate, synergy, leverage, paramount.

SCORING RUBRIC (1-10 integers, honest strict grading with ZERO score inflation):
- 1-2: Gibberish, random keystrokes, spam, or unintelligible fragments.
- 3-4: Severely off-topic, incomplete stub, or broken grammar that obscures meaning.
- 5: Understandable core idea, but flat, repetitive, or heavily error-prone.
- 6: Clear underlying logic and good intent, yet held back by noticeable grammar/agreement slips, breathless 40+ word sentences, or repeated words.
- 7: Solid, well-structured, natural spoken communication with only minor polish needed.
- 8: Crisp, confident, rhythmic prose tailored cleanly to ${mode} (${tone}) that sounds effortless out loud.
- 9-10: Rare, memorable, publication- or executive-interview-ready command of voice and precision.

STRICT OUTPUT REQUIREMENTS:
1. metricNotes: Provide a sharp 1-sentence note for EACH of the 6 metrics referencing specific evidence from THIS draft (e.g., noting exact imagery, 50-word run-on sentences, apostrophe accuracy, agreement slips, or repeated phrases like "desired outcome").
2. feedbackCheck:
   - status: 'Baseline' (if no previous coaching note), or 'Yes' / 'Partial' / 'No'.
   - implemented: Explicitly name specific mechanics/flow strengths achieved in this draft (e.g., clean apostrophes, zero spelling typos, strong contrast structure).
   - missed: Explicitly name recurring grammar slips (quoting exact examples) and any Practicing Vocabulary targets that would have fit naturally here.
3. whatImprovedPoints: Return 2-3 crisp highlight bullets, each with a concise bold-style title (e.g., "Interview Structure", "Intuitive Phrasing") and concrete detail quoting memorable phrasing from the draft. Also synthesize a 1-2 sentence summary in whatImproved.
4. pinpointedRewrites: Return 2-5 sentence-level critique blocks (ordered from earliest to latest in the draft) for the highest-impact flawed, run-on, or clunky sentences:
   - original: Exact verbatim sentence or clause copied from the draft (no ellipses or paraphrases).
   - rewrite: Clean, natural spoken-English rewrite (split 40+ word run-ons into two crisp sentences where needed).
   - rule: Explicit, memorable grammar & flow rule teaching WHY (e.g., "Always use a plural noun after 'one of the'...", "Never confuse 'improvise' with 'improve' or 'stabilize'...").
   - category: Short label like "Agreement & Verb Form", "Run-On Split & Mechanics", "Word Choice & Conciseness".
5. grammarFixes: Return up to 6 surgical verbatim substring fixes ("original" MUST exist verbatim in the draft) for one-click inline repair. If grammar is completely clean, return [].
6. rewrittenSample: Mirror the #1 highest-impact item from pinpointedRewrites into { original, improved, why } for backwards compatibility.
7. strictImprovements: 1-2 tight imperative coaching priorities summarizing the top habits to lock in next session.
8. vocabUpgrades: Return 2-4 grounded pairs from the draft, each with used (exact draft phrase), betterAlternative (crisp natural phrasing), explanation (brief rationale), contextSnippet, and contextTag (e.g., "Interview / Technical", "Interview / Email", "LinkedIn / Soft Skills", "Creative / Dialogue").
9. Title: ${shouldInferTitle ? 'The writer left the title blank: craft a sharp 3-7 word editorial title in suggestedTitle.' : 'Echo or lightly sharpen the existing topic in suggestedTitle.'}
10. Benchmarks: Keep cefrLevel, ieltsBand (4.0-9.0 in 0.5 steps), toeflEquivalent (8-30), lexicalResource, coherenceCohesion, taskAchievement, and registerControl mathematically aligned with the 6 scores. Avoid em-dashes in short labels where clean punctuation reads better.`;

    const prompt = `Mode: ${mode} | Tone: ${tone} | Word Count: ${wordCount} | Longest Sentence: ${integrity.longestSentenceWords}w
Topic: ${trimmedTopic || '(blank - infer sharp editorial title)'}
${topicPrimer ? `Topic Brief: ${topicPrimer}\n` : ''}${previousSessionSummary ? `Previous Coaching Note: ${previousSessionSummary}\n` : ''}${vocabList.length > 0 ? `To Practice Vocabulary Targets: ${vocabList.join(', ')}\n` : ''}Draft:
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
          ? (parsed.grammarFixes as Array<{
              original: string;
              corrected: string;
              rule: string;
              category: string;
            }>)
          : []
      );

      const groundedPinpoints = filterGroundedPinpointedRewrites(
        trimmedContent,
        Array.isArray(parsed.pinpointedRewrites)
          ? (parsed.pinpointedRewrites as Array<{
              original: string;
              rewrite: string;
              rule: string;
              category?: string;
            }>)
          : []
      );

      const groundedVocab = filterGroundedVocabUpgrades(
        trimmedContent,
        Array.isArray(parsed.vocabUpgrades)
          ? (parsed.vocabUpgrades as Array<{
              used: string;
              betterAlternative: string;
              explanation: string;
              contextSnippet?: string;
              contextTag?: string;
            }>)
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

      res.json({
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
        downgraded,
        cached,
        suggestedTitle,
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
      if (isQuotaOrOverloadError(err)) {
        const provisional = buildServerQueuedEvaluation(
          trimmedContent,
          String(mode),
          String(tone)
        );
        const resetSeconds = getRemainingCooldownSeconds();
        res.json({
          evaluationStatus: 'queued_for_reset',
          modelUsed: 'queued-pending-reset',
          thinkingLevelUsed: 'LOCAL',
          routingMeta: {
            model: 'queued-pending-reset',
            thinkingLevel: 'LOCAL',
            tierLabel: 'Queued (Rate Limit Reset)',
            reason: 'API rate limit reached; queued for automatic retry.',
          },
          downgraded: true,
          cached: false,
          quotaResetSeconds: resetSeconds,
          quotaResetAt: new Date(Date.now() + resetSeconds * 1000).toISOString(),
          ...provisional,
        });
        return;
      }

      const raw = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        error: raw || 'Unable to complete evaluation right now.',
      });
    }
  });

  app.post('/api/realtime-assist', async (req, res) => {
    const {
      content,
      mode = 'Personal Journal',
      tone = 'Professional-Warm',
    } = req.body ?? {};
    if (typeof content !== 'string' || content.trim().length < 15) {
      res.status(400).json({
        error:
          'Write at least a sentence before running live vocabulary & grammar assist.',
      });
      return;
    }

    const trimmedContent = content.trim();
    const wordCount = trimmedContent.split(/\s+/).filter(Boolean).length;
    const cacheKey = makeCacheKey('realtime-assist', {
      content: trimmedContent,
      mode,
      tone,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded, cached } =
        await executeCascadingJsonCall({
          cacheKey,
          task: 'realtime',
          complexityMetric: wordCount,
          contents: `Mode:${mode}|Tone:${tone}\nDraft:\n"""\n${trimmedContent}\n"""`,
          systemInstruction:
            'Concise live English editor for an EIE student. Return 1-sentence toneAlignment, 1-line clarityNudge, up to 3 exact grammarAlerts, and up to 4 vocabUpgrades from draft phrases.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              toneAlignment: { type: Type.STRING },
              clarityNudge: { type: Type.STRING },
              grammarAlerts: {
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
                  },
                  required: [
                    'used',
                    'betterAlternative',
                    'explanation',
                    'contextSnippet',
                  ],
                },
              },
            },
            required: [
              'toneAlignment',
              'clarityNudge',
              'grammarAlerts',
              'vocabUpgrades',
            ],
          },
        });

      res.json({
        ...parsed,
        modelUsed,
        thinkingLevelUsed,
        downgraded,
        cached,
        quotaQueued: false,
      });
    } catch (err) {
      if (isQuotaOrOverloadError(err)) {
        const provisional = buildServerQueuedEvaluation(
          trimmedContent,
          String(mode),
          String(tone)
        );
        res.json({
          toneAlignment: `Live check accepted (${mode} · ${tone}). Deep AI suggestions will resume automatically when the API rate limit resets.`,
          clarityNudge: provisional.flowVerdict,
          grammarAlerts: provisional.grammarFixes,
          vocabUpgrades: [],
          modelUsed: 'queued-pending-reset',
          thinkingLevelUsed: 'LOCAL',
          downgraded: true,
          quotaQueued: true,
        });
        return;
      }

      const raw = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: raw || 'Live assist request failed.' });
    }
  });

  app.post('/api/topics', async (req, res) => {
    const {
      mode = 'Technical & Interview',
      tone = 'Professional-Warm',
      focusArea,
      existingTopics = [],
      studentProfile,
      adaptiveWritingProfile,
    } = req.body ?? {};
    const avoidSample = Array.isArray(existingTopics)
      ? existingTopics.slice(-40).map(String).join('; ')
      : '';
    const persona =
      adaptiveWritingProfile?.personaSummary ||
      (studentProfile?.collegeDegree
        ? `${studentProfile.semester || 'Undergraduate'} ${studentProfile.collegeDegree}`
        : 'focused writer building natural spoken flow and expressive English');
    const cacheKey = makeCacheKey('topics-v2', {
      mode,
      tone,
      focusArea,
      persona,
      avoidLen: avoidSample.length,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded, cached } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'topics',
          complexityMetric: 60,
          contents: `3 fresh, spoken-first, non-repeating writing prompts for: ${persona}.
Mode: ${mode} | Tone: ${tone} | Focus: ${focusArea || 'fresh real-world communication, engineering clarity, or vivid storytelling'}
Strictly avoid repeating any of these past/scheduled topics: ${avoidSample || 'none'}`,
          systemInstruction:
            'Return 3 crisp, highly specific, original writing prompts (no em-dashes, no word-count rules inside the title). Frame each guidance note around how it sounds spoken aloud plus a 1-sentence pivot permission. Never repeat any topic listed in the avoid list.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              prompts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    guidance: { type: Type.STRING },
                    category: { type: Type.STRING },
                    targetWords: { type: Type.INTEGER },
                  },
                  required: ['title', 'guidance', 'category', 'targetWords'],
                },
              },
            },
            required: ['prompts'],
          },
        });

      res.json({ ...parsed, modelUsed, thinkingLevelUsed, downgraded, cached });
    } catch {
      res.json({
        modelUsed: 'curated-eie-pool',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
        prompts: [
          {
            title:
              'Calibrating a PT100 RTD Bridge Against Ambient Thermal Drift in Lab',
            guidance:
              'Explain 3-wire lead compensation aloud to a lab partner. Swap to any sensor bench test you know well.',
            category: String(mode),
            targetWords: 200,
          },
          {
            title:
              'Follow-Up Note After a Process Control & Instrumentation Mock Interview',
            guidance:
              'Reinforce your explanation of PID anti-windup and thank the panel concisely.',
            category: String(mode),
            targetWords: 170,
          },
          {
            title:
              'The Brass Chronometer: When the City Master Clock Skipped a Beat at Midnight',
            guidance:
              'Narrate character urgency through sensory mechanical details and brisk spoken dialogue.',
            category: String(mode),
            targetWords: 230,
          },
        ],
      });
    }
  });

  app.post('/api/schedule-triweekly', async (req, res) => {
    const {
      cycleDates,
      customDates,
      todayISO,
      existingTopics,
      focusNote,
      performanceContext,
      studentProfile,
      adaptiveWritingProfile,
    } = req.body ?? {};

    type DateSpec = {
      scheduledDate: string;
      dayOfWeek: string;
      pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
    };

    const VALID_PILLARS = new Set([
      'technical-concept',
      'linkedin-email',
      'creative-story',
    ]);
    const PILLAR_CYCLE: DateSpec['pillar'][] = [
      'technical-concept',
      'linkedin-email',
      'creative-story',
    ];
    const minDateISO =
      typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayISO)
        ? todayISO
        : '';

    let targetSpecs: DateSpec[] = [];

    if (Array.isArray(customDates) && customDates.length > 0) {
      targetSpecs = customDates
        .slice(0, 31)
        .map((item: Record<string, unknown>, idx: number) => {
          const day = String(item.dayOfWeek || 'Wednesday');
          const rawPillar = String(item.pillar || '');
          const safePillar: DateSpec['pillar'] = VALID_PILLARS.has(rawPillar)
            ? (rawPillar as DateSpec['pillar'])
            : day === 'Wednesday'
              ? 'technical-concept'
              : day === 'Friday'
                ? 'linkedin-email'
                : day === 'Sunday'
                  ? 'creative-story'
                  : PILLAR_CYCLE[idx % PILLAR_CYCLE.length];
          return {
            scheduledDate: String(item.scheduledDate),
            dayOfWeek: day,
            pillar: safePillar,
          };
        })
        .filter((spec) => !minDateISO || spec.scheduledDate >= minDateISO);
    } else {
      const wed = String(cycleDates?.wednesday || '');
      const fri = String(cycleDates?.friday || '');
      const sun = String(cycleDates?.sunday || '');
      if (!wed || !fri || !sun) {
        res.status(400).json({
          error:
            'Either cycleDates (wednesday, friday, sunday) or customDates array is required.',
        });
        return;
      }
      const defaultCycle: DateSpec[] = [
        { scheduledDate: wed, dayOfWeek: 'Wednesday', pillar: 'technical-concept' },
        { scheduledDate: fri, dayOfWeek: 'Friday', pillar: 'linkedin-email' },
        { scheduledDate: sun, dayOfWeek: 'Sunday', pillar: 'creative-story' },
      ];
      targetSpecs = defaultCycle.filter(
        (spec) => !minDateISO || spec.scheduledDate >= minDateISO
      );
    }

    if (targetSpecs.length === 0) {
      res.json({
        slots: [],
        modelUsed: 'none-remaining',
        thinkingLevelUsed: 'LOCAL',
        downgraded: false,
      });
      return;
    }

    const normalizeTopicKey = (val: string) =>
      val
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const existingTopicKeys = new Set(
      Array.isArray(existingTopics)
        ? existingTopics.map((t: unknown) => normalizeTopicKey(String(t || '')))
        : []
    );

    const avoidList = Array.isArray(existingTopics)
      ? existingTopics.slice(-48).join('; ')
      : '';

    const practicingList = Array.isArray(performanceContext?.practicingWords)
      ? performanceContext.practicingWords.slice(0, 3)
      : Array.isArray(adaptiveWritingProfile?.practicingVocab)
        ? adaptiveWritingProfile.practicingVocab.slice(0, 3)
        : [];

    const recurringRules = Array.isArray(adaptiveWritingProfile?.recurringGrammarRules)
      ? adaptiveWritingProfile.recurringGrammarRules.slice(0, 2)
      : Array.isArray(performanceContext?.recentStrictFixes)
        ? performanceContext.recentStrictFixes.slice(0, 2)
        : [];

    const perfSummary = performanceContext
      ? `Avg:${performanceContext.avgPercentage || 75}% | Weakest Pillar:${performanceContext.weakestPillarLabel || 'Natural Voice & Flow'} (${performanceContext.weakestPillarScore || 7.5}/10) | Practicing Vocab:${practicingList.length > 0 ? practicingList.join(', ') : 'None yet'} | Recurring Fixes:${recurringRules.length > 0 ? recurringRules.join(' ; ') : 'Vary sentence rhythm'}`
      : 'Baseline writer (no prior score history yet)';

    const domainTrack =
      adaptiveWritingProfile?.domainTrack ||
      (studentProfile?.collegeDegree &&
      /\b(eie|electronics|instrumentation|embedded|control|sensor|pcb)\b/i.test(
        String(studentProfile.collegeDegree)
      )
        ? 'eie-engineering'
        : studentProfile?.collegeDegree
          ? 'stem-technical'
          : 'general-writer');

    const writerPersona =
      adaptiveWritingProfile?.personaSummary ||
      (studentProfile && studentProfile.collegeDegree
        ? `${studentProfile.semester || 'Current Semester'} · ${studentProfile.collegeDegree}${studentProfile.collegeName ? ` · ${studentProfile.collegeName}` : ''}${studentProfile.age ? ` · Age ${studentProfile.age}` : ''}`
        : studentProfile?.age
          ? `Everyday writer (Age ${studentProfile.age}) developing natural spoken flow and expressive clarity`
          : 'Electronics and Instrumentation Engineering (EIE) undergraduate (end of 5th semester moving into 6th semester)');

    const recentWriterThemes =
      Array.isArray(adaptiveWritingProfile?.recentTopics) &&
      adaptiveWritingProfile.recentTopics.length > 0
        ? adaptiveWritingProfile.recentTopics.slice(0, 5).join('; ')
        : 'None yet';

    const domainAnchorRule =
      domainTrack === 'eie-engineering'
        ? 'Domain Anchor (EIE & Embedded): Anchor technical-concept and linkedin-email prompts in real sensors, ADCs, op-amps, signal conditioning, PID/control loops, PCB/breadboard debugging, and 5th-to-6th-sem capstone & internship experiences rather than generic corporate filler.'
        : `Domain Anchor (Adaptive to Writer Profile): Tailor technical-concept and linkedin-email prompts specifically to this writer's real age, background, field (${writerPersona}), and past writing themes (${recentWriterThemes}). Never force EIE hardware jargon onto a non-EIE writer.`;

    const cacheKey = makeCacheKey('schedule-adaptive-v2', {
      targetSpecs,
      avoidList,
      focusNote,
      perfSummary,
      writerPersona,
      domainTrack,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'schedule',
          complexityMetric: targetSpecs.length,
          contents: `Slots to generate (${targetSpecs.length}): ${targetSpecs
            .map((t) => `${t.dayOfWeek}=${t.scheduledDate} (${t.pillar})`)
            .join(', ')}
Writer Persona: ${writerPersona}
Recent Topics Written by User: ${recentWriterThemes}
Performance & Closed-Loop Targets: ${perfSummary}
Avoid repeating: ${avoidList || 'none'}
Focus note: ${focusNote || 'Fresh spoken-first expressive rotation adapted to this writer'}`,
          systemInstruction: `You design expressive, spoken-first writing prompts tailored to this specific writer (${writerPersona}).
${domainAnchorRule}

Apply ALL 5 PROMPT DESIGN RULES to every single slot (never use em-dashes, never mention clock times or word-count restrictions inside the prompt text):
1. Spoken-First Framing: Frame the task around how words sound out loud (e.g., "Explain out loud as if talking to a curious friend", "Pitch aloud to an interviewer", or "Narrate the scene aloud").
2. Expressive Pull: Push the writer to organize thoughts, contrast ideas, or convey tone and subtext, never dry textbook definitions.
3. Beginner-Friendly Topic Primer: Write a 2-3 sentence plain-English brief in topicPrimer so zero external research is needed.
4. Universal Pivot Rule: In pivotRule, explicitly let the writer swap to any familiar gadget, lab/work experience, email scenario, or story if the topic feels unfamiliar.
5. Active Practice Targets: In feedbackReminder, weave in 1-2 of their recurring grammar/flow focus rules (${recurringRules.join('; ') || 'natural spoken cadence'}) and 2-3 of their practicing words (${practicingList.join(', ') || 'vivid active verbs'}) so improvement is cumulative.

Pillar definitions:
- technical-concept (mode: "technical", tone: "academic-technical"): Mock technical/domain screening answers, explaining a real concept in plain spoken English (no equations), or defending a practical design trade-off aloud.
- linkedin-email (mode: "linkedin" or "email", tone: "professional-warm" or "formal-executive"): Candid project/lab reflections, crisp respectful emails to mentors/recruiters (asking for 15 minutes of feedback without sounding vague), or diplomatic team notes.
- creative-story (mode: "creative", tone: "narrative-vivid"): Vivid worldbuilding, tense character dialogue with subtext, or sensory-driven scenes that stretch vocabulary, rhythm, and emotional range.

For EVERY slot return:
- topic (crisp, natural, evocative title/prompt <= 15 words, zero word-count rules)
- topicPrimer (2-3 plain-English sentences)
- pivotRule (1 clear permission-to-swap sentence)
- feedbackReminder (1 concise active practice target pulling their recurring fix + practicing vocab)
- targetWords (soft guidance integer 160-240 for UI tracking only)
- suggestions (3 short spoken-flow angles, <= 14 words each).`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              slots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dayOfWeek: { type: Type.STRING },
                    scheduledDate: { type: Type.STRING },
                    slotLabel: { type: Type.STRING },
                    mode: { type: Type.STRING },
                    tone: { type: Type.STRING },
                    pillar: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    topicPrimer: { type: Type.STRING },
                    pivotRule: { type: Type.STRING },
                    feedbackReminder: { type: Type.STRING },
                    targetWords: { type: Type.INTEGER },
                    suggestions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'dayOfWeek',
                    'scheduledDate',
                    'slotLabel',
                    'mode',
                    'tone',
                    'pillar',
                    'topic',
                    'topicPrimer',
                    'pivotRule',
                    'feedbackReminder',
                    'targetWords',
                    'suggestions',
                  ],
                },
              },
            },
            required: ['slots'],
          },
        });

      const rawSlots = Array.isArray(parsed.slots) ? parsed.slots : [];
      const seenBatchKeys = new Set<string>(existingTopicKeys);

      const normalized = targetSpecs.map((spec, idx) => {
        const s = (rawSlots[idx] || {}) as Record<string, unknown>;
        const fb = pickFallbackTemplate(spec.pillar, idx);
        const safeMode =
          spec.pillar === 'technical-concept'
            ? 'technical'
            : spec.pillar === 'linkedin-email'
              ? s.mode === 'email'
                ? 'email'
                : 'linkedin'
              : 'creative';
        const safeTone =
          spec.pillar === 'technical-concept'
            ? 'academic-technical'
            : spec.pillar === 'linkedin-email'
              ? safeMode === 'email'
                ? 'formal-executive'
                : 'professional-warm'
              : 'narrative-vivid';

        let candidateTopic = String(s.topic || fb.topic).trim();
        const candidateKey = normalizeTopicKey(candidateTopic);
        if (!candidateTopic || seenBatchKeys.has(candidateKey)) {
          candidateTopic = `${fb.topic} (${spec.dayOfWeek} ${spec.scheduledDate.slice(5)})`;
        }
        seenBatchKeys.add(normalizeTopicKey(candidateTopic));

        return {
          id: `plan-${spec.scheduledDate}-${spec.dayOfWeek.slice(0, 3).toLowerCase()}`,
          dayOfWeek: spec.dayOfWeek,
          slotLabel: String(s.slotLabel || fb.slotLabel),
          slotTime: '18:19',
          scheduledDate: spec.scheduledDate,
          mode: safeMode,
          tone: safeTone,
          promptCategory:
            safeMode === 'technical'
              ? 'Technical & Interview Expression'
              : safeMode === 'email' || safeMode === 'linkedin'
                ? 'LinkedIn, Email & Soft Skills'
                : 'Creative Fantasy & Expressive Storytelling',
          topic: candidateTopic,
          topicPrimer: String(s.topicPrimer || fb.topicPrimer),
          pivotRule: String(s.pivotRule || fb.pivotRule),
          feedbackReminder: String(s.feedbackReminder || fb.feedbackReminder),
          targetWords: Math.max(140, Math.min(300, Number(s.targetWords) || fb.targetWords)),
          completed: false,
          isTriWeekly: true,
          pillar: spec.pillar,
          source: 'ai-adapted',
          suggestions:
            Array.isArray(s.suggestions) && s.suggestions.length > 0
              ? s.suggestions.slice(0, 3).map(String)
              : fb.suggestions,
        };
      });

      res.json({ slots: normalized, modelUsed, thinkingLevelUsed, downgraded });
    } catch {
      const customReminder =
        practicingList.length > 0 || recurringRules.length > 0
          ? `Practice target: ${recurringRules[0] || `strengthen ${performanceContext?.weakestPillarLabel || 'spoken flow'}`}${practicingList.length > 0 ? ` and weave in: ${practicingList.join(', ')}` : ''}.`
          : undefined;

      const slots = targetSpecs.map((spec, idx) => {
        const tpl = pickFallbackTemplate(spec.pillar, idx, customReminder);
        return {
          id: `plan-${spec.scheduledDate}-${spec.dayOfWeek.slice(0, 3).toLowerCase()}`,
          dayOfWeek: spec.dayOfWeek,
          slotLabel: tpl.slotLabel,
          slotTime: '18:19',
          scheduledDate: spec.scheduledDate,
          mode: tpl.mode,
          tone: tpl.tone,
          promptCategory: tpl.promptCategory,
          topic: tpl.topic,
          topicPrimer: tpl.topicPrimer,
          pivotRule: tpl.pivotRule,
          feedbackReminder: tpl.feedbackReminder,
          targetWords: tpl.targetWords,
          completed: false,
          isTriWeekly: true,
          pillar: spec.pillar,
          suggestions: [...tpl.suggestions],
        };
      });
      fallbackRotationCounter += 1;

      res.json({
        slots,
        modelUsed: 'curated-eie-rotation',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
        quotaQueued: true,
      });
    }
  });

  app.post('/api/pivot-topic', async (req, res) => {
    const { slot, customFocus } = req.body ?? {};
    if (!slot || typeof customFocus !== 'string' || customFocus.trim().length < 3) {
      res.status(400).json({ error: 'Provide a topic or gadget focus to pivot onto.' });
      return;
    }

    const focus = customFocus.trim();
    const cacheKey = makeCacheKey('pivot-topic', {
      mode: slot.mode,
      tone: slot.tone,
      focus,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: true,
          task: 'pivot',
          complexityMetric: 60,
          contents: `Student pivoted to familiar focus: "${focus}"
Target Mode: ${slot.mode} | Target Tone: ${slot.tone} | Day: ${slot.dayOfWeek || 'Scheduled'}`,
          systemInstruction:
            'Apply the Universal Pivot Rule for an EIE student: keep the exact target writing mode/tone, reframe the prompt around their familiar focus with a concise topic title, a 2-sentence beginner-friendly topicPrimer, and 3 crisp writing angles.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              topicPrimer: { type: Type.STRING },
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['topic', 'topicPrimer', 'suggestions'],
          },
        });

      res.json({
        topic: String(parsed.topic || focus),
        topicPrimer: String(parsed.topicPrimer || ''),
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.slice(0, 3).map(String)
          : [],
        modelUsed,
        thinkingLevelUsed,
        downgraded,
      });
    } catch {
      res.json({
        topic: `${focus} (${slot.mode === 'creative' ? 'Character Scene' : 'Focused Breakdown'})`,
        topicPrimer: `Pivoted to your chosen focus: ${focus}. Explain or depict the core mechanism, human decision, or outcome clearly in crisp ${slot.tone} English.`,
        suggestions: [
          `Open immediately with a concrete detail from ${focus}.`,
          'Keep verbs active and cut unnecessary throat-clearing fillers.',
          'Close with one memorable takeaway or decision.',
        ],
        modelUsed: 'local-pivot',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
      });
    }
  });

  app.post('/api/suggest-first-month', async (req, res) => {
    const {
      todayISO,
      targetSpecs = [],
      studentProfile,
      adaptiveWritingProfile,
      existingTopics = [],
    } = req.body ?? {};

    const minDate =
      typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayISO)
        ? todayISO
        : new Date().toISOString().slice(0, 10);

    type FirstSpec = {
      scheduledDate: string;
      dayOfWeek: string;
      pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
    };

    const validSpecs: FirstSpec[] = Array.isArray(targetSpecs)
      ? targetSpecs
          .slice(0, 31)
          .map((item: Record<string, unknown>, idx: number) => {
            const p = String(item.pillar || '');
            const safePillar: FirstSpec['pillar'] =
              p === 'technical-concept' ||
              p === 'linkedin-email' ||
              p === 'creative-story'
                ? p
                : (['technical-concept', 'linkedin-email', 'creative-story'] as const)[
                    idx % 3
                  ];
            return {
              scheduledDate: String(item.scheduledDate || minDate),
              dayOfWeek: String(item.dayOfWeek || 'Today'),
              pillar: safePillar,
            };
          })
          .filter((s) => s.scheduledDate >= minDate)
      : [];

    if (validSpecs.length === 0) {
      res.json({ slots: [], modelUsed: 'none-remaining', downgraded: false });
      return;
    }

    const persona =
      adaptiveWritingProfile?.personaSummary ||
      (studentProfile?.collegeDegree
        ? `${studentProfile.semester || 'Undergraduate'} ${studentProfile.collegeDegree}`
        : 'focused writer building natural spoken flow and expressive English');
    const avoidSample = Array.isArray(existingTopics)
      ? existingTopics.slice(-30).map(String).join('; ')
      : '';

    const cacheKey = makeCacheKey('first-month-v1', {
      minDate,
      count: validSpecs.length,
      persona,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'schedule',
          complexityMetric: validSpecs.length,
          preferFastTier: true,
          contents: `Create a welcoming, inspiring first-month writing plan (${validSpecs.length} dates starting on/after ${minDate}) for: ${persona}.
Dates: ${validSpecs.map((s) => `${s.dayOfWeek}=${s.scheduledDate} (${s.pillar})`).join(', ')}
Make the VERY FIRST slot extra inviting, concrete, and immediately enjoyable to write right now.
Never repeat any topic within this list or from: ${avoidSample || 'none'}.`,
          systemInstruction: `Design a crisp, non-repeating spoken-first starter schedule tailored to ${persona}.
Rules (zero em-dashes, zero word-count rules in titles):
- Every slot must be distinct, vivid, and beginner-friendly with a 2-sentence topicPrimer and 1-sentence pivotRule.
- Pillar technical-concept -> mode "technical", tone "academic-technical".
- Pillar linkedin-email -> mode "linkedin" or "email", tone "professional-warm" or "formal-executive".
- Pillar creative-story -> mode "creative", tone "narrative-vivid".`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              slots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    mode: { type: Type.STRING },
                    tone: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    topicPrimer: { type: Type.STRING },
                    pivotRule: { type: Type.STRING },
                    feedbackReminder: { type: Type.STRING },
                    targetWords: { type: Type.INTEGER },
                    suggestions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'mode',
                    'tone',
                    'topic',
                    'topicPrimer',
                    'pivotRule',
                    'feedbackReminder',
                    'targetWords',
                    'suggestions',
                  ],
                },
              },
            },
            required: ['slots'],
          },
        });

      const rawSlots = Array.isArray(parsed.slots) ? parsed.slots : [];
      const seenTitles = new Set<string>();
      const slots = validSpecs.map((spec, idx) => {
        const s = (rawSlots[idx] || {}) as Record<string, unknown>;
        const fb = pickFallbackTemplate(spec.pillar, idx);
        const safeMode =
          spec.pillar === 'technical-concept'
            ? 'technical'
            : spec.pillar === 'linkedin-email'
              ? s.mode === 'email'
                ? 'email'
                : 'linkedin'
              : 'creative';
        const safeTone =
          spec.pillar === 'technical-concept'
            ? 'academic-technical'
            : spec.pillar === 'linkedin-email'
              ? safeMode === 'email'
                ? 'formal-executive'
                : 'professional-warm'
              : 'narrative-vivid';

        let cleanTopic = String(s.topic || fb.topic).trim();
        const key = cleanTopic.toLowerCase();
        if (!cleanTopic || seenTitles.has(key)) {
          cleanTopic = fb.topic;
        }
        seenTitles.add(cleanTopic.toLowerCase());

        return {
          id: `plan-${spec.scheduledDate}-${spec.dayOfWeek.slice(0, 3).toLowerCase()}`,
          dayOfWeek: spec.dayOfWeek,
          slotLabel: idx === 0 ? 'First Topic · AI Starter' : fb.slotLabel,
          slotTime: '18:19',
          scheduledDate: spec.scheduledDate,
          mode: safeMode,
          tone: safeTone,
          promptCategory: fb.promptCategory,
          topic: cleanTopic,
          topicPrimer: String(s.topicPrimer || fb.topicPrimer),
          pivotRule: String(s.pivotRule || fb.pivotRule),
          feedbackReminder: String(s.feedbackReminder || fb.feedbackReminder),
          targetWords: Math.max(
            150,
            Math.min(280, Number(s.targetWords) || fb.targetWords)
          ),
          completed: false,
          isTriWeekly: true,
          pillar: spec.pillar,
          source: 'ai-adapted',
          suggestions:
            Array.isArray(s.suggestions) && s.suggestions.length > 0
              ? s.suggestions.slice(0, 3).map(String)
              : fb.suggestions,
        };
      });

      res.json({ slots, modelUsed, thinkingLevelUsed, downgraded });
    } catch {
      res.status(503).json({
        error: 'AI starter schedule temporarily unavailable; falling back to 52-week roadmap.',
      });
    }
  });

  app.post('/api/categorize-vocab', async (req, res) => {
    const { entries = [] } = req.body ?? {};
    if (!Array.isArray(entries) || entries.length === 0) {
      res.json({ categories: {}, modelUsed: 'none', downgraded: false });
      return;
    }

    const ALLOWED_CATEGORIES = [
      'Technical & Engineering',
      'Professional & Outreach',
      'Storytelling & Vivid',
      'Precision & Clarity',
      'Everyday Expression',
    ] as const;

    const compactEntries = entries.slice(0, 80).map((e: Record<string, unknown>) => ({
      id: String(e.id || ''),
      word: String(e.betterAlternative || ''),
      replaces: String(e.used || ''),
      meaning: String(e.explanation || '').slice(0, 120),
      mode: String(e.mode || 'journal'),
    }));

    const cacheKey = makeCacheKey('categorize-vocab-v1', compactEntries);

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded, cached } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: true,
          task: 'topics',
          complexityMetric: compactEntries.length,
          preferFastTier: true,
          contents: `Categorize each vocabulary item into EXACTLY ONE of these 5 categories:
${ALLOWED_CATEGORIES.join(' | ')}

Entries:
${compactEntries.map((e) => `${e.id}: "${e.word}" (replaces "${e.replaces}", mode=${e.mode}) - ${e.meaning}`).join('\n')}`,
          systemInstruction:
            'Assign each vocabulary entry ID to the single most useful semantic category from the 5 provided categories so a writer can browse their personal lexicon cleanly.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['id', 'category'],
                },
              },
            },
            required: ['items'],
          },
        });

      const allowedSet = new Set<string>(ALLOWED_CATEGORIES);
      const categories: Record<string, string> = {};
      if (Array.isArray(parsed.items)) {
        for (const row of parsed.items as Array<Record<string, unknown>>) {
          const id = String(row.id || '');
          const cat = String(row.category || '');
          if (id && allowedSet.has(cat)) {
            categories[id] = cat;
          }
        }
      }

      res.json({ categories, modelUsed, thinkingLevelUsed, downgraded, cached });
    } catch {
      res.status(503).json({
        error: 'AI categorization temporarily unavailable.',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1y',
        immutable: true,
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quillit server running on http://localhost:${PORT}`);
  });
}

createApp();
