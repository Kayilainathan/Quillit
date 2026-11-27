import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Feather, Shuffle, Sparkles } from 'lucide-react';
import type { SessionBrief } from '../utils/sessionBrief';

interface SessionBriefCardProps {
  brief: SessionBrief;
  usedVocabPhrases: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onEnterFreeWrite: () => void;
  onApplyPivot: (customFocus: string) => Promise<void> | void;
  pivoting?: boolean;
  onInsertVocabPhrase?: (phrase: string) => void;
}

export function SessionBriefCard({
  brief,
  usedVocabPhrases,
  collapsed,
  onToggleCollapse,
  onEnterFreeWrite,
  onApplyPivot,
  pivoting = false,
  onInsertVocabPhrase,
}: SessionBriefCardProps) {
  const [pivotOpen, setPivotOpen] = useState(false);
  const [pivotDraft, setPivotDraft] = useState('');

  const usedSet = new Set(usedVocabPhrases.map((p) => p.toLowerCase()));
  const usedCount = brief.vocabTargets.filter((v) =>
    usedSet.has(v.phrase.toLowerCase())
  ).length;
  const totalVocab = brief.vocabTargets.length;

  async function handleSubmitPivot() {
    const cleaned = pivotDraft.trim();
    if (cleaned.length < 3 || pivoting) return;
    await onApplyPivot(cleaned);
    setPivotDraft('');
    setPivotOpen(false);
  }

  if (collapsed) {
    return (
      <div
        data-testid="session-brief-collapsed"
        className="drawer-reveal flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 border-b border-border-subtle bg-subtle/40 text-xs"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="font-mono-tabular text-[11px] font-medium text-ink-primary shrink-0">
            {brief.promptCode}
          </span>
          <span className="text-ink-muted" aria-hidden="true">
            ·
          </span>
          <span className="font-medium text-ink-primary truncate max-w-[220px] sm:max-w-[340px]">
            {brief.title}
          </span>
          {totalVocab > 0 && (
            <>
              <span className="text-ink-muted" aria-hidden="true">
                ·
              </span>
              <span
                className={`font-mono-tabular text-[11px] whitespace-nowrap ${
                  usedCount > 0 ? 'text-status-success font-medium' : 'text-ink-muted'
                }`}
              >
                {usedCount}/{totalVocab} vocab used
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          data-testid="session-brief-expand-btn"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer shrink-0"
        >
          <span>Expand brief</span>
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section
      data-testid="session-brief-card"
      aria-label="Session Brief"
      className="drawer-reveal border-b border-border-subtle bg-subtle/30 px-4 sm:px-7 py-4 sm:py-5 space-y-3.5"
    >
      {/* Eyebrow & Collapse Control */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono-tabular text-ink-muted min-w-0">
          <span className="text-ink-secondary">{brief.slotContext}</span>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-ink-primary">{brief.promptCode}</span>
          <span aria-hidden="true">·</span>
          <span>{brief.modeLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{brief.toneLabel}</span>
        </div>

        <button
          type="button"
          data-testid="session-brief-collapse-btn"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink-primary transition-colors cursor-pointer shrink-0"
        >
          <span>Collapse brief</span>
          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Title & Scenario Prompt */}
      <div className="space-y-1">
        <h2 className="font-display text-lg sm:text-xl font-medium text-ink-primary leading-snug tracking-tight">
          {brief.title}
        </h2>
        <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed max-w-[65ch]">
          {brief.taskPrompt}
        </p>
      </div>

      {/* Topic Primer + Pivot Rule */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border-subtle text-xs">
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-ink-primary">
            Topic primer
          </div>
          <p className="text-ink-secondary leading-relaxed">
            {brief.topicPrimer}
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-ink-primary">
              Universal pivot rule
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <button
                type="button"
                data-testid="brief-pivot-toggle"
                onClick={() => setPivotOpen((v) => !v)}
                className="inline-flex items-center gap-1 font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
              >
                <Shuffle className="w-3 h-3" aria-hidden="true" />
                <span>Pivot topic</span>
              </button>
              <button
                type="button"
                data-testid="brief-free-write-btn"
                onClick={onEnterFreeWrite}
                className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
              >
                <Feather className="w-3 h-3" aria-hidden="true" />
                <span>Free write</span>
              </button>
            </div>
          </div>
          <p className="text-ink-secondary leading-relaxed">
            {brief.pivotRule}
          </p>
        </div>
      </div>

      {/* Inline Pivot Input */}
      {pivotOpen && (
        <div
          data-testid="brief-pivot-drawer"
          className="drawer-reveal p-3 rounded-lg border border-border-default bg-surface space-y-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              data-testid="brief-pivot-input"
              value={pivotDraft}
              onChange={(e) => setPivotDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmitPivot();
                }
              }}
              placeholder="e.g., Ultrasonic tank-level sensor, PCB debug email, internship reflection..."
              aria-label="Custom topic focus for pivot"
              className="input-tactile flex-1 min-w-[200px] px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              data-testid="brief-pivot-submit"
              disabled={pivoting || pivotDraft.trim().length < 3}
              onClick={() => void handleSubmitPivot()}
              className="btn-primary px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              <span>{pivoting ? 'Pivoting...' : 'Apply pivot'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Practice Targets */}
      <div className="pt-3 border-t border-border-subtle space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-ink-primary">
            Active practice targets
          </span>
          {totalVocab > 0 && (
            <span
              data-testid="brief-vocab-counter"
              className={`font-mono-tabular text-[11px] ${
                usedCount > 0 ? 'text-status-success font-medium' : 'text-ink-muted'
              }`}
            >
              {usedCount}/{totalVocab} vocab woven in
            </span>
          )}
        </div>

        {/* Mechanics Check */}
        <p className="text-xs text-ink-secondary leading-relaxed">
          <span className="font-medium text-ink-primary">Mechanics check: </span>
          {brief.mechanicsCheck}
        </p>

        {/* Vocabulary to Try */}
        {totalVocab > 0 && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-ink-muted mr-1">
                Vocabulary to try:
              </span>
              {brief.vocabTargets.map((target) => {
                const isUsed = usedSet.has(target.phrase.toLowerCase());
                return (
                  <button
                    key={target.id}
                    type="button"
                    data-testid={`brief-vocab-chip-${target.phrase
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')}`}
                    data-used={isUsed ? 'true' : 'false'}
                    onClick={() => onInsertVocabPhrase?.(target.phrase)}
                    title={
                      target.replaces
                        ? `Upgrades "${target.replaces}" — ${target.hint}`
                        : target.hint
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                      isUsed
                        ? 'border-status-success-border bg-status-success-soft text-status-success'
                        : 'border-border-default bg-surface text-ink-primary hover:border-border-strong'
                    }`}
                  >
                    {isUsed && (
                      <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>{target.phrase}</span>
                    {isUsed && (
                      <span className="text-[10px] opacity-85">Used</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              {brief.vocabWeaveCue}
            </p>
          </div>
        )}
      </div>

      {/* Zero-Pressure Editorial Invitation */}
      <p className="text-[11px] italic text-ink-muted pt-1">
        Write your draft directly below whenever you&apos;re ready (no word-count limits). Run an evaluation when finished to verify your targets and log progress.
      </p>
    </section>
  );
}
