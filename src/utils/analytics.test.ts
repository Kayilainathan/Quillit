import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDraftLocally,
  applyMultipleReplacements,
  buildDefaultTriWeeklySlots,
  buildFluencyHeatmapData,
  buildMonthMatrix,
  buildMonthTriWeeklySlots,
  INTERNATIONAL_HEATMAP_METRICS,
  computeAverageInternationalMetrics,
  computeAverageRubric,
  computeModeBreakdown,
  computeMonthlyEntries,
  computePercentage,
  computeReadabilityStats,
  computeStreaks,
  computeTaskStreak,
  computeTotalScore,
  computeVocabularyStats,
  countWords,
  createEmptyVaultPayload,
  createSeedVaultPayload,
  deriveInternationalMetrics,
  detectPracticingVocabUsed,
  exportSessionsToCsv,
  findGrowthLever,
  getMonthTriWeeklyDates,
  getTriWeeklyCycleDates,
  mergeVaultPayloads,
  needsTriWeeklyAutoReload,
  stripPredefinedSeedData,
  summarizeCoachContext,
  swapSingleTriWeeklySlot,
  buildQueuedProvisionalEvaluation,
} from './analytics';

test('swapSingleTriWeeklySlot and buildQueuedProvisionalEvaluation operate with zero API tokens', () => {
  const slots = buildDefaultTriWeeklySlots('2026-11-18');
  const originalWedTopic = slots[0].topic;
  const swappedWed = swapSingleTriWeeklySlot(slots[0], [originalWedTopic]);
  assert.notEqual(swappedWed.topic, originalWedTopic);
  assert.equal(swappedWed.mode, 'technical');
  assert.equal(swappedWed.slotTime, '6:19 PM');
  assert.ok(swappedWed.topicPrimer && swappedWed.topicPrimer.length > 20);
  assert.ok(swappedWed.pivotRule && swappedWed.pivotRule.includes('Universal Pivot'));
  assert.equal(swappedWed.suggestions?.length, 3);

  const provisional = buildQueuedProvisionalEvaluation(
    'In our 6th-semester EIE lab, we calibrated a 4-20 mA current loop transmitter and basically verified that common-mode noise remained rejected across long cable runs.',
    'technical',
    'academic-technical'
  );
  assert.ok(computeTotalScore(provisional.scores) >= 30);
  assert.ok(provisional.internationalMetrics.ieltsBand >= 5.0);
  assert.ok(provisional.grammarFixes.some((g) => g.original === 'basically'));
});


test('seed payload totals and average mastery match reference tracker', () => {
  const seed = createSeedVaultPayload('2026-11-18');
  assert.equal(seed.sessions.length, 4);
  const totalWords = seed.sessions.reduce((acc, s) => acc + s.wordCount, 0);
  assert.equal(totalWords, 953);

  const avgScore =
    seed.sessions.reduce((acc, s) => acc + s.totalScore, 0) / seed.sessions.length;
  assert.equal(avgScore, 48);
  assert.equal(computePercentage(avgScore), 80.0);
});

test('rubric scoring and word counting behave accurately', () => {
  assert.equal(countWords('   hello   world  from EIE  '), 4);
  assert.equal(countWords('   '), 0);

  const total = computeTotalScore({
    naturalVoiceFlow: 9,
    claritySimplicity: 8,
    grammarMechanics: 8,
    toneEngagement: 9,
    sentenceVarietyCadence: 7,
    concisenessDirectness: 8,
  });
  assert.equal(total, 49);
  assert.equal(computePercentage(total), 81.7);
});

test('streak computation handles consecutive and gapped days', () => {
  const seed = createSeedVaultPayload('2026-11-18');
  const gapped = computeStreaks(seed.sessions, '2026-11-18');
  assert.equal(gapped.longestStreak, 2);
  assert.equal(gapped.currentStreak, 0);

  const extended = [
    ...seed.sessions,
    { ...seed.sessions[0], id: 'S_17', date: '2026-11-17' },
    { ...seed.sessions[0], id: 'S_18', date: '2026-11-18' },
  ];
  const active = computeStreaks(extended, '2026-11-18');
  assert.equal(active.currentStreak, 2);
  assert.equal(computeMonthlyEntries(extended, '2026-11-18'), 6);
});

