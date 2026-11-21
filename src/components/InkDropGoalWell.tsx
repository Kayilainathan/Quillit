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
 * Tactile pen-and-paper "ink-drop" well integrated along the bottom edge
 * of the writing sheet. Slowly fills with organic liquid ink as the writer
 * progresses toward their daily word count goal, dripping crisp ink beads
 * and concentric ripples on writing momentum.
 */
export function InkDropGoalWell({ progress }: InkDropGoalWellProps) {
  const { totalWordsToday, goalWords, percentage, ratio, reached } = progress;
  const [dropCycle, setDropCycle] = useState(0);
  const lastWordCountRef = useRef<number>(totalWordsToday);
  const lastDropAtRef = useRef<number>(0);

  // Trigger a crisp ink-drop animation when word count grows (throttled gently for calm rhythm)
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

  // Keep a hairline meniscus visible once the first word is written so 1-3% still feels alive
  const visualFillPct =
    totalWordsToday === 0 ? 0 : Math.max(8, Math.min(100, Math.round(ratio * 100)));

  const caption = getInkWellCaption(progress);

  return (
    <div
      data-testid="ink-drop-goal-well"
      data-ink-stage={progress.stage}
      data-ink-percent={percentage}
      role="progressbar"
      aria-label="Daily writing word goal ink well"
      aria-valuemin={0}
      aria-valuemax={goalWords}
      aria-valuenow={Math.min(totalWordsToday, goalWords)}
      aria-valuetext={`${totalWordsToday} of ${goalWords} words today (${percentage}%)`}
      onClick={replayInkDrop}
      title="Tap to ripple the ink well"
      className="group relative h-12 rounded-md border border-border-subtle bg-subtle/40 overflow-hidden select-none cursor-pointer transition-colors hover:border-border-default"
    >
      {/* Rising Organic Ink Liquid Layer */}
      <div
        aria-hidden="true"
        className="ink-well-fill pointer-events-none absolute inset-0"
        style={{
          transform: `translateY(${100 - visualFillPct}%)`,
        }}
      >
        {/* Subtle Drifting Ink Meniscus Wave Crest */}
        <svg
          viewBox="0 0 400 14"
          preserveAspectRatio="none"
          className="absolute -top-[8px] left-0 w-[200%] h-[10px] ink-well-meniscus-track"
        >
          <path
            d="M0 7 Q 25 2, 50 7 T 100 7 T 150 7 T 200 7 T 250 7 T 300 7 T 350 7 T 400 7 L 400 14 L 0 14 Z"
            fill={reached ? 'var(--status-success)' : 'var(--accent)'}
            fillOpacity={reached ? 0.24 : 0.19}
          />
          <path
            d="M0 7 Q 25 2, 50 7 T 100 7 T 150 7 T 200 7 T 250 7 T 300 7 T 350 7 T 400 7"
            fill="none"
            stroke={reached ? 'var(--status-success)' : 'var(--accent)'}
            strokeOpacity={reached ? 0.52 : 0.4}
            strokeWidth="1.25"
          />
        </svg>

        {/* Deep Ink Pool Body */}
        <div
          className="w-full h-full transition-colors duration-500"
          style={{
            backgroundColor: reached ? 'var(--status-success)' : 'var(--accent)',
            opacity: reached ? 0.18 : 0.14,
          }}
        />
      </div>

      {/* Bottom Hairline Ink Fill Track for crisp horizontal legibility */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-border-subtle/60"
      >
        <div
          className="h-full origin-left transition-transform duration-500 ease-out"
          style={{
            transform: `scaleX(${ratio})`,
            backgroundColor: reached ? 'var(--status-success)' : 'var(--accent)',
          }}
        />
      </div>

      {/* Foreground Pen-and-Paper Well Details */}
      <div className="relative z-10 h-full px-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Fountain Pen Nib + Animated Ink Drop Bead & Ripple */}
          <div
            className="relative w-6 h-8 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {reached ? (
              <span
                data-testid="ink-goal-reached-seal"
                className="ink-goal-seal w-5 h-5 rounded-full bg-status-success text-ink-inverse flex items-center justify-center shadow-xs"
              >
                <Check className="w-3 h-3 stroke-[2.5]" />
              </span>
            ) : (
              <svg
                viewBox="0 0 24 30"
                className="w-5 h-7 overflow-visible"
                fill="none"
              >
                {/* Minimal Fountain Nib */}
                <path
                  d="M12 2 L16.5 9.5 L13.2 15.5 L10.8 15.5 L7.5 9.5 Z"
                  fill="var(--bg-surface)"
                  stroke="var(--ink-primary)"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                />
                <line
                  x1="12"
                  y1="9"
                  x2="12"
                  y2="15"
                  stroke="var(--ink-primary)"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="8.5" r="1.1" fill="var(--ink-primary)" />

                {/* Falling Ink Drop + Surface Ripple (keyed by dropCycle so each drop replays cleanly) */}
                {dropCycle > 0 && (
                  <g key={dropCycle}>
                    <path
                      className="ink-drop-bead"
                      d="M12 14.5 C12 14.5 14.3 17.5 14.3 19.1 C14.3 20.4 13.3 21.4 12 21.4 C10.7 21.4 9.7 20.4 9.7 19.1 C9.7 17.5 12 14.5 12 14.5 Z"
                      fill="var(--accent)"
                    />
                    <ellipse
                      className="ink-drop-ripple"
                      cx="12"
                      cy="26"
                      rx="4.2"
                      ry="1.4"
                      stroke="var(--accent)"
                      strokeWidth="1.1"
                      fill="none"
                    />
                  </g>
                )}
              </svg>
            )}
          </div>

          <span
            data-testid="ink-well-caption"
            className={`text-xs truncate transition-colors ${
              reached
                ? 'font-medium text-status-success'
                : 'text-ink-secondary group-hover:text-ink-primary'
            }`}
          >
            {caption}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono-tabular">
          <span
            data-testid="ink-well-counter"
            className={reached ? 'font-semibold text-status-success' : 'text-ink-primary font-medium'}
          >
            {totalWordsToday} / {goalWords}
          </span>
          <span className="text-ink-muted">·</span>
          <span
            className={reached ? 'font-semibold text-status-success' : 'text-ink-muted'}
          >
            {percentage}%
          </span>
        </div>
      </div>
    </div>
  );
}
