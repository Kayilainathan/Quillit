import React, { useEffect } from 'react';
import { Check, Eraser, Pause, RotateCcw, Timer, X } from 'lucide-react';
import {
  computeCountdownProgress,
  formatRemainingSeconds,
  type PostEvalClearState,
} from '../utils/postEvalClear';

interface PostEvalClearPopupProps {
  state: PostEvalClearState;
  onClearNow: () => void;
  onKeep: () => void;
  onRestore: () => void;
  onToggleAutoClear: () => void;
  onPauseChange: (paused: boolean) => void;
  onDismissUndo: () => void;
}

const RING_RADIUS = 13;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const PostEvalClearPopup: React.FC<PostEvalClearPopupProps> = ({
  state,
  onClearNow,
  onKeep,
  onRestore,
  onToggleAutoClear,
  onPauseChange,
  onDismissUndo,
}) => {
  const isVisible = state.phase !== 'idle';
  const mountedAtRef = React.useRef<number>(0);

  useEffect(() => {
    if (isVisible) {
      mountedAtRef.current = Date.now();
    }
  }, [isVisible, state.phase]);

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (state.phase === 'countdown') {
          onKeep();
        } else {
          onDismissUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, state.phase, onKeep, onDismissUndo]);

  if (!isVisible) return null;

  const isEditor = state.surfaceLabel === 'editor';
  const progress = computeCountdownProgress(state);
  const secondsLeft = formatRemainingSeconds(
    state.phase === 'countdown' ? state.remainingMs : state.undoRemainingMs
  );
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`post-eval-clear-${state.surfaceLabel}`}
      data-phase={state.phase}
      onPointerMove={() => {
        if (!state.paused && Date.now() - mountedAtRef.current > 240) {
          onPauseChange(true);
        }
      }}
      onPointerLeave={() => {
        if (state.paused) {
          onPauseChange(false);
        }
      }}
      onFocusCapture={() => onPauseChange(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onPauseChange(false);
        }
      }}
      className="fixed z-40 mobile-floating-clearance left-3 right-3 sm:left-auto sm:right-5 sm:w-[392px] post-eval-popup-enter"
    >
      <div className="relative overflow-hidden rounded-xl border border-border-default bg-elevated shadow-lg">
        {state.phase === 'countdown' ? (
          <div className="p-3.5 sm:p-4 space-y-3">
            <div className="flex items-start gap-3">
              {/* Animated Circular 3s Countdown Dial */}
              <div
                className="relative w-8 h-8 shrink-0 flex items-center justify-center text-ink-primary mt-0.5"
                aria-hidden="true"
              >
                {state.autoClearEnabled ? (
                  <>
                    <svg
                      className="w-8 h-8 -rotate-90"
                      viewBox="0 0 32 32"
                      fill="none"
                    >
                      <circle
                        cx="16"
                        cy="16"
                        r={RING_RADIUS}
                        stroke="var(--border-default)"
                        strokeWidth="2.2"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r={RING_RADIUS}
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-[stroke-dashoffset] duration-100 ease-linear"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-mono-tabular text-[11px] font-semibold">
                      {state.paused ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        `${secondsLeft}`
                      )}
                    </span>
                  </>
                ) : (
                  <span className="w-8 h-8 rounded-full border border-border-default bg-subtle flex items-center justify-center">
                    <Eraser className="w-3.5 h-3.5 text-ink-primary" />
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink-primary leading-snug">
                    {isEditor
                      ? 'Evaluation saved · Clear editor?'
                      : 'Benchmark saved · Reset chat?'}
                  </p>
                  <button
                    type="button"
                    onClick={onKeep}
                    aria-label="Keep current workspace"
                    className="btn-ghost p-1 -mr-1 -mt-1 text-ink-muted hover:text-ink-primary shrink-0"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <p className="text-[11px] text-ink-secondary leading-relaxed">
                  {state.autoClearEnabled ? (
                    state.paused ? (
                      <>
                        Timer paused · Report stays open while{' '}
                        {isEditor ? 'a fresh page opens' : 'the thread resets'}.
                      </>
                    ) : (
                      <>
                        Clearing {isEditor ? 'editor' : 'chat'} in{' '}
                        <span className="font-mono-tabular font-semibold text-ink-primary">
                          {secondsLeft}s
                        </span>{' '}
                        · Your report stays open.
                      </>
                    )
                  ) : (
                    <>
                      Your report stays open while{' '}
                      {isEditor ? 'you start a fresh page' : 'the chat resets'}.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                data-testid="post-eval-autoclear-toggle"
                onClick={onToggleAutoClear}
                aria-pressed={state.autoClearEnabled}
                title="Toggle automatic 3-second clear countdown after evaluations"
                className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-primary transition-colors cursor-pointer py-1"
              >
                <Timer className="w-3 h-3" aria-hidden="true" />
                <span className="font-mono-tabular">
                  {state.autoClearEnabled ? 'Auto 3s: On' : 'Auto 3s: Off'}
                </span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="post-eval-keep-btn"
                  onClick={onKeep}
                  className="btn-secondary px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  {isEditor ? 'Keep Draft' : 'Keep Chat'}
                </button>
                <button
                  type="button"
                  data-testid="post-eval-clear-now-btn"
                  onClick={onClearNow}
                  className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <Eraser className="w-3 h-3" aria-hidden="true" />
                  <span>Clear Now</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="w-7 h-7 rounded-full border border-border-default bg-subtle flex items-center justify-center shrink-0 text-status-success"
              >
                <Check className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-primary truncate">
                  {isEditor ? 'Fresh page ready' : 'Fresh chat ready'}
                </p>
                <p className="text-[11px] text-ink-muted truncate">
                  Saved in Ledger · Report kept open
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="post-eval-restore-btn"
                onClick={onRestore}
                className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>{isEditor ? 'Restore' : 'Restore Chat'}</span>
              </button>
              <button
                type="button"
                onClick={onDismissUndo}
                aria-label="Dismiss notification"
                className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Compositor-Only Countdown Progress Sweep */}
        {(state.phase === 'cleared-undo' || state.autoClearEnabled) && (
          <div
            aria-hidden="true"
            className="h-[2px] w-full bg-border-subtle overflow-hidden"
          >
            <div
              className="h-full w-full bg-ink-primary origin-left transition-transform duration-100 ease-linear"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
