import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  getInkWellCaption,
  type DailyInkProgress,
} from '../utils/inkGoal';

interface InkDropGoalWellProps {
  progress: DailyInkProgress;
}

/**
 * Compact, whisper-quiet pen-and-paper daily ink ribbon integrated cleanly
 * below the manuscript. Features a delicate fountain nib that releases a
 * micro ink bead & ripple as words flow, paired with a razor-slim liquid
 * ink meniscus channel that fills smoothly to the daily word goal.
 */
export function InkDropGoalWell({ progress }: InkDropGoalWellProps) {
  const { totalWordsToday, goalWords, percentage, ratio, reached } = progress;
  const [dropCycle, setDropCycle] = useState(0);
  const lastWordCountRef = useRef<number>(totalWordsToday);
  const lastDropAtRef = useRef<number>(0);

  useEffect(() => {
    const prev = lastWordCountRef.current;
    lastWordCountRef.current = totalWordsToday;
    if (totalWordsToday > prev) {
      const now = Date.now();
      if (now - lastDropAtRef.current >= 420) {
        lastDropAtRef.current = now;
        setDropCycle((c) => c + 1);
      }
    }
  }, [totalWordsToday]);

  function replayInkDrop() {
    lastDropAtRef.current = Date.now();
    setDropCycle((c) => c + 1);
  }

  const caption = getInkWellCaption(progress);
  const visualRatio = totalWordsToday === 0 ? 0 : Math.max(0.03, Math.min(1, ratio));

  return (
    <div
      data-testid="ink-drop-goal-well"
      data-ink-stage={progress.stage}
      data-ink-percent={percentage}
      role="progressbar"
      aria-label="Daily writing word goal ink ribbon"
      aria-valuemin={0}
      aria-valuemax={goalWords}
      aria-valuenow={Math.min(totalWordsToday, goalWords)}
      aria-valuetext={`${totalWordsToday} of ${goalWords} words today (${percentage}%)`}
      onClick={replayInkDrop}
      title="Daily ink level. Tap to ripple"
      className="group select-none cursor-pointer pt-1 pb-0.5 space-y-1.5"
    >
      {/* Compact single-line nib + whisper caption + tabular goal readout */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="relative w-4 h-5 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {reached ? (
              <span
                data-testid="ink-goal-reached-seal"
                className="ink-goal-seal w-3.5 h-3.5 rounded-full bg-status-success text-ink-inverse flex items-center justify-center"
              >
                <Check className="w-2.5 h-2.5 stroke-[2.75]" />
              </span>
            ) : (
              <svg
                viewBox="0 0 18 22"
                className="w-3.5 h-4.5 overflow-visible"
                fill="none"
              >
                {/* Delicate Fountain Nib */}
                <path
                  d="M9 1.5 L12.5 7.5 L10 12 L8 12 L5.5 7.5 Z"
                  fill="var(--bg-surface)"
                  stroke="var(--ink-secondary)"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <line
                  x1="9"
                  y1="7"
                  x2="9"
                  y2="11.5"
                  stroke="var(--ink-secondary)"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <circle cx="9" cy="6.6" r="0.85" fill="var(--ink-secondary)" />

                {/* Micro Ink Drop Bead + Hairline Ripple */}
                {dropCycle > 0 && (
                  <g key={dropCycle}>
                    <path
                      className="ink-drop-bead"
                      d="M9 11.5 C9 11.5 10.6 13.7 10.6 14.9 C10.6 15.8 9.9 16.5 9 16.5 C8.1 16.5 7.4 15.8 7.4 14.9 C7.4 13.7 9 11.5 9 11.5 Z"
                      fill="var(--accent)"
                    />
                    <ellipse
                      className="ink-drop-ripple"
                      cx="9"
                      cy="19.5"
                      rx="3.4"
                      ry="1"
                      stroke="var(--accent)"
                      strokeWidth="1"
                      fill="none"
                    />
                  </g>
                )}
              </svg>
            )}
          </div>

          <span
            data-testid="ink-well-caption"
            className={`text-[11px] truncate transition-colors ${
              reached
                ? 'font-medium text-status-success'
                : 'text-ink-muted group-hover:text-ink-secondary'
            }`}
          >
            {caption}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono-tabular">
          <span
            data-testid="ink-well-counter"
            className={
              reached
                ? 'font-semibold text-status-success'
                : 'font-medium text-ink-secondary'
            }
          >
            {totalWordsToday}/{goalWords}
          </span>
          <span className="text-ink-muted/60">·</span>
          <span
            className={
              reached ? 'font-semibold text-status-success' : 'text-ink-muted'
            }
          >
            {percentage}%
          </span>
        </div>
      </div>

      {/* Razor-Slim Organic Ink Trough with Drifting Meniscus */}
      <div
        aria-hidden="true"
        className="relative h-[5px] w-full rounded-full bg-border-subtle/75 overflow-hidden"
      >
        <div
          className="relative h-full rounded-full origin-left transition-all duration-500 ease-out overflow-hidden"
          style={{
            width: `${visualRatio * 100}%`,
            backgroundColor: reached ? 'var(--status-success)' : 'var(--accent)',
          }}
        >
          {/* Subtle organic ink shimmer along the top surface */}
          <svg
            viewBox="0 0 240 6"
            preserveAspectRatio="none"
            className="absolute inset-0 w-[200%] h-full ink-well-meniscus-track opacity-45"
          >
            <path
              d="M0 2.5 Q 15 0.5, 30 2.5 T 60 2.5 T 90 2.5 T 120 2.5 T 150 2.5 T 180 2.5 T 210 2.5 T 240 2.5 L 240 6 L 0 6 Z"
              fill="var(--ink-inverse)"
              fillOpacity="0.22"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
