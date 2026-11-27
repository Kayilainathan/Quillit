import { ArrowDownRight, ArrowUpRight, Flame, Target } from 'lucide-react';
import type { HeroFluencyPulse } from '../../utils/errorPatternAnalytics';

interface HeroFluencyPulseStripProps {
  pulse: HeroFluencyPulse;
  totalSessions: number;
  totalWords: number;
  onStartWriting: () => void;
}

function DeltaReadout({
  value,
  suffix = '',
  label,
}: {
  value: number | null;
  suffix?: string;
  label: string;
}) {
  if (value === null) {
    return (
      <span className="text-[11px] font-mono-tabular text-ink-muted">
        {label}
      </span>
    );
  }
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono-tabular ${
        positive ? 'text-status-success' : 'text-status-danger'
      }`}
    >
      {positive ? (
        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
      )}
      <span>
        {positive ? '+' : ''}
        {value}
        {suffix} vs prior 5
      </span>
    </span>
  );
}

export function HeroFluencyPulseStrip({
  pulse,
  totalSessions,
  totalWords,
  onStartWriting,
}: HeroFluencyPulseStripProps) {
  const ringCircumference = 2 * Math.PI * 16;

  return (
    <section
      aria-label="Hero fluency pulse"
      data-testid="dashboard-hero-fluency-pulse"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
    >
      {/* KPI 1: Overall Fluency Score */}
      <div className="card-surface p-4 sm:p-5 flex flex-col justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-muted">
          Fluency Pulse (Last 5)
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold font-mono-tabular text-ink-primary">
            {totalSessions > 0 ? pulse.overallScore : '—'}
          </span>
          <span className="text-xs font-mono-tabular text-ink-muted">/60</span>
        </div>
        <div className="pt-1 border-t border-border-subtle/70 flex items-center justify-between gap-2">
          <DeltaReadout
            value={pulse.overallDelta5}
            label={`${totalSessions} sessions · ${totalWords.toLocaleString()}w`}
          />
        </div>
      </div>

      {/* KPI 2: Spoken Readiness */}
      <div className="card-surface p-4 sm:p-5 flex flex-col justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-muted">
          Spoken Readiness
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold font-mono-tabular text-ink-primary">
            {totalSessions > 0 ? `${pulse.spokenReadiness}%` : '—'}
          </span>
        </div>
        <div className="pt-1 border-t border-border-subtle/70 flex items-center justify-between gap-2">
          <DeltaReadout
            value={pulse.spokenDelta5}
            suffix="%"
            label="Read-aloud cadence & signal"
          />
        </div>
      </div>

      {/* KPI 3: Active Streak + Weekly 10-Min Cadence Ring */}
      <div
        data-testid="dashboard-cadence-ring"
        className="card-surface p-4 sm:p-5 flex items-center justify-between gap-3"
      >
        <div className="min-w-0 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">
            Streak &amp; Weekly Cadence
          </div>
          <div className="flex items-baseline gap-2">
            <span className="inline-flex items-center gap-1 text-2xl font-semibold font-mono-tabular text-ink-primary">
              <Flame className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
              {pulse.currentStreak}d
            </span>
            <span className="text-[11px] font-mono-tabular text-ink-muted">
              best {pulse.longestStreak}d · {pulse.taskStreakCurrent} tasks
            </span>
          </div>
          <div className="text-[11px] text-ink-muted">
            {pulse.weeklyCompleted >= pulse.weeklyTarget
              ? 'Weekly 4/4 cadence met'
              : `${pulse.weeklyTarget - pulse.weeklyCompleted} left this week`}
            {pulse.hasConverseThisWeek ? ' · Converse ✓' : ''}
          </div>
        </div>

        <button
          type="button"
          onClick={onStartWriting}
          title="Open 10-Min Desk"
          aria-label={`Weekly cadence ${Math.min(pulse.weeklyTarget, pulse.weeklyCompleted)} of ${pulse.weeklyTarget}. Open 10-minute writing desk.`}
          className="relative w-12 h-12 shrink-0 cursor-pointer group"
        >
          <svg viewBox="0 0 40 40" className="w-12 h-12 -rotate-90" aria-hidden="true">
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="3.2"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={
                ringCircumference * (1 - pulse.weeklyRingPct / 100)
              }
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono-tabular text-[11px] font-semibold text-ink-primary group-hover:scale-105 transition-transform">
            {Math.min(pulse.weeklyTarget, pulse.weeklyCompleted)}/{pulse.weeklyTarget}
          </span>
        </button>
      </div>

      {/* KPI 4: CEFR Level + Next Target Focus */}
      <div className="card-surface p-4 sm:p-5 flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-ink-muted">
            CEFR &amp; Next Focus
          </span>
          <span className="font-mono-tabular text-xs font-semibold text-ink-primary">
            {pulse.latestCefr} → {pulse.nextCefrTarget}
          </span>
        </div>
        <div className="flex items-start gap-1.5 min-w-0">
          <Target className="w-3.5 h-3.5 mt-0.5 text-ink-muted shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-primary truncate">
              {pulse.primaryFocusLabel}
            </div>
            <p className="text-[11px] text-ink-muted line-clamp-2 leading-snug mt-0.5">
              {pulse.primaryFocusHint}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
