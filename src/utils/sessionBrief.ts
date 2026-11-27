import type {
  CalendarSlot,
  ErrorTag,
  GrammarFix,
  SessionTargetCheck,
  StudentProfile,
  TargetCheckStatus,
  ToneSetting,
  VocabEntry,
  WritingMode,
  WritingSession,
} from '../types';
import { CURRICULUM_52_WEEKS } from '../data/curriculum52Weeks';
import { MODE_LABELS, TONE_LABELS } from './analytics';
import { buildVocabCandidateRegex, extractVocabCandidates } from './vocabMastery';

export interface SessionBriefVocabTarget {
  id: string;
  phrase: string;
  replaces?: string;
  hint: string;
  fromBank: boolean;
}

export interface SessionBrief {
  slotId?: string;
  slotContext: string;
  promptCode: string;
  title: string;
  mode: WritingMode;
  modeLabel: string;
  tone: ToneSetting;
  toneLabel: string;
  taskPrompt: string;
  topicPrimer: string;
  pivotRule: string;
  mechanicsCheck: string;
  vocabTargets: SessionBriefVocabTarget[];
  vocabWeaveCue: string;
  isFallback: boolean;
}

const ERROR_TAG_RULES: Record<ErrorTag, string> = {
  'subject-verb': 'match singular/plural verbs cleanly (`was` vs. `were`, `is` vs. `are`)',
  'tense-shift': 'hold one consistent verb tense from start to finish',
  'article-preposition': 'check `a/an/the` and exact prepositions (`in`, `on`, `to`, `for`)',
  'run-on-sentence': 'break 25+ word chains into two crisp sentences',
  'word-choice': 'pick concrete, exact verbs instead of vague stand-ins',
  'regional-calque': 'replace literal translations (`revert back`, `discuss about`, `cope up`) with natural phrasing',
  'hedging-passive': 'cut hedges (`basically`, `actually`, `kind of`) and prefer active verbs',
  'tone-mismatch': 'keep register aligned to your reader without drifting stiff or overly casual',
  'repetition-filler': 'trim repeated sentence starters and filler padding',
  'punctuation-spacing': 'capitalize `I` and proper nouns, and keep compound words/punctuation clean',
};

const MODE_DEFAULT_PRIMERS: Record<WritingMode, string> = {
  technical:
    'Start with the core mechanism or constraint in line one, trace cause-and-effect cleanly, and close with the practical trade-off or measured impact.',
  linkedin:
    'Open with one concrete observation from real work, explain why it matters in plain English, and close with a crisp takeaway rather than corporate fluff.',
  email:
    'Lead with the operational risk or decision needed, explain the real-time value in 2–3 tight lines, and close with a low-friction next step.',
  creative:
    'Anchor the reader in one physical scene or sensory beat first, let pacing breathe between short and long lines, and land on an earned reflection.',
  journal:
    'Skip throat-clearing: name the real friction or insight in the opening sentence, unpack what actually happened, and note one thing you will do differently.',
  friend:
    'Write like you speak across a table: keep rhythm natural, skip textbook transitions, and highlight the one moment that actually stuck with you.',
};

const FALLBACK_VOCAB_BY_MODE: Record<
  WritingMode,
  Array<{ phrase: string; replaces: string; hint: string }>
