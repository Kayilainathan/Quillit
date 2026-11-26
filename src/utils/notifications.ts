import type { CalendarSlot, WritingSession } from '../types';
import {
  INTERNAL_REMINDER_HOUR,
  INTERNAL_REMINDER_MINUTE,
  computeStreaks,
  parseISODate,
} from './analytics';

export type NotificationCategory =
  | 'due-today'
  | 'overdue'
  | 'daily-goal'
  | 'pending-ai'
  | 'streak';

export interface NotificationFeedItem {
  id: string;
  category: NotificationCategory;
  title: string;
  subtitle: string;
  actionLabel?: string;
  slot?: CalendarSlot;
  dateISO?: string;
}

export interface DayNotificationSummary {
  dueTodayPending: CalendarSlot[];
  overduePending: CalendarSlot[];
  totalActionable: number;
  hasReminderToday: boolean;
  msUntilScheduledTrigger: number | null;
  headline: string;
  body: string;
  items: NotificationFeedItem[];
  todayWordsCount: number;
  dailyWordGoal: number;
  streakDays: number;
  pendingAiCount: number;
}

export interface NotificationEvaluationContext {
  sessions?: WritingSession[];
  dailyWordGoal?: number;
  pendingAiCount?: number;
  dismissedIds?: string[];
  snoozedUntilById?: Record<string, string>;
}

export interface NotificationActionState {
  dismissedIds: string[];
  snoozedUntilById: Record<string, string>;
}

const NOTIF_ACTION_STORAGE_KEY = 'quillit_notif_actions_v1';

export function loadNotificationActionState(): NotificationActionState {
  try {
    const raw = localStorage.getItem(NOTIF_ACTION_STORAGE_KEY);
    if (!raw) return { dismissedIds: [], snoozedUntilById: {} };
    const parsed = JSON.parse(raw) as Partial<NotificationActionState>;
    return {
      dismissedIds: Array.isArray(parsed.dismissedIds)
        ? parsed.dismissedIds.filter((x): x is string => typeof x === 'string')
        : [],
      snoozedUntilById:
        parsed.snoozedUntilById && typeof parsed.snoozedUntilById === 'object'
          ? parsed.snoozedUntilById
          : {},
    };
  } catch {
    return { dismissedIds: [], snoozedUntilById: {} };
  }
}

