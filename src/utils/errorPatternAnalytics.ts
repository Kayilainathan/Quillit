import type {
  AudienceOption,
  CalendarSlot,
  ErrorTag,
  ToneSetting,
  UnifiedEdit,
  WritingMode,
  WritingSession,
} from '../types';
import { normalizeErrorTag } from './evaluationCalibration';
import { isConverseSession } from './converseAnalytics';
import { computeStreaks, computeTaskStreak, formatLocalDateISO } from './analytics';

export type ErrorPatternWindow = '7d' | '30d' | 'all';
export type ErrorTrend = 'Improving' | 'Recurring' | 'New';
export type SkillPillarKey =
  | 'grammar'
  | 'tone'
  | 'communication'
  | 'vocabulary'
  | 'clarity'
  | 'conciseness';

export interface ErrorPatternExample {
  original: string;
  improved: string;
  date: string;
  topic: string;
  rule: string;
  sessionId: string;
}

export interface ErrorPatternItem {
  errorTag: ErrorTag;
  label: string;
  count: number;
  recentCount: number;
  previousCount: number;
  trend: ErrorTrend;
  diagnosis: string;
  microHabit: string;
  examples: ErrorPatternExample[];
}

export interface ErrorPatternAnalyticsResult {
  window: ErrorPatternWindow;
  sessionsAnalyzed: number;
  totalIssuesTracked: number;
  topPatterns: ErrorPatternItem[];
}

export interface PracticeWeaknessPayload {
  pillarKey: SkillPillarKey;
  pillarLabel: string;
  topic: string;
  mode: WritingMode;
  tone: ToneSetting;
  audience: AudienceOption;
  feedbackReminder: string;
  targetErrorTag?: ErrorTag;
}

export interface SkillPillarPlaybook {
  key: SkillPillarKey;
  label: string;
  avgScore: number;
  delta30d: number | null;
  sparkline: number[];
  weakestRule: string;
  microHabit: string;
  practicePayload: PracticeWeaknessPayload;
}

export interface FeedbackAppliedSummary {
  yesCount: number;
  partialCount: number;
  noCount: number;
  baselineCount: number;
  evaluatedCount: number;
  appliedRatePct: number;
  trendLabel: string;
}

export interface HeroFluencyPulse {
  overallScore: number;
  overallDelta5: number | null;
  spokenReadiness: number;
  spokenDelta5: number | null;
  currentStreak: number;
  longestStreak: number;
  taskStreakCurrent: number;
  weeklyCompleted: number;
  weeklyTarget: number;
  weeklyRingPct: number;
  hasConverseThisWeek: boolean;
  latestCefr: string;
  nextCefrTarget: string;
  primaryFocusLabel: string;
  primaryFocusHint: string;
}

export const ERROR_TAG_META: Record<
  ErrorTag,
  {
    label: string;
    diagnosis: string;
    microHabit: string;
    pillar: SkillPillarKey;
    practiceTopic: string;
    practiceMode: WritingMode;
    practiceTone: ToneSetting;
    practiceAudience: AudienceOption;
  }
