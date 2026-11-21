import type { CalendarSlot } from '../types';
import {
  INTERNAL_REMINDER_HOUR,
  INTERNAL_REMINDER_MINUTE,
  parseISODate,
} from './analytics';

export interface DayNotificationSummary {
  dueTodayPending: CalendarSlot[];
  overduePending: CalendarSlot[];
  totalActionable: number;
  hasReminderToday: boolean;
  msUntilScheduledTrigger: number | null;
  headline: string;
  body: string;
}

/**
 * Evaluates day-of reminders and computes the internal delay until the silent 18:19 local trigger
 * without ever exposing clock time strings in UI copy.
 */
export function evaluateDayNotifications(
  slots: CalendarSlot[],
  todayISO: string,
  now: Date = new Date()
): DayNotificationSummary {
  const sorted = [...slots].sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate)
  );
  const dueTodayPending = sorted.filter(
    (s) => s.scheduledDate === todayISO && !s.completed
  );
  const overduePending = sorted.filter(
    (s) => s.scheduledDate < todayISO && !s.completed
  );

  const totalActionable = dueTodayPending.length + overduePending.length;
  const hasReminderToday = totalActionable > 0;

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

  let headline = 'All caught up for today';
  let body = 'No writing tasks are due today. Check Calendar to preview upcoming sessions.';

  if (dueTodayPending.length > 0 && overduePending.length > 0) {
    headline = `Today's session + ${overduePending.length} unfinished past task${overduePending.length === 1 ? '' : 's'}`;
    body = `Today: "${dueTodayPending[0].topic}" — plus ${overduePending.length} past item${overduePending.length === 1 ? '' : 's'} waiting for catch-up.`;
  } else if (dueTodayPending.length > 0) {
    headline = `Writing session scheduled today`;
    body = `"${dueTodayPending[0].topic}" is ready in your Writing Studio.`;
  } else if (overduePending.length > 0) {
    headline = `${overduePending.length} unfinished past task${overduePending.length === 1 ? '' : 's'}`;
    body = `Pick up "${overduePending[0].topic}" from ${overduePending[0].scheduledDate} whenever you're ready.`;
  }

  return {
    dueTodayPending,
    overduePending,
    totalActionable,
    hasReminderToday,
    msUntilScheduledTrigger,
    headline,
    body,
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
