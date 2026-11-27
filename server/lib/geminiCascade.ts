import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  calibrateEvaluationScores,
  filterGroundedGrammarFixes,
} from '../../src/utils/evaluationCalibration';
import {
  ACTIVE_GEMINI_TEXT_MODELS,
  MODEL_CAPABILITIES,
  getModelStepTimeoutMs,
  normalizeThinkingLabel,
  selectUtilityModelCascade,
  supportsThinkingLevel,
  type ActiveEvalModel,
  type ActiveThinkingLabel,
  type EvaluationRouteStep,
} from '../../src/utils/evaluationRouter';
import { computeProseDiagnostics } from '../../src/utils/proseDiagnostics';
import { extractSafeJsonObject } from './validation';

/**
 * Multi-generation active Gemini text model cascade (PSR-10 — zero deprecated 1.5/2.0 models).
 * Order:
 *   1. gemini-4-hydrogen (HIGH / MEDIUM / LOW — never MINIMAL)
 *   2. gemini-3-flash-preview
 *   3. gemini-3.1-flash-lite (HIGH / MEDIUM / LOW / MINIMAL)
 *   4. gemini-2.5-flash (STANDARD — never thinkingConfig.thinkingLevel)
 *   5. gemini-2.5-flash-lite (STANDARD — never thinkingConfig.thinkingLevel)
 */
export const MODEL_TIERS = ACTIVE_GEMINI_TEXT_MODELS;
export type ModelTier = ActiveEvalModel;
export type CoachTaskKind = 'realtime' | 'schedule' | 'pivot' | 'topics';

export const modelCooldownUntil: Record<ModelTier, number> = {
  'gemini-4-hydrogen': 0,
  'gemini-3-flash-preview': 0,
  'gemini-3.1-flash-lite': 0,
  'gemini-2.5-flash': 0,
  'gemini-2.5-flash-lite': 0,
};

export const modelUnsupportedUntil: Record<ModelTier, number> = {
  'gemini-4-hydrogen': 0,
  'gemini-3-flash-preview': 0,
  'gemini-3.1-flash-lite': 0,
  'gemini-2.5-flash': 0,
  'gemini-2.5-flash-lite': 0,
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

export function makeCacheKey(endpoint: string, payload: unknown): string {
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

export function getAiClient(): GoogleGenAI {
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

export function clampScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 5;
  return Math.max(1, Math.min(10, Math.round(num)));
}

export function clampPercentage(value: unknown, fallback = 70): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function isQuotaOrOverloadError(err: unknown): boolean {
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

export function isUnsupportedOrNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('404') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('403')
  );
}

export function isInvalidArgumentError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('400') || msg.includes('INVALID_ARGUMENT');
}

export function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('STEP_TIMEOUT');
}

export function isTransientNetworkError(err: unknown): boolean {
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

export function getCandidateModelOrder(): ModelTier[] {
  const now = Date.now();
  const supported = MODEL_TIERS.filter((m) => now >= modelUnsupportedUntil[m]);
  const pool = supported.length > 0 ? supported : [...MODEL_TIERS];
  const available = pool.filter((m) => now >= modelCooldownUntil[m]);
  if (available.length > 0) {
    return available;
  }
  return [...pool].reverse();
}

export function getRemainingCooldownSeconds(): number {
  const now = Date.now();
  const activeCooldowns = MODEL_TIERS.filter(
    (m) => now >= modelUnsupportedUntil[m]
  )
    .map((m) => Math.max(0, Math.ceil((modelCooldownUntil[m] - now) / 1000)))
    .filter((s) => s > 0);
  if (activeCooldowns.length === 0) return 20;
  return Math.max(10, Math.min(40, Math.min(...activeCooldowns)));
}

export function toSdkThinkingLevel(
  model: ModelTier,
  label: ActiveThinkingLabel
): ThinkingLevel | null {
  if (!supportsThinkingLevel(model)) return null;
  const normalized = normalizeThinkingLabel(model, label);
  if (normalized === 'HIGH') return ThinkingLevel.HIGH;
  if (normalized === 'MEDIUM') return ThinkingLevel.MEDIUM;
  if (normalized === 'MINIMAL') return ThinkingLevel.MINIMAL;
  return ThinkingLevel.LOW;
}

/**
 * Builds a strictly model-safe Gemini request config (PSR-10):
 * - Never sends `thinkingConfig.thinkingLevel` to Gemini 2.5 models.
 * - Never sends `ThinkingLevel.MINIMAL` to `gemini-4-hydrogen`.
 */
export function buildModelRequestConfig(params: {
  model: ModelTier;
  thinkingLabel: ActiveThinkingLabel;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  includeSeed?: boolean;
}): Record<string, unknown> {
  const {
    model,
    thinkingLabel,
    systemInstruction,
    responseSchema,
    includeSeed = true,
  } = params;

  const config: Record<string, unknown> = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema,
  };

  if (includeSeed) {
    config.seed = 42;
  }

  const sdkThinking = toSdkThinkingLevel(model, thinkingLabel);
  if (sdkThinking !== null) {
    config.thinkingConfig = {
      thinkingLevel: sdkThinking,
    };
  }

  return config;
}

