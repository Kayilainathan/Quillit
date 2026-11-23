/**
 * Dynamic Evaluation & Multi-Generation Gemini Model Router
 *
 * Keeps the Evaluation Engine (and all AI endpoints) stall-free by dynamically routing
 * across active, non-deprecated Gemini text generations and thinking tiers:
 *   1. `gemini-4-hydrogen` (Gemini 4 Flash / Hydrogen — HIGH / MEDIUM / LOW)
 *   2. `gemini-3-flash-preview` (Gemini 3 Flash — HIGH / MEDIUM / LOW / MINIMAL)
 *   3. `gemini-3.1-flash-lite` (Gemini 3.1 Flash Lite — HIGH / MEDIUM / LOW / MINIMAL)
 *   4. `gemini-2.5-flash` (Gemini 2.5 Flash — STANDARD; omits thinkingLevel)
 *   5. `gemini-2.5-flash-lite` (Gemini 2.5 Flash Lite — STANDARD; omits thinkingLevel)
 *
 * Strict Gemini API safety invariants:
 * - NEVER uses deprecated models (`gemini-1.5-*`, `gemini-2.0-*`, `gemini-pro`).
 * - NEVER silently routes paid-only models (`gemini-4-carbon`, `gemini-4-neon`, `gemini-4-argon`).
 * - NEVER sends `MINIMAL` thinking to `gemini-4-hydrogen`.
 * - NEVER sends `thinkingConfig.thinkingLevel` to Gemini 2.5 models (Gemini 3/4 only).
 */

export const ACTIVE_GEMINI_TEXT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

export type ActiveEvalModel = (typeof ACTIVE_GEMINI_TEXT_MODELS)[number];

export const FAST_GEMINI_TEXT_MODELS: readonly ActiveEvalModel[] = [
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-4-hydrogen',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
] as const;

export type ActiveThinkingLabel =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'MINIMAL'
  | 'STANDARD';

export type RouterTaskKind =
  | 'evaluate'
  | 'realtime'
  | 'schedule'
  | 'pivot'
  | 'topics'
  | 'converse';

export interface ModelCapability {
  model: ActiveEvalModel;
  shortLabel: string;
  generation: '4' | '3.1' | '3' | '2.5';
  supportsThinkingLevel: boolean;
  supportsMinimalThinking: boolean;
  evalTimeoutMs: Record<ActiveThinkingLabel, number>;
  utilityTimeoutMs: number;
  chatTimeoutMs: number;
}

export const MODEL_CAPABILITIES: Record<ActiveEvalModel, ModelCapability> = {
  'gemini-4-hydrogen': {
    model: 'gemini-4-hydrogen',
    shortLabel: 'Hydrogen',
    generation: '4',
    supportsThinkingLevel: true,
    supportsMinimalThinking: false,
    evalTimeoutMs: {
      HIGH: 26_000,
      MEDIUM: 23_000,
      LOW: 15_000,
      MINIMAL: 15_000,
      STANDARD: 23_000,
    },
    utilityTimeoutMs: 14_000,
    chatTimeoutMs: 14_000,
  },
  'gemini-3-flash-preview': {
    model: 'gemini-3-flash-preview',
    shortLabel: 'Gemini 3 Flash',
    generation: '3',
    supportsThinkingLevel: true,
    supportsMinimalThinking: true,
    evalTimeoutMs: {
      HIGH: 18_000,
      MEDIUM: 15_000,
      LOW: 12_000,
      MINIMAL: 10_000,
      STANDARD: 15_000,
    },
    utilityTimeoutMs: 13_000,
    chatTimeoutMs: 12_000,
  },
  'gemini-3.1-flash-lite': {
    model: 'gemini-3.1-flash-lite',
    shortLabel: 'Flash Lite',
    generation: '3.1',
    supportsThinkingLevel: true,
    supportsMinimalThinking: true,
    evalTimeoutMs: {
      HIGH: 14_000,
      MEDIUM: 11_000,
      LOW: 9_500,
      MINIMAL: 8_500,
      STANDARD: 11_000,
    },
    utilityTimeoutMs: 10_000,
    chatTimeoutMs: 9_500,
  },
  'gemini-2.5-flash': {
    model: 'gemini-2.5-flash',
    shortLabel: 'Gemini 2.5 Flash',
    generation: '2.5',
    supportsThinkingLevel: false,
    supportsMinimalThinking: false,
    evalTimeoutMs: {
      HIGH: 14_000,
      MEDIUM: 14_000,
      LOW: 14_000,
      MINIMAL: 14_000,
      STANDARD: 14_000,
    },
    utilityTimeoutMs: 12_000,
    chatTimeoutMs: 12_000,
  },
  'gemini-2.5-flash-lite': {
    model: 'gemini-2.5-flash-lite',
    shortLabel: 'Flash 2.5 Lite',
    generation: '2.5',
    supportsThinkingLevel: false,
    supportsMinimalThinking: false,
    evalTimeoutMs: {
      HIGH: 10_000,
      MEDIUM: 10_000,
      LOW: 10_000,
      MINIMAL: 10_000,
      STANDARD: 10_000,
    },
    utilityTimeoutMs: 9_500,
    chatTimeoutMs: 9_000,
  },
};

