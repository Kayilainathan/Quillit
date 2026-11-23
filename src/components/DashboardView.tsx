import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  Download,
  Search,
  Table2,
  Target,
  X,
} from 'lucide-react';
import type { CalendarSlot, VocabEntry, WritingSession } from '../types';
import {
  MODE_LABELS,
  RUBRIC_DIMENSIONS,
  computeAverageInternationalMetrics,
  computeAverageRubric,
  computeModeBreakdown,
  computeMonthlyEntries,
  computePercentage,
  computeStreaks,
  computeTaskStreak,
  computeVocabularyStats,
  deriveInternationalMetrics,
  exportSessionsToCsv,
  findGrowthLever,
} from '../utils/analytics';
import {
  ConsistencyGrid,
  RubricProfileChart,
  ScoreTrendChart,
  WordVolumeChart,
} from './Charts';
import { ConverseFluencyChart } from './ConverseFluencyChart';
import { FluencyHeatmap } from './FluencyHeatmap';
import { EvaluationReportView } from './EvaluationReportView';
import { isConverseSession } from '../utils/converseAnalytics';

interface DashboardViewProps {
  sessions: WritingSession[];
  vocabulary: VocabEntry[];
  calendarSlots: CalendarSlot[];
  todayISO: string;
  theme: 'light' | 'dark';
  onStartWriting: () => void;
  onStartConverse?: () => void;
}

