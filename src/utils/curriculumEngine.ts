import type {
  CalendarSlot,
  DrillType,
  StudentProfile,
  TriWeeklyPillar,
  WritingSession,
} from '../types';
import {
  CURRICULUM_52_WEEKS,
  type CurriculumTopic,
} from '../data/curriculum52Weeks';
import type { CoachPerformanceContext } from './analytics';
import type { PreferredDateSpec } from './adaptivePromptProfile';

const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const PILLAR_ROTATION: readonly TriWeeklyPillar[] = [
  'technical-concept',
  'linkedin-email',
  'creative-story',
];

export function normalizeTopicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Collects every normalized topic title and curriculum topic ID that has already
 * been scheduled, written, or drawn so topics never repeat.
 */
export function collectUsedTopicInventory(params: {
  slots?: CalendarSlot[];
  sessions?: WritingSession[];
  usedCurriculumIds?: string[];
  extraTopics?: string[];
}): {
  usedIds: Set<string>;
  usedTopicKeys: Set<string>;
} {
  const usedIds = new Set<string>(params.usedCurriculumIds ?? []);
  const usedTopicKeys = new Set<string>();

  for (const slot of params.slots ?? []) {
    if (slot.curriculumTopicId) usedIds.add(slot.curriculumTopicId);
    const key = normalizeTopicKey(slot.topic || '');
    if (key) usedTopicKeys.add(key);
  }

  for (const session of params.sessions ?? []) {
    const key = normalizeTopicKey(session.topicDescription || '');
    if (key) usedTopicKeys.add(key);
  }

  for (const raw of params.extraTopics ?? []) {
    const key = normalizeTopicKey(raw || '');
    if (key) usedTopicKeys.add(key);
  }

  // Also cross-link any curriculum topic whose title already appears in usedTopicKeys
  for (const item of CURRICULUM_52_WEEKS) {
    if (usedTopicKeys.has(normalizeTopicKey(item.topic))) {
      usedIds.add(item.id);
    }
  }

  return { usedIds, usedTopicKeys };
}

function resolvePillarForDate(
  dow: number,
  daySet: Set<number>,
  sequenceIndex: number
): TriWeeklyPillar {
  const isClassicWedFriSun =
    daySet.size === 3 && daySet.has(3) && daySet.has(5) && daySet.has(0);

  if (isClassicWedFriSun) {
    if (dow === 3) return 'technical-concept';
    if (dow === 5) return 'linkedin-email';
    return 'creative-story';
  }

  // Dynamically cycles across all 3 pillars for ANY user-chosen weekday cadence
  // (1 day/wk, 2 days/wk, 4 days/wk, 5 days/wk, or all 7 days/wk)
  return PILLAR_ROTATION[sequenceIndex % PILLAR_ROTATION.length];
}

/**
 * Generates date specifications for a given calendar month matching the user's
 * chosen weekdays (0=Sun..6=Sat), STRICTLY skipping all past dates (`scheduledDate >= todayISO`).
 */
