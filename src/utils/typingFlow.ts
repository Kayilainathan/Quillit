/**
 * Pure real-time Words-Per-Minute (WPM) and writing flow cadence tracker.
 * Uses a recency-weighted rolling window with bulk-paste protection and
 * graceful idle decay so writers see a calm, honest cadence readout.
 */

export type WritingFlowState = 'idle' | 'warming' | 'flow' | 'brisk';

export interface TypingFlowSample {
  at: number;
  /** Standard word units added (chars / 5 blended gently with word count delta) */
  wordUnits: number;
}

export interface TypingFlowTrackerState {
  samples: TypingFlowSample[];
  lastKeystrokeAt: number | null;
  burstStartedAt: number | null;
  peakWpm: number;
  smoothedWpm: number;
  pulseSeq: number;
}

export interface TypingFlowMetrics {
  wpm: number;
  peakWpm: number;
  isTypingActive: boolean;
  flowState: WritingFlowState;
  flowLabel: string;
  /** 0 = idle, 1 = warming, 2 = steady flow, 3 = brisk flow */
  flowIntensity: 0 | 1 | 2 | 3;
  /** Normalized 0..1 cadence meter ratio (0 at rest, 1 at 85+ WPM) */
  cadenceRatio: number;
  /** Seconds elapsed in the current unbroken typing burst */
  burstSeconds: number;
}

export const TYPING_ROLLING_WINDOW_MS = 18_000;
export const TYPING_ACTIVE_TIMEOUT_MS = 2_400;
export const TYPING_SESSION_RESET_GAP_MS = 8_000;
const MIN_ELAPSED_DENOMINATOR_MS = 4_200;
const MAX_SINGLE_KEYSTROKE_CHARS = 18;
const MAX_REALISTIC_WPM = 220;
const TARGET_FULL_CADENCE_WPM = 80;

export function createInitialTypingFlowState(): TypingFlowTrackerState {
  return {
    samples: [],
    lastKeystrokeAt: null,
    burstStartedAt: null,
    peakWpm: 0,
    smoothedWpm: 0,
    pulseSeq: 0,
  };
}

