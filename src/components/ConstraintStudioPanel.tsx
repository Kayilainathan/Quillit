import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Crosshair,
  Shuffle,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { WritingMode } from '../types';
import {
  CONSTRAINT_CHALLENGES,
  evaluateAllConstraintsPreview,
  getRecommendedConstraintsForMode,
  type ConstraintCategory,
  type ConstraintChallenge,
  type ConstraintCheckResult,
} from '../utils/constraintChallenges';

type PickerTab = 'Recommended' | 'All' | ConstraintCategory;

const PICKER_TABS: readonly PickerTab[] = [
  'Recommended',
  'All',
  'Anti-Filler',
  'Rhythm',
  'Precision',
  'Clarity',
];

interface ConstraintPickerDrawerProps {
  mode: WritingMode;
  modeLabel: string;
  draftText: string;
  activeConstraint: ConstraintChallenge | null;
  onSelect: (challenge: ConstraintChallenge | null) => void;
  onRollRandom: () => void;
  onClose: () => void;
}

export const ConstraintPickerDrawer: React.FC<ConstraintPickerDrawerProps> = ({
  mode,
  modeLabel,
  draftText,
  activeConstraint,
  onSelect,
  onRollRandom,
  onClose,
}) => {
  const [tab, setTab] = useState<PickerTab>('Recommended');
  const hasDraftWords = draftText.trim().split(/\s+/).filter(Boolean).length >= 5;

  const livePreviews = useMemo(
    () => (hasDraftWords ? evaluateAllConstraintsPreview(draftText) : null),
    [draftText, hasDraftWords]
  );

  const visibleChallenges = useMemo(() => {
    if (tab === 'Recommended') {
      return getRecommendedConstraintsForMode(mode);
    }
    if (tab === 'All') {
      return [...CONSTRAINT_CHALLENGES];
    }
    return CONSTRAINT_CHALLENGES.filter((c) => c.category === tab);
  }, [tab, mode]);

  return (
    <div
      data-testid="constraint-picker-drawer"
      className="drawer-reveal pt-3 border-t border-border-subtle space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-ink-primary">
            Constraint Studio
          </span>
          <span className="text-ink-muted" aria-hidden="true">
            ·
          </span>
          <span className="text-[11px] text-ink-muted">
            Live deterministic craft guardrails
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="constraint-roll-btn"
            onClick={onRollRandom}
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
            title={`Roll a recommended constraint for ${modeLabel}`}
          >
            <Shuffle className="w-3 h-3" aria-hidden="true" />
            <span>Roll for {modeLabel.split(' ')[0]}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close constraint studio"
            className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* QuillBot-style Category Segmented Filter Strip */}
      <div
        role="tablist"
        aria-label="Constraint category filter"
        className="segmented-track flex sm:inline-flex flex-nowrap sm:flex-wrap items-center gap-0.5 overflow-x-auto scrollbar-none scroll-smooth-touch w-full sm:w-auto"
      >
        {PICKER_TABS.map((t) => {
          const isSelected = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-active={isSelected ? 'true' : 'false'}
              onClick={() => setTab(t)}
              className="segmented-item px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
            >
              {t === 'Recommended'
                ? `For ${modeLabel.split(' ')[0]}`
                : t === 'All'
                  ? `All (${CONSTRAINT_CHALLENGES.length})`
                  : t}
            </button>
          );
        })}
      </div>

      {/* Curated 2-Column Rule Grid with Live Draft Previews */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto scroll-smooth-touch pr-0.5">
        {visibleChallenges.map((ch) => {
          const isSelected = activeConstraint?.id === ch.id;
          const preview = livePreviews?.[ch.id];
          return (
            <button
              key={ch.id}
              type="button"
              data-testid={`constraint-option-${ch.id}`}
              data-active={isSelected ? 'true' : 'false'}
              onClick={() => onSelect(isSelected ? null : ch)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-all cursor-pointer space-y-1 ${
                isSelected
                  ? 'border-ink-primary bg-subtle shadow-xs'
                  : 'border-border-subtle bg-surface hover:border-border-strong hover:bg-subtle/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-primary truncate">
                  {ch.shortLabel}
                </span>
                <span className="text-[10px] font-mono-tabular text-ink-muted shrink-0">
                  {preview ? (
                    preview.passed ? (
                      <span className="text-status-success font-medium">
                        Clean
                      </span>
                    ) : (
                      <span className="text-status-warning font-medium">
                        {preview.violationCount}{' '}
                        {preview.violationCount === 1 ? 'flag' : 'flags'}
                      </span>
                    )
                  ) : (
                    ch.category
                  )}
                </span>
              </div>
              <p className="text-[11px] text-ink-secondary leading-snug line-clamp-2">
                {ch.rule}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface LiveConstraintRailProps {
  constraint: ConstraintChallenge;
  result: ConstraintCheckResult;
  wordCount: number;
  canLocateInEditor: boolean;
  onLocateSpan: (start: number, end: number) => void;
  onOpenPicker: () => void;
  onShuffle: () => void;
  onClear: () => void;
}

export const LiveConstraintRail: React.FC<LiveConstraintRailProps> = ({
  constraint,
  result,
  wordCount,
  canLocateInEditor,
  onLocateSpan,
  onOpenPicker,
  onShuffle,
  onClear,
}) => {
  const [expanded, setExpanded] = useState(true);
  const progressRatio = Math.max(0, Math.min(1, result.adherenceScore / 100));

  return (
    <div
      data-testid="live-constraint-rail"
      className="drawer-reveal rounded-lg border border-border-default bg-subtle/40 px-3.5 py-2.5 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono-tabular text-ink-muted shrink-0">
            {constraint.category}
          </span>
          <span className="text-ink-muted" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-semibold text-ink-primary truncate">
            {constraint.shortLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            data-testid="live-constraint-status"
            className={`text-[11px] font-mono-tabular font-semibold ${
              result.passed ? 'text-status-success' : 'text-status-warning'
            }`}
          >
            {result.passed
              ? `${result.adherenceScore}% · Clean`
              : `${result.adherenceScore}% · ${result.violationCount} ${
                  result.violationCount === 1 ? 'flag' : 'flags'
                }`}
          </span>

          <button
            type="button"
            onClick={onShuffle}
            aria-label="Try another constraint"
            title="Switch to another mode-matched constraint"
            className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
          >
            <Shuffle className="w-3 h-3" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenPicker}
            aria-label="Open constraint studio"
            title="Change constraint rule"
            className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
          >
            <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onClear}
            aria-label="Remove active constraint"
            title="Remove constraint"
            className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Hairline Adherence Progress Bar */}
      <div
        aria-hidden="true"
        className="h-[3px] w-full rounded-full bg-border-subtle overflow-hidden"
      >
        <div
          className={`h-full w-full origin-left transition-transform duration-200 ease-out ${
            result.passed ? 'bg-ink-primary' : 'bg-status-warning'
          }`}
          style={{ transform: `scaleX(${progressRatio})` }}
        />
      </div>

      {/* Actionable Rule Guidance or Click-to-Locate Violations */}
      {result.passed ? (
        <div className="flex items-center justify-between gap-2 text-[11px] text-ink-secondary">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <CheckCircle2
              className="w-3.5 h-3.5 text-status-success shrink-0"
              aria-hidden="true"
            />
            <span className="truncate">
              {wordCount === 0
                ? constraint.rule
                : `${result.details} ${constraint.whyItMatters}`}
            </span>
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-ink-secondary">
            <span>{result.details}</span>
            {result.matches.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-link-tactile text-[11px] text-ink-primary font-medium shrink-0"
              >
                {expanded ? 'Hide spans' : `Inspect (${result.matches.length})`}
              </button>
            )}
          </div>

          {expanded && result.matches.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
              {result.matches.slice(0, 6).map((match, idx) => (
                <button
                  key={`${match.start}-${match.end}-${idx}`}
                  type="button"
                  data-testid={`constraint-violation-${idx}`}
                  disabled={!canLocateInEditor}
                  onClick={() => onLocateSpan(match.start, match.end)}
                  title={
                    canLocateInEditor
                      ? 'Click to highlight this exact spot in your draft'
                      : match.fixHint
                  }
                  className="text-left rounded-md border border-border-subtle bg-surface hover:border-border-strong px-2.5 py-1.5 transition-colors cursor-pointer disabled:cursor-default flex items-start gap-2"
                >
                  <Crosshair
                    className="w-3 h-3 text-status-warning shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-[11px] font-mono-tabular font-semibold text-ink-primary truncate">
                      {match.excerpt}
                    </span>
                    <span className="block text-[10px] text-ink-muted leading-snug">
                      {match.fixHint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
