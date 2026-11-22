import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRICULUM_52_WEEKS } from '../data/curriculum52Weeks';
import {
  buildNonRepeatingMonthFromCurriculum,
  evaluatePeriodicAiAdaptation,
  getRemainingMonthPreferredSpecs,
  normalizeTopicKey,
  shouldAutoRollMonthSchedule,
  shouldShowNewUserWelcomeFlashcard,
  swapSlotWithCurriculum,
} from './curriculumEngine';
import { drawNextCurriculumRandomTopic } from './topicDeck';
import type { WritingSession } from '../types';

test('CURRICULUM_52_WEEKS contains all 156 unique topics across 52 weeks', () => {
  assert.equal(CURRICULUM_52_WEEKS.length, 156);

  const ids = new Set(CURRICULUM_52_WEEKS.map((t) => t.id));
  const titles = new Set(CURRICULUM_52_WEEKS.map((t) => normalizeTopicKey(t.topic)));
  const weeks = new Set(CURRICULUM_52_WEEKS.map((t) => t.week));

  assert.equal(ids.size, 156, 'Every curriculum ID must be unique');
  assert.equal(titles.size, 156, 'Every curriculum topic title must be unique');
  assert.equal(weeks.size, 52, 'All 52 weeks must be represented');
});

test('getRemainingMonthPreferredSpecs strictly skips all past dates and adapts dynamically to 1..7 weekdays', () => {
  const todayISO = '2026-11-18'; // Wednesday
  const specs3 = getRemainingMonthPreferredSpecs(2026, 10, todayISO, [3, 5, 0]);
  assert.ok(specs3.length > 0);
  for (const spec of specs3) {
    assert.ok(
      spec.scheduledDate >= todayISO,
      `Found past date ${spec.scheduledDate} < ${todayISO}`
    );
  }
  assert.equal(specs3[0].scheduledDate, '2026-11-18');
  assert.equal(specs3[0].pillar, 'technical-concept');

  // Dynamic 7-day everyday schedule
  const specs7 = getRemainingMonthPreferredSpecs(
    2026,
    10,
    '2026-11-25',
    [0, 1, 2, 3, 4, 5, 6]
  );
  assert.equal(specs7.length, 6); // Nov 25..30 inclusive
  assert.deepEqual(
    specs7.map((s) => s.pillar),
    [
      'technical-concept',
      'linkedin-email',
      'creative-story',
      'technical-concept',
      'linkedin-email',
      'creative-story',
    ]
  );

  // Dynamic 5-day weekday schedule
  const specs5 = getRemainingMonthPreferredSpecs(
    2026,
    10,
    '2026-11-16',
    [1, 2, 3, 4, 5]
  );
  assert.ok(specs5.every((s) => s.scheduledDate >= '2026-11-16'));
  assert.ok(
    specs5.every(
      (s) => s.dayOfWeek !== 'Saturday' && s.dayOfWeek !== 'Sunday'
    )
  );
});