> = {
  technical: [
    {
      phrase: 'pinpoint',
      replaces: 'find out',
      hint: 'Use when isolating a root fault or signal bottleneck.',
    },
    {
      phrase: 'compensate for',
      replaces: 'fix the problem of',
      hint: 'Use when explaining how a control loop or filter offsets drift.',
    },
    {
      phrase: 'critical bottleneck',
      replaces: 'very big problem',
      hint: 'Use to name the single stage limiting throughput or response time.',
    },
  ],
  email: [
    {
      phrase: 'operates blind to',
      replaces: 'cannot see',
      hint: 'Use to frame an operational visibility gap before pitching your fix.',
    },
    {
      phrase: 'critical bottleneck',
      replaces: 'major issue',
      hint: 'Use when naming the exact delay or failure point costing time.',
    },
    {
      phrase: 'walk you through',
      replaces: 'tell you about',
      hint: 'Use for a low-friction closing ask (e.g., a 10-minute demo).',
    },
  ],
  linkedin: [
    {
      phrase: 'trade-off',
      replaces: 'good and bad side',
      hint: 'Use when comparing two engineering or workflow approaches honestly.',
    },
    {
      phrase: 'stripped away',
      replaces: 'got rid of',
      hint: 'Use when describing what improved after simplifying a noisy process.',
    },
    {
      phrase: 'held up under',
      replaces: 'worked well during',
      hint: 'Use to show how a design behaved under real constraints.',
    },
  ],
  creative: [
    {
      phrase: 'lingered',
      replaces: 'stayed for a long time',
      hint: 'Use to slow a sensory beat without adding adverbs.',
    },
    {
      phrase: 'unravel',
      replaces: 'fall apart slowly',
      hint: 'Use when a quiet assumption starts breaking down.',
    },
    {
      phrase: 'cut through',
      replaces: 'stopped',
      hint: 'Use for a sudden sound, light, or realization breaking silence.',
    },
  ],
  journal: [
    {
      phrase: 'friction point',
      replaces: 'annoying problem',
      hint: 'Use to name what repeatedly slows down your focus or routine.',
    },
    {
      phrase: 'reset my pace',
      replaces: 'slowed down and started again',
      hint: 'Use when describing a deliberate recovery from rush or fatigue.',
    },
    {
      phrase: 'paid off',
      replaces: 'gave a good result',
      hint: 'Use when tying a small habit directly to its outcome.',
    },
  ],
  friend: [
    {
      phrase: 'caught me off guard',
      replaces: 'surprised me a lot',
      hint: 'Use naturally when something unexpected shifted your mood.',
    },
    {
      phrase: 'worth the detour',
      replaces: 'a good side trip',
      hint: 'Use when a small unplanned turn ended up being the highlight.',
    },
    {
      phrase: 'clicked right away',
      replaces: 'made sense very fast',
      hint: 'Use when an idea or conversation landed effortlessly.',
    },
  ],
};

function cleanSentence(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getWeekdayName(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return 'Today';
  }
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString('en-US', { weekday: 'long' });
}

function normalizeTagFromText(text: string): ErrorTag | null {
  const lower = text.toLowerCase();
  if (/capitaliz|spacing|comma|period|punctuation|meanwhile|one word/.test(lower)) {
    return 'punctuation-spacing';
  }
  if (/subject.?verb|singular|plural|was.*were|agreement/.test(lower)) {
    return 'subject-verb';
  }
  if (/tense|past|present|rise.*raise|verb form/.test(lower)) {
    return 'tense-shift';
  }
  if (/article|\ba\/an\b|preposition/.test(lower)) {
    return 'article-preposition';
  }
  if (/run-?on|long sentence|comma splice|split/.test(lower)) {
    return 'run-on-sentence';
  }
  if (/calque|revert back|discuss about|cope up|prepone/.test(lower)) {
    return 'regional-calque';
  }
  if (/passive|hedge|basically|actually|filler/.test(lower)) {
    return 'hedging-passive';
  }
  if (/tone|register|stiff|casual/.test(lower)) {
    return 'tone-mismatch';
  }
  if (/repeat|opener|wordy|concise/.test(lower)) {
    return 'repetition-filler';
  }
  return null;
}

/**
 * Synthesizes 1 sharp, memorable Mechanics Check line from the writer's
 * recurring errorTags, grammarFixes, and latest nextDraftPriority across
 * their last 8 completed sessions (with a crisp starter line for new writers).
 */
