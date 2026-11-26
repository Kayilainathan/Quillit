import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarSlot, WritingSession } from '../types';
import { computeDailyPracticeSuggestion } from './dailyPracticeCoach';

function makeSession(overrides: Partial<WritingSession>): WritingSession {
  return {
    id: 's1',
    date: '2026-10-01',
    daySlot: 'Wednesday',
    mode: 'technical',
    promptCategory: 'Technical',
    tone: 'crisp-direct',
    topicDescription: 'Explain why clean logs save debugging hours',
    content: 'A completed draft with enough concrete prose to qualify for time capsule comparison cleanly.',
    wordCount: 92,
    scores: {
      naturalVoiceFlow: 7,
      claritySimplicity: 7,
      grammarMechanics: 7,
      toneEngagement: 7,
      sentenceVarietyCadence: 7,
      concisenessDirectness: 7,
    },
    totalScore: 42,
    percentage: 70,
    cefrLevel: 'B2',
    toneVerdict: 'Clear',
    flowVerdict: 'Steady',
    feedbackImplemented: 'Baseline',
    whatImproved: 'Baseline',
    strictImprovements: 'Tighten transitions.',
    grammarFixes: [],
    vocabUpgrades: [],
    status: 'Completed',
    createdAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

test('computeDailyPracticeSuggestion adapts recommendations to preferred days per week', () => {
  // 2026-11-25 is Wednesday (day 3)
  const twoDay = computeDailyPracticeSuggestion({
    preferredDays: [3, 6],
    todayISO: '2026-11-25',
    sessions: [],
    calendarSlots: [],
  });
  assert.equal(twoDay.cadenceLabel, '2 days/wk plan');
  assert.equal(twoDay.isPracticeDay, true);
  assert.equal(twoDay.drill, 'compression-432');
  assert.match(twoDay.headline, /4\/3\/2 Sprint/);

  // Off-day suggests optional bonus
  const offDay = computeDailyPracticeSuggestion({
    preferredDays: [1, 4],
    todayISO: '2026-11-25',
    sessions: [],
    calendarSlots: [],
  });
  assert.equal(offDay.isPracticeDay, false);
  assert.match(offDay.headline, /Optional bonus/);

  // 5-day cadence on 3rd slot day (Wednesday in [1,2,3,4,5]) recommends 3 Rooms
  const fiveDay = computeDailyPracticeSuggestion({
    preferredDays: [1, 2, 3, 4, 5],
    todayISO: '2026-11-25',
    sessions: [],
    calendarSlots: [],
  });
  assert.equal(fiveDay.cadenceLabel, '5 days/wk plan');
  assert.equal(fiveDay.drill, 'three-rooms');
});

test('computeDailyPracticeSuggestion elevates Time Capsule when freshly unlocked or 30+ days mature', () => {
  const mature = makeSession({ id: 'old-1', date: '2026-10-10' });
  const suggestion = computeDailyPracticeSuggestion({
    preferredDays: [3, 5, 0],
    todayISO: '2026-11-25',
    sessions: [mature],
    calendarSlots: [],
  });
  assert.equal(suggestion.actionType, 'time-capsule');
  assert.equal(suggestion.drill, 'time-capsule');
  assert.equal(suggestion.timeCapsuleOrigin?.id, 'old-1');
});

test('computeDailyPracticeSuggestion honors today scheduled slot when no mature capsule is waiting', () => {
  const slot: CalendarSlot = {
    id: 'slot-1',
    dayOfWeek: 'Wednesday',
    slotLabel: 'Technical',
    scheduledDate: '2026-11-25',
    promptCategory: 'Technical',
    topic: 'Describe a clean rollback checklist',
    mode: 'technical',
    tone: 'crisp-direct',
    recommendedDrill: 'skeleton',
    targetWords: 200,
    completed: false,
  };
  const suggestion = computeDailyPracticeSuggestion({
    preferredDays: [3, 5, 0],
    todayISO: '2026-11-25',
    sessions: [],
    calendarSlots: [slot],
  });
  assert.equal(suggestion.actionType, 'slot');
  assert.equal(suggestion.drill, 'skeleton');
  assert.equal(suggestion.slot?.id, 'slot-1');
});
