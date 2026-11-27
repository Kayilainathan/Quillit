import type { DrillType, WritingMode } from '../types';
import {
  SKELETON_PASSAGE_BANK,
  type SkeletonPassage,
} from './skeletonDrill';

export const SLOW_EVAL_THRESHOLD_MS = 24_000;

export type WordWindowState = 'empty' | 'below' | 'in-zone' | 'over';

export interface WordWindowStatus {
  state: WordWindowState;
  ratio: number; // 0..1 clamped fill toward maxWords
  label: string;
}

export interface ClueWeaveStatus {
  clue: string;
  woven: boolean;
}

export interface DrillDeskMeta {
  id: DrillType;
  shortLabel: string;
  duration: string;
  tagline: string;
}

export const DRILL_DESK_META: Record<DrillType, DrillDeskMeta> = {
  standard: {
    id: 'standard',
    shortLabel: 'Standard',
    duration: '10m',
    tagline: 'Open manuscript page with quiet craft feedback',
  },
  'compression-432': {
    id: 'compression-432',
    shortLabel: '4/3/2 Sprint',
    duration: '6m',
    tagline: 'Distill one idea across 3 shrinking timed passes',
  },
  skeleton: {
    id: 'skeleton',
    shortLabel: 'Skeleton',
    duration: '8m',
    tagline: 'Study cadence, edit your anchor keywords, rebuild in your own voice',
  },
  'three-rooms': {
    id: 'three-rooms',
    shortLabel: '3 Rooms',
    duration: '10m',
    tagline: 'Explain simply to a child, then defend to an expert',
  },
  'time-capsule': {
    id: 'time-capsule',
    shortLabel: 'Time Capsule',
    duration: '10m',
    tagline: 'Rewrite an earlier topic blind and compare your voice evolution',
  },
};

/**
 * Evaluates a draft's live word count against a target compression or room window.
 */
export function computeWordWindowStatus(
  wordCount: number,
  minWords: number,
  maxWords: number
): WordWindowStatus {
  const safeCount = Math.max(0, Math.floor(wordCount));
  const safeMin = Math.max(1, Math.floor(minWords));
  const safeMax = Math.max(safeMin, Math.floor(maxWords));

  if (safeCount === 0) {
    return {
      state: 'empty',
      ratio: 0,
      label: `Target ${safeMin}–${safeMax}w`,
    };
  }

  const ratio = Math.max(0.04, Math.min(1, safeCount / safeMax));

  if (safeCount < safeMin) {
    const remaining = safeMin - safeCount;
    return {
      state: 'below',
      ratio,
      label: `${safeCount}w · ${remaining}w to zone`,
    };
  }

  if (safeCount <= safeMax) {
    return {
      state: 'in-zone',
      ratio,
      label: `${safeCount}w · In zone (${safeMin}–${safeMax}w)`,
    };
  }

  const excess = safeCount - safeMax;
  return {
    state: 'over',
    ratio: 1,
    label: `${safeCount}w · Trim ${excess}w`,
  };
}

/**
 * Computes remaining ratio (0..1) for smooth hairline & circular ink timers.
 */
export function computeTimerRemainingRatio(
  secondsLeft: number,
  totalDurationSec: number
): number {
  if (!Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(totalDurationSec, secondsLeft));
  return Number((clamped / totalDurationSec).toFixed(4));
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'your',
  'our',
  'over',
  'under',
  'about',
  'then',
  'than',
  'when',
]);

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Deterministically detects which skeleton clues have been woven into the user's
 * reconstructed draft (supports exact phrase inclusion or significant stem overlap).
 */