test('tri-weekly Wed/Fri/Sun cycle dates and auto-reload detection work properly', () => {
  // 2026-11-18 is Wednesday -> Wed 11-18, Fri 11-20, Sun 11-22
  const cycle = getTriWeeklyCycleDates('2026-11-18');
  assert.equal(cycle.wednesday, '2026-11-18');
  assert.equal(cycle.friday, '2026-11-20');
  assert.equal(cycle.sunday, '2026-11-22');

  // 2026-11-22 is Sunday -> still in Wed 11-18 .. Sun 11-22 cycle
  const sundayCycle = getTriWeeklyCycleDates('2026-11-22');
  assert.equal(sundayCycle.wednesday, '2026-11-18');
  assert.equal(sundayCycle.sunday, '2026-11-22');

  // 2026-11-23 is Monday -> advances cleanly to upcoming week's Wed 11-25, Fri 11-27, Sun 11-29
  const nextCycle = getTriWeeklyCycleDates('2026-11-23');
  assert.equal(nextCycle.wednesday, '2026-11-25');
  assert.equal(nextCycle.friday, '2026-11-27');
  assert.equal(nextCycle.sunday, '2026-11-29');

  const slots = buildDefaultTriWeeklySlots('2026-11-18');
  assert.equal(slots.length, 3);
  assert.equal(slots[0].dayOfWeek, 'Wednesday');
  assert.equal(slots[0].mode, 'technical');
  assert.equal(slots[1].dayOfWeek, 'Friday');
  assert.equal(slots[1].mode, 'linkedin');
  assert.equal(slots[2].dayOfWeek, 'Sunday');
  assert.equal(slots[2].mode, 'creative');
  assert.equal(needsTriWeeklyAutoReload(slots, '2026-11-18'), false);
  assert.equal(needsTriWeeklyAutoReload(slots, '2026-11-23'), true);
});

test('task streak maintains continuity across Wed/Fri/Sun gaps and resets if missed', () => {
  const slots = [
    ...buildDefaultTriWeeklySlots('2026-11-11').map((s) => ({
      ...s,
      id: `prev-${s.id}`,
      completed: true,
    })),
    ...buildDefaultTriWeeklySlots('2026-11-18').map((s) =>
      s.scheduledDate <= '2026-11-20' ? { ...s, completed: true } : s
    ),
  ];
  // 3 from prior week + Wed & Fri from current week = 5 consecutive tasks!
  const streak = computeTaskStreak(slots, '2026-11-20');
  assert.equal(streak.currentTaskStreak, 5);
  assert.equal(streak.longestTaskStreak, 5);
  assert.equal(streak.weeklyCompleted, 2);

  // If Fri (2026-11-20) was NOT completed and reference date moves to Saturday (2026-11-21), streak resets
  const missedSlots = slots.map((s) =>
    s.scheduledDate === '2026-11-20' ? { ...s, completed: false } : s
  );
  const broken = computeTaskStreak(missedSlots, '2026-11-21');
  assert.equal(broken.currentTaskStreak, 0);
  assert.equal(broken.longestTaskStreak, 4);
});

test('monthly Wed/Fri/Sun generator, coach context, and auto vocab mastery detection work cleanly', () => {
  const novDates = getMonthTriWeeklyDates(2026, 10); // Nov 2026 has 4 Wed, 4 Fri, 5 Sun = 13 dates
  assert.equal(novDates.length, 13);
  const seed = createSeedVaultPayload('2026-11-18');
  const ctx = summarizeCoachContext(seed.sessions, seed.vocabulary);
  assert.equal(ctx.weakestPillarLabel, 'Grammar & Mechanics');
  assert.ok(ctx.practicingWords.length > 0);
  assert.ok(ctx.activeReminder.includes('Practice'));

  const monthSlots = buildMonthTriWeeklySlots(2026, 10, seed.calendarSlots, ctx);
  assert.ok(monthSlots.length >= 6);
  assert.ok(monthSlots.every((s) => s.topicPrimer && s.pivotRule && s.slotTime === '6:19 PM'));

  const usedIds = detectPracticingVocabUsed(
    'I diagnosed the oscillating comparator and the ADC digitizes the filtered voltage cleanly.',
    seed.vocabulary
  );
  assert.ok(usedIds.includes('vocab-4')); // digitizes
  assert.ok(usedIds.includes('vocab-7')); // diagnosed
});

