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
    title: 'If you could redesign one everyday instrument or appliance from scratch, what would you fix?',
    hint: 'Pick something specific like a multimeter dial, kettle, or wall timer and argue your redesign.',
    category: 'Design Thinking',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 220,
  },
  {
    id: 'rt-06',
    title: 'A brief conversation with a stranger that stayed with you longer than expected',
    hint: 'Capture a single line of dialogue and why it lingered.',
    category: 'Story',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 240,
  },
  {
    id: 'rt-07',
    title: 'What does real focus look like for you when notifications disappear?',
    hint: 'Contrast fragmented attention with one stretch of deep lab or desk work.',
    category: 'Clarity',
    mode: 'journal',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-08',
    title: 'A quiet engineering habit you admire in senior peers and want to build yourself',
    hint: 'Explain what makes it effective rather than flashy, and your first weekly step.',
    category: 'Growth',
    mode: 'linkedin',
    tone: 'professional-warm',
    targetWords: 180,
  },
  {
    id: 'rt-09',
    title: 'Write a short note to a friend explaining why a book, film, or track hit differently',
    hint: 'Skip the summary and capture the exact feeling it left behind.',
    category: 'Letter',
    mode: 'friend',
    tone: 'conversational',
    targetWords: 180,
  },
  {
    id: 'rt-10',
    title: 'A debugging mistake that ended up teaching you a faster verification method',
    hint: 'Show the exact false assumption without softening it, then the cleaner sanity check.',
    category: 'Lessons',
    mode: 'linkedin',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-11',
    title: 'The quiet difference between looking busy and making measurable progress',
    hint: 'Use one concrete example from this semester to draw the line cleanly.',
    category: 'Work & Craft',
    mode: 'journal',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-12',
    title: 'Explain PID feedback control as if telling a curious twelve-year-old',
    hint: 'Replace equations with steering a bicycle or balancing room temperature.',
    category: 'Clarity Drill',
    mode: 'technical',
    tone: 'conversational',
    targetWords: 220,
  },
  {
    id: 'rt-13',
    title: 'A meal, rainstorm scent, or workshop sound that pulls you back to a vivid memory',
    hint: 'Open straight inside the sensory moment before naming the year or place.',
    category: 'Memory',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 220,
  },
  {
    id: 'rt-14',
    title: 'Draft a polite, confident email declining an extra task during exam sprint week',
    hint: 'Stay appreciative, avoid over-apologizing, and offer a clear alternate date.',
    category: 'Communication',
    mode: 'email',
    tone: 'formal-executive',
    targetWords: 150,
  },
  {
    id: 'rt-15',
    title: 'Which tool has genuinely made your study workflow calmer and which made it noisier?',
    hint: 'Compare one reliable tool you defend with one shiny distraction you cut.',
    category: 'Modern Life',
    mode: 'journal',
    tone: 'professional-warm',
    targetWords: 220,
  },
  {
    id: 'rt-16',
    title: 'A short scene where two teammates want the same demo to pass for opposite reasons',
    hint: 'Drop straight into their bench exchange and let subtext do the work.',
    category: 'Fiction',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 240,
  },
  {
    id: 'rt-17',
    title: 'Three quiet wins from this past week that deserve to be remembered',
    hint: 'Give each moment two crisp sentences instead of a rushed list.',
    category: 'Gratitude',
    mode: 'journal',
    tone: 'conversational',
    targetWords: 180,
  },
  {
    id: 'rt-18',
    title: 'Pitch a pragmatic upgrade to your department lab setup or project review format',
    hint: 'Lead with the bottleneck, propose a low-friction pilot, and end with one ask.',
    category: 'Persuasion',
    mode: 'email',
    tone: 'professional-warm',
    targetWords: 200,
  },
  {
    id: 'rt-19',
    title: 'A simple checklist you rely on before powering up a newly wired breadboard or PCB',
    hint: 'Walk through the checks in exact sequence and recall one fault it prevented.',
    category: 'Hardware Craft',
    mode: 'linkedin',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-20',
    title: 'Explain how a 4–20 mA industrial loop carries both signal and fault awareness',
    hint: 'Explain live-zero detection and noise immunity in clean spoken prose.',
    category: 'Systems Clarity',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 220,
  },
  {
    id: 'rt-21',
    title: 'Write a crisp follow-up email after a technical talk or alumni coffee chat',
    hint: 'Reference one concrete takeaway they shared and keep the close respectful.',
    category: 'Outreach',
    mode: 'email',
    tone: 'professional-warm',
    targetWords: 140,
  },
  {
    id: 'rt-22',
    title: 'A moment when slowing down for five minutes actually saved an entire hour',
    hint: 'Open right inside the rush, then show the single pause that prevented rework.',
    category: 'Pacing',
    mode: 'journal',
    tone: 'conversational',
    targetWords: 200,
  },
  {
    id: 'rt-23',
    title: 'Describe an electronics lab or late-night desk using only sounds, textures, and light',
    hint: 'Keep adjectives minimal and let sharp verbs carry the hum and solder warmth.',
    category: 'Atmosphere',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 210,
  },
  {
    id: 'rt-24',
    title: 'Why an approach that looks slower in theory often wins in real hardware reliability',
    hint: 'Name one real noise or bounce failure mode that hasty shortcuts trigger.',
    category: 'Engineering Trade-offs',
    mode: 'technical',
    tone: 'academic-technical',
    targetWords: 220,
  },
  {
    id: 'rt-25',
    title: 'Tell a friend about a small weekend detour that turned an ordinary day memorable',
    hint: 'Keep the rhythm warm and spoken, like catching up over tea.',
    category: 'Everyday Story',
    mode: 'friend',
    tone: 'conversational',
    targetWords: 180,
  },
  {
    id: 'rt-26',
    title: 'One common misconception about sensor calibration and its clearest correction',
    hint: 'Separate zero offset from gain drift in one crisp, memorable example.',
    category: 'Sharp Insight',
    mode: 'linkedin',
    tone: 'crisp-direct',
    targetWords: 190,
  },
  {
    id: 'rt-27',
    title: 'Send a concise update explaining a project milestone slip without losing trust',
    hint: 'Lead with impact, state the verified root cause, and commit to one next milestone.',
    category: 'Ownership',
    mode: 'email',
    tone: 'formal-executive',
    targetWords: 150,
  },
  {
    id: 'rt-28',
    title: 'A skill whose mastery is invisible until you watch an expert diagnose failure',
    hint: 'Contrast noisy trial-and-error with calm binary troubleshooting.',
    category: 'Observation',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 220,
  },
  {
    id: 'rt-29',
    title: 'How you isolate a bug when a circuit simulates cleanly in software but fails on bench',
    hint: 'Order your physical checks from power rails and ground loops down to signal integrity.',
    category: 'Troubleshooting',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 210,
  },
  {
    id: 'rt-30',
    title: 'An open career question you are exploring right now without forcing a premature answer',
    hint: 'Weigh core hardware depth versus broader software tooling with total honesty.',
    category: 'Reflection',
    mode: 'journal',
    tone: 'professional-warm',
    targetWords: 200,
  },
  {
    id: 'rt-31',
    title: 'Answer an interviewer asking: Walk me through the hardest technical tradeoff in your project',
    hint: 'Lead with the constraint, compare two options objectively, and state your measured outcome.',
    category: 'Mock Interview',
    mode: 'technical',
    tone: 'professional-warm',
    targetWords: 210,
  },
  {
    id: 'rt-32',
    title: 'Draft a cold internship outreach email to a core instrumentation or embedded team lead',
    hint: 'Open with one concrete project metric you built, attach context briefly, ask for 15 minutes.',
    category: 'Placement Outreach',
    mode: 'email',
    tone: 'formal-executive',
    targetWords: 145,
  },
  {
    id: 'rt-33',
    title: 'Why anti-aliasing before an ADC is non-negotiable in real field measurements',
    hint: 'Explain folded frequencies without drowning the reader in math notation.',
    category: 'Signal Conditioning',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-34',
    title: 'Turn a failed lab experiment into a sharp, honest three-paragraph LinkedIn reflection',
    hint: 'Skip humblebrags — share what broke, why it happened, and what you verified afterward.',
    category: 'Engineering Voice',
    mode: 'linkedin',
    tone: 'professional-warm',
    targetWords: 190,
  },
  {
    id: 'rt-35',
    title: 'Compare UART, SPI, and I2C to a junior preparing for their first embedded lab',
    hint: 'Anchor the comparison around wire count, speed, and why pull-up resistors matter on I2C.',
    category: 'Embedded Basics',
    mode: 'technical',
    tone: 'conversational',
    targetWords: 210,
  },
  {
    id: 'rt-36',
    title: 'Write a crisp abstract summary for a mini-project you want evaluated by an external panel',
    hint: 'Pack problem, sensing method, controller decision, and verified accuracy into tight prose.',
    category: 'IEEE Abstract',
    mode: 'technical',
    tone: 'academic-technical',
    targetWords: 170,
  },
  {
    id: 'rt-37',
    title: 'Write a note to your capstone teammate proposing how to split integration and testing cleanly',
    hint: 'Define clear interface contracts between firmware, analog front-end, and enclosure checks.',
    category: 'Team Alignment',
    mode: 'email',
    tone: 'crisp-direct',
    targetWords: 165,
  },
  {
    id: 'rt-38',
    title: 'Explain how a Wheatstone bridge turns tiny resistance shifts into clean measurable voltage',
    hint: 'Explain null-balance intuition and why 3-wire RTD compensation cancels lead resistance.',
    category: 'Instrumentation',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 200,
  },
  {
    id: 'rt-39',
    title: 'Tell a friend about surviving a marathon viva or hackathon demo night',
    hint: 'Capture the absurd little detail at 2 AM that made the whole team laugh.',
    category: 'Campus Story',
    mode: 'friend',
    tone: 'conversational',
    targetWords: 190,
  },
  {
    id: 'rt-40',
    title: 'What separates a crisp README or lab manual from documentation nobody opens twice?',
    hint: 'Point to reproducible wiring notes, expected waveforms, and failure recovery tables.',
    category: 'Documentation',
    mode: 'linkedin',
    tone: 'crisp-direct',
    targetWords: 185,
  },
  {
    id: 'rt-41',
    title: 'Summarize why decoupling capacitors sit right next to microcontroller power pins',
    hint: 'Use the analogy of a small local water tank beside a fast-switching valve.',
    category: 'Hardware Intuition',
    mode: 'technical',
    tone: 'conversational',
    targetWords: 185,
  },
  {
    id: 'rt-42',
    title: 'Answer an HR interviewer: Tell me about a time your team disagreed under a tight deadline',
    hint: 'Use Situation-Task-Action-Result cleanly with zero blame and measurable ownership.',
    category: 'Placement HR',
    mode: 'journal',
    tone: 'professional-warm',
    targetWords: 210,
  },
  {
    id: 'rt-43',
    title: 'Send a sharp thank-you and clarification note to a faculty guide after a project review',
    hint: 'List the exact three revisions they requested so they know you captured them accurately.',
    category: 'Academic Email',
    mode: 'email',
    tone: 'formal-executive',
    targetWords: 140,
  },
  {
    id: 'rt-44',
    title: 'Describe the quiet satisfaction of watching a clean trace lock steady on an oscilloscope',
    hint: 'Focus on physical details: BNC click, trigger threshold, noisy jitter snapping crisp.',
    category: 'Bench Moment',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 210,
  },
  {
    id: 'rt-45',
    title: 'Compare accuracy, precision, and resolution with one tangible everyday example',
    hint: 'Go beyond clichés by walking through a weighing scale or digital thermometer reading.',
    category: 'Metrology',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 190,
  },
  {
    id: 'rt-46',
    title: 'Write a short LinkedIn post sharing one unexpected lesson from reading datasheets closely',
    hint: 'Pick a real hidden detail like ADC settling time, common-mode range, or thermal derating.',
    category: 'Datasheet Craft',
    mode: 'linkedin',
    tone: 'professional-warm',
    targetWords: 180,
  },
  {
    id: 'rt-47',
    title: 'Reflect on a technical concept that intimidated you in third semester that feels natural now',
    hint: 'Name what finally made Laplace transforms, op-amps, or interrupts click.',
    category: 'Progress Check',
    mode: 'journal',
    tone: 'conversational',
    targetWords: 200,
  },
  {
    id: 'rt-48',
    title: 'Explain switch-bounce and why a clean hardware or firmware debounce saves state machines',
    hint: 'Contrast microscopic mechanical contact chatter with what an interrupt pin actually sees.',
    category: 'Embedded Signal',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 195,
  },
  {
    id: 'rt-49',
    title: 'Write a message to a classmate simplifying how PWM controls average power cleanly',
    hint: 'Focus on duty cycle, switching speed vs load inertia, and why heat stays low.',
    category: 'Peer Explain',
    mode: 'friend',
    tone: 'conversational',
    targetWords: 175,
  },
  {
    id: 'rt-50',
    title: 'Draft a crisp cold message requesting an informational call with a Core EIE engineer',
    hint: 'Keep it under 120 words, show genuine research on their work, and avoid sounding generic.',
    category: 'Networking',
    mode: 'email',
    tone: 'professional-warm',
    targetWords: 130,
  },
  {
    id: 'rt-51',
    title: 'Why grounding schemes (star vs daisy-chain) decide whether low-level measurements survive',
    hint: 'Show how shared return current injects false millivolts straight into a sensor reading.',
    category: 'Signal Integrity',
    mode: 'technical',
    tone: 'academic-technical',
    targetWords: 215,
  },
  {
    id: 'rt-52',
    title: 'Write a candid diary entry at the halfway point of sixth semester about what matters most next',
    hint: 'Separate urgent deadlines from the two deeper skills you refuse to neglect.',
    category: 'Semester Checkpoint',
    mode: 'journal',
    tone: 'conversational',
    targetWords: 210,
  },
  {
    id: 'rt-53',
    title: 'Explain thermocouples versus RTDs as if choosing a sensor for a live industrial oven',
    hint: 'Weigh temperature span, cold-junction compensation, response speed, and linearity.',
    category: 'Process Sensing',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 215,
  },
  {
    id: 'rt-54',
    title: 'Write a short scene set in an empty train station or bus bay just before dawn',
    hint: 'Let small movements — tea steam, ticket rustle, headlight sweep — carry the tension.',
    category: 'Fiction Sketch',
    mode: 'creative',
    tone: 'narrative-vivid',
    targetWords: 230,
  },
  {
    id: 'rt-55',
    title: 'Share one practical way you test whether you truly understand a topic versus memorizing it',
    hint: 'Contrast reciting textbook lines with explaining it without notes to a skeptical friend.',
    category: 'Learning Craft',
    mode: 'linkedin',
    tone: 'crisp-direct',
    targetWords: 185,
  },
  {
    id: 'rt-56',
    title: 'Draft an apology and recovery plan email to a mentor after missing a scheduled check-in',
    hint: 'Own it in the first sentence, skip dramatic excuses, and offer concrete progress attached.',
    category: 'Accountability',
    mode: 'email',
    tone: 'formal-executive',
    targetWords: 140,
  },
  {
    id: 'rt-57',
    title: 'Explain open-loop versus closed-loop stepper or DC motor control in plain spoken English',
    hint: 'Explain what encoder feedback buys you the instant a mechanical load spikes unexpectedly.',
    category: 'Control Systems',
    mode: 'technical',
    tone: 'crisp-direct',
    targetWords: 205,
  },
  {
    id: 'rt-58',
    title: 'Tell a friend why taking handwritten field notes changed how you debug hardware',
    hint: 'Describe flipping back to one scribbled voltage reading that cracked a week-old mystery.',
    category: 'Analog Habits',
    mode: 'friend',
    tone: 'conversational',
    targetWords: 180,
  },
  {
    id: 'rt-59',
    title: 'Articulate your 60-second introduction for an upcoming core placement panel',
    hint: 'Bridge your degree focus, one flagship build with real numbers, and the problem space you want.',
    category: 'Interview Intro',
    mode: 'technical',
    tone: 'professional-warm',
    targetWords: 155,
  },
  {
    id: 'rt-60',
    title: 'Describe a small everyday routine you protect because it keeps your thinking sharp',
    hint: 'Show why protecting quiet mornings or evening walks pays off in clearer sentences.',
    category: 'Clarity Habit',
    mode: 'journal',
    tone: 'professional-warm',
    targetWords: 195,
  },
];

