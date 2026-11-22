import type { ToneSetting, TriWeeklyPillar, WritingMode } from '../types';
import { CURRICULUM_52_WEEKS } from '../data/curriculum52Weeks';

export interface CuratedRandomTopic {
  id: string;
  title: string;
  hint: string;
  category: string;
  mode: WritingMode;
  tone: ToneSetting;
  targetWords: number;
}

export const CURATED_RANDOM_TOPICS: CuratedRandomTopic[] = [
  {
    id: 'rt-01',
    title: 'A small habit that quietly changed how your days feel',
    hint: 'Start with a concrete moment before and after you adopted it.',
    category: 'Reflection',
    mode: 'journal',
    tone: 'conversational',
    targetWords: 200,
  },
  {
    id: 'rt-02',
    title: 'Something you believed strongly two years ago that you now see differently',
    hint: 'Name the old belief clearly, then trace the turning point.',
    category: 'Perspective',
    mode: 'journal',
    tone: 'professional-warm',
    targetWords: 220,
  },
  {
    id: 'rt-03',
    title: 'An ordinary place that feels completely different at sunrise versus midnight',
    hint: 'Anchor the piece in two contrasting sounds, lights, or details.',
    category: 'Observation',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 220,
  },
  {
    id: 'rt-04',
    title: 'The most useful piece of advice you only understood much later',
    hint: 'Describe who said it, why you brushed it off, and when it finally clicked.',
    category: 'Essay',
    mode: 'linkedin',
    tone: 'professional-warm',
    targetWords: 200,
  },
  {
    id: 'rt-05',
    title: 'If you could redesign one everyday object from scratch, what would you fix?',
    hint: 'Pick something mundane—a kettle, backpack, alarm—and argue your redesign.',
    category: 'Design Thinking',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 220,
  },
  {
    id: 'rt-06',
    title: 'A conversation with a stranger that stayed with you longer than expected',
    hint: 'Capture a single line of dialogue and why it lingered.',
    category: 'Story',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 240,
  },
  {
    id: 'rt-07',
    title: 'What does real focus look like for you when notifications disappear?',
    hint: 'Contrast distracted busyness with one stretch of uninterrupted work.',
    category: 'Clarity',
    mode: 'journal',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-08',
    title: 'A skill you admire in other people and want to practice this year',
    hint: 'Explain what makes it subtle rather than flashy, and your first tiny step.',
    category: 'Growth',
    mode: 'linkedin',
    tone: 'professional-warm',
    targetWords: 180,
  },
  {
    id: 'rt-09',
    title: 'Write a short note to a friend explaining why a book, film, or song moved you',
    hint: 'Skip the plot summary—share the feeling it left behind.',
    category: 'Letter',
    mode: 'friend',
    tone: 'conversational',
    targetWords: 180,
  },
  {
    id: 'rt-10',
    title: 'A mistake that ended up saving you time or teaching a better method',
    hint: 'Show the exact misstep without softening it, then the cleaner approach.',
    category: 'Lessons',
    mode: 'linkedin',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-11',
    title: 'The quiet difference between being busy and making meaningful progress',
    hint: 'Use one example from your own recent week to draw the line.',
    category: 'Work & Craft',
    mode: 'journal',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-12',
    title: 'Explain a complex idea you enjoy as if you were telling a curious twelve-year-old',
    hint: 'Replace every piece of jargon with an everyday analogy.',
    category: 'Clarity Drill',
    mode: 'technical',
    tone: 'conversational',
    targetWords: 220,
  },
  {
    id: 'rt-13',
    title: 'A meal, smell, or sound that immediately pulls you back to a specific memory',
    hint: 'Open right inside the sensory moment before explaining when it happened.',
    category: 'Memory',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 220,
  },
  {
    id: 'rt-14',
    title: 'Draft a polite, confident email declining a request you do not have bandwidth for',
    hint: 'Stay warm, avoid over-apologizing, and leave the relationship intact.',
    category: 'Communication',
    mode: 'email',
    tone: 'formal-executive',
    targetWords: 150,
  },
  {
    id: 'rt-15',
    title: 'What technology has genuinely made your life calmer—and what has made it noisier?',
    hint: 'Compare one tool you would defend with one you wish you used less.',
    category: 'Modern Life',
    mode: 'journal',
    tone: 'professional-warm',
    targetWords: 220,
  },
  {
    id: 'rt-16',
    title: 'A scene where two people want the same thing for completely opposite reasons',
    hint: 'Drop straight into their exchange and let subtext do the work.',
    category: 'Fiction',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 250,
  },
  {
    id: 'rt-17',
    title: 'Three small things from this past week that deserve to be remembered',
    hint: 'Give each moment two or three crisp sentences instead of a bullet list.',
    category: 'Gratitude',
    mode: 'journal',
    tone: 'conversational',
    targetWords: 180,
  },
  {
    id: 'rt-18',
    title: 'Write a thoughtful pitch proposing an improvement to a community or team you belong to',
    hint: 'Lead with the problem, offer a low-friction trial, and end with a clear ask.',
    category: 'Persuasion',
    mode: 'email',
    tone: 'professional-warm',
    targetWords: 200,
  },
];

