/**
 * 4/3/2 Compression Sprint — Maurice's fluency compression drill adapted for 10-minute writing.
 * Round 1: 3:00 (180s), target 140–170 words
 * Round 2: 2:00 (120s), target 90–115 words (same idea, tighter!)
 * Round 3: 1:00 (60s),  target 45–65 words  (pure signal, zero fluff!)
 */

export interface CompressionRoundConfig {
  round: 1 | 2 | 3;
  label: string;
  durationSec: number;
  minWords: number;
  maxWords: number;
  guidance: string;
}

export const COMPRESSION_ROUNDS: readonly CompressionRoundConfig[] = [
  {
    round: 1,
    label: 'Round 1 · Draft',
    durationSec: 180,
    minWords: 140,
    maxWords: 170,
    guidance: 'Get the whole explanation down cleanly in natural spoken English.',
  },
  {
    round: 2,
    label: 'Round 2 · Tighten',
    durationSec: 120,
    minWords: 90,
    maxWords: 115,
    guidance: 'Write the same idea again from scratch — cut throat-clearing and weak verbs.',
  },
  {
    round: 3,
    label: 'Round 3 · Pure Signal',
    durationSec: 60,
    minWords: 45,
    maxWords: 65,
    guidance: 'Distill the core insight into one razor-sharp elevator explanation.',
  },
] as const;

export interface CompressionSprintState {
  currentRound: 1 | 2 | 3;
  remainingSec: number;
  running: boolean;
  roundTexts: [string, string, string];
  roundWordCounts: [number, number, number];
  completed: boolean;
}

export function countSprintWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function createInitialCompressionState(): CompressionSprintState {
  return {
    currentRound: 1,
    remainingSec: COMPRESSION_ROUNDS[0].durationSec,
    running: false,
    roundTexts: ['', '', ''],
    roundWordCounts: [0, 0, 0],
    completed: false,
  };
}

export function getRoundConfig(round: 1 | 2 | 3): CompressionRoundConfig {
  return COMPRESSION_ROUNDS[round - 1];
}

/**
 * Advances from Round 1 -> Round 2 -> Round 3, snapshotting the completed round's text
 * and clearing the canvas for fresh recall/compression (never copy-pasting).
 */
export function advanceCompressionRound(
  state: CompressionSprintState,
  currentDraftText: string
): CompressionSprintState {
  const idx = state.currentRound - 1;
  const nextTexts: [string, string, string] = [...state.roundTexts] as [
    string,
    string,
    string,
  ];
  const nextCounts: [number, number, number] = [...state.roundWordCounts] as [
    number,
    number,
    number,
  ];
  nextTexts[idx] = currentDraftText.trim();
  nextCounts[idx] = countSprintWords(currentDraftText);

  if (state.currentRound === 3) {
    return {
      ...state,
      roundTexts: nextTexts,
      roundWordCounts: nextCounts,
      running: false,
      remainingSec: 0,
      completed: true,
    };
  }

  const nextRound = (state.currentRound + 1) as 2 | 3;
  const nextCfg = getRoundConfig(nextRound);
  return {
    ...state,
    currentRound: nextRound,
    remainingSec: nextCfg.durationSec,
    running: false,
    roundTexts: nextTexts,
    roundWordCounts: nextCounts,
    completed: false,
  };
}

/**
 * Calculates how sharply the writer compressed Round 1 -> Round 3 (e.g., 160w -> 56w = 65% compression).
 */
export function computeCompressionMetrics(roundWordCounts: [number, number, number]): {
  r1Words: number;
  r2Words: number;
  r3Words: number;
  compressionRatioPct: number;
  hitTargetCurve: boolean;
  summaryLabel: string;
} {
  const [r1Words, r2Words, r3Words] = roundWordCounts;
  const compressionRatioPct =
    r1Words > 0 && r3Words > 0
      ? Math.max(0, Math.min(95, Math.round(((r1Words - r3Words) / r1Words) * 100)))
      : 0;

  const hitTargetCurve = r1Words > r2Words && r2Words > r3Words && r3Words >= 25;
  const summaryLabel =
    r1Words > 0 && r3Words > 0
      ? `${r1Words}w → ${r2Words}w → ${r3Words}w (${compressionRatioPct}% tighter)`
      : 'Complete all 3 rounds to measure compression';

  return {
    r1Words,
    r2Words,
    r3Words,
    compressionRatioPct,
    hitTargetCurve,
    summaryLabel,
  };
}

export function formatCountdownMMSS(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
