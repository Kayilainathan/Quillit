import type { WritingSession } from '../types';

export type InkFillStage = 'empty' | 'starting' | 'flowing' | 'nearing' | 'full';

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
  percentage: number;
  remainingWords: number;
  reached: boolean;
  stage: InkFillStage;
}

const DEFAULT_DAILY_WORD_GOAL = 250;
const MIN_DAILY_WORD_GOAL = 25;

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

  const savedWordsToday = sessions.reduce((sum, session) => {
    if (session.date !== todayISO) return sum;
    if (activeDraftId && session.id === activeDraftId) return sum;
    if (activeLoggedSessionId && session.id === activeLoggedSessionId) return sum;
    const words = Number.isFinite(session.wordCount)
      ? Math.max(0, Math.round(session.wordCount))
      : 0;
    return sum + words;
  }, 0);

  const activeDraftWords = Math.max(
    0,
    Math.round(Number.isFinite(currentWordCount) ? currentWordCount : 0)
  );

  const totalWordsToday = savedWordsToday + activeDraftWords;
  const ratio = Math.min(1, Math.max(0, totalWordsToday / goalWords));
  const percentage = Math.min(100, Math.round(ratio * 100));
  const remainingWords = Math.max(0, goalWords - totalWordsToday);
  const reached = totalWordsToday >= goalWords;

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
    percentage,
    remainingWords,
    reached,
    stage,
  };
}

/**
 * Returns calm, pen-and-paper micro-copy describing the current ink well state.
 */
export function getInkWellCaption(progress: DailyInkProgress): string {
  switch (progress.stage) {
    case 'empty':
      return 'Dip your nib to begin filling today\u2019s ink well';
    case 'starting':
      return 'First ink on the page';
    case 'flowing':
      return 'Ink flowing steadily';
    case 'nearing':
      return `${progress.remainingWords} ${progress.remainingWords === 1 ? 'word' : 'words'} to seal today\u2019s goal`;
    case 'full':
      return 'Daily ink goal reached';
  }
}