export function supportsThinkingLevel(model: ActiveEvalModel): boolean {
  return MODEL_CAPABILITIES[model].supportsThinkingLevel;
}

export function supportsMinimalThinking(model: ActiveEvalModel): boolean {
  return MODEL_CAPABILITIES[model].supportsMinimalThinking;
}

export function normalizeThinkingLabel(
  model: ActiveEvalModel,
  requested: ActiveThinkingLabel
): ActiveThinkingLabel {
  const cap = MODEL_CAPABILITIES[model];
  if (!cap.supportsThinkingLevel) {
    return 'STANDARD';
  }
  if (requested === 'STANDARD') {
    return 'MEDIUM';
  }
  if (requested === 'MINIMAL' && !cap.supportsMinimalThinking) {
    return 'LOW';
  }
  return requested;
}

export function formatTierLabel(
  model: ActiveEvalModel,
  thinkingLabel: ActiveThinkingLabel
): string {
  const cap = MODEL_CAPABILITIES[model];
  const normalized = normalizeThinkingLabel(model, thinkingLabel);
  if (normalized === 'STANDARD') {
    return cap.shortLabel;
  }
  const tierName =
    normalized === 'HIGH'
      ? 'High'
      : normalized === 'MEDIUM'
        ? 'Medium'
        : normalized === 'MINIMAL'
          ? 'Instant'
          : 'Low';
  return `${cap.shortLabel} · ${tierName}`;
}

export function getModelStepTimeoutMs(
  model: ActiveEvalModel,
  thinkingLabel: ActiveThinkingLabel,
  task: RouterTaskKind = 'evaluate'
): number {
  const cap = MODEL_CAPABILITIES[model];
  const normalized = normalizeThinkingLabel(model, thinkingLabel);
  if (task === 'evaluate') {
    return cap.evalTimeoutMs[normalized];
  }
  if (task === 'converse') {
    return cap.chatTimeoutMs;
  }
  if (task === 'schedule') {
    return cap.utilityTimeoutMs + 4_000;
  }
  return cap.utilityTimeoutMs;
}

export interface EvaluationRouteInput {
  wordCount: number;
  mode: string;
  tone: string;
  topic?: string;
  topicPrimer?: string;
  longestSentenceWords?: number;
  hasPreviousSessionSummary?: boolean;
  practicingVocabCount?: number;
  isGibberishOrLowEffort?: boolean;
  cooldownUntil?: Partial<Record<ActiveEvalModel, number>>;
  unsupportedUntil?: Partial<Record<ActiveEvalModel, number>>;
  nowMs?: number;
}

export interface EvaluationRouteStep {
  model: ActiveEvalModel;
  thinkingLabel: ActiveThinkingLabel;
  tierLabel: string;
  reason: string;
}

export interface EvaluationRoutePlan {
  primary: EvaluationRouteStep;
  cascade: EvaluationRouteStep[];
  complexityScore: number;
  topicComplexity: 'high' | 'standard' | 'light';
}

const HIGH_COMPLEXITY_MODE_RE =
  /(technical|interview|creative|story|academic|executive|formal|linkedin)/i;
const HIGH_COMPLEXITY_TOPIC_RE =
  /(pid|adc|dac|sensor|signal|conditioning|thermocouple|rtd|op-?amp|cmrr|wheatstone|control|loop|closed-?loop|open-?loop|plc|scada|pcb|microcontroller|embedded|firmware|architecture|trade-?off|alchemist|storm|dialogue|subtext|mentor|recruiter|capstone|internship|interview|oscilloscope|filter|amplifier|calibration|debugging)/i;