export function buildMechanicsCheck(sessions: WritingSession[]): string {
  const completed = sessions
    .filter((s) => s.status !== 'Draft')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  if (completed.length === 0) {
    return 'Capitalize `I` and proper nouns, keep verb tenses consistent, and split any sentence running past 25 words.';
  }

  const tagCounts = new Map<ErrorTag, number>();
  const bump = (tag: ErrorTag, weight = 1) => {
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + weight);
  };

  for (let i = 0; i < completed.length; i += 1) {
    const sess = completed[i];
    const recencyWeight = i < 2 ? 2 : 1;

    for (const edit of sess.edits ?? []) {
      if (edit.errorTag) bump(edit.errorTag, recencyWeight);
    }
    for (const fix of sess.grammarFixes ?? []) {
      if (fix.errorTag) {
        bump(fix.errorTag, recencyWeight);
      } else {
        const inferred = normalizeTagFromText(`${fix.category} ${fix.rule}`);
        if (inferred) bump(inferred, recencyWeight);
      }
    }
    if (sess.nextDraftPriority) {
      const inferred = normalizeTagFromText(sess.nextDraftPriority);
      if (inferred) bump(inferred, recencyWeight);
    }
  }

  const ranked = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 2);

  const latestPriority = cleanSentence(
    completed[0]?.nextDraftPriority || completed[0]?.strictImprovements || ''
  );

  if (ranked.length === 2) {
    const first = ERROR_TAG_RULES[ranked[0]];
    const second = ERROR_TAG_RULES[ranked[1]];
    return `${first.charAt(0).toUpperCase()}${first.slice(1)}, and ${second}.`;
  }

  if (ranked.length === 1) {
    const first = ERROR_TAG_RULES[ranked[0]];
    if (latestPriority && latestPriority.length <= 130) {
      const cleaned = latestPriority.replace(/\.$/, '');
      return `${first.charAt(0).toUpperCase()}${first.slice(1)}; also keep in mind: ${cleaned}.`;
    }
    return `${first.charAt(0).toUpperCase()}${first.slice(1)}, and double-check punctuation before submitting.`;
  }

  if (latestPriority) {
    return latestPriority.length > 170
      ? `${latestPriority.slice(0, 167).trimEnd()}...`
      : latestPriority;
  }

  return 'Keep subject-verb agreement tight, avoid filler hedges, and end each sentence with a concrete verb.';
}

/**
 * Selects 2–3 unmastered vocabulary targets from the user's bank (mode-matched
 * first, then recent unmastered entries) and pairs them with a 1-line weaving cue
 * tailored to today's topic. Falls back cleanly to curated mode-fit phrases if
 * the user's bank has fewer than 2 unmastered entries.
 */