export function saveNotificationActionState(state: NotificationActionState): void {
  try {
    localStorage.setItem(
      NOTIF_ACTION_STORAGE_KEY,
      JSON.stringify({
        dismissedIds: state.dismissedIds.slice(-60),
        snoozedUntilById: state.snoozedUntilById,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function dismissNotificationId(
  state: NotificationActionState,
  id: string
): NotificationActionState {
  if (state.dismissedIds.includes(id)) return state;
  return {
    ...state,
    dismissedIds: [...state.dismissedIds, id],
  };
}

export function addDaysISO(baseISO: string, deltaDays: number): string {
  const dt = parseISODate(baseISO);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function snoozeNotificationId(
  state: NotificationActionState,
  id: string,
  todayISO: string,
  days = 1
): NotificationActionState {
  return {
    ...state,
    snoozedUntilById: {
      ...state.snoozedUntilById,
      [id]: addDaysISO(todayISO, days),
    },
  };
}

export function clearDismissedNotifications(): NotificationActionState {
  return { dismissedIds: [], snoozedUntilById: {} };
}

function isSuppressed(
  id: string,
  todayISO: string,
  dismissedSet: Set<string>,
  snoozedUntilById: Record<string, string>
): boolean {
  if (dismissedSet.has(id)) return true;
  const until = snoozedUntilById[id];
  return Boolean(until && until > todayISO);
}

/**
 * Evaluates day-of reminders, overdue items, daily word target progress, streak
 * encouragement, and pending background AI evaluations into a clean filterable feed.
 */
export function evaluateDayNotifications(
  slots: CalendarSlot[],
  todayISO: string,
  now: Date = new Date(),
  context?: NotificationEvaluationContext
): DayNotificationSummary {
  const dismissedSet = new Set(context?.dismissedIds ?? []);
  const snoozedMap = context?.snoozedUntilById ?? {};

  const sorted = [...slots].sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate)
  );
  const dueTodayPending = sorted.filter(
    (s) => s.scheduledDate === todayISO && !s.completed
  );
  const overduePending = sorted.filter(
    (s) => s.scheduledDate < todayISO && !s.completed
  );

  const sessions = context?.sessions ?? [];
  const dailyWordGoal = context?.dailyWordGoal ?? 250;
  const todayWordsCount = sessions
    .filter((s) => s.date === todayISO)
    .reduce((sum, s) => sum + (s.wordCount || 0), 0);
  const streakDays = computeStreaks(sessions, todayISO).currentStreak;
  const pendingAiCount =
    context?.pendingAiCount ??
    sessions.filter((s) => Boolean(s.evaluationPending)).length;

  let msUntilScheduledTrigger: number | null = null;
  if (dueTodayPending.length > 0) {
    const todayDate = parseISODate(todayISO);
    const triggerAt = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate(),
      INTERNAL_REMINDER_HOUR,
      INTERNAL_REMINDER_MINUTE,
      0,
      0
    );
    const diff = triggerAt.getTime() - now.getTime();
    msUntilScheduledTrigger = diff > 0 ? diff : 0;
  }

  const items: NotificationFeedItem[] = [];

  for (const slot of dueTodayPending) {
    const id = `slot-${slot.id}`;
    if (!isSuppressed(id, todayISO, dismissedSet, snoozedMap)) {
      items.push({
        id,
        category: 'due-today',
        title: slot.topic,
        subtitle: `Today · 10 min · ${slot.targetWords}w goal`,
        actionLabel: 'Write',
        slot,
        dateISO: slot.scheduledDate,
      });
    }
  }

  for (const slot of overduePending) {
    const id = `slot-${slot.id}`;
    if (!isSuppressed(id, todayISO, dismissedSet, snoozedMap)) {
      items.push({
        id,
        category: 'overdue',
        title: slot.topic,
        subtitle: `Open from ${slot.scheduledDate} · ${slot.targetWords}w`,
        actionLabel: 'Open',
        slot,
        dateISO: slot.scheduledDate,
      });
    }
  }

  if (pendingAiCount > 0) {
    const id = `pending-ai-${todayISO}`;
    if (!isSuppressed(id, todayISO, dismissedSet, snoozedMap)) {
      items.push({
        id,
        category: 'pending-ai',
        title: `${pendingAiCount} draft${pendingAiCount === 1 ? '' : 's'} queued for full AI review`,
        subtitle: 'Open Dashboard to retry deep evaluation anytime.',
        actionLabel: 'Dashboard',
      });
    }
  }

  if (dailyWordGoal > 0) {
    const goalId = `goal-${todayISO}-${todayWordsCount >= dailyWordGoal ? 'done' : 'open'}`;
    if (!isSuppressed(goalId, todayISO, dismissedSet, snoozedMap)) {
      if (todayWordsCount >= dailyWordGoal) {
        items.push({
          id: goalId,
          category: 'daily-goal',
          title: `Daily ink target hit (${todayWordsCount}/${dailyWordGoal} words)`,
          subtitle:
            streakDays >= 2
              ? `${streakDays}-day writing rhythm locked in today.`
              : 'Consistent momentum builds panel-ready fluency.',
        });
      } else {
        const remaining = Math.max(0, dailyWordGoal - todayWordsCount);
        items.push({
          id: goalId,
          category: 'daily-goal',
          title:
            todayWordsCount > 0
              ? `${remaining} words left for today's ${dailyWordGoal}w goal`
              : `Today's ${dailyWordGoal}-word desk is open`,
          subtitle:
            streakDays >= 1
              ? `Keep your ${streakDays}-day streak moving with one clean paragraph.`
              : 'A crisp 10-minute session keeps your weekly cadence on track.',
        });
      }
    }
  }

  const activeSlotsCount = items.filter(
    (item) => item.category === 'due-today' || item.category === 'overdue'
  ).length;
  const totalActionable = activeSlotsCount + (pendingAiCount > 0 ? 1 : 0);
  const hasReminderToday = totalActionable > 0;

  let headline = 'All caught up for today';
  let body =
    'No scheduled tasks are due right now. Open Calendar or pick a fresh topic anytime.';

  if (dueTodayPending.length > 0 && overduePending.length > 0) {
    headline = `Today's session + ${overduePending.length} open task${overduePending.length === 1 ? '' : 's'}`;
    body = `"${dueTodayPending[0].topic}" is scheduled today.`;
  } else if (dueTodayPending.length > 0) {
    headline = 'Writing session scheduled today';
    body = `"${dueTodayPending[0].topic}" is ready in Write Studio.`;
  } else if (overduePending.length > 0) {
    headline = `${overduePending.length} unfinished past task${overduePending.length === 1 ? '' : 's'}`;
    body = `"${overduePending[0].topic}" from ${overduePending[0].scheduledDate} is waiting whenever you're ready.`;
  } else if (pendingAiCount > 0) {
    headline = `${pendingAiCount} draft${pendingAiCount === 1 ? '' : 's'} awaiting AI retry`;
    body = 'Saved safely in Drafts & Ledger until AI capacity catches up.';
  } else if (todayWordsCount >= dailyWordGoal) {
    headline = `Daily goal complete (${todayWordsCount}w)`;
    body =
      streakDays >= 2
        ? `${streakDays}-day writing streak active.`
        : 'Strong session today.';
  }

  return {
    dueTodayPending,
    overduePending,
    totalActionable,
    hasReminderToday,
    msUntilScheduledTrigger,
    headline,
    body,
    items,
    todayWordsCount,
    dailyWordGoal,
    streakDays,
    pendingAiCount,
  };
}

export function getBrowserNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function fireBrowserDayNotification(
  title: string,
  body: string
): boolean {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }
  try {
    new Notification(title, {
      body,
      tag: 'quilit-day-reminder',
    });
    return true;
  } catch {
    return false;
  }
}