> = {
  'tense-shift': {
    label: 'Tense Consistency',
    diagnosis: 'Shifting between past and present tense mid-paragraph breaks reader timelines.',
    microHabit: 'Lock one anchor tense in sentence 1; audit every finite verb before submitting.',
    pillar: 'grammar',
    practiceTopic:
      'Walk through a sensor calibration bug you diagnosed and fixed from start to finish in clean past tense',
    practiceMode: 'technical',
    practiceTone: 'academic-technical',
    practiceAudience: 'Interviewer',
  },
  'article-preposition': {
    label: 'Articles & Prepositions',
    diagnosis: 'Missing determiners (a/an/the) or extra prepositions ("discuss about") add subtle friction.',
    microHabit: 'Scan singular hardware nouns for an article and drop extra prepositions after transitive verbs.',
    pillar: 'grammar',
    practiceTopic:
      'Explain how a closed-loop PID controller stabilizes a noisy temperature chamber in 120 crisp words',
    practiceMode: 'technical',
    practiceTone: 'crisp-direct',
    practiceAudience: 'Interviewer',
  },
  'subject-verb': {
    label: 'Subject–Verb Agreement',
    diagnosis: 'Long clauses between subject and verb are pulling verbs out of singular/plural sync.',
    microHabit: 'Mentally cross out prepositional phrases ("of the sensors") to match the true subject to its verb.',
    pillar: 'grammar',
    practiceTopic:
      'Summarize the three hardware constraints that shape a reliable embedded data-acquisition node',
    practiceMode: 'technical',
    practiceTone: 'academic-technical',
    practiceAudience: 'Hiring Manager',
  },
  'run-on-sentence': {
    label: 'Run-On & Long Clauses',
    diagnosis: 'Multi-clause sentences over 26 words hide your main claim when read aloud.',
    microHabit: 'Put one idea per sentence and split any clause carrying two "and/which/so" pivots.',
    pillar: 'clarity',
    practiceTopic:
      'Pitch your mini-project architecture to a recruiter in five crisp sentences under 18 words each',
    practiceMode: 'linkedin',
    practiceTone: 'conversational',
    practiceAudience: 'Interviewer',
  },
  'punctuation-spacing': {
    label: 'Punctuation & Splices',
    diagnosis: 'Comma splices and loose punctuation blur sentence boundaries and natural cadence.',
    microHabit: 'Replace clause-joining commas with a full stop, semicolon, or explicit conjunction ("because", "yet").',
    pillar: 'clarity',
    practiceTopic:
      'Reflect on one engineering assumption that failed in the lab and what the test data taught you',
    practiceMode: 'journal',
    practiceTone: 'conversational',
    practiceAudience: 'Friend',
  },
  'hedging-passive': {
    label: 'Hedging & Passive Voice',
    diagnosis: 'Hiding the actor ("was tested by us") or over-hedging makes ownership sound distant.',
    microHabit: 'Lead with the subject that acted ("We calibrated", "The ADC sampled") unless the receiver matters more.',
    pillar: 'communication',
    practiceTopic:
      'Describe your exact engineering contribution during a team lab demo using direct active verbs',
    practiceMode: 'technical',
    practiceTone: 'crisp-direct',
    practiceAudience: 'Hiring Manager',
  },
  'repetition-filler': {
    label: 'Filler & Wordiness',
    diagnosis: 'Padding phrases ("basically", "in order to", "kind of") dilute your signal-to-noise ratio.',
    microHabit: 'Cut every "basically", "actually", and "in order to" on a 30-second read-aloud trim pass.',
    pillar: 'conciseness',
    practiceTopic:
      'Deliver a 90-word executive update on a signal-filtering tradeoff with zero hedge words',
    practiceMode: 'email',
    practiceTone: 'crisp-direct',
    practiceAudience: 'Hiring Manager',
  },
  'regional-calque': {
    label: 'Non-Idiomatic Calques',
    diagnosis: 'Literal idioms ("revert back", "do the needful", "prepone") break international fluency.',
    microHabit: 'Swap literal phrasing for clean global equivalents ("reply", "handle the next step", "move earlier").',
    pillar: 'communication',
    practiceTopic:
      'Write a natural follow-up email after a technical interview confirming next steps and sharing your portfolio',
    practiceMode: 'email',
    practiceTone: 'professional-warm',
    practiceAudience: 'Hiring Manager',
  },
  'tone-mismatch': {
    label: 'Tone & Register Drift',
    diagnosis: 'Register slips between casual filler and overly stiff phrasing weaken audience fit.',
    microHabit: 'Picture the exact reader in sentence 1 and match contraction level and warmth throughout.',
    pillar: 'tone',
    practiceTopic:
      'Write a balanced LinkedIn reflection on a semester project lesson that sounds grounded rather than boastful',
    practiceMode: 'linkedin',
    practiceTone: 'conversational',
    practiceAudience: 'LinkedIn Reader',
  },
  'word-choice': {
    label: 'Vague Word Choice',
    diagnosis: 'Generic modifiers ("very good", "things", "stuff") leave vivid mechanisms under-specified.',
    microHabit: 'Replace one vague noun or "very + adjective" per paragraph with an exact plain-English verb or noun.',
    pillar: 'vocabulary',
    practiceTopic:
      'Explain why an instrumentation design choice worked without using "good", "bad", "very", or "things"',
    practiceMode: 'technical',
    practiceTone: 'academic-technical',
    practiceAudience: 'Interviewer',
  },
};

function parseISODateMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d);
}

function daysBetweenISO(olderISO: string, newerISO: string): number {
  const diff = parseISODateMs(newerISO) - parseISODateMs(olderISO);
  return Math.floor(diff / 86_400_000);
}

export function inferErrorTagFromText(
  rawTag?: string,
  rule?: string,
  original?: string,
  dimension?: string
): ErrorTag {
  if (rawTag) {
    const canonical = rawTag.trim().toLowerCase().replace(/[\s_]+/g, '-');
    if (canonical in ERROR_TAG_META) {
      return canonical as ErrorTag;
    }
  }
  const blob = `${rawTag || ''} ${rule || ''} ${original || ''}`.toLowerCase();
  if (/\b(revert back|do the needful|prepone|pass out|out of station|calque|literal)\b/.test(blob)) {
    return 'regional-calque';
  }
  if (/\b(tense|past|present|had been|verb form)\b/.test(blob)) {
    return 'tense-shift';
  }
  if (/\b(agreement|subject-verb|singular|plural)\b/.test(blob)) {
    return 'subject-verb';
  }
  if (/\b(article|determiner|preposition|discuss about|depend in|comprise of)\b/.test(blob)) {
    return 'article-preposition';
  }
  if (/\b(comma splice|semicolon|punctuation|spacing|comma)\b/.test(blob)) {
    return 'punctuation-spacing';
  }
  if (/\b(run-on|long sentence|clause|split|cadence|breath)\b/.test(blob)) {
    return 'run-on-sentence';
  }
  if (/\b(passive|active voice|hedging|hedge)\b/.test(blob)) {
    return 'hedging-passive';
  }
  if (/\b(filler|wordy|wordiness|concise|redundant|repetition|basically|actually|in order to)\b/.test(blob)) {
    return 'repetition-filler';
  }
  if (/\b(tone|register|formal|informal|stiff|casual|audience)\b/.test(blob) || dimension === 'tone') {
    return 'tone-mismatch';
  }
  if (dimension === 'calque') return 'regional-calque';
  return normalizeErrorTag(rawTag, dimension);
}

interface ExtractedIssue {
  errorTag: ErrorTag;
  original: string;
  improved: string;
  rule: string;
  date: string;
  topic: string;
  sessionId: string;
}

