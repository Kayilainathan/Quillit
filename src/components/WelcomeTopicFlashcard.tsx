import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Sparkles, X } from 'lucide-react';

interface WelcomeTopicFlashcardProps {
  open: boolean;
  monthLabel: string;
  rhythmShortList: string;
  busy: boolean;
  onAccept: () => Promise<void>;
  onDismiss: () => void;
}

export function WelcomeTopicFlashcard({
  open,
  monthLabel,
  rhythmShortList,
  busy,
  onAccept,
  onDismiss,
}: WelcomeTopicFlashcardProps) {
  const [inkReady, setInkReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setInkReady(false);
      return;
    }
    const t = window.setTimeout(() => setInkReady(true), 140);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onDismiss();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, busy, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-topic-flashcard-title"
      data-testid="welcome-topic-flashcard"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onDismiss();
        }
      }}
    >
      <div
        className={`modal-panel w-full max-w-[440px] overflow-hidden ${
          inkReady ? 'ink-active' : ''
        }`}
      >
        {/* Ruled Stationery Band with Animated Fountain Pen Writing Stroke */}
        <div className="stationery-band relative px-6 pt-5 pb-5 border-b border-border-subtle bg-subtle/50 select-none">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium text-ink-muted">
              <Sparkles className="w-3.5 h-3.5 text-ink-primary" aria-hidden="true" />
              <span>Welcome to Quillit</span>
              <span aria-hidden="true">·</span>
              <span>{monthLabel}</span>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              aria-label="Dismiss welcome topic prompt"
              className="btn-ghost p-1.5 -mr-1.5 -mt-1 shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Aesthetic Animated Fountain Pen Writing Script */}
          <div className="mt-5 flex justify-center" aria-hidden="true">
            <svg
              viewBox="0 0 260 58"
              className="w-64 h-14 overflow-visible"
              fill="none"
            >
              {/* Soft guide line */}
              <path
                d="M 18 40 C 56 32, 82 44, 124 36 C 156 30, 184 41, 218 35"
                stroke="var(--border-strong)"
                strokeWidth="1.15"
                strokeDasharray="3 4"
                strokeLinecap="round"
                opacity="0.7"
              />
              {/* Animated calligraphic ink ribbon */}
              <path
                className="welcome-ink-path"
                d="M 18 40 C 56 32, 82 44, 124 36 C 156 30, 184 41, 218 35"
                stroke="var(--ink-primary)"
                strokeWidth="2.1"
                strokeLinecap="round"
              />
              {/* Second delicate flourish */}
              <path
                className="welcome-ink-subpath"
                d="M 38 48 C 76 45, 114 48, 162 45"
                stroke="var(--status-warning)"
                strokeWidth="1.25"
                strokeLinecap="round"
                opacity="0.85"
              />
              {/* Animated Sculpted Nib Gliding Across Paper */}
              <g className="welcome-pen-nib">
                <path
                  d="M 218 34 L 224 19 L 236 7 L 243 14 L 231 26 L 218 34 Z"
                  fill="var(--bg-surface)"
                  stroke="var(--ink-primary)"
                  strokeWidth="1.45"
                  strokeLinejoin="round"
                />
                <line
                  x1="218"
                  y1="34"
                  x2="229"
                  y2="23"
                  stroke="var(--ink-primary)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <circle cx="229.5" cy="22.5" r="1.6" fill="var(--status-warning)" />
              </g>
            </svg>
          </div>
        </div>

        {/* Clean Editorial Flashcard Copy & Actions */}
        <div className="p-6 sm:p-7 space-y-5">
          <div className="space-y-2">
            <h2
              id="welcome-topic-flashcard-title"
              className="font-display text-2xl font-medium tracking-tight text-ink-primary leading-snug text-balance"
            >
              Let AI craft your first writing topic?
            </h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              We can prepare a tailored first prompt right inside your Write desk and fill the remaining writing days of {monthLabel} with non-repeating topics.
            </p>
          </div>

          <div className="pt-3 border-t border-border-subtle flex items-center gap-2.5 text-xs text-ink-muted">
            <CalendarDays className="w-3.5 h-3.5 text-ink-secondary shrink-0" aria-hidden="true" />
            <span>
              Schedules today and upcoming {rhythmShortList} dates only. Past dates stay untouched.
            </span>
          </div>

          <div className="pt-1 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              data-testid="welcome-flashcard-accept"
              onClick={() => void onAccept()}
              className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {busy
                  ? 'Drafting your first topic & schedule...'
                  : 'Yes, Suggest Topic & Fill Month'}
              </span>
              {!busy && (
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              )}
            </button>

            <button
              type="button"
              disabled={busy}
              data-testid="welcome-flashcard-dismiss"
              onClick={onDismiss}
              className="btn-ghost w-full px-4 py-2 text-xs font-medium whitespace-nowrap"
            >
              Not now, I will pick my own topic
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
