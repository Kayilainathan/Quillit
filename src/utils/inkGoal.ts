import type { WritingSession } from '../types';

export type InkFillStage = 'empty' | 'starting' | 'flowing' | 'nearing' | 'full';

export const DAILY_WORD_GOAL_PRESETS = [150, 250, 400, 600] as const;
export const MIN_ADJUSTABLE_WORD_GOAL = 50;
export const MAX_ADJUSTABLE_WORD_GOAL = 2000;

export interface DailyInkProgressInput {
  todayISO: string;
  sessions: WritingSession[];
  currentWordCount: number;
  activeDraftId?: string | null;
  activeLoggedSessionId?: string | null;
  dailyWordGoal?: number;
}

export interface DailyInkProgress {
  savedWordsToday: number;
  activeDraftWords: number;
  totalWordsToday: number;
  goalWords: number;
  ratio: number;
  /** Fraction (0..1) of the goal already banked in saved sessions today */
  savedRatio: number;
  /** Fraction (0..1) of the goal contributed by the current active draft */
  activeRatio: number;
  percentage: number;
  remainingWords: number;
  /** Words written beyond the daily target once reached */
  bonusWords: number;
  /** Number of 25% folio checkpoints crossed (0..4) */
  milestonesReached: 0 | 1 | 2 | 3 | 4;
  /** Completed/draft session entries recorded today (excluding empty drafts) */
  sessionsTodayCount: number;
  reached: boolean;
  stage: InkFillStage;
}

const DEFAULT_DAILY_WORD_GOAL = 250;
const MIN_DAILY_WORD_GOAL = 25;

/**
 * Clamps a user-adjusted daily word goal to safe, sensible editorial bounds.
 */
export function clampDailyWordGoal(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAILY_WORD_GOAL;
  return Math.max(
    MIN_ADJUSTABLE_WORD_GOAL,
    Math.min(MAX_ADJUSTABLE_WORD_GOAL, Math.round(value))
  );
}

/**
 * Computes today's cumulative ink progress toward the writer's daily word goal.
 * Excludes the currently open draft ID and currently auto-logged session ID from
 * saved today sessions so live typing never double-counts words already saved in
 * that same piece.
 */
export function computeDailyInkProgress({
  todayISO,
  sessions,
  currentWordCount,
  activeDraftId = null,
  activeLoggedSessionId = null,
  dailyWordGoal = DEFAULT_DAILY_WORD_GOAL,
}: DailyInkProgressInput): DailyInkProgress {
  const goalWords = Math.max(
    MIN_DAILY_WORD_GOAL,
    Math.round(
      Number.isFinite(dailyWordGoal) && dailyWordGoal > 0
        ? dailyWordGoal
        : DEFAULT_DAILY_WORD_GOAL
    )
  );

  let sessionsTodayCount = 0;
  const savedWordsToday = sessions.reduce((sum, session) => {
    if (session.date !== todayISO) return sum;
    if (activeDraftId && session.id === activeDraftId) return sum;
    if (activeLoggedSessionId && session.id === activeLoggedSessionId) return sum;
    const words = Number.isFinite(session.wordCount)
      ? Math.max(0, Math.round(session.wordCount))
      : 0;
    if (words > 0) {
      sessionsTodayCount += 1;
    }
    return sum + words;
  }, 0);

  const activeDraftWords = Math.max(
    0,
    Math.round(Number.isFinite(currentWordCount) ? currentWordCount : 0)
  );

  const totalWordsToday = savedWordsToday + activeDraftWords;
  const ratio = Math.min(1, Math.max(0, totalWordsToday / goalWords));
  const savedRatio = Math.min(1, Math.max(0, savedWordsToday / goalWords));
  const activeRatio = Math.max(0, Math.min(1 - savedRatio, ratio - savedRatio));
  const percentage = Math.min(100, Math.round(ratio * 100));
  const remainingWords = Math.max(0, goalWords - totalWordsToday);
  const bonusWords = Math.max(0, totalWordsToday - goalWords);
  const reached = totalWordsToday >= goalWords;

  const milestonesReached: 0 | 1 | 2 | 3 | 4 = reached
    ? 4
    : ratio >= 0.75
      ? 3
      : ratio >= 0.5
        ? 2
        : ratio >= 0.25
          ? 1
          : 0;

  let stage: InkFillStage = 'empty';
  if (reached) {
    stage = 'full';
  } else if (ratio >= 0.72) {
    stage = 'nearing';
  } else if (ratio >= 0.25) {
    stage = 'flowing';
  } else if (totalWordsToday > 0) {
    stage = 'starting';
  }

  return {
    savedWordsToday,
    activeDraftWords,
    totalWordsToday,
    goalWords,
    ratio,
    savedRatio,
    activeRatio,
    percentage,
    remainingWords,
    bonusWords,
    milestonesReached,
    sessionsTodayCount,
    reached,
    stage,
  };
}

/**
 * Returns calm, editorial micro-copy describing the current daily goal state.
 */
export function getInkWellCaption(progress: DailyInkProgress): string {
  switch (progress.stage) {
    case 'empty':
      return `${progress.goalWords} words planned for today`;
    case 'starting':
      return `${progress.remainingWords} ${progress.remainingWords === 1 ? 'word' : 'words'} to go`;
    case 'flowing':
      return `${progress.remainingWords} ${progress.remainingWords === 1 ? 'word' : 'words'} remaining`;
    case 'nearing':
      return `${progress.remainingWords} ${progress.remainingWords === 1 ? 'word' : 'words'} to seal today\u2019s goal`;
    case 'full':
      return progress.bonusWords > 0
        ? `Daily goal reached · +${progress.bonusWords} extra`
        : 'Daily ink goal reached';
  }
}