test('buildNonRepeatingMonthFromCurriculum never repeats topics across consecutive months or swaps', () => {
  const testProfile = {
    collegeDegree: 'B.E. Electronics & Instrumentation',
    semester: '5th Semester',
    collegeName: 'Engineering College',
    age: 20,
    preferredDays: [1, 3, 5, 0],
    onboardingCompleted: true,
  };

  const firstMonth = buildNonRepeatingMonthFromCurriculum({
    year: 2026,
    monthIndex0: 10, // November
    todayISO: '2026-11-15',
    profile: testProfile,
    existingSlots: [],
    sessions: [],
    usedCurriculumIds: [],
  });

  assert.ok(firstMonth.addedSlots.length > 0);
  assert.ok(
    firstMonth.addedSlots.every((s) => s.scheduledDate >= '2026-11-15'),
    'No slot may be scheduled in the past'
  );

  const secondMonth = buildNonRepeatingMonthFromCurriculum({
    year: 2026,
    monthIndex0: 11, // December
    todayISO: '2026-11-15',
    profile: testProfile,
    existingSlots: firstMonth.addedSlots,
    sessions: [],
    usedCurriculumIds: firstMonth.newlyUsedCurriculumIds,
  });

  assert.ok(secondMonth.addedSlots.length > 0);

  const allSlots = [...firstMonth.addedSlots, ...secondMonth.addedSlots];
  const uniqueTopics = new Set(allSlots.map((s) => normalizeTopicKey(s.topic)));
  assert.equal(
    uniqueTopics.size,
    allSlots.length,
    'Topics across consecutive months must never repeat'
  );

  // Swap a single slot and confirm it produces a brand-new topic not in allSlots
  const target = firstMonth.addedSlots[0];
  const swapped = swapSlotWithCurriculum({
    slot: target,
    existingSlots: allSlots,
    sessions: [],
    usedCurriculumIds: [
      ...firstMonth.newlyUsedCurriculumIds,
      ...secondMonth.newlyUsedCurriculumIds,
    ],
  });
  assert.notEqual(swapped.updatedSlot.topic, target.topic);
  assert.ok(
    !uniqueTopics.has(normalizeTopicKey(swapped.updatedSlot.topic)),
    'Swapped topic must not repeat any existing topic'
  );
});

test('drawNextCurriculumRandomTopic draws from 52-week catalog without repeating used IDs or titles', () => {
  const seenIds = new Set<string>();
  const seenTitles: string[] = [];

  for (let i = 0; i < 20; i += 1) {
    const draw = drawNextCurriculumRandomTopic({
      usedCurriculumIds: Array.from(seenIds),
      usedTopicTitles: seenTitles,
      rng: () => 0.25,
    });
    assert.ok(draw.curriculumId, 'Should draw from 52-week catalog');
    assert.ok(!seenIds.has(draw.curriculumId), 'Random draw must never repeat');
    seenIds.add(draw.curriculumId);
    seenTitles.push(draw.title);
  }
});

test('evaluatePeriodicAiAdaptation triggers responsibly every 3 completed scored sessions', () => {
  const makeSession = (idx: number, pct: number): WritingSession => ({
    id: `s-${idx}`,
    date: `2026-11-0${idx}`,
    daySlot: 'Slot 1',
    mode: 'technical',
    promptCategory: 'Technical',
    tone: 'academic-technical',
    topicDescription: `Topic ${idx}`,
    content: 'Sample writing content for testing periodic adaptation.',
    wordCount: 150,
    scores: {
      naturalVoiceFlow: 7,
      claritySimplicity: 7,
      grammarMechanics: 7,
      toneEngagement: 7,
      sentenceVarietyCadence: 7,
      concisenessDirectness: 7,
    },
    totalScore: 42,
    percentage: pct,
    cefrLevel: 'B2',
    toneVerdict: '',
    flowVerdict: '',
    feedbackImplemented: 'Baseline',
    whatImproved: '',
    strictImprovements: '',
    grammarFixes: [],
    vocabUpgrades: [],
    status: 'Completed',
    createdAt: `2026-11-0${idx}T10:00:00Z`,
  });

  const twoSessions = [makeSession(1, 70), makeSession(2, 72)];
  assert.equal(
    evaluatePeriodicAiAdaptation({ sessions: twoSessions }).shouldTrigger,
    false
  );

  const threeSessions = [...twoSessions, makeSession(3, 68)];
  const triggered = evaluatePeriodicAiAdaptation({
    sessions: threeSessions,
    lastPeriodicAiSessionCount: 0,
  });
  assert.equal(triggered.shouldTrigger, true);
  assert.equal(triggered.completedCount, 3);

  const alreadyChecked = evaluatePeriodicAiAdaptation({
    sessions: threeSessions,
    lastPeriodicAiSessionCount: 3,
  });
  assert.equal(alreadyChecked.shouldTrigger, false);
});