export function selectTargetVocab(
  vocabulary: VocabEntry[],
  mode: WritingMode,
  topic: string,
  count = 3
): { targets: SessionBriefVocabTarget[]; weaveCue: string } {
  const limit = Math.max(2, Math.min(3, count));
  const stagePriority: Record<string, number> = {
    building: 0,
    emerging: 1,
    new: 2,
  };

  const unmastered = vocabulary.filter(
    (v) =>
      !v.mastered &&
      v.masteryStage !== 'mastered' &&
      (v.betterAlternative || '').trim().length >= 3
  );

  const sorted = [...unmastered].sort((a, b) => {
    const aMode = a.mode === mode ? 0 : 1;
    const bMode = b.mode === mode ? 0 : 1;
    if (aMode !== bMode) return aMode - bMode;

    const aStage = stagePriority[a.masteryStage ?? 'new'] ?? 2;
    const bStage = stagePriority[b.masteryStage ?? 'new'] ?? 2;
    if (aStage !== bStage) return aStage - bStage;

    return b.dateAdded.localeCompare(a.dateAdded);
  });

  const targets: SessionBriefVocabTarget[] = [];
  const seen = new Set<string>();

  for (const entry of sorted) {
    const primaryCandidate =
      extractVocabCandidates(entry)[0] || entry.betterAlternative.trim();
    const displayPhrase = entry.betterAlternative
      .split(/\s*(?:\/|;)\s*/)[0]
      .replace(/\([^)]*\)/g, '')
      .trim();
    const key = primaryCandidate.toLowerCase();
    if (!displayPhrase || seen.has(key)) continue;
    seen.add(key);

    targets.push({
      id: entry.id,
      phrase: displayPhrase,
      replaces: entry.used?.trim() || undefined,
      hint:
        cleanSentence(entry.explanation || '') ||
        `Stronger alternative to "${entry.used}".`,
      fromBank: true,
    });

    if (targets.length >= limit) break;
  }

  // Fill with curated mode-fit phrases when the user's bank has fewer than 2 items
  const fallbacks = FALLBACK_VOCAB_BY_MODE[mode] ?? FALLBACK_VOCAB_BY_MODE.technical;
  for (let i = 0; targets.length < limit && i < fallbacks.length; i += 1) {
    const fb = fallbacks[i];
    const key = fb.phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      id: `brief-fb-${mode}-${i}`,
      phrase: fb.phrase,
      replaces: fb.replaces,
      hint: fb.hint,
      fromBank: false,
    });
  }

  const cleanTopic = cleanSentence(topic || '');
  const topicSnippet =
    cleanTopic.length <= 64
      ? cleanTopic
      : `${cleanTopic.slice(0, 64).replace(/\s+\S*$/, '').replace(/[,:;(\-]+$/, '')}…`;
  const phraseList = targets
    .slice(0, 2)
    .map((t) => `"${t.phrase}"`)
    .join(' or ');

  const weaveCue = topicSnippet
    ? `Try weaving ${phraseList} naturally while framing "${topicSnippet}"—only where it fits your real voice.`
    : `Try weaving ${phraseList} naturally into one key claim without forcing stiff phrasing.`;

  return { targets, weaveCue };
}

/**
 * Case-insensitive, word-boundary + inflection-aware matcher returning the
 * exact `phrase` strings from `vocabTargets` already used in `draftText`.
 */
export function detectUsedTargetVocab(
  draftText: string,
  vocabTargets: Array<string | { phrase: string }>
): string[] {
  const trimmed = (draftText || '').trim();
  if (!trimmed || vocabTargets.length === 0) return [];

  const matched: string[] = [];
  const seen = new Set<string>();

  for (const item of vocabTargets) {
    const phrase = (typeof item === 'string' ? item : item.phrase).trim();
    if (phrase.length < 2) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;

    // Support slash-separated variants if passed raw
    const variants = phrase
      .replace(/\([^)]*\)/g, ' ')
      .split(/\s*(?:\/|;)\s*/)
      .map((v) => v.trim())
      .filter((v) => v.length >= 2);

    const hit = variants.some((variant) => {
      const re = buildVocabCandidateRegex(variant, 'i');
      return re.test(trimmed);
    });

    if (hit) {
      seen.add(key);
      matched.push(phrase);
    }
  }

  return matched;
}

/**
 * Picks today's incomplete calendar slot, or the nearest upcoming incomplete
 * slot (excluding pure Converse slots), returning null if none exist.
 */
export function pickDefaultBriefSlot(
  calendarSlots: CalendarSlot[],
  todayISO: string
): CalendarSlot | null {
  const pending = calendarSlots.filter((s) => !s.completed && !s.isConverseSlot);
  if (pending.length === 0) return null;

  const todaySlot = pending.find((s) => s.scheduledDate === todayISO);
  if (todaySlot) return todaySlot;

  const upcoming = pending
    .filter((s) => s.scheduledDate > todayISO)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  if (upcoming.length > 0) return upcoming[0];

  // Fallback to most recent overdue pending slot so the desk is never blank
  const overdue = [...pending].sort((a, b) =>
    b.scheduledDate.localeCompare(a.scheduledDate)
  );
  return overdue[0] ?? null;
}

