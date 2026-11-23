import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight, MessageSquare } from 'lucide-react';
import type { SavedConversationThread, WritingSession } from '../types';
import {
  buildConverseVsWrittenAnalytics,
  type ConversePillarComparison,
  type ConverseTimelinePoint,
} from '../utils/converseAnalytics';

const THREADS_STORAGE_KEY = 'quillit_converse_threads_v1';

function readLocalConverseThreads(): SavedConversationThread[] {
  try {
    const raw = localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface ConverseFluencyChartProps {
  sessions: WritingSession[];
  onStartConverse?: () => void;
  onStartWriting?: () => void;
}

interface TimelineTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: ConverseTimelinePoint;
  }>;
}

function ConverseTimelineTooltip({ active, payload }: TimelineTooltipProps) {
  const pt = payload?.[0]?.payload;
  if (!active || !pt) return null;

  const isConverse = pt.sessionType === 'converse';
  return (
    <div
      className="rounded-lg border border-border-default px-3.5 py-2.5 text-xs max-w-[260px] space-y-1.5"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="flex items-center justify-between gap-3 font-mono-tabular text-[11px]">
        <span
          className="font-semibold"
          style={{
            color: isConverse
              ? 'var(--chart-secondary)'
              : 'var(--chart-primary)',
          }}
        >
          {isConverse ? 'Converse · Spoken' : 'Write · Draft'}
        </span>
        <span className="text-ink-muted">{pt.date}</span>
      </div>

      <div className="font-medium text-ink-primary leading-snug line-clamp-2">
        {pt.topic}
      </div>

      <div className="pt-1 border-t border-border-subtle flex items-baseline justify-between gap-3 font-mono-tabular">
        <span className="text-sm font-semibold text-ink-primary">
          {pt.percentage.toFixed(1)}%
        </span>
        <span className="text-[11px] text-ink-secondary">
          {pt.totalScore}/60 · CEFR {pt.cefrLevel}
        </span>
      </div>

      <div className="text-[11px] font-mono-tabular text-ink-muted">
        {typeof pt.benchmarkIndex === 'number'
          ? `Benchmark ${pt.benchmarkIndex}/100 · `
          : ''}
        {pt.wordCount} words · Voice {pt.naturalVoiceFlow}/10 · Tone{' '}
        {pt.toneEngagement}/10
      </div>
    </div>
  );
}

interface PillarTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: ConversePillarComparison;
  }>;
}