export function matchSkeletonCluesInDraft(
  clues: string[],
  draftText: string
): ClueWeaveStatus[] {
  const lowerDraft = draftText.toLowerCase();
  const draftTokens = normalizeTokens(draftText);

  return clues.map((clue) => {
    const trimmed = clue.trim();
    if (!trimmed || lowerDraft.trim().length < 3) {
      return { clue: trimmed, woven: false };
    }

    if (lowerDraft.includes(trimmed.toLowerCase())) {
      return { clue: trimmed, woven: true };
    }

    const clueTokens = normalizeTokens(trimmed);
    if (clueTokens.length === 0) {
      return { clue: trimmed, woven: false };
    }

    const matchedTokens = clueTokens.filter((ct) => {
      const stem = ct.length >= 5 ? ct.slice(0, ct.length - 1) : ct;
      return draftTokens.some(
        (dt) => dt === ct || dt.startsWith(stem) || ct.startsWith(dt)
      );
    });

    const threshold = clueTokens.length === 1 ? 1 : Math.ceil(clueTokens.length * 0.5);
    return {
      clue: trimmed,
      woven: matchedTokens.length >= threshold,
    };
  });
}

/**
 * Normalizes a single Skeleton anchor keyword (max 4 concise words).
 */
export function normalizeSkeletonKeyword(raw: string): string {
  return raw
    .trim()
    .replace(/[\n\r,;•·]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');
}

export function updateSkeletonClueAt(
  clues: string[],
  index: number,
  rawValue: string
): string[] {
  const normalized = normalizeSkeletonKeyword(rawValue);
  if (index < 0 || index >= clues.length) return clues;
  if (!normalized) {
    return clues.filter((_, i) => i !== index);
  }
  return clues.map((item, i) => (i === index ? normalized : item));
}

export function addSkeletonClue(clues: string[], rawValue: string): string[] {
  if (clues.length >= 4) return clues;
  const normalized = normalizeSkeletonKeyword(rawValue);
  if (!normalized) return clues;
  const exists = clues.some(
    (c) => c.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) return clues;
  return [...clues, normalized];
}

export function removeSkeletonClueAt(clues: string[], index: number): string[] {
  if (index < 0 || index >= clues.length) return clues;
  return clues.filter((_, i) => i !== index);
}

/**
 * Selects a fresh Skeleton passage on entry or completion, avoiding completed
 * passages and the currently displayed passage while matching the active mode when possible.
 */
export function pickNextFreshSkeletonPassage(params: {
  mode: WritingMode;
  completedIds: string[];
  currentId?: string | null;
  domainFilter?: SkeletonPassage['domain'] | 'all';
}): SkeletonPassage {
  const { mode, completedIds, currentId, domainFilter = 'all' } = params;
  const completedSet = new Set(completedIds);

  const bank =
    domainFilter === 'all'
      ? SKELETON_PASSAGE_BANK
      : SKELETON_PASSAGE_BANK.filter((p) => p.domain === domainFilter);

  const pool = bank.length > 0 ? bank : SKELETON_PASSAGE_BANK;

  // 1. Prefer mode-matched unseen passage that isn't current
  const freshMode = pool.filter(
    (p) =>
      p.mode === mode &&
      !completedSet.has(p.id) &&
      p.id !== currentId
  );
  if (freshMode.length > 0) return freshMode[0];

  // 2. Any unseen passage in pool that isn't current
  const freshAny = pool.filter(
    (p) => !completedSet.has(p.id) && p.id !== currentId
  );
  if (freshAny.length > 0) return freshAny[0];

  // 3. Cycle smoothly past currentId when all passages have been completed
  const currentIdx = pool.findIndex((p) => p.id === currentId);
  if (currentIdx >= 0 && pool.length > 1) {
    return pool[(currentIdx + 1) % pool.length];
  }

  return pool[0];
}

/**
 * Determines when the top greeting/utility header should gracefully collapse
 * so the writer gets a calm, distraction-free manuscript during active drafting.
 */
export function shouldCollapseWriteHeader(params: {
  wordCount: number;
  sprintRunning: boolean;
  flowLockActive: boolean;
  focusMode: boolean;
}): boolean {
  if (params.focusMode) return true;
  if (params.sprintRunning || params.flowLockActive) return true;
  return params.wordCount >= 3;
}

/**
 * Counts how many optional studio add-ons are currently active for compact badges.
 */
export function countActiveDeskAddons(params: {
  activeDrill: DrillType;
  hasConstraint: boolean;
  flowLockActive: boolean;
}): number {
  let count = 0;
  if (params.activeDrill !== 'standard') count += 1;
  if (params.hasConstraint) count += 1;
  if (params.flowLockActive) count += 1;
  return count;
}
