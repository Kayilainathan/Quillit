import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
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
import { useSlidingInkIndicator } from './write-addons/useSlidingInkIndicator';

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

/**
 * Refined Editorial Craft Rule Shelf.
 * Clean gliding hairline tabs, open monograph index layout (zero thick left bars
 * or heavy nested boxes), live unboxed adherence previews, and one-click clear.
 */
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
  const [rollSpin, setRollSpin] = useState(0);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabInk = useSlidingInkIndicator(tabListRef, `${tab}-${mode}`);

  const hasDraftWords =
    draftText.trim().split(/\s+/).filter(Boolean).length >= 5;

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

  const shortMode = modeLabel.split(' ')[0];

  return (
    <div
      data-testid="constraint-picker-drawer"
      className="pt-3 border-t border-border-subtle/80 space-y-2.5"
    >
      {/* Unified Single-Row Category Ribbon + Roll, Clear & Close */}
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle/75">
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Craft rule category"
          className="relative flex items-center gap-0.5 sm:gap-1.5 overflow-x-auto scrollbar-none scroll-smooth-touch min-w-0"
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
                className={`relative px-2 pb-2 pt-0.5 text-[11px] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isSelected
                    ? 'text-ink-primary font-semibold'
                    : 'text-ink-muted hover:text-ink-secondary font-medium'
                }`}
              >
                {t === 'Recommended'
                  ? `For ${shortMode}`
                  : t === 'All'
                    ? `All (${CONSTRAINT_CHALLENGES.length})`
                    : t}
              </button>
            );
          })}

          <span
            aria-hidden="true"
            className="ink-glide-underline pointer-events-none absolute left-0 bottom-0 h-[1.5px] w-[100px] origin-left rounded-full bg-ink-primary"
            style={{
              opacity: tabInk.ready ? 1 : 0,
              transform: `translate3d(${tabInk.left + 4}px, 0, 0) scaleX(${Math.max(
                0,
                (tabInk.width - 8) / 100
              )})`,
            }}
          />
        </div>

        <div className="flex items-center gap-1 pb-1.5 shrink-0">
          {activeConstraint && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className="px-2 py-1 rounded-sm text-[11px] font-medium text-ink-muted hover:text-ink-primary transition-colors cursor-pointer whitespace-nowrap"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            data-testid="constraint-roll-btn"
            onClick={() => {
              setRollSpin((n) => n + 1);
              onRollRandom();
              onClose();
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface/80 transition-colors cursor-pointer whitespace-nowrap"
            title={`Pick a random craft rule for ${modeLabel}`}
          >
            <Shuffle
              className="w-3 h-3 transition-transform duration-200"
              style={{ transform: `rotate(${rollSpin * 180}deg)` }}
              aria-hidden="true"
            />
            <span>Roll</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close craft rule shelf"
            className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Open Editorial 2-Column Index (Clean Surface Contrast, Zero Thick Left Bars) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 max-h-52 overflow-y-auto scroll-smooth-touch pr-0.5">
        {visibleChallenges.map((ch, idx) => {
          const isSelected = activeConstraint?.id === ch.id;
          const preview = livePreviews?.[ch.id];
          const indexNum = String(idx + 1).padStart(2, '0');
          return (
            <button
              key={ch.id}
              type="button"
              data-testid={`constraint-option-${ch.id}`}
              data-active={isSelected ? 'true' : 'false'}
              title={ch.rule}
              onClick={() => {
                onSelect(isSelected ? null : ch);
                if (!isSelected) {
                  onClose();
                }
              }}
              className={`group text-left py-2 px-2.5 rounded-md transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-surface border border-border-strong/70 text-ink-primary'
                  : 'border border-transparent hover:bg-surface/75 text-ink-secondary'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className={`font-mono-tabular text-[10px] shrink-0 ${
                      isSelected ? 'text-ink-primary' : 'text-ink-muted/70'
                    }`}
                  >
                    {isSelected ? (
                      <Check
                        className="w-3 h-3 text-ink-primary stroke-[2.5]"
                        aria-hidden="true"
                      />
                    ) : (
                      indexNum
                    )}
                  </span>
                  <span
                    className={`text-[12px] truncate ${
                      isSelected
                        ? 'font-semibold text-ink-primary'
                        : 'font-medium text-ink-primary/90 group-hover:text-ink-primary'
                    }`}
                  >
                    {ch.shortLabel}
                  </span>
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
              <p className="mt-0.5 pl-5 text-[11px] text-ink-muted leading-snug truncate">
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

/**
 * Refined Editorial Proofreader Margin Rail for an active Craft Rule.
 * Single-line hairline adherence bar + unboxed underlined click-to-locate citations.
 */
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
  const [showSpans, setShowSpans] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const progressRatio = Math.max(0, Math.min(1, result.adherenceScore / 100));

  const activeHintMatch =
    !result.passed && result.matches.length > 0
      ? result.matches[hoveredIdx ?? 0] ?? result.matches[0]
      : null;

  return (
    <div
      data-testid="live-constraint-rail"
      className="drawer-reveal pt-2.5 border-t border-border-subtle/75 space-y-1.5"
    >
      {/* Primary Proofreader Strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {result.passed ? (
            <CheckCircle2
              className="w-3.5 h-3.5 text-status-success shrink-0"
              aria-hidden="true"
            />
          ) : (
            <Crosshair
              className="w-3.5 h-3.5 text-status-warning shrink-0"
              aria-hidden="true"
            />
          )}
          <span className="text-xs font-semibold text-ink-primary truncate">
            {constraint.shortLabel}
          </span>
          <span className="hidden sm:inline text-ink-muted/50" aria-hidden="true">
            ·
          </span>
          <span
            className="hidden sm:inline text-[11px] text-ink-muted truncate max-w-[320px]"
            title={constraint.rule}
          >
            {wordCount === 0 ? constraint.rule : result.details}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Hairline Adherence Gauge + Tabular Score */}
          <div className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="hidden sm:inline-block w-14 h-[2px] rounded-full bg-border-subtle overflow-hidden"
            >
              <span
                className={`block h-full w-full origin-left transition-transform duration-200 ease-out ${
                  result.passed ? 'bg-status-success' : 'bg-status-warning'
                }`}
                style={{ transform: `scaleX(${progressRatio})` }}
              />
            </span>
            <span
              data-testid="live-constraint-status"
              className={`text-[11px] font-mono-tabular font-medium ${
                result.passed ? 'text-status-success' : 'text-status-warning'
              }`}
            >
              {result.passed
                ? `${result.adherenceScore}% clean`
                : `${result.adherenceScore}% · ${result.violationCount} ${
                    result.violationCount === 1 ? 'flag' : 'flags'
                  }`}
            </span>
          </div>

          {!result.passed && result.matches.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSpans((v) => !v)}
              className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
            >
              {showSpans ? 'Hide' : 'Locate'}
            </button>
          )}

          <div className="inline-flex items-center gap-0.5 pl-1.5 border-l border-border-subtle/80">
            <button
              type="button"
              onClick={onShuffle}
              aria-label="Try another craft rule"
              title="Roll another rule"
              className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
            >
              <Shuffle className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenPicker}
              aria-label="Change craft rule"
              title="Change craft rule"
              className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
            >
              <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label="Remove active craft rule"
              title="Remove rule"
              className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile-only concise rule hint */}
      <p className="sm:hidden text-[11px] text-ink-muted leading-snug">
        {wordCount === 0 ? constraint.rule : result.details}
      </p>

      {/* Editorial Underlined Margin Citations (Zero Boxed Chips) */}
      {!result.passed && showSpans && result.matches.length > 0 && (
        <div className="drawer-reveal flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pl-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[10px] font-mono-tabular text-ink-muted">
              Locate:
            </span>
            {result.matches.slice(0, 6).map((match, idx) => (
              <React.Fragment key={`${match.start}-${match.end}-${idx}`}>
                <button
                  type="button"
                  data-testid={`constraint-violation-${idx}`}
                  disabled={!canLocateInEditor}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onFocus={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => onLocateSpan(match.start, match.end)}
                  title={`${match.fixHint}${
                    canLocateInEditor ? ' (click to highlight in draft)' : ''
                  }`}
                  className="text-[11px] font-mono-tabular text-ink-primary border-b border-dashed border-status-warning/80 hover:border-solid hover:border-ink-primary pb-[1px] transition-colors cursor-pointer disabled:cursor-default max-w-[200px] truncate"
                >
                  “{match.excerpt}”
                </button>
                {idx < Math.min(result.matches.length, 6) - 1 && (
                  <span
                    className="text-[10px] text-ink-muted/45 select-none"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>

          {activeHintMatch?.fixHint && (
            <span className="text-[11px] text-ink-muted truncate max-w-full sm:max-w-[320px]">
              {activeHintMatch.fixHint}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