test('international validation metrics and readability computation produce bounded scores', () => {
  const sample =
    'In a practical instrumentation loop, an RTD changes resistance gradually with temperature. Next, an instrumentation amplifier rejects common-mode noise before an anti-aliasing filter limits bandwidth.';
  const readability = computeReadabilityStats(sample);
  assert.ok(readability.fleschReadingEase >= 0 && readability.fleschReadingEase <= 100);
  assert.ok(readability.fkGradeLevel >= 1 && readability.fkGradeLevel <= 18);

  const seed = createSeedVaultPayload('2026-11-18');
  const intl = deriveInternationalMetrics(seed.sessions[0]);
  assert.ok(intl.ieltsBand >= 4.0 && intl.ieltsBand <= 9.0);
  assert.ok(intl.toeflEquivalent >= 15 && intl.toeflEquivalent <= 30);

  const avgIntl = computeAverageInternationalMetrics(seed.sessions);
  assert.ok(avgIntl.ieltsBand >= 6.5);
  assert.ok(avgIntl.lexicalResource > 0);
  assert.ok(avgIntl.coherenceCohesion > 0);
});

test('buildMonthMatrix generates Monday-first calendar grid', () => {
  // November 2026 starts on Sunday -> Monday-first grid starts on Oct 26 (Mon) and spans 42 cells
  const nov = buildMonthMatrix(2026, 10);
  assert.equal(nov[0].iso, '2026-10-26');
  assert.equal(nov[0].inCurrentMonth, false);
  const firstNov = nov.find((c) => c.iso === '2026-11-01');
  assert.equal(firstNov?.inCurrentMonth, true);
  assert.equal(firstNov?.weekdayIndex, 6); // Sunday
});

test('vocabulary stats aggregate week, month, year, and mastered counts', () => {
  const seed = createSeedVaultPayload('2026-11-18');
  const stats = computeVocabularyStats(seed.vocabulary, '2026-11-18');
  assert.equal(stats.totalCount, 9);
  assert.equal(stats.yearCount, 9);
  assert.equal(stats.monthCount, 9);
  assert.equal(stats.weekCount, 4);
  assert.equal(stats.masteredCount, 3);
});

test('live local draft analyzer detects filler words and repeated sentence openers', () => {
  const sample =
    'I then checked the ADC pin. I then noticed basically a loose wire. I then actually fixed it.';
  const diag = analyzeDraftLocally(sample);
  assert.equal(diag.sentenceCount, 3);
  assert.ok(diag.fillerHits.some((f) => f.word === 'basically' && f.count === 1));
  assert.ok(diag.fillerHits.some((f) => f.word === 'actually' && f.count === 1));
  assert.ok(diag.repeatedOpeners.some((o) => o.opener === 'i then' && o.count === 3));
});

test('average rubric and CSV export produce valid tracker output', () => {
  const seed = createSeedVaultPayload('2026-11-18');
  const avg = computeAverageRubric(seed.sessions);
  assert.equal(avg.naturalVoiceFlow, 8.3);
  const csv = exportSessionsToCsv(seed.sessions);
  assert.ok(csv.includes('Session ID,Date,Day & Slot'));
  assert.ok(csv.includes('IELTS Band'));
  assert.ok(csv.includes('SESSION_20261114_W1'));
});

test('applyMultipleReplacements applies multiple fixes cleanly and handles slash alternatives', () => {
  const draft = "Our sensor didn't worked and we looked into a important wire.";
  const { updatedText, appliedCount } = applyMultipleReplacements(draft, [
    { original: "didn't worked", replacement: "didn't work" },
    { original: 'looked into', replacement: 'diagnosed / inspected' },
    { original: 'a important', replacement: 'an important' },
    { original: 'not present', replacement: 'ignored' },
  ]);
  assert.equal(appliedCount, 3);
  assert.equal(
    updatedText,
    "Our sensor didn't work and we diagnosed an important wire."
  );
});