const LIGHT_MODE_RE = /(journal|friend|casual|quick|free\s*write)/i;

export function classifyTopicComplexity(
  mode: string,
  tone: string,
  topic = '',
  topicPrimer = ''
): 'high' | 'standard' | 'light' {
  const combined = `${mode} ${tone} ${topic} ${topicPrimer}`.trim();
  if (
    HIGH_COMPLEXITY_TOPIC_RE.test(combined) ||
    /(technical|interview|creative|formal|executive|academic)/i.test(
      `${mode} ${tone}`
    )
  ) {
    return 'high';
  }
  if (HIGH_COMPLEXITY_MODE_RE.test(`${mode} ${tone}`)) {
    return 'standard';
  }
  if (LIGHT_MODE_RE.test(`${mode} ${tone}`) && topic.trim().length < 36) {
    return 'light';
  }
  return 'standard';
}

export function computeEvaluationComplexityScore(
  input: EvaluationRouteInput
): { score: number; topicComplexity: 'high' | 'standard' | 'light' } {
  const topicComplexity = classifyTopicComplexity(
    input.mode,
    input.tone,
    input.topic,
    input.topicPrimer
  );

  let score = 0;

  // Word volume contribution (primary signal)
  if (input.wordCount >= 260) score += 5;
  else if (input.wordCount >= 180) score += 4;
  else if (input.wordCount >= 110) score += 3;
  else if (input.wordCount >= 65) score += 2;
  else if (input.wordCount >= 35) score += 1;

  // Topic & genre rigor contribution
  if (topicComplexity === 'high') score += 2;
  else if (topicComplexity === 'standard') score += 1;

  // Dense/run-on syntax needs deeper sentence-level rewriting
  if ((input.longestSentenceWords ?? 0) >= 34) {
    score += 1;
  }

  // Closed-loop coaching context (checking prior feedback + vocab weaving)
  if (input.hasPreviousSessionSummary) score += 1;
  if ((input.practicingVocabCount ?? 0) >= 2) score += 1;

  return { score, topicComplexity };
}

function buildStep(
  model: ActiveEvalModel,
  thinkingLabel: ActiveThinkingLabel,
  reason: string
): EvaluationRouteStep {
  const normalized = normalizeThinkingLabel(model, thinkingLabel);
  return {
    model,
    thinkingLabel: normalized,
    tierLabel: formatTierLabel(model, normalized),
    reason,
  };
}

/**
 * Produces a deep, non-stalling ordered cascade of (model, thinkingLabel) steps tailored
 * to the draft's word count, topic complexity, active cooldowns, and unsupported-model guards.
 *
 * Every single route guarantees full multi-generation downgrade coverage:
 * Hydrogen (Gen 4) -> Gemini 3 Flash (Gen 3) -> Flash Lite 3.1 (Gen 3.1) -> Gemini 2.5 Flash -> Flash 2.5 Lite.
 */
