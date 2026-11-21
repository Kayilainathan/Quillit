import { useMemo, useState } from 'react';
import { Check, Edit3, Lightbulb, Shuffle, Sparkles, Wand2, X } from 'lucide-react';
import type {
  CalendarSlot,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  RealtimeAssistResult,
  RubricScores,
  StudentProfile,
  VocabEntry,
  VocabSuggestion,
  WritingSession,
} from '../types';
import {
  MODE_LABELS,
  RUBRIC_DIMENSIONS,
  TONE_LABELS,
  analyzeDraftLocally,
  applyMultipleReplacements,
  computePercentage,
  computeReadabilityStats,
  computeTotalScore,
  deriveInternationalMetrics,
  type CoachPerformanceContext,
} from '../utils/analytics';
import { getApiUrl, safeParseJsonResponse } from '../utils/apiBase';

interface EvaluationPayload {
  evaluationStatus?: 'completed' | 'queued_for_reset';
  modelUsed?: string;
  thinkingLevelUsed?: string;
  downgraded?: boolean;
  quotaResetSeconds?: number;
  scores: RubricScores;
  cefrLevel: string;
  internationalMetrics?: InternationalMetrics;
  toneVerdict: string;
  flowVerdict: string;
  feedbackImplemented: FeedbackImplementedStatus;
  whatImproved: string;
  strictImprovements: string;
  masteredWordsUsed?: string[];
  grammarFixes: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
}

interface ScheduledTaskModalProps {
  slot: CalendarSlot;
  todayISO: string;
  studentProfile?: StudentProfile;
  coachContext: CoachPerformanceContext;
  onClose: () => void;
  onUpdateSlot: (slot: CalendarSlot) => void;
  onCompleteTask: (
    session: WritingSession,
    newVocabEntries: VocabEntry[],
    slotId: string,
    aiMasteredWords?: string[]
  ) => string[];
}