test('shouldShowNewUserWelcomeFlashcard fires only for brand-new users', () => {
  assert.equal(
    shouldShowNewUserWelcomeFlashcard({
      welcomeFlashcardShown: false,
      sessionsCount: 0,
      calendarSlotsCount: 0,
      onboardingCompleted: true,
    }),
    true
  );

  assert.equal(
    shouldShowNewUserWelcomeFlashcard({
      welcomeFlashcardShown: true,
      sessionsCount: 0,
      calendarSlotsCount: 0,
      onboardingCompleted: true,
    }),
    false
  );

  assert.equal(
    shouldShowNewUserWelcomeFlashcard({
      welcomeFlashcardShown: false,
      sessionsCount: 1,
      calendarSlotsCount: 0,
      onboardingCompleted: true,
    }),
    false
  );

  assert.equal(
    shouldShowNewUserWelcomeFlashcard({
      welcomeFlashcardShown: false,
      sessionsCount: 0,
      calendarSlotsCount: 3,
      onboardingCompleted: true,
    }),
    false
  );
});

test('shouldAutoRollMonthSchedule respects brand-new user guard and rolls into next month when current month is done', () => {
  // Brand-new user waiting for Welcome Flashcard should NOT auto-roll yet
  assert.deepEqual(
    shouldAutoRollMonthSchedule({
      autoReloadSchedule: true,
      welcomeFlashcardShown: false,
      sessions: [],
      calendarSlots: [],
      todayISO: '2026-11-22',
      preferredDays: [3, 5, 0],
    }),
    { shouldRoll: false }
  );

  // Disabled setting should never auto-roll
  assert.deepEqual(
    shouldAutoRollMonthSchedule({
      autoReloadSchedule: false,
      welcomeFlashcardShown: true,
      sessions: [],
      calendarSlots: [],
      todayISO: '2026-11-22',
      preferredDays: [3, 5, 0],
    }),
    { shouldRoll: false }
  );

  // Returning user with 0 upcoming slots mid-month should roll remaining current month
  const midMonth = shouldAutoRollMonthSchedule({
    autoReloadSchedule: true,
    welcomeFlashcardShown: true,
    sessions: [],
    calendarSlots: [],
    todayISO: '2026-11-22',
    preferredDays: [3, 5, 0],
  });
  assert.deepEqual(midMonth, {
    shouldRoll: true,
    year: 2026,
    monthIndex0: 10,
    targetKey: '2026-11',
  });

  // Once all remaining current-month slots are completed, auto-rolls into December 2026
  const builtNov = buildNonRepeatingMonthFromCurriculum({
    year: 2026,
    monthIndex0: 10,
    todayISO: '2026-11-22',
    existingSlots: [],
    sessions: [],
    usedCurriculumIds: [],
  }).addedSlots.map((slot) => ({ ...slot, completed: true }));

  const nextMonth = shouldAutoRollMonthSchedule({
    autoReloadSchedule: true,
    welcomeFlashcardShown: true,
    sessions: [],
    calendarSlots: builtNov,
    todayISO: '2026-11-22',
    preferredDays: [3, 5, 0],
  });
  assert.deepEqual(nextMonth, {
    shouldRoll: true,
    year: 2026,
    monthIndex0: 11,
    targetKey: '2026-12',
  });

  // If at least one upcoming slot is still pending, do NOT auto-roll yet
  const onePending = builtNov.map((slot, idx) =>
    idx === builtNov.length - 1 ? { ...slot, completed: false } : slot
  );
  assert.deepEqual(
    shouldAutoRollMonthSchedule({
      autoReloadSchedule: true,
      welcomeFlashcardShown: true,
      sessions: [],
      calendarSlots: onePending,
      todayISO: '2026-11-22',
      preferredDays: [3, 5, 0],
    }),
    { shouldRoll: false }
  );
});

