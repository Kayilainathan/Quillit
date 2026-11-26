import type { WritingSession } from '../types';

export interface TimeCapsuleCandidate {
  session: WritingSession;
  daysOld: number;
  isFull30Day: boolean;
  label: string;
}

function parseISODateMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d);
}

/**
 * Finds the best Time Capsule prompt from past completed sessions:
 * - Primary: oldest completed session >= 30 days old (that hasn't been revisited yet)
 * - Early-Unlock Preview: once >= 3 completed sessions exist, allows previewing the earliest
 *   past session so writers can experience Past-vs-Today growth even in Week 1.
 */
export function findTimeCapsuleCandidate(
  sessions: WritingSession[],
  todayISO: string
): TimeCapsuleCandidate | null {
  const completed = sessions
    .filter(
      (s) =>
        s.status === 'Completed' &&
        s.content.trim().length >= 40 &&
        s.drillType !== 'time-capsule'
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (completed.length === 0) return null;

  const revisitedIds = new Set(
    sessions
      .map((s) => s.drillMeta?.timeCapsuleOriginSessionId)
      .filter((id): id is string => Boolean(id))
  );

  const todayMs = parseISODateMs(todayISO);
  const eligiblePool = completed.filter((s) => !revisitedIds.has(s.id));
  const pool = eligiblePool.length > 0 ? eligiblePool : completed;

  // Check for true 30+ day maturity first
  for (const s of pool) {
    const daysOld = Math.max(
      0,
      Math.round((todayMs - parseISODateMs(s.date)) / 86_400_000)
    );
    if (daysOld >= 30) {
      return {
        session: s,
        daysOld,
        isFull30Day: true,
        label: `Time Capsule Ready · ${daysOld}d ago`,
      };
    }
  }

  // Early-unlock preview once >= 3 completed sessions exist
  if (completed.length >= 3) {
    const earliest = pool[0];
    const daysOld = Math.max(
      0,
      Math.round((todayMs - parseISODateMs(earliest.date)) / 86_400_000)
    );
    return {
      session: earliest,
      daysOld,
      isFull30Day: false,
      label:
        daysOld > 0
          ? `Time Capsule Preview · ${daysOld}d ago`
          : 'Time Capsule Preview · Earlier Session',
    };
  }

  return null;
}

export const TIME_CAPSULE_REQUIRED_SESSIONS = 3;

export interface TimeCapsuleStatus {
  state: 'locked' | 'ready';
  completedCount: number;
  requiredCount: number;
  remainingCount: number;
  progressRatio: number;
  naturalMessage: string;
  candidate: TimeCapsuleCandidate | null;
  allEligibleCandidates: TimeCapsuleCandidate[];
}

/**
 * Returns a natural-language Time Capsule readiness state for both brand-new
 * writers (locked with calm progress copy) and returning writers (ready with
 * an auto-suggested past topic to rewrite blind).
 */
export function getTimeCapsuleStatus(
  sessions: WritingSession[],
  todayISO: string
): TimeCapsuleStatus {
  const completed = sessions
    .filter(
      (s) =>
        s.status === 'Completed' &&
        s.content.trim().length >= 40 &&
        s.drillType !== 'time-capsule'
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const candidate = findTimeCapsuleCandidate(sessions, todayISO);
  const todayMs = parseISODateMs(todayISO);

  const allEligibleCandidates: TimeCapsuleCandidate[] = completed.map((s) => {
    const daysOld = Math.max(
      0,
      Math.round((todayMs - parseISODateMs(s.date)) / 86_400_000)
    );
    const isFull30Day = daysOld >= 30;
    return {
      session: s,
      daysOld,
      isFull30Day,
      label: isFull30Day
        ? `Time Capsule Ready · ${daysOld}d ago`
        : daysOld > 0
          ? `Earlier Topic · ${daysOld}d ago`
          : 'Earlier Session',
    };
  });

  if (candidate) {
    const topicTitle = candidate.session.topicDescription || 'an earlier topic';
    const agePhrase = candidate.isFull30Day
      ? `${candidate.daysOld} days ago`
      : candidate.daysOld > 0
        ? `${candidate.daysOld} day${candidate.daysOld === 1 ? '' : 's'} ago`
        : 'earlier';
    return {
      state: 'ready',
      completedCount: completed.length,
      requiredCount: TIME_CAPSULE_REQUIRED_SESSIONS,
      remainingCount: 0,
      progressRatio: 1,
      naturalMessage: `Unlocked — rewrite "${topicTitle}" from ${agePhrase} with fresh eyes and compare how your voice evolved.`,
      candidate,
      allEligibleCandidates,
    };
  }

  const remainingCount = Math.max(
    1,
    TIME_CAPSULE_REQUIRED_SESSIONS - completed.length
  );
  const progressRatio = Math.min(
    1,
    completed.length / TIME_CAPSULE_REQUIRED_SESSIONS
  );
  const naturalMessage =
    completed.length === 0
      ? 'Write 3 completed entries to seal your first Time Capsule. Once ready, Quillit will bring back an earlier topic to rewrite blind and compare your writing growth.'
      : `Write ${remainingCount} more ${remainingCount === 1 ? 'entry' : 'entries'} to unlock Time Capsule — we will bring back one of your past topics to rewrite fresh and compare your aesthetics.`;

  return {
    state: 'locked',
    completedCount: completed.length,
    requiredCount: TIME_CAPSULE_REQUIRED_SESSIONS,
    remainingCount,
    progressRatio,
    naturalMessage,
    candidate: null,
    allEligibleCandidates,
  };
}

/**
 * Computes concrete Past-vs-Today growth deltas when a writer re-answers a sealed Time Capsule prompt.
 */
export function computeTimeCapsuleDelta(
  origin: WritingSession,
  todaySession: {
    totalScore: number;
    percentage: number;
    wordCount: number;
    spokenReadinessScore?: number;
    signalNoiseRatio?: number;
  }
): {
  scoreDelta: number;
  percentageDelta: number;
  wordDelta: number;
  headline: string;
} {
  const scoreDelta = Number((todaySession.totalScore - origin.totalScore).toFixed(1));
  const percentageDelta = Number(
    (todaySession.percentage - origin.percentage).toFixed(1)
  );
  const wordDelta = todaySession.wordCount - origin.wordCount;

  let headline = 'Steady consistency with your earlier draft.';
  if (scoreDelta >= 4) {
    headline = `Breakthrough lift: +${scoreDelta} points (+${percentageDelta}%) over your past draft.`;
  } else if (scoreDelta > 0) {
    headline = `Measurable growth: +${scoreDelta} points (+${percentageDelta}%) sharper than before.`;
  } else if (scoreDelta < 0) {
    headline = `${scoreDelta} points vs your earlier pass — compare both drafts side-by-side to spot what shifted.`;
  }

  return {
    scoreDelta,
    percentageDelta,
    wordDelta,
    headline,
  };
}
