import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Plus, SlidersHorizontal, X } from 'lucide-react';
import {
  clampDailyWordGoal,
  DAILY_WORD_GOAL_PRESETS,
  getInkWellCaption,
  type DailyInkProgress,
} from '../utils/inkGoal';

interface InkDropGoalWellProps {
  progress: DailyInkProgress;
  onChangeDailyWordGoal?: (nextGoal: number) => void;
}

const QUARTER_TICKS = [0.25, 0.5, 0.75] as const;

/**
 * Redesigned Editorial Daily Goal Folio Gauge.
 * Combines a circular ink-ring dial, split-source (saved today + live on desk)
 * architectural ruler bar with 25/50/75% checkpoints, bonus word readout, and
 * an unobtrusive inline target adjuster right on the writing desk.
 */
export function InkDropGoalWell({
  progress,
  onChangeDailyWordGoal,
}: InkDropGoalWellProps) {
  const {
    savedWordsToday,
    activeDraftWords,
    totalWordsToday,
    goalWords,
    percentage,
    ratio,
    savedRatio,
    bonusWords,
    reached,
    stage,
  } = progress;

  const [adjusterOpen, setAdjusterOpen] = useState(false);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const prevReachedRef = useRef(reached);

  useEffect(() => {
    if (reached && !prevReachedRef.current) {
      setCelebrateTick((c) => c + 1);
    }
    prevReachedRef.current = reached;
  }, [reached]);

  const caption = getInkWellCaption(progress);
  const ringRadius = 11.5;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - Math.max(0, Math.min(1, ratio)));

  const handleSetGoal = (next: number) => {
    if (!onChangeDailyWordGoal) return;
    const clamped = clampDailyWordGoal(next);
    onChangeDailyWordGoal(clamped);
  };

  const hasSplitSources = savedWordsToday > 0 && activeDraftWords > 0;

  return (
    <section
      data-testid="ink-drop-goal-well"
      data-ink-stage={stage}
      data-ink-percent={percentage}
      aria-label="Daily writing word goal"
      className="pt-3 border-t border-border-subtle/80 space-y-2.5 select-none"
    >
      {/* Top Row: Engraved Ink Ring + Editorial Status + Tabular Counter & Target Tune */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Architectural Circular Progress Ring (28x28) */}
          <div
            className="relative w-7 h-7 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <svg viewBox="0 0 28 28" className="w-7 h-7 -rotate-90">
              <circle
                cx="14"
                cy="14"
                r={ringRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="text-border-default/80"
              />
              <circle
                cx="14"
                cy="14"
                r={ringRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className={`daily-folio-ring-arc ${
                  reached ? 'text-status-success' : 'text-ink-primary'
                }`}
              />
            </svg>
            {reached ? (
              <span
                data-testid="ink-goal-reached-seal"
                className="ink-goal-seal absolute inset-0 flex items-center justify-center text-status-success"
              >
                <Check className="w-3 h-3 stroke-[2.75]" />
              </span>
            ) : (
              <span className="absolute font-mono-tabular text-[8.5px] font-semibold text-ink-secondary">
                {percentage}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xs font-semibold text-ink-primary tracking-[-0.01em]">
                Daily Goal
              </span>
              <span className="text-ink-muted/45 text-[11px]" aria-hidden="true">
                ·
              </span>
              <span
                data-testid="ink-well-caption"
                className={`text-[11px] truncate ${
                  reached
                    ? 'font-medium text-status-success'
                    : 'text-ink-muted'
                }`}
              >
                {caption}
              </span>
            </div>

            {hasSplitSources && (
              <p className="text-[10px] font-mono-tabular text-ink-muted leading-tight mt-0.5">
                {savedWordsToday} saved earlier · {activeDraftWords} on desk
              </p>
            )}
          </div>
        </div>

        {/* Right: Crisp Tabular Ratio + Seamless Inline Target Adjuster Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-baseline gap-1 font-mono-tabular text-[11px]">
            <span
              data-testid="ink-well-counter"
              className={`font-semibold ${
                reached ? 'text-status-success' : 'text-ink-primary'
              }`}
            >
              {totalWordsToday}
            </span>
            <span className="text-ink-muted">/ {goalWords}w</span>
            {bonusWords > 0 && (
              <span className="text-[10px] font-medium text-status-success pl-0.5">
                (+{bonusWords})
              </span>
            )}
          </div>

          {onChangeDailyWordGoal && (
            <button
              type="button"
              data-testid="daily-goal-adjust-toggle"
              aria-expanded={adjusterOpen}
              aria-label={
                adjusterOpen
                  ? 'Close daily word target controls'
                  : 'Adjust daily word target'
              }
              onClick={() => setAdjusterOpen((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 min-h-[28px] rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${
                adjusterOpen
                  ? 'bg-subtle text-ink-primary'
                  : 'text-ink-muted hover:text-ink-primary hover:bg-subtle/70'
              }`}
            >
              {adjusterOpen ? (
                <>
                  <X className="w-3 h-3" aria-hidden="true" />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Target</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Split-Source Architectural Folio Track with Quarter-Folio Checkpoints */}
      <div
        role="progressbar"
        aria-label="Daily writing word goal progress"
        aria-valuemin={0}
        aria-valuemax={goalWords}
        aria-valuenow={Math.min(totalWordsToday, goalWords)}
        aria-valuetext={`${totalWordsToday} of ${goalWords} words today (${percentage}%)`}
        className="relative h-[5px] w-full rounded-full bg-border-subtle/80 overflow-hidden"
      >
        {/* Total progress fill (live draft + saved) */}
        <div
          className={`daily-folio-bar absolute inset-y-0 left-0 w-full rounded-full ${
            reached ? 'bg-status-success' : 'bg-ink-primary'
          }`}
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }}
        />

        {/* Banked saved-today underlay when both saved & live draft exist */}
        {hasSplitSources && !reached && (
          <div
            className="daily-folio-bar absolute inset-y-0 left-0 w-full rounded-full bg-ink-secondary/65"
            style={{
              transform: `scaleX(${Math.max(0, Math.min(1, savedRatio))})`,
            }}
          />
        )}

        {/* Restrained One-Shot Completion Sheen */}
        {reached && celebrateTick > 0 && (
          <span
            key={celebrateTick}
            aria-hidden="true"
            className="daily-goal-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-ink-inverse/45 to-transparent"
          />
        )}

        {/* Quarter-Folio Architectural Ruler Ticks (25%, 50%, 75%) */}
        {QUARTER_TICKS.map((tick) => (
          <span
            key={tick}
            aria-hidden="true"
            style={{ left: `${tick * 100}%` }}
            className="pointer-events-none absolute top-0 bottom-0 w-[1.5px] -translate-x-1/2 bg-surface/85"
          />
        ))}
      </div>

      {/* Inline Target Adjuster Drawer (Presets + ±50 Stepper) */}
      {adjusterOpen && onChangeDailyWordGoal && (
        <div
          data-testid="daily-goal-adjuster"
          className="drawer-reveal flex flex-wrap items-center justify-between gap-2 pt-1.5 text-[11px]"
        >
          <div
            role="group"
            aria-label="Daily word goal presets"
            className="flex flex-wrap items-center gap-1"
          >
            <span className="text-ink-muted mr-1">Daily target:</span>
            {DAILY_WORD_GOAL_PRESETS.map((preset) => {
              const isCurrent = goalWords === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  data-testid={`daily-goal-preset-${preset}`}
                  data-active={isCurrent ? 'true' : 'false'}
                  onClick={() => handleSetGoal(preset)}
                  className={`px-2.5 py-1 min-h-[30px] rounded-sm font-mono-tabular transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-accent text-ink-inverse font-semibold'
                      : 'bg-subtle/75 text-ink-secondary hover:text-ink-primary hover:bg-subtle'
                  }`}
                >
                  {preset}w
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              data-testid="daily-goal-decrease-btn"
              onClick={() => handleSetGoal(goalWords - 50)}
              disabled={goalWords <= 50}
              aria-label="Decrease daily word target by 50"
              className="btn-ghost p-1.5 min-w-[30px] min-h-[30px] inline-flex items-center justify-center border border-border-subtle disabled:opacity-40"
            >
              <Minus className="w-3 h-3" aria-hidden="true" />
            </button>
            <span className="font-mono-tabular text-ink-primary font-medium min-w-[46px] text-center">
              {goalWords}w
            </span>
            <button
              type="button"
              data-testid="daily-goal-increase-btn"
              onClick={() => handleSetGoal(goalWords + 50)}
              disabled={goalWords >= 2000}
              aria-label="Increase daily word target by 50"
              className="btn-ghost p-1.5 min-w-[30px] min-h-[30px] inline-flex items-center justify-center border border-border-subtle disabled:opacity-40"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
