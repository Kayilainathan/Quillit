import type {
  RubricScores,
  SavedConversationThread,
  WritingSession,
} from '../types';
import { RUBRIC_DIMENSIONS, computePercentage } from './analytics';

export interface ConverseTimelinePoint {
  id: string;
  date: string;
  shortDate: string;
  axisLabel: string;
  sessionType: 'converse' | 'written';
  topic: string;
  cefrLevel: string;
  totalScore: number;
  percentage: number;
  wordCount: number;
  converseScore: number | null;
  writtenScore: number | null;
  benchmarkIndex?: number;
  naturalVoiceFlow: number;
  toneEngagement: number;
  grammarMechanics: number;
}

export interface ConversePillarComparison {
  key: keyof RubricScores;
  label: string;
  shortLabel: string;
  converseAvg: number | null;
  writtenAvg: number | null;
  delta: number | null;
}

export interface ConverseAnalyticsSummary {
  timeline: ConverseTimelinePoint[];
  pillars: ConversePillarComparison[];
  converseCount: number;
  writtenCount: number;
  converseAvgPct: number | null;
  writtenAvgPct: number | null;
  fluencyGapPct: number | null;
  converseTrendDelta: number | null;
  latestConverseCefr: string | null;
  latestConversePct: number | null;
  bestConverseSession: ConverseTimelinePoint | null;
}

/**
 * Determines whether a persisted WritingSession originated from the Converse live-dialogue studio.
 */
export function isConverseSession(session: WritingSession): boolean {
  if (!session) return false;
  if (typeof session.id === 'string' && session.id.startsWith('CHAT_')) {
    return true;
  }
  const slot = (session.daySlot || '').trim().toLowerCase();
  const category = (session.promptCategory || '').trim().toLowerCase();
  const topic = (session.topicDescription || '').trim().toLowerCase();
  return (
    slot.startsWith('live chat') ||
    category.startsWith('live conversation') ||
    topic.startsWith('live conversation:') ||
    topic.startsWith('live chat:')
  );
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const mIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  const day = Number(parts[2]);
  if (!Number.isFinite(day)) return isoDate.slice(5);
  return `${monthNames[mIdx]} ${day}`;
}

function resolveSessionPct(session: WritingSession): number {
  if (typeof session.percentage === 'number' && Number.isFinite(session.percentage)) {
    return round1(Math.max(0, Math.min(100, session.percentage)));
  }
  return round1(computePercentage(session.totalScore || 0));
}

function loadMatchingBenchmarkIndex(
  session: WritingSession,
  savedThreads?: SavedConversationThread[]
): number | undefined {
  if (!savedThreads || savedThreads.length === 0) return undefined;
  const normalizedTopic = session.topicDescription.toLowerCase();
  const match = savedThreads.find((t) => {
    if (typeof t.benchmarkIndex !== 'number') return false;
    const sameDay = t.updatedAt.slice(0, 10) === session.date;
    const titleHit =
      normalizedTopic.includes(t.scenario.title.toLowerCase()) ||
      session.daySlot.toLowerCase().includes(t.scenario.title.toLowerCase());
    return sameDay && titleHit;
  });
  return match?.benchmarkIndex;
}

/**
 * Builds the chronological Converse vs Written fluency series and 6-pillar spoken-vs-written comparison.
 */