export interface TopicDeckState {
  remainingIds: string[];
  lastShownId: string | null;
  cycleCount: number;
}

export interface RefinedTopicsCache {
  updatedAtISO: string;
  drawsSinceRefresh: number;
  topics: CuratedRandomTopic[];
}

const DECK_STORAGE_KEY = 'quilit_random_topic_deck_v1';
const REFINED_TOPICS_KEY = 'quillit_refined_topics_cache_v1';

export function loadRefinedTopicsCache(): RefinedTopicsCache {
  try {
    const raw = localStorage.getItem(REFINED_TOPICS_KEY);
    if (!raw) {
      return { updatedAtISO: '', drawsSinceRefresh: 0, topics: [] };
    }
    const parsed = JSON.parse(raw) as Partial<RefinedTopicsCache>;
    return {
      updatedAtISO: typeof parsed.updatedAtISO === 'string' ? parsed.updatedAtISO : '',
      drawsSinceRefresh:
        typeof parsed.drawsSinceRefresh === 'number' ? parsed.drawsSinceRefresh : 0,
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    };
  } catch {
    return { updatedAtISO: '', drawsSinceRefresh: 0, topics: [] };
  }
}

export function saveRefinedTopicsCache(cache: RefinedTopicsCache): void {
  try {
    localStorage.setItem(
      REFINED_TOPICS_KEY,
      JSON.stringify({
        updatedAtISO: cache.updatedAtISO,
        drawsSinceRefresh: cache.drawsSinceRefresh,
        topics: cache.topics.slice(-18),
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Triggers periodic background topic refinement every 5 random draws or 7 days
 * so the random topic deck stays fresh without spamming the API.
 */
export function shouldRefreshPeriodicTopics(
  cache: RefinedTopicsCache,
  todayISO: string
): boolean {
  if (cache.drawsSinceRefresh >= 5) return true;
  if (!cache.updatedAtISO) return cache.drawsSinceRefresh >= 2;
  const [y1, m1, d1] = cache.updatedAtISO.split('-').map(Number);
  const [y2, m2, d2] = todayISO.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return false;
  const diffDays = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
  return diffDays >= 7;
}

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
 * Draws a non-repeating random topic from periodic refined topics, the 52-week
 * curriculum database, or the 30-topic curated deck — strictly excluding already-used
 * titles and never displaying mechanical "Week N" prefixes.
 */
export function drawNextCurriculumRandomTopic(params: {
  usedCurriculumIds?: string[];
  usedTopicTitles?: string[];
  lastShownId?: string | null;
  pillarHint?: TriWeeklyPillar;
  refinedTopics?: CuratedRandomTopic[];
  rng?: () => number;
}): CurriculumRandomDraw {
  const {
    usedCurriculumIds = [],
    usedTopicTitles = [],
    lastShownId = null,
    pillarHint,
    refinedTopics = [],
    rng = Math.random,
  } = params;

  const usedIdSet = new Set(usedCurriculumIds);
  if (lastShownId) usedIdSet.add(lastShownId);
  const usedTitleSet = new Set(
    usedTopicTitles.map(normalizeTitleForDeck).filter(Boolean)
  );

  // Occasionally surface a fresh periodically refined topic when available
  const unusedRefined = refinedTopics.filter(
    (t) =>
      t.id !== lastShownId &&
      !usedTitleSet.has(normalizeTitleForDeck(t.title))
  );
  if (unusedRefined.length > 0 && rng() < 0.35) {
    const pickedRefined =
      unusedRefined[Math.floor(rng() * unusedRefined.length)] ?? unusedRefined[0];
    return {
      id: pickedRefined.id,
      curriculumId: null,
      title: pickedRefined.title,
      hint: pickedRefined.hint,
      category: pickedRefined.category,
      mode: pickedRefined.mode,
      tone: pickedRefined.tone,
      targetWords: pickedRefined.targetWords,
      exhausted52Weeks: false,
    };
  }

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
      category: picked.category,
      mode: picked.mode,
      tone: picked.tone,
      targetWords: picked.targetWords,
      exhausted52Weeks: false,
    };
  }

  // Fallback across the expanded 30-topic curated deck
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