export interface TopicDeckState {
  remainingIds: string[];
  lastShownId: string | null;
  cycleCount: number;
}

const DECK_STORAGE_KEY = 'quilit_random_topic_deck_v1';

function shuffleIds(ids: string[], rng: () => number): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createFreshDeckState(
  lastShownId: string | null = null,
  cycleCount = 1,
  rng: () => number = Math.random
): TopicDeckState {
  const allIds = CURATED_RANDOM_TOPICS.map((t) => t.id);
  const shuffled = shuffleIds(allIds, rng);

  // Avoid immediately repeating the last item from the previous cycle at index 0
  if (lastShownId && shuffled.length > 1 && shuffled[0] === lastShownId) {
    const swapIdx = 1 + Math.floor(rng() * (shuffled.length - 1));
    [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
  }

  return {
    remainingIds: shuffled,
    lastShownId,
    cycleCount,
  };
}

/**
 * Draws the next non-repeating topic from the deck. Only starts a fresh
 * shuffled cycle after every single topic in CURATED_RANDOM_TOPICS has been drawn.
 */
export function drawNextRandomTopic(
  state: TopicDeckState | null,
  rng: () => number = Math.random
): {
  topic: CuratedRandomTopic;
  nextState: TopicDeckState;
  positionInCycle: number;
  totalInCycle: number;
  startedNewCycle: boolean;
} {
  const validIdSet = new Set(CURATED_RANDOM_TOPICS.map((t) => t.id));
  const total = CURATED_RANDOM_TOPICS.length;

  let working: TopicDeckState;
  let startedNewCycle = false;

  if (!state) {
    working = createFreshDeckState(null, 1, rng);
  } else {
    const cleanedRemaining = state.remainingIds.filter((id) => validIdSet.has(id));
    if (cleanedRemaining.length === 0) {
      working = createFreshDeckState(
        state.lastShownId,
        (state.cycleCount || 1) + 1,
        rng
      );
      startedNewCycle = true;
    } else {
      working = {
        remainingIds: cleanedRemaining,
        lastShownId: state.lastShownId,
        cycleCount: state.cycleCount || 1,
      };
    }
  }

  const [pickedId, ...restIds] = working.remainingIds;
  const topic =
    CURATED_RANDOM_TOPICS.find((t) => t.id === pickedId) ??
    CURATED_RANDOM_TOPICS[0];

  const nextState: TopicDeckState = {
    remainingIds: restIds,
    lastShownId: topic.id,
    cycleCount: working.cycleCount,
  };

  const positionInCycle = total - restIds.length;

  return {
    topic,
    nextState,
    positionInCycle,
    totalInCycle: total,
    startedNewCycle,
  };
}

export function loadPersistedDeckState(): TopicDeckState | null {
  try {
    const raw = localStorage.getItem(DECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TopicDeckState>;
    if (!Array.isArray(parsed.remainingIds)) return null;
    return {
      remainingIds: parsed.remainingIds.filter((x): x is string => typeof x === 'string'),
      lastShownId: typeof parsed.lastShownId === 'string' ? parsed.lastShownId : null,
      cycleCount: typeof parsed.cycleCount === 'number' && parsed.cycleCount >= 1 ? parsed.cycleCount : 1,
    };
  } catch {
    return null;
  }
}

export function savePersistedDeckState(state: TopicDeckState): void {
  try {
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function normalizeTitleForDeck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CurriculumRandomDraw {
  id: string;
  curriculumId: string | null;
  title: string;
  hint: string;
  category: string;
  mode: WritingMode;
  tone: ToneSetting;
  targetWords: number;
  week?: number;
  exhausted52Weeks: boolean;
}

/**
 * Draws a non-repeating random topic from the full 52-week (156-topic) curriculum
 * database, strictly excluding already-scheduled slots, completed sessions, and
 * previously drawn curriculum IDs. Falls back cleanly to CURATED_RANDOM_TOPICS only
 * if all 156 curriculum topics have been exhausted.
 */
export function drawNextCurriculumRandomTopic(params: {
  usedCurriculumIds?: string[];
  usedTopicTitles?: string[];
  lastShownId?: string | null;
  pillarHint?: TriWeeklyPillar;
  rng?: () => number;
}): CurriculumRandomDraw {
  const {
    usedCurriculumIds = [],
    usedTopicTitles = [],
    lastShownId = null,
    pillarHint,
    rng = Math.random,
  } = params;

  const usedIdSet = new Set(usedCurriculumIds);
  if (lastShownId) usedIdSet.add(lastShownId);
  const usedTitleSet = new Set(
    usedTopicTitles.map(normalizeTitleForDeck).filter(Boolean)
  );

  const isUnused = (item: (typeof CURRICULUM_52_WEEKS)[number]) =>
    !usedIdSet.has(item.id) &&
    !usedTitleSet.has(normalizeTitleForDeck(item.topic));

  let pool = pillarHint
    ? CURRICULUM_52_WEEKS.filter((item) => item.pillar === pillarHint && isUnused(item))
    : CURRICULUM_52_WEEKS.filter(isUnused);

  if (pool.length === 0 && pillarHint) {
    pool = CURRICULUM_52_WEEKS.filter(isUnused);
  }

  if (pool.length > 0) {
    const picked = pool[Math.floor(rng() * pool.length)] ?? pool[0];
    return {
      id: picked.id,
      curriculumId: picked.id,
      title: picked.topic,
      hint: `${picked.topicPrimer} ${picked.pivotRule}`,
      category: `Week ${picked.week} · ${picked.category}`,
      mode: picked.mode,
      tone: picked.tone,
      targetWords: picked.targetWords,
      week: picked.week,
      exhausted52Weeks: false,
    };
  }

  // Only reached after all 156 topics in the 52-week curriculum have been used
  const fallbackPool = CURATED_RANDOM_TOPICS.filter(
    (t) => t.id !== lastShownId && !usedTitleSet.has(normalizeTitleForDeck(t.title))
  );
  const pickedFallback =
    (fallbackPool.length > 0
      ? fallbackPool[Math.floor(rng() * fallbackPool.length)]
      : CURATED_RANDOM_TOPICS[Math.floor(rng() * CURATED_RANDOM_TOPICS.length)]) ??
    CURATED_RANDOM_TOPICS[0];

  return {
    id: pickedFallback.id,
    curriculumId: null,
    title: pickedFallback.title,
    hint: pickedFallback.hint,
    category: pickedFallback.category,
    mode: pickedFallback.mode,
    tone: pickedFallback.tone,
    targetWords: pickedFallback.targetWords,
    exhausted52Weeks: true,
  };
}

