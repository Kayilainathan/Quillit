import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Clock,
  Columns2,
  Eye,
  EyeOff,
  ListOrdered,
  Plus,
  Shuffle,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import {
  compareSkeletonReconstruction,
  isCustomUserTopic,
  shuffleSkeletonClueOrder,
  splitPassageSentences,
  type SkeletonPassage,
  type SkeletonPhase,
} from '../../utils/skeletonDrill';
import { matchSkeletonCluesInDraft } from '../../utils/writeStudioAddons';
import { formatCountdownMMSS } from '../../utils/compressionSprint';

const SKELETON_DOMAIN_FILTERS: {
  id: SkeletonPassage['domain'] | 'all';
  label: string;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'technical', label: 'Tech' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'email', label: 'Email' },
  { id: 'creative', label: 'Story' },
];

const SKELETON_STEPS: { id: SkeletonPhase; num: string; label: string }[] = [
  { id: 'study', num: '1', label: 'Study' },
  { id: 'reconstruct', num: '2', label: 'Reconstruct' },
  { id: 'compare', num: '3', label: 'Compare' },
];

const STUDY_BREATH_SECONDS = 120;

export interface SkeletonStudioPanelProps {
  phase: SkeletonPhase;
  passage: SkeletonPassage;
  domainFilter: SkeletonPassage['domain'] | 'all';
  clues: string[];
  loading: boolean;
  completedCount: number;
  activeTopic: string;
  draftText: string;
  onChangeDomainFilter: (domain: SkeletonPassage['domain'] | 'all') => void;
  onUpdateClue: (index: number, value: string) => void;
  onAddClue: (value: string) => void;
  onRemoveClue: (index: number) => void;
  onAutoDistillClues: () => void;
  onNextPassage: () => void;
  onAdaptToTopic: () => void;
  onSetPhase: (phase: SkeletonPhase) => void;
  onEnterReconstruct: () => void;
}

