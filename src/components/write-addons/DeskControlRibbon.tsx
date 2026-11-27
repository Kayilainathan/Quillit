import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  Feather,
  Focus,
  History,
  Lock,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  AudienceOption,
  DrillType,
  ToneSetting,
  WritingMode,
} from '../../types';
import { MODE_LABELS, TONE_LABELS } from '../../utils/analytics';
import { formatMobileStudioSummary } from '../../utils/mobileViewport';
import {
  countActiveDeskAddons,
  DRILL_DESK_META,
} from '../../utils/writeStudioAddons';
import type { TimeCapsuleStatus } from '../../utils/timeCapsule';
import type {
  ConstraintChallenge,
  ConstraintCheckResult,
} from '../../utils/constraintChallenges';
import { ConstraintPickerDrawer } from '../ConstraintStudioPanel';
import { useSlidingInkIndicator } from './useSlidingInkIndicator';

const AUDIENCE_OPTIONS: AudienceOption[] = [
  'Interviewer',
  'Hiring Manager',
  'Professor',
  'LinkedIn Reader',
  'Friend',
];

const COMPACT_MODE_LABELS: Record<WritingMode, string> = {
  journal: 'Journal',
  linkedin: 'LinkedIn',
  email: 'Email',
  friend: 'Friend',
  technical: 'Technical',
  creative: 'Creative',
};

const ALL_DRILL_IDS: DrillType[] = [
  'standard',
  'compression-432',
  'skeleton',
  'three-rooms',
  'time-capsule',
];