test('mode breakdown and growth lever identify weakest rubric dimension and per-mode stats', () => {
  const seed = createSeedVaultPayload('2026-11-18');
  const breakdown = computeModeBreakdown(seed.sessions);
  const tech = breakdown.find((b) => b.mode === 'technical');
  assert.equal(tech?.sessionCount, 2);
  assert.equal(tech?.totalWords, 495);

  const avg = computeAverageRubric(seed.sessions);
  const lever = findGrowthLever(avg);
  assert.equal(lever?.label, 'Grammar & Mechanics');
  assert.equal(lever?.score, 7.3);
});

test('mergeVaultPayloads merges cross-device sessions, slots, and vocab without duplicates', () => {
  const local = createSeedVaultPayload('2026-11-18');
  const pendingLocal = {
    ...local.sessions[0],
    id: 'SESSION_CLOUD_PENDING',
    date: '2026-11-18',
    evaluationPending: true,
    totalScore: 40,
  };
  const localWithPending = {
    ...local,
    sessions: [...local.sessions, pendingLocal],
  };

  const remoteCompleted = {
    ...pendingLocal,
    evaluationPending: false,
    totalScore: 54,
  };
  const remoteOnlySession = {
    ...local.sessions[0],
    id: 'SESSION_OTHER_DEVICE',
    date: '2026-11-19',
  };
  const completedRemoteSlot = {
    ...local.calendarSlots[2],
    completed: true,
    linkedSessionId: 'SESSION_OTHER_DEVICE',
  };

  const merged = mergeVaultPayloads(localWithPending, {
    sessions: [remoteCompleted, remoteOnlySession],
    calendarSlots: [completedRemoteSlot],
    vocabulary: [
      {
        ...local.vocabulary[0],
        id: 'vocab-duplicate-pair',
      },
      {
        id: 'vocab-remote-new',
        used: 'a lot of noise',
        betterAlternative: 'high-frequency interference',
        explanation: 'Domain-specific instrumentation noun phrase.',
        contextSnippet: 'Filter out high-frequency interference.',
        mode: 'technical',
        dateAdded: '2026-11-18',
        mastered: false,
      },
    ],
  });

  assert.equal(merged.sessions.length, 6);
  const resolved = merged.sessions.find((s) => s.id === 'SESSION_CLOUD_PENDING');
  assert.equal(resolved?.evaluationPending, false);
  assert.equal(resolved?.totalScore, 54);
  const slot = merged.calendarSlots.find((s) => s.id === completedRemoteSlot.id);
  assert.equal(slot?.completed, true);
  assert.equal(merged.vocabulary.length, local.vocabulary.length + 1);
});

test('createEmptyVaultPayload initializes zero predefined records and stripPredefinedSeedData preserves user work', () => {
  const empty = createEmptyVaultPayload();
  assert.equal(empty.sessions.length, 0);
  assert.equal(empty.calendarSlots.length, 0);
  assert.equal(empty.vocabulary.length, 0);
  assert.equal(empty.settings.autoReloadSchedule, false);

  const seed = createSeedVaultPayload('2026-11-18');
  const userSession = {
    ...seed.sessions[0],
    id: 'SESSION_USER_CUSTOM_1',
    topic: 'User written PID loop explanation',
  };
  const userSlotCompletedBySeed = {
    ...seed.calendarSlots[0],
    completed: true,
    linkedSessionId: 'SESSION_USER_CUSTOM_1',
  };
  const userCustomSlot = {
    ...seed.calendarSlots[1],
    id: 'tri-ai-custom-1',
    topic: 'Custom AI task',
  };
  const userVocab = {
    ...seed.vocabulary[0],
    id: 'vocab-user-1',
    betterAlternative: 'calibrated',
  };

  const { cleaned, changed, removedSessionIds, removedSlotIds, removedVocabIds } =
    stripPredefinedSeedData({
      ...seed,
      sessions: [...seed.sessions, userSession],
      calendarSlots: [
        userSlotCompletedBySeed,
        ...seed.calendarSlots.slice(1),
        userCustomSlot,
      ],
      vocabulary: [...seed.vocabulary, userVocab],
    });

  assert.equal(changed, true);
  assert.equal(removedSessionIds.length, 4);
  assert.equal(removedSlotIds.length, 5);
  assert.equal(removedVocabIds.length, 9);
  assert.deepEqual(cleaned.sessions.map((s) => s.id), ['SESSION_USER_CUSTOM_1']);
  assert.deepEqual(
    cleaned.calendarSlots.map((s) => s.id),
    [seed.calendarSlots[0].id, 'tri-ai-custom-1']
  );
  assert.deepEqual(cleaned.vocabulary.map((v) => v.id), ['vocab-user-1']);
  assert.equal(cleaned.settings.autoReloadSchedule, false);
});