export function DashboardView({
  sessions,
  vocabulary,
  calendarSlots,
  todayISO,
  theme,
  onStartWriting,
  onStartConverse,
}: DashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [ledgerView, setLedgerView] = useState<'summary' | 'sheet'>('summary');
  const [selectedSession, setSelectedSession] = useState<WritingSession | null>(
    null
  );

  const completed = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.status === 'Completed')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions]
  );

  const metrics = useMemo(() => {
    const totalSessions = completed.length;
    const totalWords = completed.reduce((acc, s) => acc + s.wordCount, 0);
    const avgScore =
      totalSessions > 0
        ? Number(
            (
              completed.reduce((acc, s) => acc + s.totalScore, 0) / totalSessions
            ).toFixed(1)
          )
        : 0;
    const avgPct = totalSessions > 0 ? computePercentage(avgScore) : 0;
    const streaks = computeStreaks(completed, todayISO);
    const taskStreak = computeTaskStreak(calendarSlots, todayISO);
    const monthlyEntries = computeMonthlyEntries(completed, todayISO);
    const vocabStats = computeVocabularyStats(vocabulary, todayISO);
    const avgRubric = computeAverageRubric(completed);
    const avgIntl = computeAverageInternationalMetrics(completed);
    const growthLever = findGrowthLever(avgRubric);
    const modeBreakdown = computeModeBreakdown(completed);
    const latestCefr = completed[0]?.cefrLevel ?? '—';
    const bestSession =
      completed.length > 0
        ? [...completed].sort((a, b) => b.totalScore - a.totalScore)[0]
        : null;
    return {
      totalSessions,
      totalWords,
      avgScore,
      avgPct,
      streaks,
      taskStreak,
      monthlyEntries,
      vocabStats,
      avgIntl,
      growthLever,
      modeBreakdown,
      latestCefr,
      bestSession,
    };
  }, [completed, vocabulary, calendarSlots, todayISO]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return completed.filter((s) => {
      if (modeFilter === 'converse') {
        if (!isConverseSession(s)) return false;
      } else if (modeFilter === 'written') {
        if (isConverseSession(s)) return false;
      } else if (modeFilter !== 'all' && s.mode !== modeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.topicDescription.toLowerCase().includes(q) ||
        s.promptCategory.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.strictImprovements.toLowerCase().includes(q)
      );
    });
  }, [completed, searchQuery, modeFilter]);

  function handleDownloadCsv() {
    const csv = exportSessionsToCsv(
      [...completed].sort((a, b) => a.date.localeCompare(b.date))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quillit_Writing_Tracker_${todayISO}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const internationalBars = [
    {
      label: 'Tone & Register Control',
      value: metrics.avgIntl.registerControl,
      standard: 'Cambridge / Pragmatics',
    },
    {
      label: 'Grammar & Syntactic Accuracy',
      value: metrics.avgIntl.grammarAccuracy,
      standard: 'IELTS Grammatical Range',
    },
    {
      label: 'Lexical Resource & Range',
      value: metrics.avgIntl.lexicalResource,
      standard: 'IELTS / CEFR Vocabulary',
    },
    {
      label: 'Coherence & Cohesion',
      value: metrics.avgIntl.coherenceCohesion,
      standard: 'IELTS Discourse Flow',
    },
    {
      label: 'Task Achievement & Clarity',
      value: metrics.avgIntl.taskAchievement,
      standard: 'TOEFL Independent Rubric',
    },
  ];

  const selectedSessionIntl = selectedSession
    ? deriveInternationalMetrics(selectedSession)
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-medium text-ink-primary">
            Progress & Fluency Insights
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Multidimensional rubric tracking, international language benchmarks, task streaks, and vocabulary growth.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onStartWriting}
            className="btn-primary inline-flex items-center px-4 py-2 text-xs font-medium whitespace-nowrap"
          >
            New Session
          </button>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <section
        aria-label="Key writing metrics"
        className="grid grid-cols-2 lg:grid-cols-5 gap-4"
      >
        <div className="card-surface p-4 sm:p-5">
          <div className="text-xs text-ink-muted">
            Average Score
          </div>
          <div className="mt-1.5 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {metrics.avgScore}
            <span className="text-sm font-normal text-ink-muted">/60</span>
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-status-success">
            {metrics.avgPct.toFixed(1)}% mastery
          </div>
        </div>

        <div className="card-surface p-4 sm:p-5">
          <div className="text-xs text-ink-muted">
            Task & Writing Streak
          </div>
          <div className="mt-1.5 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {metrics.taskStreak.currentTaskStreak}
            <span className="text-sm font-normal text-ink-muted"> tasks</span>
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-ink-muted">
            Best task: {metrics.taskStreak.longestTaskStreak} · Daily best:{' '}
            {metrics.streaks.longestStreak}d
          </div>
        </div>

        <div className="card-surface p-4 sm:p-5">
          <div className="text-xs text-ink-muted">
            Monthly Entries
          </div>
          <div className="mt-1.5 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {metrics.monthlyEntries}
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-ink-muted">
            {metrics.totalSessions} sessions all-time
          </div>
        </div>

        <div className="card-surface p-4 sm:p-5">
          <div className="text-xs text-ink-muted">
            Words Written
          </div>
          <div className="mt-1.5 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {metrics.totalWords.toLocaleString()}
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-ink-muted">
            Avg{' '}
            {metrics.totalSessions > 0
              ? Math.round(metrics.totalWords / metrics.totalSessions)
              : 0}{' '}
            words/session
          </div>
        </div>

        <div className="card-surface col-span-2 lg:col-span-1 p-4 sm:p-5">
          <div className="text-xs text-ink-muted">
            Vocabulary Learned
          </div>
          <div className="mt-1.5 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {metrics.vocabStats.yearCount}
            <span className="text-sm font-normal text-ink-muted"> this year</span>
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-ink-muted">
            {metrics.vocabStats.weekCount} wk · {metrics.vocabStats.monthCount} mo
          </div>
        </div>
      </section>

      {/* Visual Analytics Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="card-surface lg:col-span-7 p-6">
          <ScoreTrendChart sessions={completed} />
        </div>
        <div className="card-surface lg:col-span-5 p-6">
          <RubricProfileChart sessions={completed} />
        </div>
      </section>

      {/* Converse Spoken Interaction Fluency vs Written Sessions (Recharts) */}
      <ConverseFluencyChart
        sessions={completed}
        onStartConverse={onStartConverse}
        onStartWriting={onStartWriting}
      />

      {/* International Evaluation & Proficiency Standards */}
      <section
        aria-label="International English evaluation standards"
        className="card-surface p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
              <Award className="w-4 h-4 text-ink-primary" aria-hidden="true" />
              <span>International Validation Standards</span>
            </div>
            <h2 className="text-base font-semibold text-ink-primary mt-0.5">
              CEFR, IELTS & TOEFL Writing Calibration
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-mono-tabular">
            <div>
              <span className="text-ink-muted">CEFR </span>
              <span className="text-sm font-semibold text-ink-primary">
                {metrics.latestCefr}
              </span>
            </div>
            <div>
              <span className="text-ink-muted">IELTS Band </span>
              <span className="text-sm font-semibold text-status-success">
                {metrics.avgIntl.ieltsBand.toFixed(1)}
              </span>
            </div>
            <div>
              <span className="text-ink-muted">TOEFL </span>
              <span className="text-sm font-semibold text-ink-primary">
                {metrics.avgIntl.toeflEquivalent}/30
              </span>
            </div>
            <div>
              <span className="text-ink-muted">Flesch Ease </span>
              <span className="text-sm font-semibold text-ink-primary">
                {metrics.avgIntl.fleschReadingEase}
              </span>
            </div>
            <div>
              <span className="text-ink-muted">FK Grade </span>
              <span className="text-sm font-semibold text-ink-primary">
                {metrics.avgIntl.fkGradeLevel}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {internationalBars.map((item) => (
            <div
              key={item.label}
              className="p-3.5 rounded-lg border border-border-subtle bg-subtle space-y-2"
            >
              <div className="text-xs font-medium text-ink-primary leading-snug">
                {item.label}
              </div>
              <div className="text-xl font-semibold font-mono-tabular text-ink-primary">
                {item.value}
                <span className="text-xs font-normal text-ink-muted">/10</span>
              </div>
              <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${Math.min(100, item.value * 10)}%` }}
                />
              </div>
              <div className="text-[11px] text-ink-muted">
                {item.standard}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3-Month D3 Fluency Heatmap of 6 International Evaluation Metrics */}
      <FluencyHeatmap
        sessions={completed}
        referenceDateISO={todayISO}
        theme={theme}
        onStartWriting={onStartWriting}
      />

      {/* Deep Fluency Insights: Mode Breakdown + Word Volume + Growth Lever */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="card-surface lg:col-span-5 p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Performance by Writing Mode
              </h3>
              <p className="text-xs text-ink-muted">
                Mastery & word output across technical and creative genres
              </p>
            </div>
            <span className="text-xs font-mono-tabular text-ink-muted">
              CEFR {metrics.latestCefr}
            </span>
          </div>

          <div className="space-y-3">
            {metrics.modeBreakdown.map((item) => (
              <div key={item.mode} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink-primary">
                    {item.label}
                  </span>
                  <span className="font-mono-tabular text-ink-secondary">
                    {item.sessionCount > 0
                      ? `${item.avgScore}/60 · ${item.avgPercentage.toFixed(0)}% · ${item.sessionCount}x`
                      : 'No sessions yet'}
                  </span>
                </div>
                <div className="h-2 rounded-sm bg-subtle overflow-hidden">
                  <div
                    className={`h-full rounded-sm transition-all duration-200 ${
                      item.sessionCount > 0 ? 'bg-accent' : 'bg-transparent'
                    }`}
                    style={{ width: `${item.avgPercentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-surface lg:col-span-4 p-6">
          <WordVolumeChart sessions={completed} />
        </div>

        <div className="card-surface lg:col-span-3 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
              <Target className="w-4 h-4 text-ink-primary" aria-hidden="true" />
              <span>Primary Growth Lever</span>
            </div>

            {metrics.growthLever ? (
              <>
                <div>
                  <div className="font-display text-lg font-medium text-ink-primary">
                    {metrics.growthLever.label}
                  </div>
                  <div className="mt-1 text-2xl font-semibold font-mono-tabular text-ink-primary">
                    {metrics.growthLever.score}
                    <span className="text-sm font-normal text-ink-muted">/10 avg</span>
                  </div>
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Raising your lowest pillar by +1.5 points pushes overall mastery above{' '}
                  <span className="font-mono-tabular font-medium text-ink-primary">
                    {Math.min(100, metrics.avgPct + 2.5).toFixed(1)}%
                  </span>
                  .
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-muted leading-relaxed">
                Complete your first evaluated draft to unlock your personalized growth lever.
              </p>
            )}

            {metrics.bestSession && (
              <div className="pt-3 border-t border-border-subtle text-xs">
                <div className="text-ink-muted">
                  Personal Best
                </div>
                <div className="font-medium text-ink-primary mt-0.5 truncate">
                  {metrics.bestSession.topicDescription}
                </div>
                <div className="font-mono-tabular text-status-success mt-0.5">
                  {metrics.bestSession.totalScore}/60 ({metrics.bestSession.percentage.toFixed(1)}%)
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onStartWriting}
            className="btn-secondary w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium"
          >
            <span>Practice Focus Area</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="card-surface p-6">
        <ConsistencyGrid sessions={completed} referenceDateISO={todayISO} />
      </section>

      {/* Session Ledger */}
      <section className="card-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-semibold text-ink-primary">
              Session Evaluation Ledger
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Select any session to inspect rubric scores, international benchmarks, grammar fixes, and vocabulary upgrades.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Ledger display mode"
              className="segmented-track inline-flex items-center gap-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={ledgerView === 'summary'}
                data-active={ledgerView === 'summary' ? 'true' : 'false'}
                onClick={() => setLedgerView('summary')}
                className="segmented-item px-2.5 py-1 text-xs font-medium"
              >
                Summary Ledger
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ledgerView === 'sheet'}
                data-active={ledgerView === 'sheet' ? 'true' : 'false'}
                onClick={() => setLedgerView('sheet')}
                className="segmented-item inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium"
              >
                <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Cloud Tracker Sheet</span>
              </button>
            </div>

            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics or notes..."
                aria-label="Search sessions"
                className="input-tactile pl-8 pr-3 py-1.5 text-xs"
              />
            </div>

            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              aria-label="Filter sessions by writing mode"
              className="input-tactile px-3 py-1.5 text-xs"
            >
              <option value="all">All Modes</option>
              <option value="converse">Converse (Live Chat)</option>
              <option value="written">Written Drafts Only</option>
              <option value="journal">Personal Journal</option>
              <option value="linkedin">LinkedIn Post</option>
              <option value="email">Professional Email</option>
              <option value="friend">Friend Exchange</option>
              <option value="technical">Technical & Interview</option>
              <option value="creative">Creative Writing</option>
            </select>
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">
            No sessions match your current filter.
          </div>
        ) : ledgerView === 'summary' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-xs text-ink-muted">
                  <th className="py-2.5 pr-4 font-medium">Date</th>
                  <th className="py-2.5 pr-4 font-medium">Category & Topic</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Words</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Score</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Mastery</th>
                  <th className="py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-sm">
                {filteredSessions.map((session) => {
                  const intl = deriveInternationalMetrics(session);
                  return (
                    <tr
                      key={session.id}
                      className="row-tactile"
                    >
                      <td className="py-3 pr-4 font-mono-tabular text-xs text-ink-secondary whitespace-nowrap">
                        {session.date}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-ink-primary">
                          {session.topicDescription}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {session.promptCategory} · {session.daySlot} · CEFR{' '}
                          {session.cefrLevel} · IELTS {intl.ieltsBand.toFixed(1)}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-tabular text-xs text-ink-secondary">
                        {session.wordCount}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-tabular text-xs font-medium text-ink-primary">
                        {session.totalScore}/60
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-tabular text-xs text-status-success font-medium">
                        {session.percentage.toFixed(1)}%
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedSession(session)}
                          className="inline-link-tactile text-xs font-medium whitespace-nowrap"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border-subtle rounded-lg">
            <table className="w-max min-w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-subtle text-[11px] text-ink-secondary">
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Session ID</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Date</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Day &amp; Slot</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Prompt Category</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Topic Description</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Word Count</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Natural Voice &amp; Flow (/10)</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Clarity &amp; Simplicity (/10)</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Grammar &amp; Mechanics (/10)</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Tone &amp; Engagement (/10)</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Sentence Variety &amp; Cadence (/10)</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Conciseness &amp; Directness (/10)</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Total Score (/60)</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Percentage (%)</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Feedback Implemented?</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">What Improved Since Last Session</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Strict Improvements &amp; Pinpointed Fixes</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Vocabulary Upgrades (Used -&gt; Better Alternative)</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredSessions.map((session) => {
                  const vocabText =
                    session.vocabUpgrades.length > 0
                      ? session.vocabUpgrades
                          .map((v) => `${v.used} -> ${v.betterAlternative}`)
                          .join('; ')
                      : '—';
                  return (
                    <tr
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className="row-tactile cursor-pointer align-top"
                    >
                      <td className="py-2.5 px-3 font-mono-tabular text-[11px] text-ink-muted whitespace-nowrap">
                        {session.id}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular whitespace-nowrap text-ink-secondary">
                        {session.date}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-ink-secondary">
                        {session.daySlot}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-ink-secondary">
                        {session.promptCategory}
                      </td>
                      <td className="py-2.5 px-3 min-w-[220px] max-w-[280px] font-medium text-ink-primary">
                        {session.topicDescription}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-ink-secondary">
                        {session.wordCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-ink-secondary">
                        {session.scores.naturalVoiceFlow}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-ink-secondary">
                        {session.scores.claritySimplicity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-ink-secondary">
                        {session.scores.grammarMechanics}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-ink-secondary">
                        {session.scores.toneEngagement}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-ink-secondary">
                        {session.scores.sentenceVarietyCadence}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-ink-secondary">
                        {session.scores.concisenessDirectness}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold text-ink-primary">
                        {session.totalScore}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold text-status-success">
                        {session.percentage.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-ink-secondary">
                        {session.feedbackImplemented}
                      </td>
                      <td className="py-2.5 px-3 min-w-[240px] max-w-[300px] text-ink-secondary">
                        {session.whatImproved}
                      </td>
                      <td className="py-2.5 px-3 min-w-[240px] max-w-[300px] text-ink-secondary">
                        {session.strictImprovements}
                      </td>
                      <td className="py-2.5 px-3 min-w-[220px] max-w-[280px] text-ink-secondary">
                        {vocabText}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-status-success">
                        {session.evaluationPending ? 'Queued (AI Reset)' : session.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Session Inspection Modal */}
      {selectedSession && selectedSessionIntl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-modal-title"
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="modal-panel max-w-3xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-border-subtle">
              <div>
                <div className="text-xs text-ink-muted font-mono-tabular">
                  {selectedSession.id} · {selectedSession.date} ·{' '}
                  {MODE_LABELS[selectedSession.mode]} · {selectedSession.wordCount} words
                </div>
                <h2
                  id="session-modal-title"
                  className="font-display text-xl font-medium text-ink-primary mt-1"
                >
                  {selectedSession.topicDescription}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                aria-label="Close session detail"
                className="btn-ghost p-1.5"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <EvaluationReportView
              defaultView="detailed"
              report={{
                topic: selectedSession.topicDescription,
                modeLabel: MODE_LABELS[selectedSession.mode],
                scores: selectedSession.scores,
                metricNotes: selectedSession.metricNotes,
                cefrLevel: selectedSession.cefrLevel,
                internationalMetrics: selectedSessionIntl,
                toneVerdict: selectedSession.toneVerdict,
                flowVerdict: selectedSession.flowVerdict,
                feedbackImplemented: selectedSession.feedbackImplemented,
                feedbackCheck: selectedSession.feedbackCheck,
                whatImproved: selectedSession.whatImproved,
                whatImprovedPoints: selectedSession.whatImprovedPoints,
                strictImprovements: selectedSession.strictImprovements,
                pinpointedRewrites: selectedSession.pinpointedRewrites,
                rewrittenSample: selectedSession.rewrittenSample,
                grammarFixes: selectedSession.grammarFixes,
                vocabUpgrades: selectedSession.vocabUpgrades,
                routingMeta: selectedSession.routingMeta,
                modelUsed: selectedSession.modelUsed,
              }}
            />

            <div className="pt-3 border-t border-border-subtle">
              <h3 className="text-xs font-semibold text-ink-muted mb-1.5">
                Saved Draft
              </h3>
              <div className="p-4 rounded-lg bg-subtle border border-border-subtle text-sm leading-relaxed whitespace-pre-wrap text-ink-primary">
                {selectedSession.content}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