export function buildConverseVsWrittenAnalytics(
  sessions: WritingSession[],
  savedThreads?: SavedConversationThread[]
): ConverseAnalyticsSummary {
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed')
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      const createdCmp = (a.createdAt || '').localeCompare(b.createdAt || '');
      if (createdCmp !== 0) return createdCmp;
      return a.id.localeCompare(b.id);
    });

  // Track same-day counts so X-axis labels stay readable even when multiple sessions occur on one day
  const dateTotals = new Map<string, number>();
  for (const s of completed) {
    dateTotals.set(s.date, (dateTotals.get(s.date) ?? 0) + 1);
  }
  const dateSeen = new Map<string, number>();

  const timeline: ConverseTimelinePoint[] = completed.map((session) => {
    const isConverse = isConverseSession(session);
    const pct = resolveSessionPct(session);
    const shortDate = formatShortDate(session.date);
    const totalOnDate = dateTotals.get(session.date) ?? 1;
    const seq = (dateSeen.get(session.date) ?? 0) + 1;
    dateSeen.set(session.date, seq);
    const axisLabel = totalOnDate > 1 ? `${shortDate} #${seq}` : shortDate;
    const benchmarkIndex = isConverse
      ? loadMatchingBenchmarkIndex(session, savedThreads)
      : undefined;

    return {
      id: session.id,
      date: session.date,
      shortDate,
      axisLabel,
      sessionType: isConverse ? 'converse' : 'written',
      topic: session.topicDescription,
      cefrLevel: session.cefrLevel || '—',
      totalScore: session.totalScore,
      percentage: pct,
      wordCount: session.wordCount,
      converseScore: isConverse ? pct : null,
      writtenScore: isConverse ? null : pct,
      benchmarkIndex,
      naturalVoiceFlow: session.scores.naturalVoiceFlow,
      toneEngagement: session.scores.toneEngagement,
      grammarMechanics: session.scores.grammarMechanics,
    };
  });

  const converseSessions = completed.filter(isConverseSession);
  const writtenSessions = completed.filter((s) => !isConverseSession(s));
  const conversePoints = timeline.filter((p) => p.sessionType === 'converse');
  const writtenPoints = timeline.filter((p) => p.sessionType === 'written');

  const converseAvgPct =
    conversePoints.length > 0
      ? round1(
          conversePoints.reduce((acc, p) => acc + p.percentage, 0) /
            conversePoints.length
        )
      : null;

  const writtenAvgPct =
    writtenPoints.length > 0
      ? round1(
          writtenPoints.reduce((acc, p) => acc + p.percentage, 0) /
            writtenPoints.length
        )
      : null;

  const fluencyGapPct =
    converseAvgPct !== null && writtenAvgPct !== null
      ? round1(converseAvgPct - writtenAvgPct)
      : null;

  const converseTrendDelta =
    conversePoints.length >= 2
      ? round1(
          conversePoints[conversePoints.length - 1].percentage -
            conversePoints[0].percentage
        )
      : null;

  const latestConverse =
    conversePoints.length > 0
      ? conversePoints[conversePoints.length - 1]
      : null;

  const bestConverseSession =
    conversePoints.length > 0
      ? [...conversePoints].sort((a, b) => b.percentage - a.percentage)[0]
      : null;

  const pillars: ConversePillarComparison[] = RUBRIC_DIMENSIONS.map((dim) => {
    const converseAvg =
      converseSessions.length > 0
        ? round1(
            converseSessions.reduce((acc, s) => acc + s.scores[dim.key], 0) /
              converseSessions.length
          )
        : null;
    const writtenAvg =
      writtenSessions.length > 0
        ? round1(
            writtenSessions.reduce((acc, s) => acc + s.scores[dim.key], 0) /
              writtenSessions.length
          )
        : null;
    const delta =
      converseAvg !== null && writtenAvg !== null
        ? round1(converseAvg - writtenAvg)
        : null;

    return {
      key: dim.key,
      label: dim.label,
      shortLabel: dim.shortLabel,
      converseAvg,
      writtenAvg,
      delta,
    };
  });

  return {
    timeline,
    pillars,
    converseCount: conversePoints.length,
    writtenCount: writtenPoints.length,
    converseAvgPct,
    writtenAvgPct,
    fluencyGapPct,
    converseTrendDelta,
    latestConverseCefr: latestConverse?.cefrLevel ?? null,
    latestConversePct: latestConverse?.percentage ?? null,
    bestConverseSession,
  };
}