function DrillMark({
  id,
  active,
  locked = false,
}: {
  id: DrillType;
  active: boolean;
  locked?: boolean;
}) {
  const strokeClass = active
    ? 'text-ink-primary'
    : locked
      ? 'text-ink-muted/75'
      : 'text-ink-muted';

  if (id === 'standard') {
    return (
      <svg
        viewBox="0 0 16 16"
        className={`w-3.5 h-3.5 shrink-0 transition-colors ${strokeClass}`}
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3.2 2.75H10.6L12.8 5V13.25H3.2V2.75Z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          d="M5.4 6.75H10.6M5.4 9.5H9.2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (id === 'compression-432') {
    return (
      <svg
        viewBox="0 0 16 16"
        className={`w-3.5 h-3.5 shrink-0 transition-colors ${strokeClass}`}
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 4.25H13.5"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <path
          d="M3.8 8H12.2"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          opacity={active ? 0.85 : 0.75}
        />
        <path
          d="M5.5 11.75H10.5"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          opacity={active ? 0.7 : 0.55}
        />
      </svg>
    );
  }

  if (id === 'skeleton') {
    return (
      <svg
        viewBox="0 0 16 16"
        className={`w-3.5 h-3.5 shrink-0 transition-colors ${strokeClass}`}
        fill="none"
        aria-hidden="true"
      >
        <circle cx="3.5" cy="4.25" r="1" fill="currentColor" />
        <path
          d="M6.2 4.25H13"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="3.5" cy="8" r="1" fill="currentColor" />
        <path
          d="M6.2 8H11.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="3.5" cy="11.75" r="1" fill="currentColor" />
        <path
          d="M6.2 11.75H12.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (id === 'three-rooms') {
    return (
      <svg
        viewBox="0 0 16 16"
        className={`w-3.5 h-3.5 shrink-0 transition-colors ${strokeClass}`}
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="2.25"
          y="3"
          width="11.5"
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <path d="M8 3.2V12.8" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  if (locked) {
    return (
      <Lock
        className={`w-3 h-3 shrink-0 transition-colors ${strokeClass}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <History
      className={`w-3.5 h-3.5 shrink-0 transition-colors ${strokeClass}`}
      aria-hidden="true"
    />
  );
}

interface DeskControlRibbonProps {
  mode: WritingMode;
  audience: AudienceOption;
  tone: ToneSetting;
  activeDrill: DrillType;
  timeCapsuleStatus: TimeCapsuleStatus;
  activeConstraint: ConstraintChallenge | null;
  constraintResult: ConstraintCheckResult | null;
  showConstraintPicker: boolean;
  flowLockActive: boolean;
  flowSecondsLabel: string;
  mobileControlsOpen: boolean;
  draftText: string;
  onSelectMode: (mode: WritingMode) => void;
  onChangeAudience: (audience: AudienceOption) => void;
  onChangeTone: (tone: ToneSetting) => void;
  onSelectDrill: (drill: DrillType) => void;
  onLaunchTimeCapsule: () => void;
  onToggleConstraintPicker: () => void;
  onSelectConstraint: (challenge: ConstraintChallenge | null) => void;
  onRollConstraint: () => void;
  onCloseConstraintPicker: () => void;
  onToggleFlowSprint: () => void;
  sentenceFocusMode?: boolean;
  onToggleSentenceFocus?: () => void;
  onToggleMobileControls: () => void;
}

export const DeskControlRibbon: React.FC<DeskControlRibbonProps> = ({
  mode,
  audience,
  tone,
  activeDrill,
  timeCapsuleStatus,
  activeConstraint,
  constraintResult,
  showConstraintPicker,
  flowLockActive,
  flowSecondsLabel,
  mobileControlsOpen,
  draftText,
  onSelectMode,
  onChangeAudience,
  onChangeTone,
  onSelectDrill,
  onLaunchTimeCapsule,
  onToggleConstraintPicker,
  onSelectConstraint,
  onRollConstraint,
  onCloseConstraintPicker,
  onToggleFlowSprint,
  sentenceFocusMode = false,
  onToggleSentenceFocus,
  onToggleMobileControls,
}) => {
  const [styleTrayOpen, setStyleTrayOpen] = useState(false);
  const modeTabListRef = useRef<HTMLDivElement>(null);
  const drillTabListRef = useRef<HTMLDivElement>(null);

  const modeInk = useSlidingInkIndicator(
    modeTabListRef,
    `${mode}-${styleTrayOpen}-${mobileControlsOpen}`
  );
  const drillInk = useSlidingInkIndicator(
    drillTabListRef,
    `${activeDrill}-${timeCapsuleStatus.state}-${mobileControlsOpen}`
  );

  const activeAddonsCount = countActiveDeskAddons({
    activeDrill,
    hasConstraint: Boolean(activeConstraint),
    flowLockActive,
  });

  const isCapsuleLocked = timeCapsuleStatus.state === 'locked';

  return (
    <div className="border-b border-border-subtle bg-subtle/20">
      {/* Mobile Compact Editorial Summary Bar (< sm) */}
      <div className="sm:hidden flex items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xs font-medium text-ink-primary truncate">
            {formatMobileStudioSummary({
              modeLabel: COMPACT_MODE_LABELS[mode],
              toneLabel: TONE_LABELS[tone],
              drillLabel: DRILL_DESK_META[activeDrill].shortLabel,
              constraintShortLabel: activeConstraint?.shortLabel ?? null,
              flowLockActive,
            })}
          </span>
        </div>

        <button
          type="button"
          data-testid="mobile-studio-options-toggle"
          aria-expanded={mobileControlsOpen}
          onClick={onToggleMobileControls}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-md text-xs font-medium shrink-0 transition-colors cursor-pointer ${
            mobileControlsOpen
              ? 'bg-accent text-ink-inverse'
              : 'bg-surface border border-border-default text-ink-primary'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {mobileControlsOpen
              ? 'Done'
              : activeAddonsCount > 0
                ? `Desk · ${activeAddonsCount}`
                : 'Desk'}
          </span>
        </button>
      </div>

      {/* Minimal Single-Line Stationery Desk Bar (Always visible sm+, smooth reveal on mobile) */}
      <div
        className={`${
          mobileControlsOpen
            ? 'block drawer-reveal border-t border-border-subtle sm:border-t-0'
            : 'hidden sm:block'
        }`}
      >
        <div className="px-3.5 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 min-w-0">
          {/* Left: Gliding Stationery Practice Shelf (All 5 mechanics always visible, zero clipping) */}
          <div
            ref={drillTabListRef}
            role="tablist"
            aria-label="Practice mode"
            className="relative flex items-center gap-0.5 overflow-x-auto scrollbar-none scroll-smooth-touch min-w-0 py-0.5"
          >
            <span
              aria-hidden="true"
              className="ink-glide-foil pointer-events-none absolute left-0 top-0.5 bottom-0.5 rounded-md bg-surface border border-border-default shadow-xs"
              style={{
                opacity: drillInk.ready ? 1 : 0,
                width: `${drillInk.width}px`,
                transform: `translate3d(${drillInk.left}px, 0, 0)`,
              }}
            />

            {ALL_DRILL_IDS.map((drillId) => {
              const meta = DRILL_DESK_META[drillId];
              const isSelected = activeDrill === drillId;
              const lockedCapsule =
                drillId === 'time-capsule' && isCapsuleLocked;
              const ribbonLabel =
                drillId === 'compression-432'
                  ? '4/3/2'
                  : drillId === 'time-capsule'
                    ? 'Capsule'
                    : meta.shortLabel;
              return (
                <button
                  key={drillId}
                  type="button"
                  role="tab"
                  data-testid={`drill-tab-${drillId}`}
                  aria-selected={isSelected}
                  data-active={isSelected ? 'true' : 'false'}
                  title={
                    lockedCapsule
                      ? timeCapsuleStatus.naturalMessage
                      : `${meta.shortLabel} — ${meta.tagline} (${meta.duration})`
                  }
                  onClick={() => {
                    if (drillId === 'time-capsule') {
                      onLaunchTimeCapsule();
                    } else {
                      onSelectDrill(drillId);
                    }
                  }}
                  className={`relative z-10 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] whitespace-nowrap shrink-0 transition-colors cursor-pointer select-none ${
                    isSelected
                      ? 'text-ink-primary font-semibold'
                      : lockedCapsule
                        ? 'text-ink-muted/80 hover:text-ink-secondary font-normal'
                        : 'text-ink-muted hover:text-ink-primary font-medium'
                  }`}
                >
                  <DrillMark
                    id={drillId}
                    active={isSelected}
                    locked={lockedCapsule}
                  />
                  <span>{ribbonLabel}</span>
                  {lockedCapsule && (
                    <span className="font-mono-tabular text-[10px] opacity-65">
                      {timeCapsuleStatus.completedCount}/
                      {timeCapsuleStatus.requiredCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: Minimal Style Trigger + Craft Rule + 3m Flow */}
          <div className="flex flex-wrap items-center gap-1 shrink-0">
            {/* Compact Style & Voice Trigger (replaces cluttered dual-row header) */}
            <button
              type="button"
              data-testid="style-tray-toggle"
              aria-expanded={styleTrayOpen}
              onClick={() => setStyleTrayOpen((prev) => !prev)}
              title={`Format: ${MODE_LABELS[mode]} · Tone: ${TONE_LABELS[tone]} · Audience: ${audience}`}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                styleTrayOpen
                  ? 'bg-surface border border-border-strong text-ink-primary shadow-xs'
                  : 'bg-transparent border border-transparent hover:border-border-default hover:bg-surface/70 text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <span className="text-ink-primary font-medium">
                {COMPACT_MODE_LABELS[mode]}
              </span>
              <ChevronDown
                className={`w-3 h-3 text-ink-muted transition-transform duration-200 ${
                  styleTrayOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            <span
              aria-hidden="true"
              className="hidden sm:inline-block h-3.5 w-px bg-border-subtle"
            />

            {/* Craft Rule Trigger */}
            <div className="inline-flex items-center gap-0.5">
              <button
                type="button"
                data-testid="constraint-picker-toggle"
                data-active={
                  activeConstraint || showConstraintPicker ? 'true' : 'false'
                }
                aria-expanded={showConstraintPicker}
                onClick={onToggleConstraintPicker}
                className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                  activeConstraint
                    ? 'bg-surface border border-ink-primary/35 text-ink-primary shadow-xs'
                    : showConstraintPicker
                      ? 'bg-surface border border-border-strong text-ink-primary'
                      : 'bg-transparent border border-transparent hover:border-border-default hover:bg-surface/70 text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <SlidersHorizontal
                  className="w-3 h-3 shrink-0 transition-transform duration-150 group-hover:scale-105"
                  aria-hidden="true"
                />
                <span
                  title={activeConstraint?.shortLabel ?? 'Craft Rule'}
                  className="max-w-[130px] sm:max-w-[104px] truncate"
                >
                  {activeConstraint
                    ? activeConstraint.shortLabel
                    : 'Craft Rule'}
                </span>
                {activeConstraint && constraintResult && (
                  <span
                    className={`font-mono-tabular text-[10px] font-semibold ${
                      constraintResult.passed
                        ? 'text-status-success'
                        : 'text-status-warning'
                    }`}
                  >
                    {constraintResult.adherenceScore}%
                  </span>
                )}
              </button>

              {activeConstraint && (
                <button
                  type="button"
                  onClick={() => onSelectConstraint(null)}
                  aria-label="Clear active constraint"
                  className="btn-ghost p-1 text-ink-muted hover:text-ink-primary"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* 3m Flow Sprint Trigger */}
            <button
              type="button"
              data-testid="flow-sprint-toggle"
              data-active={flowLockActive ? 'true' : 'false'}
              aria-pressed={flowLockActive}
              onClick={onToggleFlowSprint}
              title="3-Minute No-Backspace Flow Sprint: disables deleting so you draft forward without self-editing"
              className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                flowLockActive
                  ? 'bg-accent text-ink-inverse border border-accent shadow-xs'
                  : 'bg-transparent border border-transparent hover:border-border-default hover:bg-surface/70 text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <Feather
                className={`w-3 h-3 shrink-0 ${
                  flowLockActive ? 'ink-nib-breathe' : ''
                }`}
                aria-hidden="true"
              />
              <span className="font-mono-tabular">
                {flowLockActive ? `Flow ${flowSecondsLabel}` : '3m Flow'}
              </span>
            </button>

            {/* Optional Sentence Focus Mode Toggle */}
            {onToggleSentenceFocus && (
              <button
                type="button"
                data-testid="sentence-focus-toggle"
                data-active={sentenceFocusMode ? 'true' : 'false'}
                aria-pressed={sentenceFocusMode}
                onClick={onToggleSentenceFocus}
                title="Sentence Focus Mode: softly dims surrounding paragraphs so only your active thought stands out"
                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                  sentenceFocusMode
                    ? 'bg-surface border border-ink-primary/40 text-ink-primary shadow-xs'
                    : 'bg-transparent border border-transparent hover:border-border-default hover:bg-surface/70 text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <Focus className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="hidden md:inline">Focus</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Minimal Style & Voice Tray (Format, Audience, Tone — revealed on click) */}
        {styleTrayOpen && (
          <div
            data-testid="style-tray-panel"
            className="drawer-reveal px-3.5 sm:px-6 pt-2 pb-2.5 border-t border-border-subtle/80 bg-surface/55 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5"
          >
            <div
              ref={modeTabListRef}
              role="tablist"
              aria-label="Writing format"
              className="relative flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none scroll-smooth-touch min-w-0"
            >
              {(Object.keys(COMPACT_MODE_LABELS) as WritingMode[]).map((m) => {
                const isSelected = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    data-active={isSelected ? 'true' : 'false'}
                    title={MODE_LABELS[m]}
                    onClick={() => onSelectMode(m)}
                    className={`relative px-2 sm:px-2.5 py-1.5 text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'text-ink-primary font-semibold'
                        : 'text-ink-muted hover:text-ink-secondary font-normal'
                    }`}
                  >
                    {COMPACT_MODE_LABELS[m]}
                  </button>
                );
              })}

              <span
                aria-hidden="true"
                className="ink-glide-underline pointer-events-none absolute left-0 bottom-0 h-[2px] w-[100px] origin-left rounded-full bg-ink-primary"
                style={{
                  opacity: modeInk.ready ? 1 : 0,
                  transform: `translate3d(${modeInk.left + 6}px, 0, 0) scaleX(${Math.max(
                    0,
                    (modeInk.width - 12) / 100
                  )})`,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 min-w-0">
              <div className="relative inline-flex items-center min-w-0">
                <label htmlFor="audience-select" className="sr-only">
                  Target audience
                </label>
                <select
                  id="audience-select"
                  data-testid="audience-select"
                  value={audience}
                  title="Target reader for Audience Gut-Reaction"
                  onChange={(e) =>
                    onChangeAudience(e.target.value as AudienceOption)
                  }
                  className="appearance-none bg-transparent hover:bg-subtle/70 focus:bg-surface rounded-sm pl-1.5 pr-5 py-1 text-[11px] sm:text-xs font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer truncate max-w-full focus:outline-none"
                >
                  {AUDIENCE_OPTIONS.map((aud) => (
                    <option key={aud} value={aud}>
                      For: {aud}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-3 h-3 text-ink-muted pointer-events-none -ml-4 shrink-0"
                  aria-hidden="true"
                />
              </div>

              <span
                aria-hidden="true"
                className="h-3 w-px bg-border-default shrink-0"
              />

              <div className="relative inline-flex items-center min-w-0">
                <label htmlFor="tone-select" className="sr-only">
                  Target tone
                </label>
                <select
                  id="tone-select"
                  value={tone}
                  title="Select target writing tone"
                  onChange={(e) => onChangeTone(e.target.value as ToneSetting)}
                  className="appearance-none bg-transparent hover:bg-subtle/70 focus:bg-surface rounded-sm pl-1.5 pr-5 py-1 text-[11px] sm:text-xs font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer truncate max-w-full focus:outline-none"
                >
                  {Object.entries(TONE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-3 h-3 text-ink-muted pointer-events-none -ml-4 shrink-0"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        )}

        {/* Animated Constraint Studio Drawer */}
        {showConstraintPicker && (
          <div className="drawer-reveal px-3.5 sm:px-6 pb-4">
            <ConstraintPickerDrawer
              mode={mode}
              modeLabel={COMPACT_MODE_LABELS[mode]}
              draftText={draftText}
              activeConstraint={activeConstraint}
              onSelect={onSelectConstraint}
              onRollRandom={onRollConstraint}
              onClose={onCloseConstraintPicker}
            />
          </div>
        )}
      </div>
    </div>
  );
};