export function ScheduledTaskModal({
  slot,
  todayISO,
  studentProfile,
  coachContext,
  onClose,
  onUpdateSlot,
  onCompleteTask,
}: ScheduledTaskModalProps) {
  const [content, setContent] = useState('');
  const [editingTopic, setEditingTopic] = useState(false);
  const [customTopic, setCustomTopic] = useState(slot.topic);
  const [showSuggestions, setShowSuggestions] = useState(
    Boolean(slot.suggestions && slot.suggestions.length > 0)
  );
  const [showPivot, setShowPivot] = useState(false);
  const [pivotFocus, setPivotFocus] = useState('');
  const [pivoting, setPivoting] = useState(false);

  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeResult, setRealtimeResult] =
    useState<RealtimeAssistResult | null>(null);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const diagnostics = useMemo(() => analyzeDraftLocally(content), [content]);
  const readability = useMemo(() => computeReadabilityStats(content), [content]);
  const progressPct = Math.min(
    100,
    Math.round((diagnostics.wordCount / Math.max(1, slot.targetWords)) * 100)
  );

  async function handlePivot() {
    if (pivotFocus.trim().length < 3) return;
    setPivoting(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/pivot-topic'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          customFocus: pivotFocus.trim(),
        }),
      });
      const data = await safeParseJsonResponse<Record<string, unknown>>(res);
      if (!res.ok || !data) {
        throw new Error(
          (typeof data?.error === 'string' && data.error) ||
            'Topic pivot requires an active API server.'
        );
      }
      onUpdateSlot({
        ...slot,
        topic: String(data.topic || pivotFocus.trim()),
        topicPrimer: String(data.topicPrimer || slot.topicPrimer || ''),
        suggestions:
          Array.isArray(data.suggestions) && data.suggestions.length > 0
            ? data.suggestions
            : slot.suggestions,
      });
      setPivotFocus('');
      setShowPivot(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to pivot prompt.');
    } finally {
      setPivoting(false);
    }
  }

  async function handleLiveAssist() {
    setError(null);
    setAppliedBanner(null);
    if (content.trim().length < 15) {
      setError('Write at least one sentence before running live suggestions.');
      return;
    }
    setRealtimeLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/realtime-assist'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode: MODE_LABELS[slot.mode],
          tone: TONE_LABELS[slot.tone],
        }),
      });
      const data = await safeParseJsonResponse<Record<string, unknown>>(res);
      if (!res.ok || !data) {
        throw new Error(
          (typeof data?.error === 'string' && data.error) ||
            'Live AI assist requires an active API server.'
        );
      }
      setRealtimeResult(data as unknown as RealtimeAssistResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live assist failed.');
    } finally {
      setRealtimeLoading(false);
    }
  }

  function handleApplyAllLive() {
    if (!realtimeResult) return;
    const pairs = [
      ...realtimeResult.grammarAlerts.map((g) => ({
        original: g.original,
        replacement: g.corrected,
      })),
      ...realtimeResult.vocabUpgrades.map((v) => ({
        original: v.used,
        replacement: v.betterAlternative,
      })),
    ];
    const { updatedText, appliedCount } = applyMultipleReplacements(content, pairs);
    setContent(updatedText);
    setAppliedBanner(
      appliedCount > 0
        ? `Applied ${appliedCount} live improvement${appliedCount === 1 ? '' : 's'} to your draft.`
        : 'All matching phrases were already updated.'
    );
  }

  async function handleEvaluateAndFinish() {
    setError(null);
    if (content.trim().length < 20) {
      setError('Write at least 20 characters before evaluating this scheduled slot.');
      return;
    }
    setEvaluating(true);
    try {
      const res = await fetch(getApiUrl('/api/evaluate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode: MODE_LABELS[slot.mode],
          tone: TONE_LABELS[slot.tone],
          topic: slot.topic,
          topicPrimer: slot.topicPrimer || '',
          previousSessionSummary: coachContext.previousSessionSummary,
          practicingVocab: coachContext.practicingWords.map(
            (v) => v.betterAlternative
          ),
          studentProfile,
        }),
      });
      const data = await safeParseJsonResponse<Record<string, unknown>>(res);
      if (!res.ok || !data) {
        throw new Error(
          (typeof data?.error === 'string' && data.error) ||
            'AI evaluation requires an active API server.'
        );
      }
      setEvaluation(data as unknown as EvaluationPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  }

  function handleSaveAndComplete() {
    if (!evaluation) return;
    const isQueued = evaluation.evaluationStatus === 'queued_for_reset';
    const totalScore = computeTotalScore(evaluation.scores);
    const percentage = computePercentage(totalScore);
    const sessionId = `SESSION_${todayISO.replace(/-/g, '')}_${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;

    const intl = deriveInternationalMetrics({
      scores: evaluation.scores,
      content: content.trim(),
      internationalMetrics: evaluation.internationalMetrics,
    });

    const session: WritingSession = {
      id: sessionId,
      date: todayISO,
      daySlot: `${slot.dayOfWeek} - ${slot.slotLabel}`,
      mode: slot.mode,
      promptCategory: slot.promptCategory,
      tone: slot.tone,
      topicDescription: slot.topic,
      content: content.trim(),
      wordCount: diagnostics.wordCount,
      scores: evaluation.scores,
      totalScore,
      percentage,
      cefrLevel: evaluation.cefrLevel,
      internationalMetrics: intl,
      toneVerdict: evaluation.toneVerdict,
      flowVerdict: evaluation.flowVerdict,
      feedbackImplemented: evaluation.feedbackImplemented,
      whatImproved: evaluation.whatImproved,
      strictImprovements: evaluation.strictImprovements,
      grammarFixes: evaluation.grammarFixes,
      vocabUpgrades: evaluation.vocabUpgrades,
      status: 'Completed',
      evaluationPending: isQueued,
      modelUsed: evaluation.modelUsed,
      queuedAt: isQueued ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };

    const newVocab: VocabEntry[] = evaluation.vocabUpgrades.map((v, idx) => ({
      id: `vocab-${Date.now()}-${idx}`,
      used: v.used,
      betterAlternative: v.betterAlternative,
      explanation: v.explanation,
      contextSnippet: v.contextSnippet || slot.topic,
      mode: slot.mode,
      dateAdded: todayISO,
      mastered: false,
      sessionId,
    }));

    onCompleteTask(session, newVocab, slot.id, evaluation.masteredWordsUsed);
    onClose();
  }

  const evalTotal = evaluation ? computeTotalScore(evaluation.scores) : 0;
  const evalIntl = evaluation
    ? deriveInternationalMetrics({
        scores: evaluation.scores,
        content,
        internationalMetrics: evaluation.internationalMetrics,
      })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheduled-popup-title"
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="modal-panel max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-ink-muted font-medium font-mono-tabular">
              {slot.scheduledDate} · {slot.dayOfWeek} · {slot.slotLabel}
            </div>
            {editingTopic ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  aria-label="Edit scheduled topic title"
                  className="input-tactile flex-1 min-w-[200px] px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customTopic.trim()) {
                      onUpdateSlot({ ...slot, topic: customTopic.trim() });
                    }
                    setEditingTopic(false);
                  }}
                  className="btn-primary px-3 py-1.5 text-xs font-medium"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomTopic(slot.topic);
                    setEditingTopic(false);
                  }}
                  className="btn-secondary px-2.5 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2 mt-1">
                <h2
                  id="scheduled-popup-title"
                  className="font-display text-xl font-medium text-ink-primary"
                >
                  {slot.topic}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setCustomTopic(slot.topic);
                    setEditingTopic(true);
                  }}
                  aria-label="Edit topic title"
                  title="Edit topic title"
                  className="btn-ghost p-1 mt-0.5 shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="text-xs text-ink-muted mt-1">
              {MODE_LABELS[slot.mode]} · {TONE_LABELS[slot.tone]} · Target{' '}
              <span className="font-mono-tabular">{slot.targetWords}</span> words
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close scheduled task popup"
            className="btn-ghost p-1.5"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Beginner Topic Primer & Coach Reminder */}
        {(slot.topicPrimer || slot.feedbackReminder || coachContext.activeReminder) && (
          <div className="rounded-lg border border-border-subtle bg-subtle px-3.5 py-3 space-y-1.5 text-xs">
            {slot.topicPrimer && (
              <p className="text-ink-secondary leading-relaxed">
                <span className="font-semibold text-ink-primary">
                  Topic Primer:{' '}
                </span>
                {slot.topicPrimer}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-status-warning">
              <span>
                Coach Focus:{' '}
                {slot.feedbackReminder || coachContext.activeReminder}
              </span>
              <button
                type="button"
                onClick={() => setShowPivot((v) => !v)}
                className="inline-link-tactile inline-flex items-center gap-1 font-medium"
              >
                <Shuffle className="w-3 h-3" aria-hidden="true" />
                <span>{showPivot ? 'Hide Pivot' : 'Universal Pivot'}</span>
              </button>
            </div>

            {showPivot && (
              <div className="pt-2 border-t border-border-subtle flex flex-wrap gap-2">
                <input
                  type="text"
                  value={pivotFocus}
                  onChange={(e) => setPivotFocus(e.target.value)}
                  placeholder="Swap to any familiar circuit, email, or story..."
                  aria-label="Universal Pivot custom topic"
                  className="input-tactile flex-1 min-w-[200px] px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={pivoting || pivotFocus.trim().length < 3}
                  onClick={handlePivot}
                  className="btn-primary px-3 py-1.5 text-xs font-medium"
                >
                  {pivoting ? 'Pivoting...' : 'Pivot Now'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Writing Angles */}
        {slot.suggestions && slot.suggestions.length > 0 && (
          <div className="rounded-lg border border-border-subtle bg-subtle px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-primary">
                <Lightbulb className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                <span>Writing Angles &amp; Suggestions</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSuggestions((v) => !v)}
                className="inline-link-tactile text-[11px] font-medium"
              >
                {showSuggestions ? 'Hide' : 'Show'}
              </button>
            </div>
            {showSuggestions && (
              <ul className="mt-2 space-y-1 text-xs text-ink-secondary list-disc pl-4">
                {slot.suggestions.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono-tabular text-ink-muted">
            <span>
              {diagnostics.wordCount} / {slot.targetWords} words ({progressPct}%)
            </span>
            <span>
              {diagnostics.sentenceCount} sentences
              {diagnostics.wordCount > 10
                ? ` · Grade ${readability.fkGradeLevel}`
                : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="scheduled-popup-editor" className="sr-only">
            Scheduled task writing area
          </label>
          <textarea
            id="scheduled-popup-editor"
            rows={7}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your scheduled entry right here to complete this slot..."
            className="input-tactile w-full p-4 text-sm leading-relaxed"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
          >
            {error}
          </div>
        )}

        {appliedBanner && (
          <div className="p-2.5 rounded-lg border border-status-success-border bg-status-success-soft text-xs text-status-success">
            {appliedBanner}
          </div>
        )}

        {realtimeResult && (
          <div className="p-4 rounded-lg border border-border-subtle bg-subtle space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-primary">
                Live Suggestions
              </span>
              {(realtimeResult.grammarAlerts.length > 0 ||
                realtimeResult.vocabUpgrades.length > 0) && (
                <button
                  type="button"
                  onClick={handleApplyAllLive}
                  className="btn-primary px-2.5 py-1 text-xs font-medium"
                >
                  Apply All
                </button>
              )}
            </div>
            <p className="text-xs text-ink-secondary">
              {realtimeResult.toneAlignment} {realtimeResult.clarityNudge}
            </p>
            {realtimeResult.grammarAlerts.map((g, i) => (
              <div key={`g-${i}`} className="text-xs">
                <span className="line-through text-ink-muted">{g.original}</span>{' '}
                →{' '}
                <span className="font-semibold text-status-success">
                  {g.corrected}
                </span>
              </div>
            ))}
            {realtimeResult.vocabUpgrades.map((v, i) => (
              <div key={`v-${i}`} className="text-xs">
                <span className="line-through text-ink-muted">{v.used}</span> →{' '}
                <span className="font-semibold text-ink-primary">
                  {v.betterAlternative}
                </span>
              </div>
            ))}
          </div>
        )}

        {evaluation && evalIntl && (
          <div className="p-4 rounded-lg border border-border-subtle bg-subtle space-y-3">
            {evaluation.evaluationStatus === 'queued_for_reset' && (
              <div className="p-3 rounded-lg border border-status-warning-border bg-status-warning-soft space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-status-warning">
                  <span>Writing Accepted · Evaluation Done When Limit Resets</span>
                  <span className="font-mono-tabular">
                    ~{evaluation.quotaResetSeconds || 30}s
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-border-subtle overflow-hidden">
                  <div className="h-full w-2/3 bg-status-warning" />
                </div>
                <p className="text-[11px] text-status-warning">
                  All AI model limits are temporarily reached. Your writing is accepted now and will auto-complete full AI scoring when the quota resets.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold font-mono-tabular text-ink-primary">
                Score: {evalTotal}/60 ({computePercentage(evalTotal).toFixed(1)}%)
              </div>
              <div className="text-xs font-mono-tabular text-ink-secondary">
                CEFR {evaluation.cefrLevel} · IELTS {evalIntl.ieltsBand.toFixed(1)} ·
                Feedback: {evaluation.feedbackImplemented}
                {evaluation.modelUsed
                  ? ` · ${evaluation.modelUsed === 'queued-pending-reset' ? 'Queued' : `${evaluation.modelUsed}${evaluation.thinkingLevelUsed ? ` (${evaluation.thinkingLevelUsed})` : ''}`}`
                  : ''}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {RUBRIC_DIMENSIONS.map((dim) => (
                <div key={dim.key} className="text-xs">
                  <span className="text-ink-muted">{dim.shortLabel}:</span>{' '}
                  <span className="font-mono-tabular font-semibold text-ink-primary">
                    {evaluation.scores[dim.key]}/10
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-secondary">
              {evaluation.strictImprovements}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={handleLiveAssist}
            disabled={realtimeLoading || evaluating}
            className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium"
          >
            <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{realtimeLoading ? 'Checking...' : 'Live Suggestions'}</span>
          </button>

          <div className="flex items-center gap-2">
            {!evaluation ? (
              <button
                type="button"
                onClick={handleEvaluateAndFinish}
                disabled={evaluating || realtimeLoading}
                className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{evaluating ? 'Evaluating...' : 'Evaluate Draft'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAndComplete}
                className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {evaluation.evaluationStatus === 'queued_for_reset'
                    ? 'Accept & Complete Task'
                    : 'Save & Complete Task'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