function buildDefaultPivotRule(profile?: StudentProfile): string {
  const degree = profile?.collegeDegree?.trim();
  const contextNoun = degree
    ? `any ${degree} project, lab build, or technical experience`
    : 'any course capstone, mini-project, or real workflow improvement';
  return `Not feeling this exact angle? Pivot freely to ${contextNoun} you know well while keeping the same audience and structure.`;
}

function derivePromptCode(
  slot: CalendarSlot | null,
  completedSessionCount: number,
  fallbackId?: string
): string {
  if (slot?.curriculumTopicId) {
    return slot.curriculumTopicId.toUpperCase();
  }
  if (fallbackId) {
    return fallbackId.toUpperCase();
  }
  return `S${String(completedSessionCount + 1).padStart(2, '0')}`;
}

/**
 * Builds the complete Editorial Session Brief shown above the 65ch writing canvas.
 */
export function buildSessionBrief(params: {
  activeSlot?: CalendarSlot | null;
  calendarSlots?: CalendarSlot[];
  sessions: WritingSession[];
  vocabulary: VocabEntry[];
  studentProfile?: StudentProfile;
  todayISO?: string;
  currentMode?: WritingMode;
  currentTone?: ToneSetting;
  currentTopic?: string;
}): SessionBrief {
  const todayISO = params.todayISO || new Date().toISOString().slice(0, 10);
  const completedCount = params.sessions.filter((s) => s.status !== 'Draft').length;

  const resolvedSlot =
    params.activeSlot !== undefined
      ? params.activeSlot
      : pickDefaultBriefSlot(params.calendarSlots ?? [], todayISO);

  if (resolvedSlot) {
    const mode = resolvedSlot.mode;
    const tone = resolvedSlot.tone;
    const weekday = resolvedSlot.dayOfWeek || getWeekdayName(resolvedSlot.scheduledDate);
    const slotContext = `${weekday} · ${resolvedSlot.slotLabel || MODE_LABELS[mode]}`;
    const promptCode = derivePromptCode(resolvedSlot, completedCount);
    const title = cleanSentence(resolvedSlot.topic);
    const taskPrompt =
      resolvedSlot.suggestions && resolvedSlot.suggestions.length > 0
        ? cleanSentence(resolvedSlot.suggestions[0])
        : `Write a focused ${MODE_LABELS[mode].toLowerCase()} response on "${title}" tailored for your real reader.`;
    const topicPrimer =
      cleanSentence(resolvedSlot.topicPrimer || '') || MODE_DEFAULT_PRIMERS[mode];
    const pivotRule =
      cleanSentence(resolvedSlot.pivotRule || '') ||
      buildDefaultPivotRule(params.studentProfile);
    const mechanicsCheck = buildMechanicsCheck(params.sessions);
    const { targets: vocabTargets, weaveCue: vocabWeaveCue } = selectTargetVocab(
      params.vocabulary,
      mode,
      title
    );

    return {
      slotId: resolvedSlot.id,
      slotContext,
      promptCode,
      title,
      mode,
      modeLabel: MODE_LABELS[mode],
      tone,
      toneLabel: TONE_LABELS[tone],
      taskPrompt,
      topicPrimer,
      pivotRule,
      mechanicsCheck,
      vocabTargets,
      vocabWeaveCue,
      isFallback: false,
    };
  }

  // Fallback: pick a clean unused curriculum topic matching currentMode (or day-of-year rotation)
  const usedTopics = new Set(
    params.sessions.map((s) => s.topicDescription.toLowerCase().trim())
  );
  const targetMode = params.currentMode ?? 'technical';
  const daySeed = Number(todayISO.replace(/-/g, '')) || 1;
  const modeCandidates = CURRICULUM_52_WEEKS.filter(
    (c) => c.mode === targetMode && !usedTopics.has(c.topic.toLowerCase().trim())
  );
  const pool = modeCandidates.length > 0 ? modeCandidates : CURRICULUM_52_WEEKS;
  const chosen = pool[daySeed % pool.length] ?? CURRICULUM_52_WEEKS[0];

  const mode = params.currentMode ?? chosen.mode;
  const tone = params.currentTone ?? chosen.tone;
  const title =
    params.currentTopic && params.currentTopic.trim().length > 0
      ? cleanSentence(params.currentTopic)
      : chosen.topic;
  const weekday = getWeekdayName(todayISO);
  const promptCode = derivePromptCode(null, completedCount, chosen.id);
  const mechanicsCheck = buildMechanicsCheck(params.sessions);
  const { targets: vocabTargets, weaveCue: vocabWeaveCue } = selectTargetVocab(
    params.vocabulary,
    mode,
    title
  );

  return {
    slotId: undefined,
    slotContext: `${weekday} · ${chosen.category}`,
    promptCode,
    title,
    mode,
    modeLabel: MODE_LABELS[mode],
    tone,
    toneLabel: TONE_LABELS[tone],
    taskPrompt:
      cleanSentence(chosen.topicPrimer) ||
      `Write a sharp ${MODE_LABELS[mode].toLowerCase()} piece on "${title}" aimed at a real reader.`,
    topicPrimer: MODE_DEFAULT_PRIMERS[mode],
    pivotRule:
      cleanSentence(chosen.pivotRule || '') ||
      buildDefaultPivotRule(params.studentProfile),
    mechanicsCheck,
    vocabTargets,
    vocabWeaveCue,
    isFallback: true,
  };
}