test('buildFluencyHeatmapData aggregates the 6 international metrics across the past 3 months and tracks deltas', () => {
  const empty = buildFluencyHeatmapData([], '2026-11-19');
  assert.equal(empty.windowStartISO, '2026-08-19');
  assert.equal(empty.windowEndISO, '2026-11-19');
  assert.equal(empty.metrics.length, 6);
  assert.equal(INTERNATIONAL_HEATMAP_METRICS.length, 6);
  assert.ok(empty.weeks.length >= 13 && empty.weeks.length <= 15);
  assert.equal(empty.activeWeeksCount, 0);
  assert.equal(empty.totalSessionsInWindow, 0);
  assert.ok(empty.cells.every((c) => c.value === null));

  const seed = createSeedVaultPayload('2026-11-18');
  const olderOutside3Months = {
    ...seed.sessions[0],
    id: 'SESSION_OLD',
    date: '2026-08-10',
  };
  const sepSession = {
    ...seed.sessions[0],
    id: 'SESSION_SEP',
    date: '2026-09-09',
    scores: {
      naturalVoiceFlow: 6,
      claritySimplicity: 6,
      grammarMechanics: 6,
      toneEngagement: 6,
      sentenceVarietyCadence: 6,
      concisenessDirectness: 6,
    },
    totalScore: 36,
    percentage: 60.0,
    internationalMetrics: undefined,
  };
  const novSession1 = {
    ...seed.sessions[1],
    id: 'SESSION_NOV_1',
    date: '2026-11-16',
    scores: {
      naturalVoiceFlow: 9,
      claritySimplicity: 9,
      grammarMechanics: 8,
      toneEngagement: 9,
      sentenceVarietyCadence: 8,
      concisenessDirectness: 9,
    },
    totalScore: 52,
    percentage: 86.7,
    internationalMetrics: undefined,
  };
  const novSession2 = {
    ...seed.sessions[2],
    id: 'SESSION_NOV_2',
    date: '2026-11-18',
    scores: {
      naturalVoiceFlow: 9,
      claritySimplicity: 9,
      grammarMechanics: 10,
      toneEngagement: 9,
      sentenceVarietyCadence: 10,
      concisenessDirectness: 9,
    },
    totalScore: 56,
    percentage: 93.3,
    internationalMetrics: undefined,
  };

  const heatmap = buildFluencyHeatmapData(
    [olderOutside3Months, sepSession, novSession1, novSession2],
    '2026-11-19'
  );

  // Excluded olderOutside3Months (2026-08-10 < 2026-08-19)
  assert.equal(heatmap.totalSessionsInWindow, 3);
  // Sep week (1 session) + Nov week (2 sessions) = 2 active weeks
  assert.equal(heatmap.activeWeeksCount, 2);

  const grammarSummary = heatmap.metricSummaries.find(
    (m) => m.key === 'grammarAccuracy'
  );
  // Sep grammar=6.0, Nov grammar=avg(8,10)=9.0 -> delta = +3.0
  assert.equal(grammarSummary?.latestValue, 9);
  assert.equal(grammarSummary?.delta, 3);

  const ieltsSummary = heatmap.metricSummaries.find(
    (m) => m.key === 'ieltsCalibration'
  );
  assert.ok((ieltsSummary?.delta ?? 0) > 0);
});

