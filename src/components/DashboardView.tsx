import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react';
import type { CalendarSlot, VocabEntry, WritingSession } from '../types';
import {
  MODE_LABELS,
  computeAverageInternationalMetrics,
  computeModeBreakdown,
  deriveInternationalMetrics,
  exportSessionsToCsv,
} from '../utils/analytics';
import {
  ERROR_TAG_META,
  computeErrorPatternAnalytics,
  computeFeedbackAppliedRate,
  computeHeroFluencyPulse,
  computeSkillPillarPlaybooks,
  getSessionTopIssueTag,
  type ErrorPatternWindow,
  type PracticeWeaknessPayload,
} from '../utils/errorPatternAnalytics';
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
import { getTimeCapsuleStatus } from '../utils/timeCapsule';
import { HeroFluencyPulseStrip } from './dashboard/HeroFluencyPulseStrip';
import { MistakeRadarCard } from './dashboard/MistakeRadarCard';
import { SkillPillarGrid } from './dashboard/SkillPillarGrid';
import { FeedbackLoopCard } from './dashboard/FeedbackLoopCard';

interface DashboardViewProps {
  sessions: WritingSession[];
  vocabulary: VocabEntry[];
  calendarSlots: CalendarSlot[];
  todayISO: string;
  theme: 'light' | 'dark';
  onStartWriting: () => void;
  onStartConverse?: () => void;
  onLaunchTimeCapsule?: (originSession: WritingSession) => void;
  onPracticeWeakness?: (payload: PracticeWeaknessPayload) => void;
  onRetryPendingEvaluation?: (sessionId: string) => void;
  retryingSessionId?: string | null;
}

