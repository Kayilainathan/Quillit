import type { WritingSession } from '../types';

const OFFLINE_MODEL_IDS = new Set([
  'offline-rubric',
  'offline-local',
  'local-offline',
  'offline-conversation',
  'queued-pending-reset',
]);

export interface HealthAvailabilitySnapshot {
  reachable: boolean;
  aiAvailable: boolean;
  hasKey: boolean;
  nextAvailableInSeconds: number;
  activeModel?: string;
}

/**
 * Returns true when a session (or evaluation payload) was scored locally/offline
 * or provisionally queued rather than completed by a live Gemini model.
 */
export function isOfflineEvaluatedSession(session: {
  modelUsed?: string;
  routingMeta?: { model?: string; thinkingLevel?: string };
}): boolean {
  const model = (session.modelUsed || '').trim().toLowerCase();
  if (model && OFFLINE_MODEL_IDS.has(model)) {
    return true;
  }
  const routeModel = (session.routingMeta?.model || '').trim().toLowerCase();
  if (routeModel && OFFLINE_MODEL_IDS.has(routeModel)) {
    return true;
  }
  return false;
}

/**
 * Returns true when a session should be queued for automatic AI evaluation/upgrade:
 * - Any session explicitly marked `evaluationPending: true` (including slow-API drafts
 *   and newly logged offline evaluations)
 * - Any completed session scored by an offline/queued engine (including historical
 *   offline-evaluated sessions already present in the vault)
 * Ignores ordinary unsaved drafts (`status === 'Draft' && !evaluationPending`) and
 * empty/ultra-short notes (< 20 chars) that cannot pass `/api/evaluate` validation.
 */
export function needsAiEvaluation(session: WritingSession): boolean {
  if (!session || typeof session.content !== 'string') return false;
  if (session.content.trim().length < 20) return false;
  if (session.evaluationPending) return true;
  if (session.status === 'Draft') return false;
  return isOfflineEvaluatedSession(session);
}

/**
 * Returns true when a session should appear in the user's logged Session Evaluation Ledger.
 * Offline-evaluated completed sessions ARE immediately logged with their local rubric scores
 * while queued for AI upgrade; empty 0/60 slow-API draft placeholders remain in the pending
 * banner until AI scores arrive.
 */
export function isSessionLoggedInLedger(session: WritingSession): boolean {
  if (session.status !== 'Completed') return false;
  if (!session.evaluationPending) return true;
  return isOfflineEvaluatedSession(session) && session.totalScore > 0;
}

/**
 * Computes bounded retry delay for the background AI upgrade worker.
 * Uses server-reported cooldown when provided; otherwise grows cleanly
 * (8s -> 15s -> 30s -> 60s -> 90s cap).
 */
export function computeNextRetryDelayMs(
  consecutiveFailures: number,
  quotaResetSeconds?: number
): number {
  if (
    typeof quotaResetSeconds === 'number' &&
    Number.isFinite(quotaResetSeconds) &&
    quotaResetSeconds > 0
  ) {
    return Math.max(5_000, Math.min(90_000, Math.round(quotaResetSeconds * 1000)));
  }
  const steps = [8_000, 15_000, 30_000, 60_000, 90_000];
  const idx = Math.max(0, Math.min(steps.length - 1, Math.floor(consecutiveFailures)));
  return steps[idx];
}

/**
 * Interprets `GET /api/health` payload safely so the background worker probes
 * AI readiness with zero Gemini token usage before attempting session upgrades.
 */
export function parseHealthAvailability(
  payload: Record<string, unknown> | null
): HealthAvailabilitySnapshot {
  if (!payload || payload.ok !== true) {
    return {
      reachable: false,
      aiAvailable: false,
      hasKey: false,
      nextAvailableInSeconds: 15,
    };
  }
  const hasKey = Boolean(payload.hasKey);
  const tiers = Array.isArray(payload.tiers)
    ? (payload.tiers as Array<{
        available?: boolean;
        cooldownSeconds?: number;
        unsupportedSeconds?: number;
      }>)
    : [];
  const anyTierAvailable =
    tiers.length > 0 ? tiers.some((t) => Boolean(t.available)) : hasKey;
  const aiAvailable =
    typeof payload.aiAvailable === 'boolean'
      ? payload.aiAvailable
      : hasKey && anyTierAvailable;

  let nextAvailableInSeconds = 0;
  if (!aiAvailable && tiers.length > 0) {
    const cooldowns = tiers
      .filter((t) => (t.unsupportedSeconds ?? 0) === 0 && (t.cooldownSeconds ?? 0) > 0)
      .map((t) => Number(t.cooldownSeconds) || 0);
    nextAvailableInSeconds =
      cooldowns.length > 0
        ? Math.max(5, Math.min(60, Math.min(...cooldowns)))
        : 25;
  }

  return {
    reachable: true,
    aiAvailable,
    hasKey,
    nextAvailableInSeconds:
      typeof payload.nextAvailableInSeconds === 'number'
        ? Math.max(0, Math.round(payload.nextAvailableInSeconds))
        : nextAvailableInSeconds,
    activeModel:
      typeof payload.activeModel === 'string' ? payload.activeModel : undefined,
  };
}
