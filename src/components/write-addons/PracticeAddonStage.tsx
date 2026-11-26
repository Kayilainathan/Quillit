import React from 'react';
import {
  ArrowRight,
  Check,
  History,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import type { DrillType, WritingSession } from '../../types';
import {
  type CompressionRoundConfig,
  computeCompressionMetrics,
  formatCountdownMMSS,
} from '../../utils/compressionSprint';
import { analyzeDraftLocally } from '../../utils/analytics';
import {
  computeTimerRemainingRatio,
  computeWordWindowStatus,
} from '../../utils/writeStudioAddons';
import { resolveCompressionSprintStageUi } from '../../utils/writeStudioLifecycle';
import type {
  SkeletonPassage,
  SkeletonPhase,
} from '../../utils/skeletonDrill';
import type { TimeCapsuleStatus } from '../../utils/timeCapsule';
import { SkeletonStudioPanel } from './SkeletonStudioPanel';

const ROUND_ROMAN = ['I', 'II', 'III'] as const;

/**
 * Horological Circular Ink-Dial Timer for 4/3/2 Compression Sprint.
 * Sweeps smoothly every second with a continuous second hairline + draining ink arc.
 */
const HorologicalInkDial: React.FC<{
  secondsLeft: number;
  durationSec: number;
  ratio: number;
  running: boolean;
  completed?: boolean;
}> = ({ secondsLeft, durationSec, ratio, running, completed = false }) => {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = completed ? 0 : circumference * (1 - ratio);
  const elapsed = Math.max(0, durationSec - secondsLeft);
  const sweepDeg = (elapsed % 60) * 6;

  return (
    <div
      data-testid="sprint-ink-dial"
      data-completed={completed ? 'true' : 'false'}
      className="relative inline-flex items-center justify-center w-12 h-12 shrink-0"
    >
      <svg
        viewBox="0 0 52 52"
        className="w-12 h-12 -rotate-90"
        aria-hidden="true"
      >
        {/* Subtle breathing outer ring while running */}
        {running && !completed && (
          <circle
            cx="26"
            cy="26"
            r="24.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            className="text-accent ink-dial-pulse"
          />
        )}
        {/* Engraved 12-hour dial ticks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const inner = i % 3 === 0 ? 16.5 : 17.6;
          const outer = 19.2;
          return (
            <line
              key={i}
              x1={26 + inner * Math.cos(angle)}
              y1={26 + inner * Math.sin(angle)}
              x2={26 + outer * Math.cos(angle)}
              y2={26 + outer * Math.sin(angle)}
              stroke="currentColor"
              strokeWidth={i % 3 === 0 ? '1.1' : '0.7'}
              className={completed ? 'text-status-success/40' : 'text-ink-muted/35'}
            />
          );
        })}
        {/* Track circle */}
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          className="text-border-default/80"
        />
        {/* Active continuous draining ink arc (full success ring on completion) */}
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={
            completed
              ? 'ink-dial-arc-snappy text-status-success'
              : running
                ? 'ink-dial-arc text-accent'
                : 'ink-dial-arc-snappy text-ink-primary/70'
          }
        />
        {/* Continuous sweeping radial indicator */}
        {!completed && elapsed > 0 && (
          <g
            className="ink-dial-sweep-hand"
            style={{ transform: `rotate(${sweepDeg}deg)` }}
          >
            <line
              x1="39.5"
              y1="26"
              x2="45"
              y2="26"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              className={running ? 'text-accent' : 'text-ink-muted/65'}
            />
          </g>
        )}
      </svg>
      {completed ? (
        <span
          data-testid="sprint-completed-seal"
          aria-label="Sprint complete"
          className="absolute inline-flex items-center justify-center text-status-success"
        >
          <Check className="sprint-check-settle w-4 h-4 stroke-[2.5]" aria-hidden="true" />
        </span>
      ) : (
        <span
          data-testid="sprint-timer-clock"
          className={`absolute font-mono-tabular text-[11px] font-semibold tracking-tight ${
            running ? 'text-ink-primary' : 'text-ink-secondary'
          }`}
        >
          {formatCountdownMMSS(secondsLeft)}
        </span>
      )}
    </div>
  );
};

interface PracticeAddonStageProps {
  activeDrill: DrillType;
  // 4/3/2 Compression Sprint
  compressionRoundsSpec: readonly CompressionRoundConfig[];
  sprintRoundIdx: 0 | 1 | 2;
  sprintSecondsLeft: number;
  sprintRunning: boolean;
  sprintAutoPaused: boolean;
  sprintAutoArmed: boolean;
  sprintRounds: [string, string, string];
  showPrevRoundsDrawer: boolean;
  currentWordCount: number;
  sprintEmptyGuardMessage?: string | null;
  sprintEmptyGuardTick?: number;
  sprintCompleted?: boolean;
  isDraftEvaluatedClean?: boolean;
  evaluating?: boolean;
  onToggleSprintTimer: () => void;
  onResetSprintTimer: () => void;
  onAdvanceSprintRound: () => void;
  onEvaluateSprintFinal?: () => void;
  onStartNewSprint?: () => void;
  onStartSprintRevision?: () => void;
  onTogglePrevRounds: () => void;
  // Skeleton Reconstruction (3-phase Franklin study -> reconstruct -> compare)
  skeletonPhase: SkeletonPhase;
  skeletonPassage: SkeletonPassage;
  skeletonDomainFilter: SkeletonPassage['domain'] | 'all';
  skeletonClues: string[];
  skeletonLoading: boolean;
  skeletonCompletedCount: number;
  activeTopic: string;
  draftText: string;
  onChangeSkeletonDomainFilter: (
    domain: SkeletonPassage['domain'] | 'all'
  ) => void;
  onUpdateSkeletonClue: (index: number, value: string) => void;
  onAddSkeletonClue: (value: string) => void;
  onRemoveSkeletonClue: (index: number) => void;
  onAutoDistillSkeletonClues: () => void;
  onNextSkeletonPassage: () => void;
  onAdaptSkeletonToTopic: () => void;
  onSetSkeletonPhase: (phase: SkeletonPhase) => void;
  onEnterReconstruct: () => void;
  // Time Capsule (both locked natural-language state & unlocked blind retest)
  timeCapsuleStatus: TimeCapsuleStatus;
  selectedTimeCapsuleOrigin: WritingSession | null;
  onSwitchTimeCapsuleTopic: () => void;
  onStartWritingFromLockedCapsule: () => void;
  onExitTimeCapsule: () => void;
  // Revision Pass 2
  revisionContext: {
    pass1Score: number;
    focusItems: string[];
  } | null;
  onCancelRevision: () => void;
}

export const PracticeAddonStage: React.FC<PracticeAddonStageProps> = ({
  activeDrill,
  compressionRoundsSpec,
  sprintRoundIdx,
  sprintSecondsLeft,
  sprintRunning,
  sprintAutoPaused,
  sprintAutoArmed,
  sprintRounds,
  showPrevRoundsDrawer,
  currentWordCount,
  sprintEmptyGuardMessage = null,
  sprintEmptyGuardTick = 0,
  sprintCompleted = false,
  isDraftEvaluatedClean = false,
  evaluating = false,
  onToggleSprintTimer,
  onResetSprintTimer,
  onAdvanceSprintRound,
  onEvaluateSprintFinal,
  onStartNewSprint,
  onStartSprintRevision,
  onTogglePrevRounds,
  skeletonPhase,
  skeletonPassage,
  skeletonDomainFilter,
  skeletonClues,
  skeletonLoading,
  skeletonCompletedCount,
  activeTopic,
  draftText,
  onChangeSkeletonDomainFilter,
  onUpdateSkeletonClue,
  onAddSkeletonClue,
  onRemoveSkeletonClue,
  onAutoDistillSkeletonClues,
  onNextSkeletonPassage,
  onAdaptSkeletonToTopic,
  onSetSkeletonPhase,
  onEnterReconstruct,
  timeCapsuleStatus,
  selectedTimeCapsuleOrigin,
  onSwitchTimeCapsuleTopic,
  onStartWritingFromLockedCapsule,
  onExitTimeCapsule,
  revisionContext,
  onCancelRevision,
}) => {
  const currentSpec = compressionRoundsSpec[sprintRoundIdx];
  const timerRatio = computeTimerRemainingRatio(
    sprintSecondsLeft,
    currentSpec.durationSec
  );
  const wordWindow = computeWordWindowStatus(
    currentWordCount,
    currentSpec.minWords,
    currentSpec.maxWords
  );
  const sprintUi = resolveCompressionSprintStageUi({
    sprintRoundIdx,
    sprintSecondsLeft,
    sprintRunning,
    sprintAutoPaused,
    sprintAutoArmed,
    sprintCompleted,
    evaluating,
    hasRevisionContext: Boolean(revisionContext),
    currentWordCount,
    minFinalWords: compressionRoundsSpec[2].minWords,
    isDraftEvaluatedClean,
  });
  const sprintSummaryCounts: [number, number, number] = [
    analyzeDraftLocally(sprintRounds[0]).wordCount,
    analyzeDraftLocally(sprintRounds[1]).wordCount,
    currentWordCount || analyzeDraftLocally(sprintRounds[2]).wordCount,
  ];
  const compressionMetrics = computeCompressionMetrics(sprintSummaryCounts);

  return (
    <>
      {/* 1. 4/3/2 COMPRESSION SPRINT — Horological Ink-Dial & Animated 1 -> 2 -> 3 Stepper */}
      {activeDrill === 'compression-432' && (
        <div
          key="stage-compression-432"
          data-testid="compression-sprint-panel"
          data-sprint-running={sprintRunning ? 'true' : 'false'}
          data-sprint-stage={sprintRoundIdx + 1}
          data-sprint-completed={sprintUi.allPassesCompleted ? 'true' : 'false'}
          className="drawer-reveal relative px-3.5 sm:px-6 py-3.5 sm:py-4 border-b border-border-subtle bg-subtle/35 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Circular Horological Ink-Dial + Animated 1 -> 2 -> 3 Progression */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div
                key={`dial-pass-${sprintRoundIdx}-${sprintUi.allPassesCompleted ? 'done' : 'live'}`}
                className="sprint-dial-reset shrink-0"
              >
                <HorologicalInkDial
                  secondsLeft={sprintSecondsLeft}
                  durationSec={currentSpec.durationSec}
                  ratio={timerRatio}
                  running={sprintRunning}
                  completed={sprintUi.allPassesCompleted}
                />
              </div>

              <div className="space-y-1.5">
                <div
                  data-testid="sprint-stage-stepper"
                  aria-label={
                    sprintUi.allPassesCompleted
                      ? 'Compression sprint completed (all 3 passes scored)'
                      : `Compression sprint pass ${sprintRoundIdx + 1} of 3`
                  }
                  className="flex items-center gap-1.5 sm:gap-2"
                >
                  {compressionRoundsSpec.map((spec, idx) => {
                    const isCompleted =
                      sprintUi.allPassesCompleted || idx < sprintRoundIdx;
                    const isCurrent =
                      !sprintUi.allPassesCompleted && idx === sprintRoundIdx;
                    const mins = Math.round(spec.durationSec / 60);
                    return (
                      <React.Fragment key={spec.round}>
                        <div
                          data-testid={`sprint-stage-node-${idx + 1}`}
                          data-stage-state={
                            isCompleted
                              ? 'completed'
                              : isCurrent
                                ? 'current'
                                : 'upcoming'
                          }
                          className={`inline-flex items-center gap-1.5 text-[11px] transition-opacity duration-300 ${
                            isCurrent
                              ? 'text-ink-primary font-semibold opacity-100'
                              : isCompleted
                                ? 'text-status-success font-medium opacity-95'
                                : 'text-ink-muted opacity-50'
                          }`}
                        >
                          <span className="relative inline-flex items-center justify-center">
                            {isCurrent && (
                              <span
                                key={`halo-${sprintRoundIdx}`}
                                aria-hidden="true"
                                className="sprint-node-halo pointer-events-none absolute inset-0 rounded-full border border-ink-primary/45"
                              />
                            )}
                            <span
                              key={`node-${idx}-${isCompleted ? 'done' : isCurrent ? 'curr' : 'wait'}`}
                              className={`relative w-5 h-5 rounded-full inline-flex items-center justify-center font-mono-tabular text-[10px] border transition-colors duration-300 ${
                                isCurrent
                                  ? 'sprint-node-arrive bg-accent text-ink-inverse border-accent'
                                  : isCompleted
                                    ? 'bg-status-success-soft text-status-success border-status-success-border'
                                    : 'bg-surface text-ink-muted border-border-default'
                              }`}
                            >
                              {isCompleted ? (
                                <Check
                                  className="sprint-check-settle w-2.5 h-2.5 stroke-[2.5]"
                                  aria-hidden="true"
                                />
                              ) : (
                                idx + 1
                              )}
                            </span>
                          </span>
                          <span className="font-mono-tabular">{mins}m</span>
                        </div>

                        {idx < 2 && (
                          <span
                            aria-hidden="true"
                            data-testid={`sprint-connector-${idx + 1}-to-${idx + 2}`}
                            data-filled={
                              sprintUi.allPassesCompleted || idx < sprintRoundIdx
                                ? 'true'
                                : 'false'
                            }
                            className="relative w-5 sm:w-8 h-[1.5px] rounded-full bg-border-default/80 overflow-hidden"
                          >
                            <span
                              className={`sprint-connector-fill absolute inset-0 rounded-full ${
                                sprintUi.allPassesCompleted
                                  ? 'bg-status-success'
                                  : 'bg-ink-primary'
                              }`}
                              style={{
                                transform: `scaleX(${
                                  sprintUi.allPassesCompleted || idx < sprintRoundIdx
                                    ? 1
                                    : 0
                                })`,
                              }}
                            />
                          </span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                <p className="text-[11px] text-ink-muted">
                  {sprintUi.allPassesCompleted ? (
                    <span
                      data-testid="sprint-completed-status"
                      className={
                        isDraftEvaluatedClean
                          ? 'text-status-success font-medium'
                          : 'text-ink-secondary font-medium'
                      }
                    >
                      {sprintUi.statusText}
                    </span>
                  ) : sprintRunning ? (
                    <span className="text-ink-secondary">{sprintUi.statusText}</span>
                  ) : sprintAutoPaused ? (
                    <span data-testid="sprint-paused-pill">
                      {sprintUi.statusText}
                    </span>
                  ) : sprintAutoArmed && sprintSecondsLeft > 0 ? (
                    <span data-testid="sprint-auto-armed-hint">
                      {sprintUi.statusText}
                    </span>
                  ) : (
                    <span>{sprintUi.statusText}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Right: Context-Aware Controls (Timer only while active; New Sprint / Revise / Re-evaluate after scoring) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {sprintUi.showTimerControls && (
                <>
                  <button
                    type="button"
                    data-testid="sprint-play-pause-button"
                    disabled={sprintUi.disableStartButton}
                    onClick={onToggleSprintTimer}
                    aria-label={sprintRunning ? 'Pause timer' : 'Start timer'}
                    className="btn-secondary px-2.5 py-1.5 min-h-[32px] inline-flex items-center gap-1.5 text-[11px] font-medium disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {sprintRunning ? (
                      <>
                        <Pause className="w-3 h-3" aria-hidden="true" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" aria-hidden="true" />
                        <span>Start</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={sprintUi.disableResetButton}
                    onClick={onResetSprintTimer}
                    aria-label="Reset round timer"
                    title="Reset round timer"
                    className="btn-ghost p-1.5 min-w-[32px] min-h-[32px] inline-flex items-center justify-center disabled:opacity-45"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </>
              )}

              {sprintUi.secondaryAction?.kind === 'revise' && onStartSprintRevision && (
                <button
                  type="button"
                  data-testid="sprint-revise-button"
                  onClick={onStartSprintRevision}
                  className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] text-[11px] font-medium whitespace-nowrap"
                >
                  <RotateCw className="w-3 h-3" aria-hidden="true" />
                  <span>{sprintUi.secondaryAction.label}</span>
                </button>
              )}

              {sprintUi.secondaryAction?.kind === 'new-sprint' && onStartNewSprint && (
                <button
                  type="button"
                  data-testid="sprint-new-button"
                  onClick={onStartNewSprint}
                  className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] text-[11px] font-medium whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span>{sprintUi.secondaryAction.label}</span>
                </button>
              )}

              {sprintUi.primaryAction.kind === 'advance' && (
                <button
                  key={`next-${sprintEmptyGuardTick}`}
                  type="button"
                  data-testid="sprint-next-round-button"
                  data-empty-blocked={currentWordCount === 0 ? 'true' : 'false'}
                  onClick={onAdvanceSprintRound}
                  className={`btn-primary inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] text-[11px] font-medium whitespace-nowrap ${
                    sprintEmptyGuardTick > 0 && currentWordCount === 0
                      ? 'flow-shake'
                      : ''
                  } ${currentWordCount === 0 ? 'opacity-75' : ''}`}
                >
                  <span>{sprintUi.primaryAction.label}</span>
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </button>
              )}

              {(sprintUi.primaryAction.kind === 'submit-evaluate' ||
                sprintUi.primaryAction.kind === 're-evaluate' ||
                sprintUi.primaryAction.kind === 'evaluating') && (
                <button
                  type="button"
                  data-testid="sprint-submit-evaluate-button"
                  disabled={sprintUi.primaryAction.disabled}
                  onClick={onEvaluateSprintFinal}
                  className="editorial-enter btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] text-[11px] font-medium whitespace-nowrap"
                >
                  <Sparkles
                    className={`w-3 h-3 ${evaluating ? 'animate-pulse' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{sprintUi.primaryAction.label}</span>
                </button>
              )}

              {sprintUi.primaryAction.kind === 'new-sprint' && onStartNewSprint && (
                <button
                  type="button"
                  data-testid="sprint-new-button"
                  onClick={onStartNewSprint}
                  className="editorial-enter btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] text-[11px] font-medium whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span>{sprintUi.primaryAction.label}</span>
                </button>
              )}

              {sprintUi.primaryAction.kind === 'need-words' && (
                <span
                  data-testid="sprint-final-word-progress"
                  className="font-mono-tabular text-[11px] text-ink-muted whitespace-nowrap px-2"
                >
                  {sprintUi.primaryAction.label}
                </span>
              )}
            </div>
          </div>

          {sprintEmptyGuardMessage && (
            <div
              role="status"
              data-testid="sprint-empty-guard"
              className="drawer-reveal px-3 py-2 rounded-md border border-status-warning-border bg-status-warning-soft text-[11px] text-status-warning font-medium"
            >
              {sprintEmptyGuardMessage}
            </div>
          )}

          {/* Bottom Row: Editorial Guidance (or Completed Compression Arc) + Live Word-Window Gauge */}
          <div
            key={`sprint-guidance-${sprintRoundIdx}-${sprintUi.allPassesCompleted ? 'done' : 'live'}`}
            className="sprint-stage-glide flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] pt-1.5 border-t border-border-subtle/60"
          >
            {sprintUi.allPassesCompleted ? (
              <p className="text-ink-secondary leading-relaxed font-mono-tabular">
                <span className="font-semibold text-ink-primary font-sans">
                  Compression Arc:{' '}
                </span>
                {compressionMetrics.summaryLabel}
              </p>
            ) : (
              <p className="text-ink-secondary leading-relaxed">
                <span className="font-semibold text-ink-primary">
                  {currentSpec.label}:{' '}
                </span>
                {currentSpec.guidance}
              </p>
            )}

            <div className="flex items-center gap-3 shrink-0">
              <div
                data-testid="sprint-word-window"
                className="inline-flex items-center gap-2 font-mono-tabular"
              >
                <span
                  className={
                    wordWindow.state === 'in-zone'
                      ? 'text-status-success font-semibold'
                      : wordWindow.state === 'over'
                        ? 'text-status-warning font-semibold'
                        : 'text-ink-muted'
                  }
                >
                  {wordWindow.label}
                </span>
                <span
                  aria-hidden="true"
                  className="w-14 h-[3px] rounded-full bg-border-subtle overflow-hidden inline-block"
                >
                  <span
                    className={`block h-full w-full origin-left transition-transform duration-200 ease-out ${
                      wordWindow.state === 'in-zone'
                        ? 'bg-status-success'
                        : wordWindow.state === 'over'
                          ? 'bg-status-warning'
                          : 'bg-ink-primary'
                    }`}
                    style={{ transform: `scaleX(${wordWindow.ratio})` }}
                  />
                </span>
              </div>

              {sprintRoundIdx > 0 && (
                <button
                  type="button"
                  onClick={onTogglePrevRounds}
                  className="inline-link-tactile font-medium cursor-pointer whitespace-nowrap"
                >
                  {showPrevRoundsDrawer
                    ? 'Hide Earlier'
                    : `Peek Pass ${sprintRoundIdx === 2 ? '1–2' : '1'}`}
                </button>
              )}
            </div>
          </div>

          {showPrevRoundsDrawer && sprintRoundIdx > 0 && (
            <div className="drawer-reveal grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2.5 border-t border-border-subtle">
              {sprintRounds.slice(0, sprintRoundIdx).map((txt, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-md bg-surface/80 border border-border-subtle text-[11px] space-y-1"
                >
                  <div className="font-mono-tabular font-semibold text-ink-muted">
                    Pass {idx + 1} ({ROUND_ROMAN[idx]}) ·{' '}
                    {analyzeDraftLocally(txt).wordCount}w
                  </div>
                  <p className="text-ink-secondary leading-relaxed line-clamp-4">
                    {txt || '(empty)'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. SKELETON RECONSTRUCTION — Modular 3-Phase Franklin Studio */}
      {activeDrill === 'skeleton' && (
        <SkeletonStudioPanel
          phase={skeletonPhase}
          passage={skeletonPassage}
          domainFilter={skeletonDomainFilter}
          clues={skeletonClues}
          loading={skeletonLoading}
          completedCount={skeletonCompletedCount}
          activeTopic={activeTopic}
          draftText={draftText}
          onChangeDomainFilter={onChangeSkeletonDomainFilter}
          onUpdateClue={onUpdateSkeletonClue}
          onAddClue={onAddSkeletonClue}
          onRemoveClue={onRemoveSkeletonClue}
          onAutoDistillClues={onAutoDistillSkeletonClues}
          onNextPassage={onNextSkeletonPassage}
          onAdaptToTopic={onAdaptSkeletonToTopic}
          onSetPhase={onSetSkeletonPhase}
          onEnterReconstruct={onEnterReconstruct}
        />
      )}

      {/* 3. TIME CAPSULE — Natural-Language Locked State OR Unlocked Blind Retest */}
      {activeDrill === 'time-capsule' && (
        <div
          key={`stage-time-capsule-${timeCapsuleStatus.state}`}
          className="drawer-reveal px-3.5 sm:px-6 py-3.5 border-b border-border-subtle bg-subtle/35"
        >
          {timeCapsuleStatus.state === 'locked' ? (
            <div
              data-testid="time-capsule-locked-panel"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink-primary">
                  <Lock className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
                  <span>Time Capsule Sealing Progress</span>
                  <span className="font-mono-tabular text-[11px] font-normal text-ink-muted">
                    ({timeCapsuleStatus.completedCount} of{' '}
                    {timeCapsuleStatus.requiredCount} completed)
                  </span>
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  {timeCapsuleStatus.naturalMessage}
                </p>
                {/* 3-Step Ink Seal Progress Bar */}
                <div
                  className="flex items-center gap-1.5 max-w-[210px]"
                  aria-label={`${timeCapsuleStatus.completedCount} of ${timeCapsuleStatus.requiredCount} entries sealed`}
                >
                  {Array.from({ length: timeCapsuleStatus.requiredCount }).map(
                    (_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          i < timeCapsuleStatus.completedCount
                            ? 'bg-accent'
                            : 'bg-border-default'
                        }`}
                      />
                    )
                  )}
                </div>
              </div>

              <button
                type="button"
                data-testid="time-capsule-write-now-btn"
                onClick={onStartWritingFromLockedCapsule}
                className="btn-primary inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0"
              >
                <span>Write an Entry</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div
              data-testid="time-capsule-seal-banner"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <History
                    className="w-3.5 h-3.5 text-ink-primary shrink-0"
                    aria-hidden="true"
                  />
                  <strong className="text-ink-primary font-semibold">
                    Blind Time Capsule Rewrite
                  </strong>
                  {selectedTimeCapsuleOrigin && (
                    <span className="font-mono-tabular text-[11px] text-ink-muted">
                      · Sealed {selectedTimeCapsuleOrigin.date} (
                      {selectedTimeCapsuleOrigin.totalScore}/60)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-secondary leading-relaxed">
                  Your original draft stays sealed while you rewrite this topic
                  fresh. Evaluation will unseal it and compare your writing
                  aesthetics side-by-side.
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {timeCapsuleStatus.allEligibleCandidates.length > 1 && (
                  <button
                    type="button"
                    data-testid="time-capsule-switch-topic-btn"
                    onClick={onSwitchTimeCapsuleTopic}
                    className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                  >
                    <Shuffle className="w-3 h-3" aria-hidden="true" />
                    <span>Another Past Topic</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExitTimeCapsule}
                  className="btn-ghost text-[11px] font-medium px-2 py-1 whitespace-nowrap"
                >
                  Exit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. REVISE & LIFT (PASS 2) PINNED FOCUS STRIP */}
      {revisionContext && (
        <div
          data-testid="revision-focus-banner"
          className="drawer-reveal px-3.5 sm:px-6 py-3 border-b border-border-subtle bg-accent-soft/30 space-y-1.5 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink-primary font-mono-tabular">
              Pass 2 · Revise &amp; Lift (Target: beat{' '}
              {revisionContext.pass1Score}/60)
            </span>
            <button
              type="button"
              onClick={onCancelRevision}
              aria-label="Cancel revision pass"
              className="btn-ghost p-1"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-0.5 text-[11px] text-ink-secondary">
            {revisionContext.focusItems.map((item, i) => (
              <li key={i}>· {item}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};