export function DashboardView({
  sessions,
  vocabulary,
  calendarSlots,
  todayISO,
  theme,
  onStartWriting,
  onStartConverse,
  onLaunchTimeCapsule,
  onPracticeWeakness,
  onRetryPendingEvaluation,
  retryingSessionId = null,
}: DashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [ledgerView, setLedgerView] = useState<'summary' | 'sheet'>('summary');
  const [mistakeWindow, setMistakeWindow] = useState<ErrorPatternWindow>('30d');
  const [showDeepBenchmarks, setShowDeepBenchmarks] = useState(false);
  const [selectedSession, setSelectedSession] = useState<WritingSession | null>(
    null
  );

  const completed = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.status === 'Completed' && !s.evaluationPending)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
        ),
    [sessions]
  );

  const totalWords = useMemo(
    () => completed.reduce((acc, s) => acc + s.wordCount, 0),
    [completed]
  );

  const heroPulse = useMemo(
    () => computeHeroFluencyPulse(completed, calendarSlots, todayISO),
    [completed, calendarSlots, todayISO]
  );

  const errorPatterns = useMemo(
    () =>
      computeErrorPatternAnalytics(completed, {
        window: mistakeWindow,
        referenceDateISO: todayISO,
      }),
    [completed, mistakeWindow, todayISO]
  );

  const skillPillars = useMemo(
    () => computeSkillPillarPlaybooks(completed, todayISO),
    [completed, todayISO]
  );

  const feedbackLoop = useMemo(
    () => computeFeedbackAppliedRate(completed),
    [completed]
  );

  const avgIntl = useMemo(
    () => computeAverageInternationalMetrics(completed),
    [completed]
  );

  const modeBreakdown = useMemo(
    () => computeModeBreakdown(completed),
    [completed]
  );

  const awaitingAiSessions = useMemo(
    () =>
      sessions
        .filter((s) => Boolean(s.evaluationPending))
        .sort((a, b) =>
          (b.queuedAt || b.createdAt).localeCompare(a.queuedAt || a.createdAt)
        ),
    [sessions]
  );

  const timeCapsuleStatus = useMemo(
    () => getTimeCapsuleStatus(sessions, todayISO),
    [sessions, todayISO]
  );

  const latestTimeCapsuleSession = useMemo(
    () =>
      completed.find(
        (s) => s.drillType === 'time-capsule' && s.drillVerdict?.summary
      ) ?? null,
    [completed]
  );

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

  function handlePracticeTrigger(payload: PracticeWeaknessPayload) {
    if (onPracticeWeakness) {
      onPracticeWeakness(payload);
    } else {
      onStartWriting();
    }
  }

  const selectedSessionIntl = selectedSession
    ? deriveInternationalMetrics(selectedSession)
    : null;

  return (
    <div className="editorial-enter max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-medium text-ink-primary">
            Diagnostic Progress Dashboard
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Spot recurring bottlenecks, drill your weakest skill pillar, and track closed-loop fluency gains.
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

      {/* Awaiting AI Evaluation Banner */}
      {awaitingAiSessions.length > 0 && (
        <section
          aria-label="Drafts awaiting AI evaluation"
          data-testid="dashboard-awaiting-ai-banner"
          className="card-surface drawer-reveal border-status-warning-border bg-status-warning-soft/55 p-4 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-status-warning">
              <RefreshCw
                className="w-3.5 h-3.5 awaiting-ink-spinner shrink-0"
                aria-hidden="true"
              />
              <span>
                Awaiting AI Evaluation ({awaitingAiSessions.length}{' '}
                {awaitingAiSessions.length === 1 ? 'draft' : 'drafts'})
              </span>
            </div>
            <span className="text-[11px] text-ink-secondary">
              Saved safely to Drafts — scores update automatically while you use other features.
            </span>
          </div>

          <div className="divide-y divide-border-subtle/70 border-t border-border-subtle/70">
            {awaitingAiSessions.slice(0, 3).map((draft) => {
              const isRetrying = retryingSessionId === draft.id;
              return (
                <div
                  key={draft.id}
                  className="pt-2.5 pb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-ink-primary truncate block">
                      {draft.topicDescription || 'Untitled Draft'}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-ink-muted">
                      {MODE_LABELS[draft.mode]} · {draft.wordCount}w · {draft.date}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onRetryPendingEvaluation && (
                      <button
                        type="button"
                        data-testid={`retry-pending-eval-${draft.id}`}
                        disabled={isRetrying}
                        onClick={() => onRetryPendingEvaluation(draft.id)}
                        className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>{isRetrying ? 'Evaluating...' : 'Retry Now'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onStartWriting}
                      className="btn-ghost px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      Open Studio
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Module 1: Hero Fluency Pulse (4 KPIs) */}
      <HeroFluencyPulseStrip
        pulse={heroPulse}
        totalSessions={completed.length}
        totalWords={totalWords}
        onStartWriting={onStartWriting}
      />

      {/* Module 2: Recurring Mistake Radar ("What Is Holding You Back") */}
      <MistakeRadarCard
        analytics={errorPatterns}
        windowFilter={mistakeWindow}
        onChangeWindow={setMistakeWindow}
        onPracticeWeakness={handlePracticeTrigger}
      />

      {/* Module 3: 6 Skill Pillars + "How to Improvise" Playbook */}
      <SkillPillarGrid
        pillars={skillPillars}
        onPracticeWeakness={handlePracticeTrigger}
      />

      {/* Module 4: Closed-Loop Feedback Applied Rate & Time Capsule */}
      <FeedbackLoopCard
        feedback={feedbackLoop}
        timeCapsuleStatus={timeCapsuleStatus}
        latestTimeCapsuleSession={latestTimeCapsuleSession}
        onLaunchTimeCapsule={onLaunchTimeCapsule}
      />

      {/* Primary Trend & Spoken Fluency Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <div className="card-surface lg:col-span-7 p-4 sm:p-6">
          <ScoreTrendChart sessions={completed} />
        </div>
        <div className="card-surface lg:col-span-5 p-4 sm:p-6">
          <RubricProfileChart sessions={completed} />
        </div>
      </section>

      <ConverseFluencyChart
        sessions={completed}
        onStartConverse={onStartConverse}
        onStartWriting={onStartWriting}
      />

      {/* Collapsible Deep Benchmarks & History (IELTS/TOEFL, D3 Heatmap, Mode Breakdown, Consistency) */}
      <section className="card-surface overflow-hidden">
        <button
          type="button"
          data-testid="toggle-deep-benchmarks"
          aria-expanded={showDeepBenchmarks}
          onClick={() => setShowDeepBenchmarks((v) => !v)}
          className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-subtle/40 transition-colors cursor-pointer"
        >
          <div>
            <div className="text-sm font-semibold text-ink-primary">
              International Benchmarks, Fluency Heatmap &amp; Activity History
            </div>
            <div className="text-xs font-mono-tabular text-ink-muted mt-0.5">
              CEFR {heroPulse.latestCefr} · IELTS {avgIntl.ieltsBand.toFixed(1)} · TOEFL{' '}
              {avgIntl.toeflEquivalent}/30 · {vocabulary.length} lexicon entries
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary shrink-0">
            <span>{showDeepBenchmarks ? 'Hide' : 'Expand'}</span>
            {showDeepBenchmarks ? (
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            )}
          </span>
        </button>

        {showDeepBenchmarks && (
          <div className="px-4 sm:px-6 pb-6 pt-2 border-t border-border-subtle space-y-6 drawer-reveal">
            <FluencyHeatmap
              sessions={completed}
              referenceDateISO={todayISO}
              theme={theme}
              onStartWriting={onStartWriting}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 space-y-3">
                <h3 className="text-sm font-semibold text-ink-primary">
                  Performance by Writing Mode
                </h3>
                <div className="space-y-2.5">
                  {modeBreakdown.map((item) => (
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
                      <div className="h-1.5 rounded-sm bg-subtle overflow-hidden">
                        <div
                          className={`h-full rounded-sm ${
                            item.sessionCount > 0 ? 'bg-accent' : 'bg-transparent'
                          }`}
                          style={{ width: `${item.avgPercentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-6">
                <WordVolumeChart sessions={completed} />
              </div>
            </div>

            <ConsistencyGrid sessions={completed} referenceDateISO={todayISO} />
          </div>
        )}
      </section>

      {/* Scannable Session Ledger */}
      <section className="card-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-semibold text-ink-primary">
              Session Evaluation Ledger
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Scan score, spoken readiness, and top issue tag at a glance — click any row for Before→After diff and full report.
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
                Scannable Ledger
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
                <span>Full Sheet</span>
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
              <option value="technical">Technical &amp; Interview</option>
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
                  <th className="py-2.5 pr-4 font-medium">Title &amp; Mode</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Score</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Spoken</th>
                  <th className="py-2.5 pr-4 font-medium">Top Issue Tag</th>
                  <th className="py-2.5 font-medium text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-sm">
                {filteredSessions.map((session) => {
                  const topTag = getSessionTopIssueTag(session);
                  const spokenPct =
                    typeof session.spokenReadinessScore === 'number'
                      ? session.spokenReadinessScore
                      : Math.round(session.percentage);
                  return (
                    <tr
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className="row-tactile cursor-pointer"
                    >
                      <td className="py-3 pr-4 font-mono-tabular text-xs text-ink-secondary whitespace-nowrap">
                        {session.date}
                      </td>
                      <td className="py-3 pr-4 min-w-[200px]">
                        <div className="font-medium text-ink-primary">
                          {session.topicDescription}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {MODE_LABELS[session.mode]} · {session.wordCount}w · CEFR{' '}
                          {session.cefrLevel}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-tabular text-xs font-medium text-ink-primary whitespace-nowrap">
                        {session.totalScore}/60
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-tabular text-xs text-ink-secondary whitespace-nowrap">
                        {spokenPct}%
                      </td>
                      <td className="py-3 pr-4 text-xs text-ink-secondary whitespace-nowrap">
                        {topTag ? (
                          <span className="inline-block px-2 py-0.5 rounded border border-border-subtle bg-subtle text-[11px]">
                            {ERROR_TAG_META[topTag].label}
                          </span>
                        ) : (
                          <span className="text-ink-muted">Clean pass</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSession(session);
                          }}
                          className="inline-link-tactile text-xs font-medium whitespace-nowrap"
                        >
                          Diff &amp; Report
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
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Date</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Mode</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Topic</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Words</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Voice</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Clarity</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Grammar</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Tone</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Cadence</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Concise</th>
                  <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Total</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => setSelectedSession(session)}
                    className="row-tactile cursor-pointer align-top"
                  >
                    <td className="py-2.5 px-3 font-mono-tabular whitespace-nowrap text-ink-secondary">
                      {session.date}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-ink-secondary">
                      {MODE_LABELS[session.mode]}
                    </td>
                    <td className="py-2.5 px-3 min-w-[200px] max-w-[280px] font-medium text-ink-primary">
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
                      {session.totalScore}/60
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-ink-secondary">
                      {session.feedbackImplemented}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Slide-over Session Inspection Drawer */}
      {selectedSession && selectedSessionIntl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-modal-title"
          className="modal-scrim fixed inset-0 z-50 flex justify-end"
          onClick={() => setSelectedSession(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel w-full max-w-2xl h-full overflow-y-auto p-5 sm:p-6 space-y-5 rounded-none sm:rounded-l-xl"
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-border-subtle">
              <div>
                <div className="text-xs text-ink-muted font-mono-tabular">
                  {selectedSession.date} · {MODE_LABELS[selectedSession.mode]} ·{' '}
                  {selectedSession.wordCount} words
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
              draftContent={selectedSession.content}
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
                spokenReadinessScore: selectedSession.spokenReadinessScore,
                signalNoiseRatio: selectedSession.signalNoiseRatio,
                audienceReaction: selectedSession.audienceReaction,
                audience: selectedSession.audience,
                calqueFixes: selectedSession.calqueFixes,
                drillType: selectedSession.drillType,
                drillMeta: selectedSession.drillMeta,
                drillVerdict: selectedSession.drillVerdict,
                revisionDelta: selectedSession.revisionDelta,
                edits: selectedSession.edits,
                toneCheck: selectedSession.toneCheck,
                nextDraftPriority: selectedSession.nextDraftPriority,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