export function recordModelFailure(model: ModelTier, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (isUnsupportedOrNotFoundError(err)) {
    modelUnsupportedUntil[model] = Date.now() + 30 * 60_000;
    return;
  }
  if (isTimeoutError(err)) {
    modelCooldownUntil[model] = Date.now() + 20_000;
    return;
  }
  if (isQuotaOrOverloadError(err)) {
    const isRateLimit =
      msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
    modelCooldownUntil[model] = Date.now() + (isRateLimit ? 40_000 : 18_000);
    return;
  }
  if (isTransientNetworkError(err)) {
    modelCooldownUntil[model] = Date.now() + 12_000;
  }
}

export function recordModelSuccess(model: ModelTier, downgraded: boolean): void {
  lastSuccessfulModel = model;
  if (downgraded) {
    totalAutoDowngrades += 1;
  }
}

export function getCascadeHealthSnapshot() {
  const now = Date.now();
  const candidates = getCandidateModelOrder();
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  const tiers = MODEL_TIERS.map((m) => {
    const cooldownSeconds = Math.max(
      0,
      Math.ceil((modelCooldownUntil[m] - now) / 1000)
    );
    const unsupportedSeconds = Math.max(
      0,
      Math.ceil((modelUnsupportedUntil[m] - now) / 1000)
    );
    return {
      model: m,
      tierName: MODEL_CAPABILITIES[m].shortLabel,
      generation: MODEL_CAPABILITIES[m].generation,
      available: cooldownSeconds === 0 && unsupportedSeconds === 0,
      cooldownSeconds,
      unsupportedSeconds,
    };
  });
  const aiAvailable = hasKey && tiers.some((t) => t.available);
  const coolingCandidates = tiers
    .filter((t) => t.unsupportedSeconds === 0 && t.cooldownSeconds > 0)
    .map((t) => t.cooldownSeconds);
  const nextAvailableInSeconds = aiAvailable
    ? 0
    : coolingCandidates.length > 0
      ? Math.min(...coolingCandidates)
      : hasKey
        ? 20
        : 60;

  return {
    ok: true,
    hasKey,
    aiAvailable,
    nextAvailableInSeconds,
    activeModel: candidates[0],
    lastSuccessfulModel,
    tiers,
    totalCacheHits,
    totalAutoDowngrades,
  };
}

/**
 * Pure cascade runner testable with injected executors so unit tests can verify
 * 5-generation fallback, per-request failed-model skip sets, and timeouts deterministically.
 */
export async function runCascadeSteps<T>(params: {
  cascade: EvaluationRouteStep[];
  timeoutForStep: (step: EvaluationRouteStep) => number;
  executeStep: (step: EvaluationRouteStep, includeSeed: boolean) => Promise<T>;
  onFailure?: (step: EvaluationRouteStep, err: unknown) => void;
  cooldownMap?: Partial<Record<ActiveEvalModel, number>>;
  unsupportedMap?: Partial<Record<ActiveEvalModel, number>>;
}): Promise<{ result: T; stepUsed: EvaluationRouteStep; downgraded: boolean }> {
  const {
    cascade,
    timeoutForStep,
    executeStep,
    onFailure,
    cooldownMap = modelCooldownUntil,
    unsupportedMap = modelUnsupportedUntil,
  } = params;

  const primaryModel: ActiveEvalModel = cascade[0]?.model ?? 'gemini-4-hydrogen';
  const failedModelsThisRequest = new Set<ActiveEvalModel>();
  let lastErr: unknown;
  let hadRetryableFailure = false;

  for (let i = 0; i < cascade.length; i += 1) {
    const step = cascade[i];
    const now = Date.now();

    if (
      failedModelsThisRequest.has(step.model) ||
      (unsupportedMap[step.model] ?? 0) > now
    ) {
      continue;
    }

    if ((cooldownMap[step.model] ?? 0) > now) {
      const hasHealthyAlternativeAhead = cascade
        .slice(i + 1)
        .some(
          (next) =>
            !failedModelsThisRequest.has(next.model) &&
            (unsupportedMap[next.model] ?? 0) <= now &&
            (cooldownMap[next.model] ?? 0) <= now
        );
      if (hasHealthyAlternativeAhead) {
        continue;
      }
    }

    const downgraded = i > 0 || step.model !== primaryModel;
    const stepTimeoutMs = timeoutForStep(step);
    let includeSeed = true;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          executeStep(step, includeSeed),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(
                new Error(
                  `STEP_TIMEOUT: ${step.model} (${step.thinkingLabel}) exceeded ${stepTimeoutMs}ms`
                )
              );
            }, stepTimeoutMs);
          }),
        ]);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        return { result, stepUsed: step, downgraded };
      } catch (err) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        lastErr = err;
        if (
          isTimeoutError(err) ||
          isQuotaOrOverloadError(err) ||
          isTransientNetworkError(err)
        ) {
          hadRetryableFailure = true;
        }

        if (
          isUnsupportedOrNotFoundError(err) ||
          isTimeoutError(err) ||
          isQuotaOrOverloadError(err)
        ) {
          onFailure?.(step, err);
          failedModelsThisRequest.add(step.model);
          break;
        }

        if (attempt === 0 && isInvalidArgumentError(err) && includeSeed) {
          includeSeed = false;
          continue;
        }

        if (attempt === 0 && isTransientNetworkError(err)) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        onFailure?.(step, err);
        failedModelsThisRequest.add(step.model);
        break;
      }
    }
  }

  const finalErr =
    lastErr instanceof Error
      ? lastErr
      : new Error(
          typeof lastErr === 'string' && lastErr
            ? lastErr
            : 'All Gemini model tiers are currently busy.'
        );
  if (hadRetryableFailure) {
    (finalErr as Error & { hadRetryableFailure?: boolean }).hadRetryableFailure =
      true;
  }
  throw finalErr;
}

