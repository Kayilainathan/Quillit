/**
 * Dynamic Evaluation Model & Thinking Tier Router
 *
 * Selects the optimal Gemini model (`gemini-4-hydrogen` vs `gemini-3.1-flash-lite`)
 * and thinking level (`HIGH` | `MEDIUM` | `LOW`) dynamically based on:
 *   1. Draft word count & structural complexity (longest sentence, sentence count)
 *   2. Topic domain & writing mode/tone demands (Technical/Interview, Creative, Formal Executive vs. brief Journal)
 *   3. Closed-loop coaching context (previous session tracking, practicing vocabulary count)
 *   4. Live cooldown/rate-limit availability across tiers
 *
 * Never uses deprecated models or invalid thinking levels (`MINIMAL` is never sent to `gemini-4-hydrogen`).
 */

export type ActiveEvalModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
export type ActiveThinkingLabel = 'HIGH' | 'MEDIUM' | 'LOW';

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

const HIGH_COMPLEXITY_MODE_RE = /(technical|interview|creative|story|academic|executive|formal|linkedin)/i;
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
  const shortModel =
    model === 'gemini-4-hydrogen' ? 'Hydrogen' : 'Flash Lite';
  const tierName =
    thinkingLabel === 'HIGH'
      ? 'High'
      : thinkingLabel === 'MEDIUM'
        ? 'Medium'
        : 'Low';
  return {
    model,
    thinkingLabel,
    tierLabel: `${shortModel} · ${tierName}`,
    reason,
  };
}

/**
 * Produces an ordered cascade of (model, thinkingLevel) steps tailored to the
 * draft's word count, topic complexity, and active rate-limit cooldowns.
 *
 * Routing matrix:
 * - Gibberish / ultra-short (<35w light): Flash Lite Low -> Hydrogen Low (instant, low token cost)
 * - Short/crisp (35-75w light or <50w standard): Flash Lite Medium -> Hydrogen Low -> Flash Lite Low
 * - Standard practice (50-115w standard or 35-85w high-complexity): Hydrogen Low -> Flash Lite Medium -> Flash Lite Low
 * - Substantive draft (90-210w or complexity 5-7): Hydrogen Medium -> Flash Lite High -> Hydrogen Low -> Flash Lite Medium
 * - Deep/long/high-stakes (210+w or complexity >= 8): Hydrogen Medium (or High for 240+w dense essays) -> Flash Lite High -> Hydrogen Low
 *
 * Note: We reserve Hydrogen Medium as our gold-standard workhorse for substantive drafts
 * (matching Gemini H2 depth at fast latency) and escalate to Hydrogen High for long 240+ word
 * complex pieces, while fast-tracking short notes to Hydrogen Low or Flash Lite High/Medium/Low.
 */
export function selectDynamicEvaluationRoute(
  input: EvaluationRouteInput
): EvaluationRoutePlan {
  const now = input.nowMs ?? Date.now();
  const cooldown = input.cooldownUntil ?? {};
  const { score, topicComplexity } = computeEvaluationComplexityScore(input);

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
        'gemini-4-hydrogen',
        'LOW',
        'Backup verification for brief input'
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
        'gemini-3.1-flash-lite',
        'HIGH',
        'High-reasoning Flash Lite fallback during Hydrogen cooldown'
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
        'gemini-3.1-flash-lite',
        'HIGH',
        'High-reasoning Flash Lite failover'
      ),
      buildStep(
        'gemini-4-hydrogen',
        'LOW',
        'Low-latency Hydrogen failover'
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
        'gemini-3.1-flash-lite',
        'MEDIUM',
        'Balanced Flash Lite failover for concise draft'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'LOW',
        'Ultra-fast Flash Lite safety tier'
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
        'gemini-4-hydrogen',
        'LOW',
        'Hydrogen Low backup for brief entry'
      ),
      buildStep(
        'gemini-3.1-flash-lite',
        'LOW',
        'Ultra-fast Flash Lite backup'
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
        'gemini-4-hydrogen',
        'LOW',
        'Hydrogen Low backup for ultra-brief note'
      ),
    ];
  }

  // Reorder so non-cooled-down models come first while preserving tier priority
  const healthy = desired.filter((step) => !isCoolingDown(step.model));
  const cooled = desired.filter((step) => isCoolingDown(step.model));
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
