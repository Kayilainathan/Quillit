import React, { useEffect, useState } from 'react';
import { ArrowRight, Compass, History, X } from 'lucide-react';
import type { DailyPracticeSuggestion } from '../utils/dailyPracticeCoach';

interface DailyPracticeSuggestionPopupProps {
  suggestion: DailyPracticeSuggestion | null;
  todayISO: string;
  suppressed?: boolean;
  onAccept: (suggestion: DailyPracticeSuggestion) => void;
}

function getDismissKey(todayISO: string, suggestionId: string): string {
  return `quillit_daily_suggestion_dismissed_${todayISO}_${suggestionId}`;
}

export const DailyPracticeSuggestionPopup: React.FC<
  DailyPracticeSuggestionPopupProps
> = ({ suggestion, todayISO, suppressed = false, onAccept }) => {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!suggestion) return;
    try {
      const stored = localStorage.getItem(
        getDismissKey(todayISO, suggestion.id)
      );
      setDismissed(stored === '1');
    } catch {
      setDismissed(false);
    }
  }, [todayISO, suggestion?.id]);

  if (
    !suggestion ||
    suppressed ||
    dismissed ||
    suggestion.alreadyCompletedToday
  ) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(getDismissKey(todayISO, suggestion.id), '1');
    } catch {
      // ignore storage errors
    }
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="daily-practice-suggestion-popup"
      className="post-eval-popup-enter mobile-floating-clearance fixed right-3 sm:right-4 left-3 sm:left-auto z-30 sm:w-[304px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border-default/90 popup-glass-surface shadow-lg p-3.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono-tabular uppercase tracking-[0.06em] text-ink-muted">
            {suggestion.actionType === 'time-capsule' ? (
              <History className="w-3 h-3 text-ink-primary" aria-hidden="true" />
            ) : (
              <Compass className="w-3 h-3 text-ink-primary" aria-hidden="true" />
            )}
            <span>{suggestion.cadenceLabel}</span>
          </div>
          <h3 className="text-xs font-semibold text-ink-primary leading-snug">
            {suggestion.headline}
          </h3>
          <p className="text-[11px] text-ink-secondary leading-relaxed">
            {suggestion.rationale}
          </p>
        </div>

        <button
          type="button"
          data-testid="daily-suggestion-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss today's practice suggestion"
          className="btn-ghost p-1 text-ink-muted hover:text-ink-primary shrink-0 -mt-0.5 -mr-1"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 pt-2 border-t border-border-subtle flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
        >
          Later
        </button>
        <button
          type="button"
          data-testid="daily-suggestion-accept"
          onClick={() => {
            handleDismiss();
            onAccept(suggestion);
          }}
          className="btn-primary inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
        >
          <span>{suggestion.ctaLabel}</span>
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};