export function getRemainingMonthPreferredSpecs(
  year: number,
  monthIndex0: number,
  todayISO: string,
  preferredDays?: number[]
): PreferredDateSpec[] {
  const validDays = Array.from(
    new Set(
      (preferredDays && preferredDays.length > 0 ? preferredDays : [3, 5, 0]).filter(
        (d) => Number.isInteger(d) && d >= 0 && d <= 6
      )
    )
  );
  const daySet = new Set(validDays);
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();

  const specs: PreferredDateSpec[] = [];
  let seqIdx = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const scheduledDate = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(
      day
    ).padStart(2, '0')}`;

    // Never schedule any date strictly before todayISO
    if (scheduledDate < todayISO) continue;

    const dt = new Date(year, monthIndex0, day);
    const dow = dt.getDay();
    if (!daySet.has(dow)) continue;

    specs.push({
      scheduledDate,
      dayOfWeek: FULL_WEEKDAYS[dow] ?? 'Wednesday',
      pillar: resolvePillarForDate(dow, daySet, seqIdx),
    });
    seqIdx += 1;
  }

  return specs;
}

/**
 * Picks the next unused topic from the 52-week curriculum catalog matching the
 * requested pillar (if available), falling back to any unused topic across the
 * 156-topic catalog so zero repetition occurs across the full year.
 */
export function pickNextUnusedCurriculumTopic(params: {
  usedIds: Set<string>;
  usedTopicKeys: Set<string>;
  pillar?: TriWeeklyPillar;
  randomize?: boolean;
  rng?: () => number;
}): CurriculumTopic | null {
  const { usedIds, usedTopicKeys, pillar, randomize = false, rng = Math.random } =
    params;

  const isUnused = (item: CurriculumTopic) =>
    !usedIds.has(item.id) && !usedTopicKeys.has(normalizeTopicKey(item.topic));

  let candidates = pillar
    ? CURRICULUM_52_WEEKS.filter((t) => t.pillar === pillar && isUnused(t))
    : CURRICULUM_52_WEEKS.filter(isUnused);

  if (candidates.length === 0 && pillar) {
    candidates = CURRICULUM_52_WEEKS.filter(isUnused);
  }

  if (candidates.length === 0) {
    return null;
  }

  if (randomize) {
    const idx = Math.floor(rng() * candidates.length);
    return candidates[idx] ?? candidates[0];
  }

  return candidates[0];
}

export function inferRecommendedDrillForSlot(
  dayOfWeek: string,
  pillar?: TriWeeklyPillar
): {
  recommendedDrill: DrillType;
  isConverseSlot: boolean;
  drillShortLabel: string;
} {
  const day = dayOfWeek.toLowerCase();
  if (day.startsWith('mon')) {
    return {
      recommendedDrill: 'skeleton',
      isConverseSlot: false,
      drillShortLabel: '10m · Skeleton',
    };
  }
  if (day.startsWith('wed')) {
    return {
      recommendedDrill: 'compression-432',
      isConverseSlot: false,
      drillShortLabel: '10m · 4/3/2 Sprint',
    };
  }
  if (day.startsWith('fri')) {
    return {
      recommendedDrill: 'three-rooms',
      isConverseSlot: false,
      drillShortLabel: '10m · 3 Rooms',
    };
  }
  if (day.startsWith('sat')) {
    return {
      recommendedDrill: 'standard',
      isConverseSlot: true,
      drillShortLabel: '10m · Converse Flex',
    };
  }
  if (day.startsWith('sun')) {
    return {
      recommendedDrill: 'standard',
      isConverseSlot: false,
      drillShortLabel: '10m · Story + Flow',
    };
  }
  if (pillar === 'technical-concept') {
    return {
      recommendedDrill: 'compression-432',
      isConverseSlot: false,
      drillShortLabel: '10m · 4/3/2 Sprint',
    };
  }
  if (pillar === 'linkedin-email') {
    return {
      recommendedDrill: 'three-rooms',
      isConverseSlot: false,
      drillShortLabel: '10m · 3 Rooms',
    };
  }
  return {
    recommendedDrill: 'skeleton',
    isConverseSlot: false,
    drillShortLabel: '10m · Skeleton',
  };
}

export function curriculumTopicToCalendarSlot(params: {
  topic: CurriculumTopic;
  scheduledDate: string;
  dayOfWeek: string;
  reminderTime?: string;
  targetWordGoal?: number;
  coachContext?: CoachPerformanceContext;
  source?: CalendarSlot['source'];
}): CalendarSlot {
  const {
    topic,
    scheduledDate,
    dayOfWeek,
    reminderTime = '18:19',
    targetWordGoal,
    coachContext,
    source = 'curriculum-52w',
  } = params;

  const suffix = dayOfWeek.slice(0, 3).toLowerCase();
  const cleanLabel = topic.category;
  const drillSpec = inferRecommendedDrillForSlot(dayOfWeek, topic.pillar);

  return {
    id: `plan-${scheduledDate}-${suffix}`,
    dayOfWeek,
    slotLabel: cleanLabel,
    slotTime: reminderTime,
    scheduledDate,
    mode: topic.mode,
    tone: topic.tone,
    promptCategory: topic.category,
    topic: topic.topic,
    topicPrimer: topic.topicPrimer,
    pivotRule: topic.pivotRule,
    feedbackReminder:
      coachContext?.activeReminder ||
      `Register: ${topic.register}. Focus on clear, natural spoken flow.`,
    targetWords: targetWordGoal || topic.targetWords,
    completed: false,
    isTriWeekly: true,
    pillar: topic.pillar,
    suggestions: [...topic.suggestions],
    curriculumTopicId: topic.id,
    source,
    recommendedDrill: drillSpec.recommendedDrill,
    isConverseSlot: drillSpec.isConverseSlot,
  };
}

/**
 * Fills remaining (today + future ONLY) preferred weekdays in a target month using
 * the 52-week curriculum database with strict zero-repetition across existing slots,
 * completed sessions, and previously used curriculum IDs.
 */
export function buildNonRepeatingMonthFromCurriculum(params: {
  year: number;
  monthIndex0: number;
  todayISO: string;
  profile?: StudentProfile;
  existingSlots: CalendarSlot[];
  sessions: WritingSession[];
  usedCurriculumIds?: string[];
  coachContext?: CoachPerformanceContext;
  randomizeOrder?: boolean;
  rng?: () => number;
}): {
  addedSlots: CalendarSlot[];
  newlyUsedCurriculumIds: string[];
  catalogExhausted: boolean;
} {
  const {
    year,
    monthIndex0,
    todayISO,
    profile,
    existingSlots,
    sessions,
    usedCurriculumIds = [],
    coachContext,
    randomizeOrder = false,
    rng = Math.random,
  } = params;

  const targetSpecs = getRemainingMonthPreferredSpecs(
    year,
    monthIndex0,
    todayISO,
    profile?.preferredDays
  );

  const occupiedDates = new Set(existingSlots.map((s) => s.scheduledDate));
  const { usedIds, usedTopicKeys } = collectUsedTopicInventory({
    slots: existingSlots,
    sessions,
    usedCurriculumIds,
  });

  const addedSlots: CalendarSlot[] = [];
  const newlyUsedCurriculumIds: string[] = [];
  let catalogExhausted = false;

  for (const spec of targetSpecs) {
    if (occupiedDates.has(spec.scheduledDate)) continue;

    const picked = pickNextUnusedCurriculumTopic({
      usedIds,
      usedTopicKeys,
      pillar: spec.pillar,
      randomize: randomizeOrder,
      rng,
    });

    if (!picked) {
      catalogExhausted = true;
      break;
    }

    usedIds.add(picked.id);
    usedTopicKeys.add(normalizeTopicKey(picked.topic));
    newlyUsedCurriculumIds.push(picked.id);

    addedSlots.push(
      curriculumTopicToCalendarSlot({
        topic: picked,
        scheduledDate: spec.scheduledDate,
        dayOfWeek: spec.dayOfWeek,
        reminderTime: profile?.reminderTime || '18:19',
        targetWordGoal: profile?.targetWordGoal,
        coachContext,
        source: 'curriculum-52w',
      })
    );
  }

  return {
    addedSlots,
    newlyUsedCurriculumIds,
    catalogExhausted,
  };
}

/**
 * Swaps a single scheduled calendar slot to the next unused 52-week curriculum topic
 * matching the slot's pillar (never repeating any already-used topic).
 */
export function swapSlotWithCurriculum(params: {
  slot: CalendarSlot;
  existingSlots: CalendarSlot[];
  sessions: WritingSession[];
  usedCurriculumIds?: string[];
  coachContext?: CoachPerformanceContext;
}): {
  updatedSlot: CalendarSlot;
  pickedCurriculumId: string | null;
} {
  const { slot, existingSlots, sessions, usedCurriculumIds = [], coachContext } =
    params;

  const { usedIds, usedTopicKeys } = collectUsedTopicInventory({
    slots: existingSlots,
    sessions,
    usedCurriculumIds,
  });

  const picked = pickNextUnusedCurriculumTopic({
    usedIds,
    usedTopicKeys,
    pillar: slot.pillar,
    randomize: true,
  });

  if (!picked) {
    return { updatedSlot: slot, pickedCurriculumId: null };
  }

  return {
    updatedSlot: {
      ...slot,
      slotLabel: picked.category,
      mode: picked.mode,
      tone: picked.tone,
      promptCategory: picked.category,
      topic: picked.topic,
      topicPrimer: picked.topicPrimer,
      pivotRule: picked.pivotRule,
      feedbackReminder:
        coachContext?.activeReminder || slot.feedbackReminder || picked.topicPrimer,
      targetWords: picked.targetWords,
      suggestions: [...picked.suggestions],
      curriculumTopicId: picked.id,
      source: 'curriculum-52w',
    },
    pickedCurriculumId: picked.id,
  };
}

/**
 * Determines whether periodic AI topic adaptation should run based on real
 * completed writing sessions & recent score trends (responsible, non-spammy AI usage).
 */
export function evaluatePeriodicAiAdaptation(params: {
  sessions: WritingSession[];
  lastPeriodicAiSessionCount?: number;
}): {
  shouldTrigger: boolean;
  completedCount: number;
  recentAveragePct: number;
  reason: string;
} {
  const completed = params.sessions
    .filter((s) => s.status === 'Completed' && s.percentage > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const completedCount = completed.length;
  const lastChecked = params.lastPeriodicAiSessionCount ?? 0;
  const newSinceLastCheck = completedCount - lastChecked;

  const recentSlice = completed.slice(0, 3);
  const recentAveragePct =
    recentSlice.length > 0
      ? Math.round(
          recentSlice.reduce((sum, s) => sum + s.percentage, 0) /
            recentSlice.length
        )
      : 0;

  if (completedCount >= 3 && newSinceLastCheck >= 3) {
    return {
      shouldTrigger: true,
      completedCount,
      recentAveragePct,
      reason:
        recentAveragePct < 74
          ? `Recent 3-session average is ${recentAveragePct}%. Ready to adapt upcoming topics around your top grammar and flow targets.`
          : `${newSinceLastCheck} new scored sessions logged. Ready to tune upcoming prompts to your latest progress.`,
    };
  }

  return {
    shouldTrigger: false,
    completedCount,
    recentAveragePct,
    reason: 'Following your 52-week roadmap steadily.',
  };
}

/**
 * Ensures the welcome AI flashcard only appears for genuinely new users
 * (both Local Offline Space & Cloud accounts) who haven't seen it yet and
 * don't already have scheduled slots or completed writing sessions.
 */
export function shouldShowNewUserWelcomeFlashcard(params: {
  welcomeFlashcardShown?: boolean;
  sessionsCount: number;
  calendarSlotsCount: number;
  onboardingCompleted?: boolean;
}): boolean {
  if (params.welcomeFlashcardShown) return false;
  if (params.onboardingCompleted === false) return false;
  if (params.sessionsCount > 0 || params.calendarSlotsCount > 0) return false;
  return true;
}

/**
 * Determines whether the app should automatically roll over upcoming writing
 * slots from the 52-week curriculum (or AI once exhausted) when `autoReloadSchedule`
 * is active. Never fires for brand-new users before the Welcome Flashcard has been
 * shown, never schedules past dates, and rolls into the next month once all
 * remaining sessions in the current month are completed.
 */
export function shouldAutoRollMonthSchedule(params: {
  autoReloadSchedule: boolean;
  welcomeFlashcardShown?: boolean;
  sessions: WritingSession[];
  calendarSlots: CalendarSlot[];
  todayISO: string;
  preferredDays?: number[];
}):
  | { shouldRoll: false }
  | { shouldRoll: true; year: number; monthIndex0: number; targetKey: string } {
  if (!params.autoReloadSchedule) {
    return { shouldRoll: false };
  }

  const isBrandNewWaitingForFlashcard =
    !params.welcomeFlashcardShown &&
    params.sessions.length === 0 &&
    params.calendarSlots.length === 0;
  if (isBrandNewWaitingForFlashcard) {
    return { shouldRoll: false };
  }

  // If the user still has at least one uncompleted upcoming slot (today or later), wait.
  const hasUpcomingPending = params.calendarSlots.some(
    (slot) => !slot.completed && slot.scheduledDate >= params.todayISO
  );
  if (hasUpcomingPending) {
    return { shouldRoll: false };
  }

  const [ty, tm] = params.todayISO.split('-').map(Number);
  if (!ty || !tm) {
    return { shouldRoll: false };
  }
  const currentYear = ty;
  const currentMonth0 = tm - 1;
  const occupiedDates = new Set(
    params.calendarSlots.map((s) => s.scheduledDate)
  );

  // 1. Check remaining unoccupied preferred weekdays in the current month (>= todayISO)
  const currentMonthSpecs = getRemainingMonthPreferredSpecs(
    currentYear,
    currentMonth0,
    params.todayISO,
    params.preferredDays
  ).filter((spec) => !occupiedDates.has(spec.scheduledDate));

  if (currentMonthSpecs.length > 0) {
    return {
      shouldRoll: true,
      year: currentYear,
      monthIndex0: currentMonth0,
      targetKey: `${currentYear}-${String(currentMonth0 + 1).padStart(2, '0')}`,
    };
  }

  // 2. Roll cleanly into the following month once current month has no remaining slots
  const nextMonth0 = (currentMonth0 + 1) % 12;
  const nextYear = currentMonth0 === 11 ? currentYear + 1 : currentYear;
  const nextMonthSpecs = getRemainingMonthPreferredSpecs(
    nextYear,
    nextMonth0,
    params.todayISO,
    params.preferredDays
  ).filter((spec) => !occupiedDates.has(spec.scheduledDate));

  if (nextMonthSpecs.length > 0) {
    return {
      shouldRoll: true,
      year: nextYear,
      monthIndex0: nextMonth0,
      targetKey: `${nextYear}-${String(nextMonth0 + 1).padStart(2, '0')}`,
    };
  }

  return { shouldRoll: false };
}