test('personalized rolling 1-month schedule builds Wed/Fri/Sun tasks that survive seed stripping', async () => {
  const {
    buildPersonalizedMonthSchedule,
    getRollingMonthTriWeeklyDates,
    getVisibleWritePageTasks,
    formatStudentProfileLabel,
  } = await import('./analytics');
  const { evaluateDayNotifications } = await import('./notifications');

  const dates = getRollingMonthTriWeeklyDates('2026-11-18', 30);
  // 30 days starting on Wednesday 2026-11-18 contains ~12-13 Wed/Fri/Sun slots
  assert.ok(dates.length >= 12 && dates.length <= 14);
  assert.equal(dates[0].scheduledDate, '2026-11-18');
  assert.equal(dates[0].dayOfWeek, 'Wednesday');
  assert.equal(dates[1].scheduledDate, '2026-11-20');
  assert.equal(dates[1].dayOfWeek, 'Friday');
  assert.equal(dates[2].scheduledDate, '2026-11-22');
  assert.equal(dates[2].dayOfWeek, 'Sunday');

  const csProfile = {
    collegeDegree: 'B.Tech Computer Science',
    semester: '5th Semester',
    collegeName: 'NIT Trichy',
    age: 20,
    onboardingCompleted: true,
  };
  assert.equal(
    formatStudentProfileLabel(csProfile),
    '5th Semester · B.Tech Computer Science'
  );

  const scheduled = buildPersonalizedMonthSchedule(
    '2026-11-18',
    csProfile,
    [],
    undefined,
    30
  );
  assert.equal(scheduled.length, dates.length);
  assert.ok(scheduled.every((s) => s.id.startsWith('plan-')));
  assert.ok(scheduled.every((s) => s.slotTime === '18:19'));
  assert.ok(scheduled.every((s) => !s.topic.includes('6:19')));
  assert.ok(
    scheduled.some(
      (s) =>
        s.pillar === 'technical-concept' &&
        (s.topic.includes('B.Tech Computer Science') ||
          (s.topicPrimer ?? '').includes('B.Tech Computer Science'))
    )
  );

  // Confirm automated plan-* tasks are preserved by stripPredefinedSeedData
  const empty = createEmptyVaultPayload();
  const { cleaned } = stripPredefinedSeedData({
    ...empty,
    calendarSlots: scheduled,
  });
  assert.equal(cleaned.calendarSlots.length, scheduled.length);

  // Confirm Write Page shows ONLY today's task + past incomplete tasks (never future tasks)
  const pastIncomplete = {
    ...scheduled[0],
    id: 'plan-2026-11-15-sun',
    scheduledDate: '2026-11-15',
    dayOfWeek: 'Sunday',
    completed: false,
  };
  const pastCompleted = {
    ...scheduled[0],
    id: 'plan-2026-11-13-fri',
    scheduledDate: '2026-11-13',
    dayOfWeek: 'Friday',
    completed: true,
  };
  const visible = getVisibleWritePageTasks(
    [pastCompleted, pastIncomplete, ...scheduled],
    '2026-11-18'
  );
  assert.equal(visible.pastIncompleteTasks.length, 1);
  assert.equal(visible.pastIncompleteTasks[0].id, 'plan-2026-11-15-sun');
  assert.equal(visible.todayTasks.length, 1);
  assert.equal(visible.todayTasks[0].scheduledDate, '2026-11-18');
  const combinedVisible = [...visible.pastIncompleteTasks, ...visible.todayTasks];
  assert.equal(combinedVisible.length, 2);
  assert.ok(combinedVisible.every((s) => s.scheduledDate <= '2026-11-18'));
  assert.equal(visible.nextUpcomingTask?.scheduledDate, '2026-11-20');

  // Confirm day-of notifications calculate silent 18:19 delay and never expose "6:19"
  const morningNow = new Date(2026, 10, 18, 10, 19, 0, 0); // 10:19 AM -> 8 hours before 18:19
  const notif = evaluateDayNotifications(
    [pastIncomplete, ...scheduled],
    '2026-11-18',
    morningNow
  );
  assert.equal(notif.dueTodayPending.length, 1);
  assert.equal(notif.overduePending.length, 1);
  assert.equal(notif.totalActionable, 2);
  assert.equal(notif.msUntilScheduledTrigger, 8 * 60 * 60 * 1000);
  assert.ok(!notif.headline.includes('6:19'));
  assert.ok(!notif.body.includes('6:19'));
});