export async function executeDynamicEvaluationCall(params: {
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

  const taskPromise = (async () => {
    const ai = getAiClient();
    const { result: parsed, stepUsed, downgraded } = await runCascadeSteps({
      cascade,
      timeoutForStep: (step) =>
        getModelStepTimeoutMs(step.model, step.thinkingLabel, 'evaluate'),
      onFailure: (step, err) => recordModelFailure(step.model, err),
      executeStep: async (step, includeSeed) => {
        const config = buildModelRequestConfig({
          model: step.model,
          thinkingLabel: step.thinkingLabel,
          systemInstruction,
          responseSchema,
          includeSeed,
        });
        const response = await ai.models.generateContent({
          model: step.model,
          contents,
          config,
        });
        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          throw new Error(`Empty response from ${step.model}`);
        }
        return extractSafeJsonObject(rawText);
      },
    });

    recordModelSuccess(stepUsed.model, downgraded);
    const resultEnvelope = {
      parsed,
      stepUsed,
      modelUsed: stepUsed.model,
      thinkingLevelUsed: stepUsed.thinkingLabel,
      downgraded,
    };
    setCachedResponse(cacheKey, resultEnvelope);
    return resultEnvelope;
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

export async function executeCascadingJsonCall(params: {
  cacheKey: string;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  allowCache?: boolean;
  task?: CoachTaskKind;
  complexityMetric?: number;
  preferFastTier?: boolean;
  overrideTimeoutMs?: number;
}): Promise<{
  parsed: Record<string, unknown>;
  modelUsed: ModelTier;
  thinkingLevelUsed: string;
  downgraded: boolean;
  cached: boolean;
  latencyMs: number;
}> {
  const {
    cacheKey,
    contents,
    systemInstruction,
    responseSchema,
    allowCache = true,
    task = 'topics',
    complexityMetric = 60,
    preferFastTier,
    overrideTimeoutMs,
  } = params;

  const startedAt = Date.now();

  if (allowCache) {
    const cachedHit = getCachedResponse(cacheKey);
    if (cachedHit) {
      return {
        parsed: cachedHit.parsed as Record<string, unknown>,
        modelUsed: (cachedHit.modelUsed as ModelTier) || lastSuccessfulModel,
        thinkingLevelUsed: String(cachedHit.thinkingLevelUsed || 'LOW'),
        downgraded: Boolean(cachedHit.downgraded),
        cached: true,
        latencyMs: Math.max(1, Date.now() - startedAt),
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
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  }

  const taskPromise = (async () => {
    const ai = getAiClient();
    const cascade = selectUtilityModelCascade({
      task,
      complexityMetric,
      preferFastTier,
      cooldownUntil: modelCooldownUntil,
      unsupportedUntil: modelUnsupportedUntil,
    });

    const { result: parsed, stepUsed, downgraded } = await runCascadeSteps({
      cascade,
      timeoutForStep: (step) =>
        overrideTimeoutMs ??
        getModelStepTimeoutMs(step.model, step.thinkingLabel, task),
      onFailure: (step, err) => recordModelFailure(step.model, err),
      executeStep: async (step, includeSeed) => {
        const config = buildModelRequestConfig({
          model: step.model,
          thinkingLabel: step.thinkingLabel,
          systemInstruction,
          responseSchema,
          includeSeed,
        });
        const response = await ai.models.generateContent({
          model: step.model,
          contents,
          config,
        });
        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          throw new Error(`Empty response from ${step.model}`);
        }
        return extractSafeJsonObject(rawText);
      },
    });

    recordModelSuccess(stepUsed.model, downgraded);
    const resultEnvelope = {
      parsed,
      modelUsed: stepUsed.model,
      thinkingLevelUsed: stepUsed.thinkingLabel,
      downgraded,
    };

    if (allowCache) {
      setCachedResponse(cacheKey, resultEnvelope);
    }
    return resultEnvelope;
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
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export function buildServerQueuedEvaluation(
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
  const diagnostics = computeProseDiagnostics(content);

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
    spokenReadinessScore: diagnostics.baselineSpokenReadiness,
    signalNoiseRatio: diagnostics.signalNoiseRatio,
    calqueFixes: diagnostics.calqueFixes,
    audienceReaction:
      'Provisional local check captured — full reader reaction will appear once the live Gemini tier resets.',
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