export function selectDynamicEvaluationRoute(
  input: EvaluationRouteInput
): EvaluationRoutePlan {
  const now = input.nowMs ?? Date.now();
  const cooldown = input.cooldownUntil ?? {};
  const unsupported = input.unsupportedUntil ?? {};
  const { score, topicComplexity } = computeEvaluationComplexityScore(input);

  const isUnsupported = (model: ActiveEvalModel): boolean =>
    (unsupported[model] ?? 0) > now;
  const isCoolingDown = (model: ActiveEvalModel): boolean =>
    (cooldown[model] ?? 0) > now;

  let desired: EvaluationRouteStep[];

  if (input.isGibberishOrLowEffort) {
    desired = [
      buildStep(
        'gemini-3.1-flash-lite',
        'LOW',
        'Fast integrity verification for ultra-short or low-coherence input'
      ),
      buildStep(
        'gemini-2.5-flash-lite',
        'STANDARD',
        'Ultra-light Gemini 2.5 Flash Lite safety verification'
      ),
      buildStep(
        'gemini-3-flash-preview',
        'LOW',
        'Gemini 3 Flash fast backup verification'
      ),
      buildStep(
        'gemini-2.5-flash',
        'STANDARD',
        'Gemini 2.5 Flash backup verification'
      ),
      buildStep(
        'gemini-4-hydrogen',
        'LOW',
        'Hydrogen Low fallback verification'
      ),
    ];
  } else if (
    input.wordCount >= 240 ||
    (input.wordCount >= 180 && topicComplexity === 'high' && score >= 8)
  ) {
    desired = [
      buildStep(
        'gemini-4-hydrogen',
        'HIGH',
        `Deep multi-paragraph editorial pass (${input.wordCount}w, ${topicComplexity}-rigor topic)`
      ),
      buildStep(
        'gemini-4-hydrogen',
        'MEDIUM',
        'Balanced Hydrogen fallback for long draft'
      ),
      buildStep(
        'gemini-3-flash-preview',
        'MEDIUM',
        'Gemini 3 Flash dynamic downgrade for deep critique'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'HIGH',
        'High-reasoning Flash Lite 3.1 failover'
      ),
      buildStep(
        'gemini-2.5-flash',
        'STANDARD',
        'Gemini 2.5 Flash resilient generation failover'
      ),
      buildStep(
        'gemini-2.5-flash-lite',
        'STANDARD',
        'Flash 2.5 Lite zero-stall safety tier'
      ),
    ];
  } else if (
    input.wordCount >= 95 ||
    (input.wordCount >= 65 && topicComplexity === 'high') ||
    score >= 5
  ) {
    desired = [
      buildStep(
        'gemini-4-hydrogen',
        'MEDIUM',
        `Strict line-by-line coaching (${input.wordCount}w, ${topicComplexity}-rigor topic)`
      ),
      buildStep(
        'gemini-3-flash-preview',
        'MEDIUM',
        'Gemini 3 Flash dynamic downgrade'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'HIGH',
        'High-reasoning Flash Lite 3.1 failover'
      ),
      buildStep(
        'gemini-2.5-flash',
        'STANDARD',
        'Gemini 2.5 Flash resilient failover'
      ),
      buildStep(
        'gemini-4-hydrogen',
        'LOW',
        'Low-latency Hydrogen failover'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'LOW',
        'Fast Flash Lite 3.1 safety tier'
      ),
      buildStep(
        'gemini-2.5-flash-lite',
        'STANDARD',
        'Flash 2.5 Lite zero-stall safety tier'
      ),
    ];
  } else if (input.wordCount >= 45 || topicComplexity === 'high') {
    desired = [
      buildStep(
        'gemini-4-hydrogen',
        'LOW',
        `Fast Hydrogen critique for concise draft (${input.wordCount}w)`
      ),
      buildStep(
        'gemini-3-flash-preview',
        'LOW',
        'Gemini 3 Flash low-latency downgrade'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'MEDIUM',
        'Balanced Flash Lite 3.1 failover for concise draft'
      ),
      buildStep(
        'gemini-2.5-flash',
        'STANDARD',
        'Gemini 2.5 Flash resilient failover'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'LOW',
        'Ultra-fast Flash Lite 3.1 safety tier'
      ),
      buildStep(
        'gemini-2.5-flash-lite',
        'STANDARD',
        'Flash 2.5 Lite zero-stall safety tier'
      ),
    ];
  } else if (input.wordCount >= 25) {
    desired = [
      buildStep(
        'gemini-3.1-flash-lite',
        'MEDIUM',
        `Fast Flash Lite Medium critique for brief ${input.wordCount}w entry`
      ),
      buildStep(
        'gemini-3-flash-preview',
        'LOW',
        'Gemini 3 Flash fast backup for brief entry'
      ),
      buildStep(
        'gemini-2.5-flash',
        'STANDARD',
        'Gemini 2.5 Flash backup for brief entry'
      ),
      buildStep(
        'gemini-4-hydrogen',
        'LOW',
        'Hydrogen Low backup for brief entry'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'LOW',
        'Ultra-fast Flash Lite backup'
      ),
      buildStep(
        'gemini-2.5-flash-lite',
        'STANDARD',
        'Flash 2.5 Lite zero-stall safety tier'
      ),
    ];
  } else {
    desired = [
      buildStep(
        'gemini-3.1-flash-lite',
        'LOW',
        `Instant Flash Lite Low check for ultra-brief ${input.wordCount}w note`
      ),
      buildStep(
        'gemini-2.5-flash-lite',
        'STANDARD',
        'Flash 2.5 Lite instant safety tier'
      ),
      buildStep(
        'gemini-3-flash-preview',
        'LOW',
        'Gemini 3 Flash fast backup'
      ),
      buildStep(
        'gemini-2.5-flash',
        'STANDARD',
        'Gemini 2.5 Flash backup'
      ),
      buildStep(
        'gemini-4-hydrogen',
        'LOW',
        'Hydrogen Low backup for ultra-brief note'
      ),
    ];
  }

  // Filter out models flagged unsupported/404 unless ALL models are flagged
  const supported = desired.filter((step) => !isUnsupported(step.model));
  const pool = supported.length > 0 ? supported : desired;

  // Promote healthy (non-cooled-down) models ahead of cooled-down models while preserving tier priority
  const healthy = pool.filter((step) => !isCoolingDown(step.model));
  const cooled = pool.filter((step) => isCoolingDown(step.model));
  const ordered = [...healthy, ...cooled];

  // Deduplicate identical (model, thinkingLabel) steps
  const seen = new Set<string>();
  const cascade: EvaluationRouteStep[] = [];
  for (const step of ordered) {
    const key = `${step.model}:${step.thinkingLabel}`;
    if (!seen.has(key)) {
      seen.add(key);
      cascade.push(step);
    }
  }

  return {
    primary: cascade[0],
    cascade,
    complexityScore: score,
    topicComplexity,
  };
}