export function extractSessionIssues(session: WritingSession): ExtractedIssue[] {
  const issues: ExtractedIssue[] = [];
  const seen = new Set<string>();

  const pushUnique = (
    errorTag: ErrorTag,
    original: string,
    improved: string,
    rule: string
  ) => {
    const cleanOrig = original.trim();
    const cleanImp = improved.trim();
    if (!cleanOrig || !cleanImp) return;
    const key = `${errorTag}::${cleanOrig.toLowerCase()}::${cleanImp.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      errorTag,
      original: cleanOrig,
      improved: cleanImp,
      rule: rule.trim() || ERROR_TAG_META[errorTag].diagnosis,
      date: session.date,
      topic: session.topicDescription || 'Writing Session',
      sessionId: session.id,
    });
  };

  // Prefer v4 unified edits when available
  if (Array.isArray(session.edits) && session.edits.length > 0) {
    for (const edit of session.edits as UnifiedEdit[]) {
      const tag = inferErrorTagFromText(
        edit.errorTag,
        edit.rule,
        edit.original,
        edit.dimension
      );
      pushUnique(tag, edit.original, edit.improved, edit.rule);
    }
  } else {
    // Legacy v3 sessions: aggregate grammarFixes, calqueFixes, and pinpointedRewrites
    for (const gf of session.grammarFixes ?? []) {
      const tag = inferErrorTagFromText(gf.errorTag, gf.rule, gf.original, 'grammar');
      pushUnique(tag, gf.original, gf.corrected, gf.rule);
    }
    for (const cf of session.calqueFixes ?? []) {
      pushUnique('regional-calque', cf.phrase, cf.naturalAlternative, cf.reason);
    }
    for (const pr of session.pinpointedRewrites ?? []) {
      const tag = inferErrorTagFromText(
        pr.errorTag,
        pr.rule,
        pr.original,
        pr.dimension || (pr.category?.toLowerCase().includes('tone') ? 'tone' : 'flow')
      );
      pushUnique(tag, pr.original, pr.rewrite, pr.rule);
    }
  }

  return issues;
}

export function getSessionTopIssueTag(session: WritingSession): ErrorTag | null {
  const issues = extractSessionIssues(session);
  if (issues.length === 0) return null;
  const counts = new Map<ErrorTag, number>();
  for (const item of issues) {
    counts.set(item.errorTag, (counts.get(item.errorTag) ?? 0) + 1);
  }
  let best: ErrorTag | null = null;
  let bestCount = 0;
  for (const [tag, count] of counts.entries()) {
    if (count > bestCount) {
      best = tag;
      bestCount = count;
    }
  }
  return best;
}

export function computeErrorPatternAnalytics(
  sessions: WritingSession[],
  options?: { window?: ErrorPatternWindow; referenceDateISO?: string }
): ErrorPatternAnalyticsResult {
  const window: ErrorPatternWindow = options?.window ?? '30d';
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed' && !s.evaluationPending)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const referenceDateISO =
    options?.referenceDateISO || completed[0]?.date || formatLocalDateISO(new Date());

  const maxDays = window === '7d' ? 7 : window === '30d' ? 30 : Infinity;
  const inWindow = completed.filter((s) => {
    if (!Number.isFinite(maxDays)) return true;
    const age = daysBetweenISO(s.date, referenceDateISO);
    return age >= 0 && age <= maxDays;
  });

  // Split chronologically into recent half vs earlier half for trend calculation
  const splitIdx = Math.max(1, Math.ceil(inWindow.length / 2));
  const recentSessionIds = new Set(inWindow.slice(0, splitIdx).map((s) => s.id));
  const newestTwoIds = new Set(inWindow.slice(0, 2).map((s) => s.id));

  const buckets = new Map<
    ErrorTag,
    {
      count: number;
      recentCount: number;
      previousCount: number;
      onlyInNewestTwo: boolean;
      examples: ErrorPatternExample[];
    }
  >();

  let totalIssuesTracked = 0;

  for (const session of inWindow) {
    const issues = extractSessionIssues(session);
    const isRecent = recentSessionIds.has(session.id);
    const isNewestTwo = newestTwoIds.has(session.id);

    for (const issue of issues) {
      totalIssuesTracked += 1;
      const existing = buckets.get(issue.errorTag) ?? {
        count: 0,
        recentCount: 0,
        previousCount: 0,
        onlyInNewestTwo: true,
        examples: [],
      };
      existing.count += 1;
      if (isRecent) {
        existing.recentCount += 1;
      } else {
        existing.previousCount += 1;
      }
      if (!isNewestTwo) {
        existing.onlyInNewestTwo = false;
      }
      if (existing.examples.length < 3) {
        existing.examples.push({
          original: issue.original,
          improved: issue.improved,
          date: issue.date,
          topic: issue.topic,
          rule: issue.rule,
          sessionId: issue.sessionId,
        });
      }
      buckets.set(issue.errorTag, existing);
    }
  }

  const topPatterns: ErrorPatternItem[] = Array.from(buckets.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].recentCount - a[1].recentCount)
    .slice(0, 5)
    .map(([errorTag, stats]) => {
      const meta = ERROR_TAG_META[errorTag];
      let trend: ErrorTrend = 'Recurring';
      if (stats.previousCount > 0 && stats.recentCount < stats.previousCount) {
        trend = 'Improving';
      } else if (
        inWindow.length >= 3 &&
        stats.onlyInNewestTwo &&
        stats.previousCount === 0
      ) {
        trend = 'New';
      } else {
        trend = 'Recurring';
      }
      return {
        errorTag,
        label: meta.label,
        count: stats.count,
        recentCount: stats.recentCount,
        previousCount: stats.previousCount,
        trend,
        diagnosis: meta.diagnosis,
        microHabit: meta.microHabit,
        examples: stats.examples,
      };
    });

  return {
    window,
    sessionsAnalyzed: inWindow.length,
    totalIssuesTracked,
    topPatterns,
  };
}

function getPillarScore(session: WritingSession, key: SkillPillarKey): number {
  switch (key) {
    case 'grammar':
      return session.scores.grammarMechanics;
    case 'tone':
      return session.scores.toneEngagement;
    case 'communication':
      return session.scores.naturalVoiceFlow;
    case 'vocabulary':
      return typeof session.internationalMetrics?.lexicalResource === 'number'
        ? session.internationalMetrics.lexicalResource
        : session.scores.sentenceVarietyCadence;
    case 'clarity':
      return session.scores.claritySimplicity;
    case 'conciseness':
      return session.scores.concisenessDirectness;
  }
}

const PILLAR_DEFAULTS: Record<
  SkillPillarKey,
  {
    label: string;
    fallbackRule: string;
    fallbackHabit: string;
    topic: string;
    mode: WritingMode;
    tone: ToneSetting;
    audience: AudienceOption;
  }
> = {
  grammar: {
    label: 'Grammar',
    fallbackRule: 'Keep verb tenses, articles, and subject–verb pairs locked across clauses.',
    fallbackHabit: 'Before evaluating, read verbs and nouns aloud to catch dropped articles or tense drift.',
    topic: 'Document a hardware debugging session from first symptom to verified root cause in crisp past tense',
    mode: 'technical',
    tone: 'academic-technical',
    audience: 'Interviewer',
  },
  tone: {
    label: 'Tone',
    fallbackRule: 'Match warmth, formality, and directness to the specific reader.',
    fallbackHabit: 'Name your audience mentally before sentence 1 and hold one consistent register through the close.',
    topic: 'Write a concise outreach note to an alumni engineer asking one sharp question about instrumentation careers',
    mode: 'email',
    tone: 'professional-warm',
    audience: 'Hiring Manager',
  },
  communication: {
    label: 'Communication',
    fallbackRule: 'Favor natural active phrasing over stiff templates or literal calques.',
    fallbackHabit: 'Read your opening two sentences out loud — rewrite any phrase you would never say in person.',
    topic: 'Explain a real-world engineering trade-off to a teammate as clearly as you would at a whiteboard',
    mode: 'technical',
    tone: 'conversational',
    audience: 'Friend',
  },
  vocabulary: {
    label: 'Vocabulary',
    fallbackRule: 'Swap generic modifiers ("very good", "things") for exact plain-English verbs.',
    fallbackHabit: 'Replace two vague verbs or qualifiers per draft with concrete words from your active lexicon.',
    topic: 'Describe how feedback stability protects an industrial control loop using crisp, concrete verbs',
    mode: 'technical',
    tone: 'academic-technical',
    audience: 'Interviewer',
  },
  clarity: {
    label: 'Clarity',
    fallbackRule: 'Lead with the main point and split tangled 30-word clauses into crisp steps.',
    fallbackHabit: 'Keep one core claim per sentence; cap complex technical sentences near 20 words.',
    topic: 'Break down why sensor calibration drift happens so both a non-engineer and a panelist follow immediately',
    mode: 'linkedin',
    tone: 'crisp-direct',
    audience: 'LinkedIn Reader',
  },
  conciseness: {
    label: 'Conciseness',
    fallbackRule: 'Trim filler transitions ("basically", "in order to") so every word earns its place.',
    fallbackHabit: 'Delete 10% of your word count during a final tight pass without losing a single technical fact.',
    topic: 'Write a 100-word project progress brief stating outcome, blocker, and next step with zero fluff',
    mode: 'email',
    tone: 'crisp-direct',
    audience: 'Hiring Manager',
  },
};

export function computeSkillPillarPlaybooks(
  sessions: WritingSession[],
  referenceDateISO?: string
): SkillPillarPlaybook[] {
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed' && !s.evaluationPending)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const refDate =
    referenceDateISO ||
    completed[completed.length - 1]?.date ||
    formatLocalDateISO(new Date());

  const patterns = computeErrorPatternAnalytics(completed, {
    window: '30d',
    referenceDateISO: refDate,
  }).topPatterns;

  const keys: SkillPillarKey[] = [
    'grammar',
    'tone',
    'communication',
    'vocabulary',
    'clarity',
    'conciseness',
  ];

  return keys.map((key) => {
    const def = PILLAR_DEFAULTS[key];
    const scores = completed.map((s) => getPillarScore(s, key));
    const avgScore =
      scores.length > 0
        ? Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(1))
        : 0;

    // 30d delta: recent 30d avg minus prior 30d avg, falling back to recent-half vs earlier-half
    const recent30 = completed.filter((s) => {
      const age = daysBetweenISO(s.date, refDate);
      return age >= 0 && age <= 30;
    });
    const prior30 = completed.filter((s) => {
      const age = daysBetweenISO(s.date, refDate);
      return age > 30 && age <= 60;
    });

    let delta30d: number | null = null;
    if (recent30.length > 0 && prior30.length > 0) {
      const rAvg =
        recent30.reduce((a, s) => a + getPillarScore(s, key), 0) / recent30.length;
      const pAvg =
        prior30.reduce((a, s) => a + getPillarScore(s, key), 0) / prior30.length;
      delta30d = Number((rAvg - pAvg).toFixed(1));
    } else if (completed.length >= 4) {
      const mid = Math.floor(completed.length / 2);
      const earlier = completed.slice(0, mid);
      const later = completed.slice(mid);
      const lAvg =
        later.reduce((a, s) => a + getPillarScore(s, key), 0) / later.length;
      const eAvg =
        earlier.reduce((a, s) => a + getPillarScore(s, key), 0) / earlier.length;
      delta30d = Number((lAvg - eAvg).toFixed(1));
    }

    const sparkline = scores.slice(-8);
    const matchedPattern = patterns.find(
      (p) => ERROR_TAG_META[p.errorTag].pillar === key
    );
    const matchedMeta = matchedPattern
      ? ERROR_TAG_META[matchedPattern.errorTag]
      : null;

    const weakestRule = matchedPattern
      ? `${matchedPattern.label} (${matchedPattern.count}× recently): ${matchedPattern.diagnosis}`
      : def.fallbackRule;
    const microHabit = matchedPattern ? matchedPattern.microHabit : def.fallbackHabit;

    const practicePayload: PracticeWeaknessPayload = {
      pillarKey: key,
      pillarLabel: def.label,
      topic: matchedMeta ? matchedMeta.practiceTopic : def.topic,
      mode: matchedMeta ? matchedMeta.practiceMode : def.mode,
      tone: matchedMeta ? matchedMeta.practiceTone : def.tone,
      audience: matchedMeta ? matchedMeta.practiceAudience : def.audience,
      feedbackReminder: `Focus: ${def.label} — ${microHabit}`,
      targetErrorTag: matchedPattern?.errorTag,
    };

    return {
      key,
      label: def.label,
      avgScore,
      delta30d,
      sparkline,
      weakestRule,
      microHabit,
      practicePayload,
    };
  });
}

export function computeFeedbackAppliedRate(
  sessions: WritingSession[]
): FeedbackAppliedSummary {
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed' && !s.evaluationPending)
    .sort((a, b) => b.date.localeCompare(a.date));

  let yesCount = 0;
  let partialCount = 0;
  let noCount = 0;
  let baselineCount = 0;

  for (const s of completed.slice(0, 20)) {
    if (s.feedbackImplemented === 'Yes') yesCount += 1;
    else if (s.feedbackImplemented === 'Partial') partialCount += 1;
    else if (s.feedbackImplemented === 'No') noCount += 1;
    else baselineCount += 1;
  }

  const evaluatedCount = yesCount + partialCount + noCount;
  const appliedRatePct =
    evaluatedCount > 0
      ? Math.round(((yesCount + partialCount * 0.5) / evaluatedCount) * 100)
      : 0;

  const trendLabel =
    evaluatedCount === 0
      ? 'Baseline calibrating'
      : appliedRatePct >= 75
        ? 'Closing the loop consistently'
        : appliedRatePct >= 45
          ? 'Applying edits — stay intentional'
          : 'Revisit top coaching priority before drafting';

  return {
    yesCount,
    partialCount,
    noCount,
    baselineCount,
    evaluatedCount,
    appliedRatePct,
    trendLabel,
  };
}

const CEFR_PROGRESSION = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function getNextCefrLevel(current: string): string {
  const clean = (current || '').trim().toUpperCase().slice(0, 2);
  const idx = CEFR_PROGRESSION.indexOf(clean);
  if (idx === -1) return 'B2';
  return CEFR_PROGRESSION[Math.min(CEFR_PROGRESSION.length - 1, idx + 1)];
}

export function computeHeroFluencyPulse(
  sessions: WritingSession[],
  calendarSlots: CalendarSlot[],
  todayISO: string
): HeroFluencyPulse {
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed' && !s.evaluationPending)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const recent5 = completed.slice(0, 5);
  const prev5 = completed.slice(5, 10);

  const avgOf = (arr: WritingSession[], fn: (s: WritingSession) => number) =>
    arr.length > 0 ? arr.reduce((acc, s) => acc + fn(s), 0) / arr.length : 0;

  const overallScore =
    completed.length > 0
      ? Number(avgOf(recent5, (s) => s.totalScore).toFixed(1))
      : 0;
  const overallDelta5 =
    recent5.length >= 2 && prev5.length >= 2
      ? Number(
          (
            avgOf(recent5, (s) => s.totalScore) -
            avgOf(prev5, (s) => s.totalScore)
          ).toFixed(1)
        )
      : null;

  const spokenVal = (s: WritingSession) =>
    typeof s.spokenReadinessScore === 'number'
      ? s.spokenReadinessScore
      : Math.round(s.percentage);

  const spokenReadiness =
    completed.length > 0 ? Math.round(avgOf(recent5, spokenVal)) : 0;
  const spokenDelta5 =
    recent5.length >= 2 && prev5.length >= 2
      ? Math.round(avgOf(recent5, spokenVal) - avgOf(prev5, spokenVal))
      : null;

  const streaks = computeStreaks(completed, todayISO);
  const taskStreak = computeTaskStreak(calendarSlots, todayISO);

  const [y, m, d] = todayISO.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  const mondayOffset = (dt.getDay() + 6) % 7;
  const startDt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - mondayOffset);
  const endDt = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate() + 6);
  const weekStartISO = formatLocalDateISO(startDt);
  const weekEndISO = formatLocalDateISO(endDt);

  const thisWeek = completed.filter(
    (s) => s.date >= weekStartISO && s.date <= weekEndISO
  );
  const weeklyTarget = 4;
  const weeklyCompleted = thisWeek.length;
  const weeklyRingPct = Math.min(
    100,
    Math.round((Math.min(weeklyTarget, weeklyCompleted) / weeklyTarget) * 100)
  );
  const hasConverseThisWeek = thisWeek.some((s) => isConverseSession(s));

  const latestCefr = completed[0]?.cefrLevel || '—';
  const nextCefrTarget =
    latestCefr === '—' ? 'B2' : getNextCefrLevel(latestCefr);

  const patterns = computeErrorPatternAnalytics(completed, {
    window: '30d',
    referenceDateISO: todayISO,
  });
  const topPattern = patterns.topPatterns[0];

  return {
    overallScore,
    overallDelta5,
    spokenReadiness,
    spokenDelta5,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    taskStreakCurrent: taskStreak.currentTaskStreak,
    weeklyCompleted,
    weeklyTarget,
    weeklyRingPct,
    hasConverseThisWeek,
    latestCefr,
    nextCefrTarget,
    primaryFocusLabel: topPattern ? topPattern.label : 'Establish Baseline',
    primaryFocusHint: topPattern
      ? `${topPattern.count}× in 30d · ${topPattern.microHabit}`
      : 'Complete 2 drafts to surface your top fluency bottleneck.',
  };
}