/**
 * Deterministic target check verification used both by offline fastEvaluate and
 * as the grounding verifier on the server so vocabulary usage is never hallucinated.
 */
export function evaluateTargetCheckOffline(params: {
  content: string;
  activeMechanicsCheck?: string;
  practicingVocab?: string[];
  grammarFixes?: GrammarFix[];
  grammarScore?: number;
}): SessionTargetCheck {
  const practicing = (params.practicingVocab ?? [])
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  const vocabUsed = detectUsedTargetVocab(params.content, practicing);
  const usedSet = new Set(vocabUsed.map((v) => v.toLowerCase()));
  const vocabMissed = practicing.filter((p) => !usedSet.has(p.toLowerCase()));

  const mechanicsText = (params.activeMechanicsCheck || '').trim();
  if (!mechanicsText) {
    return {
      mechanicsStatus: 'Baseline',
      mechanicsNote:
        'Baseline mechanics recorded — future sessions will track your specific focus habits.',
      vocabUsed,
      vocabMissed,
    };
  }

  const fixes = params.grammarFixes ?? [];
  const grammarScore = params.grammarScore ?? 7;

  let mechanicsStatus: TargetCheckStatus = 'Cleared';
  let mechanicsNote =
    'Held your mechanics focus cleanly across this draft with zero major slips.';

  if (fixes.length >= 3 || grammarScore <= 5) {
    mechanicsStatus = 'Missed';
    mechanicsNote = fixes[0]
      ? `${fixes.length} mechanics slips surfaced (starting with "${fixes[0].original}" -> "${fixes[0].corrected}").`
      : 'Several mechanics and sentence-boundary slips still need a careful final pass.';
  } else if (fixes.length >= 1 || grammarScore === 6) {
    mechanicsStatus = 'Partial';
    mechanicsNote = fixes[0]
      ? `Mostly clean, with ${fixes.length} minor slip${fixes.length === 1 ? '' : 's'} to tighten ("${fixes[0].original}").`
      : 'Mostly on target; tighten one or two phrasing edges on the next pass.';
  }

  return {
    mechanicsStatus,
    mechanicsNote,
    vocabUsed,
    vocabMissed,
  };
}