/**
 * Selects a non-stalling multi-generation model cascade for utility AI endpoints
 * (realtime assist, topic generation, schedule planning, topic pivot, vocab categorization).
 * Fast-tier utility tasks default to Flash Lite / Flash 2.5 Lite / Gemini 3 Flash first so
 * Hydrogen quota stays protected for the core Evaluation Engine.
 */
export function selectUtilityModelCascade(input: {
  task: Exclude<RouterTaskKind, 'evaluate' | 'converse'>;
  complexityMetric?: number;
  preferFastTier?: boolean;
  cooldownUntil?: Partial<Record<ActiveEvalModel, number>>;
  unsupportedUntil?: Partial<Record<ActiveEvalModel, number>>;
  nowMs?: number;
}): EvaluationRouteStep[] {
  const now = input.nowMs ?? Date.now();
  const cooldown = input.cooldownUntil ?? {};
  const unsupported = input.unsupportedUntil ?? {};
  const complexity = input.complexityMetric ?? 60;

  const isUnsupported = (model: ActiveEvalModel): boolean =>
    (unsupported[model] ?? 0) > now;
  const isCoolingDown = (model: ActiveEvalModel): boolean =>
    (cooldown[model] ?? 0) > now;

  // Protect Hydrogen quota for Evaluation: only schedule (non-fast) starts on Hydrogen -> 3-Flash -> 3.1-Lite -> 2.5-Flash -> 2.5-Lite
  const useFastFirst =
    input.preferFastTier !== undefined
      ? input.preferFastTier
      : input.task !== 'schedule';

  const orderedModels: readonly ActiveEvalModel[] = useFastFirst
    ? FAST_GEMINI_TEXT_MODELS
    : ACTIVE_GEMINI_TEXT_MODELS;

  const steps = orderedModels.map((model) => {
    let thinking: ActiveThinkingLabel;
    if (!supportsThinkingLevel(model)) {
      thinking = 'STANDARD';
    } else if (input.task === 'schedule') {
      thinking =
        model === 'gemini-4-hydrogen' && complexity > 4 ? 'MEDIUM' : 'LOW';
    } else if (
      (input.task === 'realtime' || input.task === 'pivot') &&
      supportsMinimalThinking(model)
    ) {
      thinking = 'MINIMAL';
    } else {
      thinking = 'LOW';
    }

    return buildStep(
      model,
      thinking,
      `${input.task} dynamic cascade (${formatTierLabel(model, thinking)})`
    );
  });

  const supported = steps.filter((step) => !isUnsupported(step.model));
  const pool = supported.length > 0 ? supported : steps;
  const healthy = pool.filter((step) => !isCoolingDown(step.model));
  const cooled = pool.filter((step) => isCoolingDown(step.model));
  return [...healthy, ...cooled];
}
