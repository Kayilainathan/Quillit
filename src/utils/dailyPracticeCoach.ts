import type { CalendarSlot, DrillType, WritingSession } from '../types';
import { getTimeCapsuleStatus } from './timeCapsule';

export interface DailyPracticeSuggestion {
  id: string;
  actionType: 'drill' | 'time-capsule' | 'converse' | 'slot';
  drill: DrillType;
  headline: string;
  rationale: string;
  ctaLabel: string;
  cadenceLabel: string;
  isPracticeDay: boolean;
  alreadyCompletedToday: boolean;
  slot?: CalendarSlot;
  timeCapsuleOrigin?: WritingSession;
}

function parseWeekday(todayISO: string): number {
  const [y, m, d] = todayISO.split('-').map(Number);
  if (!y || !m || !d) return new Date().getDay();
  return new Date(y, m - 1, d).getDay();
}

function getCadenceRotation(daysPerWeek: number): DrillType[] {
  if (daysPerWeek <= 2) {
    // High-ROI focused drills when writing 1–2 days/week
    return ['compression-432', 'skeleton'];
  }
  if (daysPerWeek === 3) {
    // Classic 3-day fluency triad
    return ['compression-432', 'skeleton', 'three-rooms'];
  }
  if (daysPerWeek <= 5) {
    // Balanced 4–5 day craft rotation
    return ['skeleton', 'compression-432', 'three-rooms', 'standard', 'compression-432'];
  }
  // 6–7 day daily writer rhythm
  return [
    'compression-432',
    'skeleton',
    'three-rooms',
    'standard',
    'compression-432',
    'skeleton',
    'standard',
  ];
}

const DRILL_COPY: Record<
  DrillType,
  { headline: string; rationale: string; ctaLabel: string }
> = {
  'compression-432': {
    headline: 'Today’s pick: 4/3/2 Sprint',
    rationale: 'Sharpen your core idea across three shrinking timed passes to cut filler.',
    ctaLabel: 'Start 4/3/2 Sprint',
  },
  skeleton: {
    headline: 'Today’s pick: Skeleton Rewrite',
    rationale: 'Study crisp structure, edit your 4 anchor keywords, and rebuild in your own voice.',
    ctaLabel: 'Open Skeleton',
  },
  'three-rooms': {
    headline: 'Today’s pick: 3 Rooms Shift',
    rationale: 'Explain one idea plainly, then defend it cleanly for a sharp reader.',
    ctaLabel: 'Open 3 Rooms',
  },
  standard: {
    headline: 'Today’s pick: 10-Min Clean Page',
    rationale: 'Write freely with one Craft Rule or 3m Flow to lock in calm, steady cadence.',
    ctaLabel: 'Start Writing',
  },
  'time-capsule': {
    headline: 'Time Capsule Unlocked',
    rationale: 'Rewrite an earlier topic blind to see how your tone and clarity have evolved.',
    ctaLabel: 'Open Time Capsule',
  },
};

/**
 * Recommends what to practice today based on the user's selected days/week cadence,
 * today's scheduled slots, completed sessions, and Time Capsule unlock readiness.
 */
export function computeDailyPracticeSuggestion(params: {
  preferredDays?: number[];
  todayISO: string;
  sessions: WritingSession[];
  calendarSlots: CalendarSlot[];
}): DailyPracticeSuggestion {
  const { preferredDays, todayISO, sessions, calendarSlots } = params;
  const normalizedDays = Array.from(
    new Set(
      (preferredDays && preferredDays.length > 0 ? preferredDays : [3, 5, 0])
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
  ).sort((a, b) => a - b);

  const daysPerWeek = Math.max(1, normalizedDays.length);
  const cadenceLabel = `${daysPerWeek} ${daysPerWeek === 1 ? 'day' : 'days'}/wk plan`;
  const todayDow = parseWeekday(todayISO);
  const isPracticeDay = normalizedDays.includes(todayDow);

  const alreadyCompletedToday = sessions.some(
    (s) => s.status === 'Completed' && s.date === todayISO
  );

  // 1. Check if a Time Capsule (30-day mature or freshly unlocked) is ready and not revisited today
  const capsuleStatus = getTimeCapsuleStatus(sessions, todayISO);
  const didCapsuleRecently = sessions.some(
    (s) => s.drillType === 'time-capsule' && s.date === todayISO
  );
  if (
    capsuleStatus.state === 'ready' &&
    capsuleStatus.candidate &&
    !alreadyCompletedToday &&
    !didCapsuleRecently &&
    (capsuleStatus.candidate.isFull30Day || capsuleStatus.completedCount === 3)
  ) {
    const origin = capsuleStatus.candidate.session;
    return {
      id: `capsule-${todayISO}-${origin.id}`,
      actionType: 'time-capsule',
      drill: 'time-capsule',
      headline: `Time Capsule Ready: "${origin.topicDescription}"`,
      rationale: capsuleStatus.candidate.isFull30Day
        ? `Written ${capsuleStatus.candidate.daysOld} days ago — rewrite it blind today to compare your evolution.`
        : 'You completed 3 entries! Rewrite your earliest topic blind to compare your growth.',
      ctaLabel: 'Rewrite Blind',
      cadenceLabel,
      isPracticeDay,
      alreadyCompletedToday: false,
      timeCapsuleOrigin: origin,
    };
  }

  // 2. Check if there's an uncompleted scheduled slot due today
  const todaySlot = calendarSlots.find(
    (s) => s.scheduledDate === todayISO && !s.completed
  );
  if (todaySlot && !alreadyCompletedToday) {
    if (todaySlot.isConverseSlot) {
      return {
        id: `slot-converse-${todaySlot.id}`,
        actionType: 'converse',
        drill: 'standard',
        headline: 'Today’s pick: 10-Min Live Converse',
        rationale: 'Practice spontaneous spoken-style flow with live recasts.',
        ctaLabel: 'Open Converse',
        cadenceLabel,
        isPracticeDay: true,
        alreadyCompletedToday: false,
        slot: todaySlot,
      };
    }

    const slotDrill: DrillType = todaySlot.recommendedDrill || 'compression-432';
    const copy = DRILL_COPY[slotDrill];
    return {
      id: `slot-${todaySlot.id}`,
      actionType: 'slot',
      drill: slotDrill,
      headline: copy.headline,
      rationale: `Scheduled prompt: "${todaySlot.topic}"`,
      ctaLabel: copy.ctaLabel,
      cadenceLabel,
      isPracticeDay: true,
      alreadyCompletedToday: false,
      slot: todaySlot,
    };
  }

  // 3. Deterministic cadence-driven drill recommendation based on selected days/week
  const rotation = getCadenceRotation(daysPerWeek);
  const slotPos = normalizedDays.indexOf(todayDow);
  const rotationIndex =
    slotPos >= 0
      ? slotPos % rotation.length
      : (todayDow + sessions.length) % rotation.length;
  const recommendedDrill = rotation[rotationIndex] ?? 'compression-432';
  const copy = DRILL_COPY[recommendedDrill];

  return {
    id: `daily-${todayISO}-${recommendedDrill}`,
    actionType: 'drill',
    drill: recommendedDrill,
    headline: isPracticeDay
      ? copy.headline
      : `Optional bonus: ${copy.headline.replace('Today’s pick: ', '')}`,
    rationale: copy.rationale,
    ctaLabel: copy.ctaLabel,
    cadenceLabel,
    isPracticeDay,
    alreadyCompletedToday,
  };
}