function countWordsSimple(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function computeRawWindowWpm(
  recentSamples: TypingFlowSample[],
  nowMs: number
): number {
  if (recentSamples.length === 0) return 0;
  const totalWordUnits = recentSamples.reduce((sum, s) => sum + s.wordUnits, 0);
  const oldestAt = recentSamples[0].at;
  const elapsedMs = Math.max(MIN_ELAPSED_DENOMINATOR_MS, nowMs - oldestAt);
  const rawWpm = Math.round((totalWordUnits / elapsedMs) * 60_000);
  return Math.max(0, Math.min(MAX_REALISTIC_WPM, rawWpm));
}

/**
 * Records a text change in the editor and returns the updated rolling flow state.
 * Ignores bulk clipboard pastes (> 18 chars in one event) so WPM reflects genuine typing.
 */
export function recordTypingProgress(
  state: TypingFlowTrackerState,
  prevText: string,
  nextText: string,
  nowMs: number
): TypingFlowTrackerState {
  if (nextText === prevText) {
    return state;
  }

  // Reset cleanly if user completely clears the editor
  if (nextText.trim().length === 0) {
    return createInitialTypingFlowState();
  }

  const charDelta = nextText.length - prevText.length;
  const wordDelta = countWordsSimple(nextText) - countWordsSimple(prevText);

  // If there was a long pause since the previous burst, start a fresh rolling burst
  const staleBurst =
    state.lastKeystrokeAt !== null &&
    nowMs - state.lastKeystrokeAt > TYPING_SESSION_RESET_GAP_MS;

  const baseSamples = staleBurst
    ? []
    : state.samples.filter((s) => nowMs - s.at <= TYPING_ROLLING_WINDOW_MS);

  const nextBurstStartedAt =
    staleBurst || state.burstStartedAt === null ? nowMs : state.burstStartedAt;

  // Guard against bulk paste events skewing WPM
  if (charDelta > MAX_SINGLE_KEYSTROKE_CHARS) {
    return {
      ...state,
      samples: baseSamples,
      lastKeystrokeAt: nowMs,
      burstStartedAt: nextBurstStartedAt,
      pulseSeq: state.pulseSeq + 1,
    };
  }

  // Positive typing adds standard 5-char word units (blended gently with word completions)
  let wordUnits = 0;
  if (charDelta > 0) {
    const charUnits = charDelta / 5;
    wordUnits =
      wordDelta > 0 ? Math.max(charUnits, wordDelta * 0.45) : charUnits;
  }

  const nextSamples =
    wordUnits > 0
      ? [...baseSamples, { at: nowMs, wordUnits }]
      : baseSamples;

  const rawWpm = computeRawWindowWpm(nextSamples, nowMs);

  // Gentle exponential smoothing eliminates jarring digit jitter on keystrokes
  const prevSmoothed = staleBurst ? 0 : state.smoothedWpm;
  const smoothedWpm =
    prevSmoothed <= 0
      ? rawWpm
      : Math.round(prevSmoothed * 0.62 + rawWpm * 0.38);

  const nextPeak = Math.max(state.peakWpm, smoothedWpm, rawWpm);

  return {
    samples: nextSamples,
    lastKeystrokeAt: nowMs,
    burstStartedAt: nextBurstStartedAt,
    peakWpm: nextPeak,
    smoothedWpm,
    pulseSeq: state.pulseSeq + 1,
  };
}

/**
 * Computes the live smoothed WPM and flow status for a given timestamp.
 */
export function computeTypingFlowMetrics(
  state: TypingFlowTrackerState,
  nowMs: number
): TypingFlowMetrics {
  const recentSamples = state.samples.filter(
    (s) => nowMs - s.at <= TYPING_ROLLING_WINDOW_MS
  );

  const isTypingActive =
    state.lastKeystrokeAt !== null &&
    nowMs - state.lastKeystrokeAt <= TYPING_ACTIVE_TIMEOUT_MS;

  const burstSeconds =
    isTypingActive && state.burstStartedAt !== null
      ? Math.max(0, Math.floor((nowMs - state.burstStartedAt) / 1000))
      : 0;

  if (recentSamples.length === 0) {
    return {
      wpm: 0,
      peakWpm: state.peakWpm,
      isTypingActive,
      flowState: isTypingActive ? 'warming' : 'idle',
      flowLabel: isTypingActive ? 'Warming' : 'Ready',
      flowIntensity: isTypingActive ? 1 : 0,
      cadenceRatio: 0,
      burstSeconds,
    };
  }

  const windowWpm = computeRawWindowWpm(recentSamples, nowMs);
  const wpm = isTypingActive
    ? state.smoothedWpm > 0
      ? Math.round(state.smoothedWpm * 0.55 + windowWpm * 0.45)
      : windowWpm
    : windowWpm;

  const clampedWpm = Math.max(0, Math.min(MAX_REALISTIC_WPM, wpm));
  const peakWpm = Math.max(state.peakWpm, clampedWpm);
  const cadenceRatio = Math.max(
    0,
    Math.min(1, clampedWpm / TARGET_FULL_CADENCE_WPM)
  );

  if (!isTypingActive) {
    return {
      wpm: clampedWpm,
      peakWpm,
      isTypingActive: false,
      flowState: 'idle',
      flowLabel: clampedWpm > 0 ? 'Settled' : 'Ready',
      flowIntensity: 0,
      cadenceRatio: clampedWpm > 0 ? cadenceRatio * 0.35 : 0,
      burstSeconds: 0,
    };
  }

  if (clampedWpm >= 55) {
    return {
      wpm: clampedWpm,
      peakWpm,
      isTypingActive: true,
      flowState: 'brisk',
      flowLabel: 'Brisk',
      flowIntensity: 3,
      cadenceRatio,
      burstSeconds,
    };
  }

  if (clampedWpm >= 24) {
    return {
      wpm: clampedWpm,
      peakWpm,
      isTypingActive: true,
      flowState: 'flow',
      flowLabel: 'In flow',
      flowIntensity: 2,
      cadenceRatio,
      burstSeconds,
    };
  }

  return {
    wpm: clampedWpm,
    peakWpm,
    isTypingActive: true,
    flowState: 'warming',
    flowLabel: 'Steady',
    flowIntensity: 1,
    cadenceRatio,
    burstSeconds,
  };
}
