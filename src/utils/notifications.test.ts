import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarSlot } from '../types';
import {
  clearDismissedNotifications,
  dismissNotificationId,
  evaluateDayNotifications,
  snoozeNotificationId,
} from './notifications';

test('evaluateDayNotifications supports scheduled tasks, insights, dismiss, and snooze cleanly', () => {
  const slots: CalendarSlot[] = [
    {
      id: 's1',
      scheduledDate: '2026-11-26',
      dayOfWeek: 'Thursday',
      slotLabel: 'Technical Drill',
      promptCategory: 'instrumentation',
      mode: 'technical',
      tone: 'crisp-direct',
      topic: 'Explain 3-wire RTD lead compensation aloud for placement panels',
      targetWords: 200,
      completed: false,
    },
    {
      id: 's2',
      scheduledDate: '2026-11-24',
      dayOfWeek: 'Tuesday',
      slotLabel: 'Status Email',
      promptCategory: 'workplace',
      mode: 'email',
      tone: 'formal-executive',
      topic: 'Send project status escalation email',
      targetWords: 150,
      completed: false,
    },
  ];

  const base = evaluateDayNotifications(slots, '2026-11-26', new Date(2026, 10, 26, 10, 0), {
    dailyWordGoal: 250,
    pendingAiCount: 1,
    sessions: [],
  });

  assert.equal(base.dueTodayPending.length, 1);
  assert.equal(base.overduePending.length, 1);
  assert.equal(base.totalActionable, 3); // 2 tasks + 1 pending AI
  assert.ok(base.items.some((i) => i.category === 'daily-goal'));
  assert.ok(base.items.some((i) => i.category === 'pending-ai'));

  let state = dismissNotificationId({ dismissedIds: [], snoozedUntilById: {} }, 'slot-s2');
  state = snoozeNotificationId(state, 'slot-s1', '2026-11-26', 1);

  const filtered = evaluateDayNotifications(slots, '2026-11-26', new Date(2026, 10, 26, 10, 0), {
    dailyWordGoal: 250,
    pendingAiCount: 1,
    sessions: [],
    dismissedIds: state.dismissedIds,
    snoozedUntilById: state.snoozedUntilById,
  });

  assert.equal(filtered.items.some((i) => i.id === 'slot-s1'), false);
  assert.equal(filtered.items.some((i) => i.id === 'slot-s2'), false);
  assert.equal(filtered.totalActionable, 1);

  const cleared = clearDismissedNotifications();
  assert.equal(cleared.dismissedIds.length, 0);
  assert.deepEqual(cleared.snoozedUntilById, {});
});