export const SkeletonStudioPanel: React.FC<SkeletonStudioPanelProps> = ({
  phase,
  passage,
  domainFilter,
  clues,
  loading,
  completedCount,
  activeTopic,
  draftText,
  onChangeDomainFilter,
  onUpdateClue,
  onAddClue,
  onRemoveClue,
  onAutoDistillClues,
  onNextPassage,
  onAdaptToTopic,
  onSetPhase,
  onEnterReconstruct,
}) => {
  const [editingClueIdx, setEditingClueIdx] = useState<number | null>(null);
  const [editingClueValue, setEditingClueValue] = useState('');
  const [newClueInput, setNewClueInput] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null);
  const [jumbledMode, setJumbledMode] = useState(false);
  const [jumbleSeed, setJumbleSeed] = useState(1);
  const [studyTimerRunning, setStudyTimerRunning] = useState(false);
  const [studySecondsLeft, setStudySecondsLeft] = useState(STUDY_BREATH_SECONDS);

  // Reset inline edit & study breath timer cleanly when passage changes
  useEffect(() => {
    setEditingClueIdx(null);
    setEditingClueValue('');
    setHighlightedIdx(null);
    setStudyTimerRunning(false);
    setStudySecondsLeft(STUDY_BREATH_SECONDS);
  }, [passage.id]);

  // Pause study timer when leaving Study phase
  useEffect(() => {
    if (phase !== 'study' && studyTimerRunning) {
      setStudyTimerRunning(false);
    }
  }, [phase, studyTimerRunning]);

  // Optional 2:00 calm reading cue countdown
  useEffect(() => {
    if (!studyTimerRunning) return;
    const id = window.setInterval(() => {
      setStudySecondsLeft((prev) => {
        if (prev <= 1) {
          setStudyTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [studyTimerRunning]);

  const sentences = useMemo(
    () => splitPassageSentences(passage.text),
    [passage.text]
  );

  const clueWeaveStatuses = useMemo(
    () => matchSkeletonCluesInDraft(clues, draftText),
    [clues, draftText]
  );
  const wovenCount = clueWeaveStatuses.filter((c) => c.woven).length;
  const weaveRatio =
    clueWeaveStatuses.length > 0 ? wovenCount / clueWeaveStatuses.length : 0;

  const draftWordCount = useMemo(
    () => draftText.trim().split(/\s+/).filter(Boolean).length,
    [draftText]
  );
  const canCompare = draftWordCount >= 8;

  const comparison = useMemo(
    () => compareSkeletonReconstruction(passage.text, draftText),
    [passage.text, draftText]
  );

  const displayOrder = useMemo(() => {
    if (!jumbledMode || clues.length < 2) {
      return clues.map((_, i) => i);
    }
    return shuffleSkeletonClueOrder(clues.length, jumbleSeed);
  }, [clues, jumbledMode, jumbleSeed]);

  const hasCustomTopic = isCustomUserTopic(activeTopic);
  const isAdaptedToCurrentTopic =
    Boolean(passage.adaptedToTopic) &&
    passage.adaptedToTopic?.trim().toLowerCase() ===
      activeTopic.trim().toLowerCase();

  const activeStepIdx =
    phase === 'study' ? 0 : phase === 'reconstruct' ? 1 : 2;

  const commitClueEdit = (idx: number) => {
    onUpdateClue(idx, editingClueValue);
    setEditingClueIdx(null);
    setEditingClueValue('');
  };

  const handleAddNewClue = () => {
    if (!newClueInput.trim()) return;
    onAddClue(newClueInput);
    setNewClueInput('');
  };

  const handleToggleJumble = () => {
    setJumbledMode((prev) => {
      const next = !prev;
      if (next) setJumbleSeed((s) => s + 1);
      return next;
    });
  };

  return (
    <div
      data-testid="skeleton-drill-panel"
      data-skeleton-phase={phase}
      className="px-3.5 sm:px-6 py-4 border-b border-border-subtle bg-subtle/35 space-y-3.5"
    >
      {/* Editorial 3-Phase Stepper: 1 Study -> 2 Reconstruct -> 3 Compare */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border-subtle/70">
        <div
          data-testid="skeleton-phase-stepper"
          role="group"
          aria-label="Skeleton reconstruction phases"
          className="flex items-center gap-1.5 sm:gap-2"
        >
          {SKELETON_STEPS.map((step, idx) => {
            const isActive = idx === activeStepIdx;
            const isPast = idx < activeStepIdx;
            const disabled =
              (step.id === 'reconstruct' && clues.length === 0) ||
              (step.id === 'compare' && !canCompare);

            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  data-testid={`skeleton-step-${step.id}`}
                  data-state={
                    isActive ? 'active' : isPast ? 'completed' : 'upcoming'
                  }
                  disabled={disabled}
                  onClick={() => {
                    if (step.id === 'reconstruct') {
                      onEnterReconstruct();
                    } else {
                      onSetPhase(step.id);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 text-[11px] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? 'text-ink-primary font-semibold'
                      : isPast
                        ? 'text-ink-secondary hover:text-ink-primary'
                        : 'text-ink-muted hover:text-ink-secondary'
                  }`}
                >
                  <span
                    className={`relative w-5 h-5 rounded-full inline-flex items-center justify-center font-mono-tabular text-[10px] font-semibold border transition-colors ${
                      isActive
                        ? 'bg-accent text-ink-inverse border-accent skeleton-step-arrive'
                        : isPast
                          ? 'bg-surface text-ink-primary border-ink-primary/50'
                          : 'bg-surface/60 text-ink-muted border-border-default'
                    }`}
                  >
                    {isPast ? (
                      <Check
                        className="w-2.5 h-2.5 stroke-[2.5] sprint-check-settle"
                        aria-hidden="true"
                      />
                    ) : (
                      step.num
                    )}
                  </span>
                  <span>{step.label}</span>
                </button>

                {idx < SKELETON_STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="relative w-5 sm:w-8 h-[1.5px] rounded-full bg-border-default overflow-hidden shrink-0"
                  >
                    <span
                      className="absolute inset-0 bg-ink-primary sprint-connector-fill"
                      style={{
                        transform: `scaleX(${activeStepIdx > idx ? 1 : 0})`,
                      }}
                    />
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Quiet unboxed status metadata */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
          {isAdaptedToCurrentTopic && (
            <span
              data-testid="skeleton-topic-adapted-indicator"
              className="text-ink-primary font-medium"
            >
              Adapted to your topic
            </span>
          )}
          {isAdaptedToCurrentTopic && completedCount > 0 && (
            <span aria-hidden="true">·</span>
          )}
          {completedCount > 0 && (
            <span className="font-mono-tabular">
              {completedCount} completed
            </span>
          )}
        </div>
      </div>

      {/* ============================================================
          PHASE 1: STUDY — Sentence-Indexed Folio + Editable Beats
         ============================================================ */}
      {phase === 'study' && (
        <div
          key={`skeleton-study-${passage.id}`}
          className="skeleton-phase-enter space-y-3"
        >
          {/* Folio Title + Style Lens + Topic Adaptation / New Passage */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3
                data-testid="skeleton-passage-title"
                className="font-display font-semibold text-sm sm:text-[15px] text-ink-primary tracking-[-0.01em]"
              >
                {passage.title || 'Study Folio'}
              </h3>
              <span className="font-mono-tabular text-[11px] text-ink-muted whitespace-nowrap">
                {sentences.length} sentences · {passage.wordCount}w
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Filter skeleton passages by style"
                className="inline-flex items-center gap-0.5 border-r border-border-subtle pr-2 mr-0.5"
              >
                {SKELETON_DOMAIN_FILTERS.map((f) => {
                  const active = domainFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onChangeDomainFilter(f.id)}
                      className={`px-1.5 py-0.5 rounded-sm text-[10px] transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-surface text-ink-primary font-semibold border border-border-default'
                          : 'text-ink-muted hover:text-ink-primary'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {hasCustomTopic && !isAdaptedToCurrentTopic && (
                <button
                  type="button"
                  data-testid="skeleton-adapt-topic-btn"
                  disabled={loading}
                  onClick={onAdaptToTopic}
                  className="btn-secondary inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                >
                  <Target className="w-3 h-3" aria-hidden="true" />
                  <span>{loading ? 'Adapting...' : 'Adapt to Topic'}</span>
                </button>
              )}

              <button
                type="button"
                data-testid="skeleton-change-passage-btn"
                disabled={loading}
                onClick={onNextPassage}
                className="btn-ghost inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
              >
                <Shuffle className="w-3 h-3" aria-hidden="true" />
                <span>{loading ? 'Drawing...' : 'New Passage'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Sentence-Indexed Master Folio */}
          <div
            data-testid="skeleton-master-passage"
            className="rounded-md border border-border-default bg-surface divide-y divide-border-subtle/60 overflow-hidden"
          >
            {sentences.map((sentence, idx) => {
              const isHighlighted = highlightedIdx === idx;
              return (
                <button
                  key={`folio-sent-${idx}`}
                  type="button"
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  onMouseLeave={() => setHighlightedIdx(null)}
                  onClick={() => {
                    setHighlightedIdx(idx);
                    if (idx < clues.length) {
                      setEditingClueIdx(idx);
                      setEditingClueValue(clues[idx]);
                    }
                  }}
                  className={`w-full text-left px-3.5 sm:px-4 py-2.5 flex items-baseline gap-3 transition-colors cursor-pointer ${
                    isHighlighted ? 'bg-subtle/65' : 'bg-surface hover:bg-subtle/40'
                  }`}
                >
                  <span
                    className={`font-mono-tabular text-[10px] shrink-0 transition-colors ${
                      isHighlighted
                        ? 'text-ink-primary font-semibold'
                        : 'text-ink-muted'
                    }`}
                  >
                    0{idx + 1}
                  </span>
                  <span className="font-display text-[14.5px] sm:text-[15.5px] text-ink-primary leading-[1.65] tracking-[-0.004em]">
                    {sentence}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Editable Structural Keyword Beats */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-secondary">
                Sentence beats — click any beat or sentence to refine (max 4 words):
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  data-testid="skeleton-auto-distill-btn"
                  onClick={onAutoDistillClues}
                  className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-primary transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span>Auto-distill</span>
                </button>
                {clues.length >= 2 && (
                  <button
                    type="button"
                    data-testid="skeleton-jumble-toggle"
                    onClick={handleToggleJumble}
                    aria-pressed={jumbledMode}
                    className={`inline-flex items-center gap-1 text-[11px] transition-colors whitespace-nowrap cursor-pointer ${
                      jumbledMode
                        ? 'text-ink-primary font-semibold'
                        : 'text-ink-muted hover:text-ink-primary'
                    }`}
                  >
                    {jumbledMode ? (
                      <ListOrdered className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                    )}
                    <span>{jumbledMode ? 'Jumbled on' : 'Jumble order'}</span>
                  </button>
                )}
              </div>
            </div>

            <div
              data-testid="skeleton-editable-clues"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {clues.map((clue, idx) => {
                const isEditing = editingClueIdx === idx;
                const isPairedHover = highlightedIdx === idx;
                const wordCount = clue.trim().split(/\s+/).filter(Boolean).length;
                return (
                  <div
                    key={`study-clue-${idx}`}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    onMouseLeave={() => setHighlightedIdx(null)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-surface min-w-0 transition-colors ${
                      isPairedHover || isEditing
                        ? 'border-ink-primary/65'
                        : 'border-border-default'
                    }`}
                  >
                    <span className="font-mono-tabular text-[10px] text-ink-muted shrink-0">
                      0{idx + 1}
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        data-testid={`skeleton-clue-editor-${idx}`}
                        value={editingClueValue}
                        onChange={(e) => setEditingClueValue(e.target.value)}
                        onBlur={() => commitClueEdit(idx)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitClueEdit(idx);
                          } else if (e.key === 'Escape') {
                            setEditingClueIdx(null);
                          }
                        }}
                        className="flex-1 min-w-0 bg-transparent text-xs text-ink-primary focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        data-testid={`skeleton-clue-chip-${idx}`}
                        onClick={() => {
                          setEditingClueIdx(idx);
                          setEditingClueValue(clue);
                        }}
                        title="Click to edit keyword"
                        className="flex-1 min-w-0 text-left text-xs font-medium text-ink-primary truncate hover:text-accent transition-colors cursor-text"
                      >
                        {clue}
                      </button>
                    )}
                    <span className="font-mono-tabular text-[9px] text-ink-muted shrink-0">
                      {wordCount}w
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveClue(idx)}
                      aria-label={`Remove keyword ${clue}`}
                      className="p-0.5 text-ink-muted hover:text-ink-primary shrink-0 cursor-pointer"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}

              {clues.length < 4 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-border-default bg-surface/60 min-w-0">
                  <input
                    type="text"
                    data-testid="skeleton-add-clue-input"
                    value={newClueInput}
                    onChange={(e) => setNewClueInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNewClue();
                      }
                    }}
                    placeholder="+ Add beat..."
                    className="flex-1 min-w-0 bg-transparent text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewClue}
                    disabled={!newClueInput.trim()}
                    aria-label="Add keyword"
                    className="p-0.5 text-ink-muted hover:text-ink-primary disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Study Footer: Calm Optional 2:00 Study Breath + Dominant Primary CTA */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              data-testid="skeleton-study-timer-btn"
              onClick={() => {
                if (studySecondsLeft === 0) {
                  setStudySecondsLeft(STUDY_BREATH_SECONDS);
                  setStudyTimerRunning(true);
                } else {
                  setStudyTimerRunning((r) => !r);
                }
              }}
              className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-primary transition-colors whitespace-nowrap cursor-pointer"
            >
              <Clock className="w-3 h-3" aria-hidden="true" />
              <span className="font-mono-tabular">
                {studyTimerRunning
                  ? `Studying · ${formatCountdownMMSS(studySecondsLeft)}`
                  : studySecondsLeft < STUDY_BREATH_SECONDS &&
                      studySecondsLeft > 0
                    ? `Resume study · ${formatCountdownMMSS(studySecondsLeft)}`
                    : '2:00 study cue'}
              </span>
            </button>

            <button
              type="button"
              data-testid="skeleton-hide-reconstruct-button"
              onClick={onEnterReconstruct}
              disabled={clues.length === 0}
              className="btn-primary inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap"
            >
              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Hide &amp; Reconstruct</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================
          PHASE 2: RECONSTRUCT — Curtain-Folded Margin Rail + Live Weave
         ============================================================ */}
      {phase === 'reconstruct' && (
        <div
          key={`skeleton-reconstruct-${passage.id}`}
          className="skeleton-curtain-enter space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-semibold text-ink-primary">
                Skeleton Margin
              </span>
              <span className="text-ink-muted" aria-hidden="true">
                ·
              </span>
              <span
                data-testid="skeleton-weave-summary"
                className="font-mono-tabular text-ink-secondary"
              >
                {wovenCount}/{clueWeaveStatuses.length} beats woven
              </span>
              {jumbledMode && (
                <>
                  <span className="text-ink-muted" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-ink-muted">Jumbled notes</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {clues.length >= 2 && (
                <button
                  type="button"
                  onClick={handleToggleJumble}
                  aria-pressed={jumbledMode}
                  className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                >
                  <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                  <span>{jumbledMode ? 'Order' : 'Jumble'}</span>
                </button>
              )}
              <button
                type="button"
                data-testid="skeleton-peek-master-btn"
                onClick={() => onSetPhase('study')}
                className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
              >
                <Eye className="w-3 h-3" aria-hidden="true" />
                <span>Peek Master</span>
              </button>
              <button
                type="button"
                data-testid="skeleton-open-compare-btn"
                disabled={!canCompare}
                onClick={() => onSetPhase('compare')}
                title={
                  canCompare
                    ? 'Compare your rebuild side-by-side against the master passage'
                    : 'Write at least 8 words to unlock side-by-side comparison'
                }
                className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
              >
                <Columns2 className="w-3 h-3" aria-hidden="true" />
                <span>Compare</span>
              </button>
              <button
                type="button"
                onClick={onNextPassage}
                className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
              >
                <Shuffle className="w-3 h-3" aria-hidden="true" />
                <span>Switch</span>
              </button>
            </div>
          </div>

          {/* Hairline Ink Weave Progress */}
          <div className="w-full h-[2px] rounded-full bg-border-default/80 overflow-hidden">
            <div
              className={`h-full transition-transform duration-300 ease-out origin-left ${
                weaveRatio >= 1 ? 'bg-status-success' : 'bg-ink-primary'
              }`}
              style={{ transform: `scaleX(${weaveRatio})` }}
            />
          </div>

          {/* Pinned Skeleton Clue Rail (Natural or Franklin Jumbled Order) */}
          <div
            data-testid="skeleton-clue-rail"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {displayOrder.map((originalIdx, displayIdx) => {
              const item = clueWeaveStatuses[originalIdx];
              if (!item) return null;
              const isEditing = editingClueIdx === originalIdx;
              return (
                <div
                  key={`recon-clue-${originalIdx}`}
                  data-woven={item.woven ? 'true' : 'false'}
                  data-clue-text={item.clue}
                  className={`px-2.5 py-2 rounded-md border text-xs transition-colors flex items-center gap-2 min-w-0 ${
                    item.woven
                      ? 'border-status-success-border bg-status-success-soft/60 text-status-success'
                      : 'border-border-subtle bg-surface/85 text-ink-primary'
                  }`}
                >
                  <span
                    className={`font-mono-tabular text-[10px] shrink-0 ${
                      item.woven
                        ? 'text-status-success font-semibold'
                        : 'text-ink-muted'
                    }`}
                  >
                    {item.woven ? (
                      <Check
                        className="w-3 h-3 stroke-[2.5] clue-woven-check"
                        aria-hidden="true"
                      />
                    ) : jumbledMode ? (
                      `·${displayIdx + 1}`
                    ) : (
                      `0${originalIdx + 1}`
                    )}
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingClueValue}
                      onChange={(e) => setEditingClueValue(e.target.value)}
                      onBlur={() => commitClueEdit(originalIdx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitClueEdit(originalIdx);
                        } else if (e.key === 'Escape') {
                          setEditingClueIdx(null);
                        }
                      }}
                      className="flex-1 min-w-0 bg-transparent text-xs text-ink-primary focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingClueIdx(originalIdx);
                        setEditingClueValue(item.clue);
                      }}
                      title="Click to edit anchor keyword"
                      className={`flex-1 min-w-0 text-left truncate font-medium cursor-text ${
                        item.woven ? 'line-through opacity-85' : ''
                      }`}
                    >
                      {item.clue}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================
          PHASE 3: COMPARE — Side-by-Side Diff & Cadence Mirror
         ============================================================ */}
      {phase === 'compare' && (
        <div
          key={`skeleton-compare-${passage.id}`}
          data-testid="skeleton-compare-view"
          className="skeleton-compare-reveal space-y-3"
        >
          {/* Unboxed Tabular Metrics Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              <span className="font-mono-tabular font-semibold text-ink-primary">
                {comparison.originalityPct}% original phrasing
              </span>
              <span className="text-ink-muted" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular text-ink-secondary">
                {comparison.wordRatioPct}% length ({comparison.userWords}w vs{' '}
                {comparison.originalWords}w)
              </span>
              <span className="text-ink-muted" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular text-ink-secondary">
                {wovenCount}/{clueWeaveStatuses.length} beats woven
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="skeleton-back-to-draft-btn"
                onClick={onEnterReconstruct}
                className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
              >
                <span>Back to Draft</span>
              </button>
              <button
                type="button"
                onClick={onNextPassage}
                className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
              >
                <Shuffle className="w-3 h-3" aria-hidden="true" />
                <span>New Passage</span>
              </button>
            </div>
          </div>

          {/* 2-Column Editorial Mirror */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
            <div className="p-3.5 rounded-md border border-border-default bg-surface flex flex-col justify-between gap-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-ink-primary">
                    Master Model
                  </span>
                  <span className="font-mono-tabular text-ink-muted">
                    {comparison.originalWords}w
                  </span>
                </div>
                <p className="font-display text-[14px] text-ink-primary leading-[1.68]">
                  {passage.text}
                </p>
              </div>
              {passage.signatureMoves.length > 0 && (
                <div className="pt-2 border-t border-border-subtle/70 text-[11px] text-ink-muted">
                  <span className="text-ink-secondary font-medium">
                    Signature moves:{' '}
                  </span>
                  <span>{passage.signatureMoves.join(' · ')}</span>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-md border border-border-default bg-surface flex flex-col justify-between gap-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-ink-primary">
                    Your Reconstruction
                  </span>
                  <span className="font-mono-tabular text-ink-muted">
                    {comparison.userWords}w
                  </span>
                </div>
                <p className="font-display text-[14px] text-ink-primary leading-[1.68] whitespace-pre-wrap">
                  {draftText.trim() || 'Your draft will appear here.'}
                </p>
              </div>
              <p className="pt-2 border-t border-border-subtle/70 text-[11px] text-ink-secondary">
                {comparison.cadenceNote}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