function ConversePillarTooltip({ active, payload }: PillarTooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div
      className="rounded-lg border border-border-default px-3.5 py-2.5 text-xs space-y-1.5"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="font-medium text-ink-primary">{item.label}</div>
      <div className="space-y-0.5 font-mono-tabular text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span style={{ color: 'var(--chart-secondary)' }}>Converse avg</span>
          <span className="font-semibold text-ink-primary">
            {item.converseAvg !== null ? `${item.converseAvg.toFixed(1)}/10` : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-ink-secondary">Written avg</span>
          <span className="font-semibold text-ink-primary">
            {item.writtenAvg !== null ? `${item.writtenAvg.toFixed(1)}/10` : '—'}
          </span>
        </div>
        {item.delta !== null && (
          <div className="pt-1 border-t border-border-subtle flex items-center justify-between gap-4">
            <span className="text-ink-muted">Spoken gap</span>
            <span
              className="font-semibold"
              style={{
                color:
                  item.delta >= 0
                    ? 'var(--status-success)'
                    : 'var(--status-warning)',
              }}
            >
              {item.delta >= 0 ? `+${item.delta.toFixed(1)}` : item.delta.toFixed(1)} pts
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConverseFluencyChart({
  sessions,
  onStartConverse,
  onStartWriting,
}: ConverseFluencyChartProps) {
  const [chartMode, setChartMode] = useState<'timeline' | 'pillars'>('timeline');
  const [windowRange, setWindowRange] = useState<'all' | 'recent'>('all');

  const analytics = useMemo(() => {
    const savedThreads = readLocalConverseThreads();
    return buildConverseVsWrittenAnalytics(sessions, savedThreads);
  }, [sessions]);

  const visibleTimeline = useMemo(() => {
    if (windowRange === 'recent' && analytics.timeline.length > 12) {
      return analytics.timeline.slice(-12);
    }
    return analytics.timeline;
  }, [analytics.timeline, windowRange]);

  const gapText =
    analytics.fluencyGapPct === null
      ? '—'
      : `${analytics.fluencyGapPct >= 0 ? '+' : ''}${analytics.fluencyGapPct.toFixed(1)}%`;

  const trendText =
    analytics.converseTrendDelta === null
      ? analytics.converseCount === 1
        ? 'Baseline set'
        : '—'
      : `${analytics.converseTrendDelta >= 0 ? '+' : ''}${analytics.converseTrendDelta.toFixed(1)}%`;

  return (
    <section
      aria-label="Converse fluency progress compared to written sessions"
      data-testid="dashboard-converse-fluency-chart"
      className="card-surface p-6 space-y-5"
    >
      {/* Header Row: Editorial Title + Interactive Segmented Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-ink-muted">
            Spoken Interaction vs Written Craft
          </div>
          <h2 className="text-base font-semibold text-ink-primary">
            Converse Fluency Trajectory
          </h2>
          <p className="text-xs text-ink-secondary">
            Track live conversational quality over time relative to your written drafts on a unified 100% fluency scale.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {chartMode === 'timeline' && analytics.timeline.length > 12 && (
            <div
              role="tablist"
              aria-label="Chart time range"
              className="segmented-track inline-flex items-center gap-0.5 text-[11px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={windowRange === 'all'}
                data-active={windowRange === 'all' ? 'true' : 'false'}
                onClick={() => setWindowRange('all')}
                className="segmented-item px-2.5 py-1 font-medium whitespace-nowrap"
              >
                All ({analytics.timeline.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={windowRange === 'recent'}
                data-active={windowRange === 'recent' ? 'true' : 'false'}
                onClick={() => setWindowRange('recent')}
                className="segmented-item px-2.5 py-1 font-medium whitespace-nowrap"
              >
                Recent 12
              </button>
            </div>
          )}

          <div
            role="tablist"
            aria-label="Converse chart view mode"
            className="segmented-track inline-flex items-center gap-0.5 text-[11px]"
          >
            <button
              type="button"
              role="tab"
              data-testid="converse-chart-tab-timeline"
              aria-selected={chartMode === 'timeline'}
              data-active={chartMode === 'timeline' ? 'true' : 'false'}
              onClick={() => setChartMode('timeline')}
              className="segmented-item px-2.5 py-1 font-medium whitespace-nowrap"
            >
              Over Time
            </button>
            <button
              type="button"
              role="tab"
              data-testid="converse-chart-tab-pillars"
              aria-selected={chartMode === 'pillars'}
              data-active={chartMode === 'pillars' ? 'true' : 'false'}
              onClick={() => setChartMode('pillars')}
              className="segmented-item px-2.5 py-1 font-medium whitespace-nowrap"
            >
              By Sub-Skill
            </button>
          </div>
        </div>
      </div>

      {/* Unboxed 4-Column Tabular Summary Strip (Zero-Pill Discipline) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3.5 border-y border-border-subtle">
        <div>
          <div className="text-[11px] text-ink-muted">Converse Avg</div>
          <div
            data-testid="converse-chart-avg"
            className="mt-0.5 text-lg font-semibold font-mono-tabular text-ink-primary"
          >
            {analytics.converseAvgPct !== null
              ? `${analytics.converseAvgPct.toFixed(1)}%`
              : '—'}
          </div>
          <div className="text-[11px] font-mono-tabular text-ink-muted">
            {analytics.converseCount}{' '}
            {analytics.converseCount === 1 ? 'chat' : 'chats'}
            {analytics.latestConverseCefr
              ? ` · CEFR ${analytics.latestConverseCefr}`
              : ''}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-ink-muted">Written Avg</div>
          <div
            data-testid="written-chart-avg"
            className="mt-0.5 text-lg font-semibold font-mono-tabular text-ink-primary"
          >
            {analytics.writtenAvgPct !== null
              ? `${analytics.writtenAvgPct.toFixed(1)}%`
              : '—'}
          </div>
          <div className="text-[11px] font-mono-tabular text-ink-muted">
            {analytics.writtenCount}{' '}
            {analytics.writtenCount === 1 ? 'draft' : 'drafts'}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-ink-muted">Spoken vs Written</div>
          <div
            data-testid="converse-written-gap"
            className="mt-0.5 text-lg font-semibold font-mono-tabular"
            style={{
              color:
                analytics.fluencyGapPct === null
                  ? 'var(--ink-primary)'
                  : analytics.fluencyGapPct >= 0
                    ? 'var(--status-success)'
                    : 'var(--status-warning)',
            }}
          >
            {gapText}
          </div>
          <div className="text-[11px] text-ink-muted">
            {analytics.fluencyGapPct === null
              ? 'Needs both modes'
              : analytics.fluencyGapPct >= 0
                ? 'Spoken ahead of written'
                : 'Written ahead of spoken'}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-ink-muted">Converse Progress</div>
          <div
            className="mt-0.5 text-lg font-semibold font-mono-tabular"
            style={{
              color:
                analytics.converseTrendDelta !== null &&
                analytics.converseTrendDelta < 0
                  ? 'var(--status-warning)'
                  : 'var(--ink-primary)',
            }}
          >
            {trendText}
          </div>
          <div className="text-[11px] text-ink-muted">
            {analytics.bestConverseSession
              ? `Peak ${analytics.bestConverseSession.percentage.toFixed(0)}%`
              : 'First chat unlocks trend'}
          </div>
        </div>
      </div>

      {/* Main Recharts Visualization or Clean Empty State */}
      {analytics.timeline.length === 0 ? (
        <div
          data-testid="converse-chart-empty"
          className="py-10 px-4 text-center space-y-3"
        >
          <MessageSquare
            className="w-5 h-5 mx-auto text-ink-muted"
            aria-hidden="true"
          />
          <div className="space-y-1 max-w-md mx-auto">
            <p className="text-sm font-medium text-ink-primary">
              No fluency sessions plotted yet
            </p>
            <p className="text-xs text-ink-secondary">
              Evaluate a live Converse session or a written draft to start comparing your spoken interaction trajectory against your writing.
            </p>
          </div>
          {onStartConverse && (
            <button
              type="button"
              onClick={onStartConverse}
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap"
            >
              <span>Start Live Chat</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Quiet Inline Legend (Matches Active Chart Marks) */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                {chartMode === 'timeline' ? (
                  <span
                    className="w-3 h-0.5 rounded-full inline-block"
                    style={{ backgroundColor: 'var(--chart-secondary)' }}
                  />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-xs inline-block"
                    style={{ backgroundColor: 'var(--chart-secondary)' }}
                  />
                )}
                <span className="text-ink-secondary font-medium">
                  Converse Fluency
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                {chartMode === 'timeline' ? (
                  <span
                    className="w-3 h-0.5 rounded-full inline-block border-t-2 border-dashed"
                    style={{ borderColor: 'var(--chart-primary)' }}
                  />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-xs inline-block opacity-75"
                    style={{ backgroundColor: 'var(--chart-primary)' }}
                  />
                )}
                <span>Written Sessions</span>
              </span>
            </div>

            {analytics.converseCount === 0 && onStartConverse && (
              <button
                type="button"
                onClick={onStartConverse}
                className="inline-link-tactile inline-flex items-center gap-1 text-xs font-medium text-ink-primary cursor-pointer"
              >
                <span>Add your first Converse session</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}

            {analytics.converseCount > 0 &&
              analytics.writtenCount === 0 &&
              onStartWriting && (
                <button
                  type="button"
                  onClick={onStartWriting}
                  className="inline-link-tactile inline-flex items-center gap-1 text-xs font-medium text-ink-primary cursor-pointer"
                >
                  <span>Write a draft to compare baseline</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
          </div>

          {/* Chart Canvas */}
          <div
            className="w-full h-[272px]"
            role="img"
            aria-label={
              chartMode === 'timeline'
                ? 'Recharts line chart comparing Converse spoken fluency scores and written session scores over time'
                : 'Recharts bar chart comparing Converse and written averages across six English fluency sub-skills'
            }
          >
            {chartMode === 'timeline' ? (
              <ResponsiveContainer width="100%" height={272} minWidth={0}>
                <ComposedChart
                  data={visibleTimeline}
                  margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
                >
                  <defs>
                    <linearGradient
                      id="converseFluencyAreaFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--chart-secondary)"
                        stopOpacity={0.24}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--chart-secondary)"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="axisLabel"
                    tick={{
                      fill: 'var(--ink-muted)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                    }}
                    axisLine={{ stroke: 'var(--chart-grid)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={22}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{
                      fill: 'var(--ink-muted)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ConverseTimelineTooltip />}
                    cursor={{
                      stroke: 'var(--border-strong)',
                      strokeDasharray: '3 3',
                    }}
                  />

                  {analytics.writtenAvgPct !== null &&
                    analytics.converseCount > 0 && (
                      <ReferenceLine
                        y={analytics.writtenAvgPct}
                        stroke="var(--ink-muted)"
                        strokeDasharray="4 4"
                        strokeOpacity={0.55}
                        label={{
                          value: `Written avg ${analytics.writtenAvgPct.toFixed(0)}%`,
                          position: 'insideTopRight',
                          fill: 'var(--ink-muted)',
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                    )}

                  <Area
                    type="monotone"
                    dataKey="converseScore"
                    name="Converse Fluency"
                    stroke="var(--chart-secondary)"
                    strokeWidth={2.4}
                    fill="url(#converseFluencyAreaFill)"
                    connectNulls
                    dot={{
                      r: 4.5,
                      fill: 'var(--chart-secondary)',
                      stroke: 'var(--bg-surface)',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6,
                      fill: 'var(--chart-secondary)',
                      stroke: 'var(--bg-surface)',
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="writtenScore"
                    name="Written Sessions"
                    stroke="var(--chart-primary)"
                    strokeWidth={1.8}
                    strokeDasharray="5 4"
                    connectNulls
                    dot={{
                      r: 3.5,
                      fill: 'var(--bg-surface)',
                      stroke: 'var(--chart-primary)',
                      strokeWidth: 1.8,
                    }}
                    activeDot={{
                      r: 5.5,
                      fill: 'var(--bg-surface)',
                      stroke: 'var(--chart-primary)',
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={272} minWidth={0}>
                <BarChart
                  data={analytics.pillars}
                  margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
                  barGap={6}
                >
                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{
                      fill: 'var(--ink-muted)',
                      fontSize: 11,
                      fontFamily: 'var(--font-sans)',
                    }}
                    axisLine={{ stroke: 'var(--chart-grid)' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    tick={{
                      fill: 'var(--ink-muted)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ConversePillarTooltip />}
                    cursor={{ fill: 'var(--accent-soft)' }}
                  />
                  <Bar
                    dataKey="converseAvg"
                    name="Converse"
                    fill="var(--chart-secondary)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="writtenAvg"
                    name="Written"
                    fill="var(--chart-primary)"
                    fillOpacity={0.72}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
