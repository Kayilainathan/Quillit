import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Dices,
  ExternalLink,
  FileText,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Shuffle,
  Sparkles,
  Sun,
  Trash2,
  Unlock,
  Wand2,
  X,
} from 'lucide-react';
import type {
  CalendarSlot,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  RealtimeAssistResult,
  RubricScores,
  StudentProfile,
  ToneSetting,
  VocabEntry,
  VocabSuggestion,
  WritingMode,
  WritingSession,
} from '../types';
import {
  MODE_LABELS,
  RUBRIC_DIMENSIONS,
  TONE_LABELS,
  analyzeDraftLocally,
  applyMultipleReplacements,
  buildQueuedProvisionalEvaluation,
  computePercentage,
  computeReadabilityStats,
  computeTotalScore,
  deriveInternationalMetrics,
  getVisibleWritePageTasks,
  type CoachPerformanceContext,
} from '../utils/analytics';
import {
  drawNextRandomTopic,
  loadPersistedDeckState,
  savePersistedDeckState,
  type TopicDeckState,
} from '../utils/topicDeck';
import {
  applyAllOfflineIssues,
  applyOfflineIssue,
  runOfflineProofread,
  type OfflineProofIssue,
} from '../utils/offlineProofreader';

interface EvaluationPayload {
  evaluationStatus?: 'completed' | 'queued_for_reset';
  modelUsed?: string;
  thinkingLevelUsed?: string;
  downgraded?: boolean;
  cached?: boolean;
  quotaResetSeconds?: number;
  quotaResetAt?: string;
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

interface WriteStudioProps {
  todayISO: string;
  theme: 'light' | 'dark';
  focusMode: boolean;
  onToggleTheme: () => void;
  onToggleFocusMode: () => void;
  sessions: WritingSession[];
  vocabulary: VocabEntry[];
  calendarSlots: CalendarSlot[];
  studentProfile?: StudentProfile;
  coachContext: CoachPerformanceContext;
  autoReloadSchedule: boolean;
  refreshingSchedule: boolean;
  scheduleError: string | null;
  activeAiModelLabel?: string;
  pendingEvalSessionsCount?: number;
  liveOfflineCheckEnabled?: boolean;
  onToggleLiveOfflineCheck?: () => void;
  onRefreshTriWeeklySchedule: () => void;
  onToggleAutoReloadSchedule: () => void;
  onSwapSingleSlot: (slotId: string) => void;
  onClearAllSlots?: () => void;
  onUpdateSlot: (slot: CalendarSlot) => void;
  onOpenCalendar?: () => void;
  initialMode: WritingMode;
  initialTone: ToneSetting;
  initialTopic: string;
  initialDaySlot: string;
  linkedCalendarSlotId?: string;
  onSaveSession: (
    session: WritingSession,
    newVocabEntries: VocabEntry[],
    linkedSlotId?: string,
    aiMasteredWords?: string[]
  ) => string[];
  onSaveDraft?: (draft: WritingSession) => void;
  onDeleteDraft?: (draftId: string) => void;
  onAddVocabEntry: (entry: VocabEntry) => void;
  onOpenScheduledPopup: (slot: CalendarSlot) => void;
}

export function WriteStudio({
  todayISO,
  theme,
  focusMode,
  onToggleTheme,
  onToggleFocusMode,
  sessions,
  vocabulary,
  calendarSlots,
  studentProfile,
  coachContext,
  pendingEvalSessionsCount = 0,
  liveOfflineCheckEnabled = true,
  onToggleLiveOfflineCheck,
  onUpdateSlot,
  initialMode,
  initialTone,
  initialTopic,
  initialDaySlot,
  linkedCalendarSlotId,
  onSaveSession,
  onSaveDraft,
  onDeleteDraft,
  onAddVocabEntry,
  onOpenScheduledPopup,
}: WriteStudioProps) {
  const [mode, setMode] = useState<WritingMode>(initialMode);
  const [tone, setTone] = useState<ToneSetting>(initialTone);
  const [topic, setTopic] = useState(initialTopic);
  const [daySlot, setDaySlot] = useState(initialDaySlot);
  const [activeSlotId, setActiveSlotId] = useState<string | undefined>(
    linkedCalendarSlotId
  );
  const [content, setContent] = useState('');
  const [debouncedContent, setDebouncedContent] = useState('');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftSavedLabel, setDraftSavedLabel] = useState<string | null>(null);
  const [showDraftsShelf, setShowDraftsShelf] = useState(false);

  const [preLoadSnapshot, setPreLoadSnapshot] = useState<{
    mode: WritingMode;
    tone: ToneSetting;
    topic: string;
    daySlot: string;
    activeSlotId?: string;
    content: string;
  } | null>(() =>
    linkedCalendarSlotId
      ? {
          mode: 'journal',
          tone: 'conversational',
          topic: '',
          daySlot: 'Free Write',
          activeSlotId: undefined,
          content: '',
        }
      : null
  );

  // Non-repeating zero-API random topic deck (simulated AI shimmer, 0 tokens)
  const deckStateRef = useRef<TopicDeckState | null>(loadPersistedDeckState());
  const topicTimerRef = useRef<number | null>(null);
  const [suggestingTopic, setSuggestingTopic] = useState(false);
  const [suggestedTopicMeta, setSuggestedTopicMeta] = useState<{
    hint: string;
    category: string;
    position: number;
    total: number;
  } | null>(null);

  // Universal Pivot controls when a slot is loaded
  const [showPivotInput, setShowPivotInput] = useState(false);
  const [pivotFocus, setPivotFocus] = useState('');
  const [pivoting, setPivoting] = useState(false);

  // Live instant offline proofreader drawer visibility
  const [showOfflinePanel, setShowOfflinePanel] = useState(true);
  const [showAllDueTasks, setShowAllDueTasks] = useState(false);

  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeResult, setRealtimeResult] =
    useState<RealtimeAssistResult | null>(null);
  const [liveAppliedNotice, setLiveAppliedNotice] = useState<string | null>(
    null
  );

  const [checkedAngles, setCheckedAngles] = useState<Record<string, boolean>>(
    {}
  );

  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationPayload | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [promotedVocabBanner, setPromotedVocabBanner] = useState<string[] | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedVocabKeys, setSavedVocabKeys] = useState<Set<string>>(new Set());

  const [resetCountdown, setResetCountdown] = useState<number>(0);
  const [initialResetTotal, setInitialResetTotal] = useState<number>(30);

  // Debounce content lightly (~120ms) for silky-smooth instant live offline proofreading
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedContent(content);
    }, 120);
    return () => window.clearTimeout(t);
  }, [content]);

  useEffect(() => {
    return () => {
      if (topicTimerRef.current !== null) {
        window.clearTimeout(topicTimerRef.current);
      }
    };
  }, []);

  const diagnostics = useMemo(() => analyzeDraftLocally(content), [content]);
  const readability = useMemo(() => computeReadabilityStats(content), [content]);

  const offlineIssues = useMemo(
    () => (liveOfflineCheckEnabled ? runOfflineProofread(debouncedContent) : []),
    [liveOfflineCheckEnabled, debouncedContent]
  );

  const savedDrafts = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'Draft')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessions]
  );

  const { todayTasks, pastIncompleteTasks } = useMemo(
    () => getVisibleWritePageTasks(calendarSlots, todayISO),
    [calendarSlots, todayISO]
  );

  const visibleWriteTasks = useMemo(
    () => [...todayTasks, ...pastIncompleteTasks],
    [todayTasks, pastIncompleteTasks]
  );

  const activeLinkedSlot = useMemo(
    () =>
      activeSlotId
        ? calendarSlots.find((s) => s.id === activeSlotId) ?? null
        : null,
    [activeSlotId, calendarSlots]
  );

  const formattedToday = useMemo(() => {
    try {
      const [y, m, d] = todayISO.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return dt.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return todayISO;
    }
  }, [todayISO]);

  function handleSuggestRandomTopic() {
    if (suggestingTopic) return;
    setErrorMessage(null);
    setSuggestingTopic(true);

    if (topicTimerRef.current !== null) {
      window.clearTimeout(topicTimerRef.current);
    }

    // Crisp simulated AI thinking beat — zero network calls, zero API tokens
    topicTimerRef.current = window.setTimeout(() => {
      const draw = drawNextRandomTopic(deckStateRef.current);
      deckStateRef.current = draw.nextState;
      savePersistedDeckState(draw.nextState);

      if (activeSlotId) {
        setActiveSlotId(undefined);
        setPreLoadSnapshot(null);
      }
      setTopic(draw.topic.title);
      setMode(draw.topic.mode);
      setTone(draw.topic.tone);
      setDaySlot(draw.topic.category);
      setSuggestedTopicMeta({
        hint: draw.topic.hint,
        category: draw.topic.category,
        position: draw.positionInCycle,
        total: draw.totalInCycle,
      });
      setSuggestingTopic(false);
    }, 520);
  }

  function handleSaveDraftClick() {
    if (!onSaveDraft) return;
    setErrorMessage(null);
    if (!topic.trim() && !content.trim()) {
      setErrorMessage('Write a title or a few words before saving a draft.');
      return;
    }

    const nowISO = new Date().toISOString();
    const draftId = activeDraftId || `draft-${Date.now()}`;
    const effectiveTopic =
      topic.trim() || `${MODE_LABELS[mode]} Draft (${todayISO})`;
    const baselineScores: RubricScores = {
      naturalVoiceFlow: 0,
      claritySimplicity: 0,
      grammarMechanics: 0,
      toneEngagement: 0,
      sentenceVarietyCadence: 0,
      concisenessDirectness: 0,
    };

    const draftSession: WritingSession = {
      id: draftId,
      date: todayISO,
      daySlot: daySlot.trim() || 'Draft',
      mode,
      promptCategory: MODE_LABELS[mode],
      tone,
      topicDescription: effectiveTopic,
      content,
      wordCount: diagnostics.wordCount,
      scores: baselineScores,
      totalScore: 0,
      percentage: 0,
      cefrLevel: 'Draft',
      toneVerdict: '',
      flowVerdict: '',
      feedbackImplemented: 'Baseline',
      whatImproved: '',
      strictImprovements: '',
      grammarFixes: [],
      vocabUpgrades: [],
      status: 'Draft',
      createdAt: nowISO,
    };

    onSaveDraft(draftSession);
    setActiveDraftId(draftId);
    const timeText = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    setDraftSavedLabel(`Saved ${timeText}`);
  }

  function handleLoadDraft(draft: WritingSession) {
    setActiveSlotId(undefined);
    setPreLoadSnapshot(null);
    setActiveDraftId(draft.id);
    setMode(draft.mode);
    setTone(draft.tone);
    setTopic(draft.topicDescription);
    setDaySlot(draft.daySlot || 'Draft');
    setContent(draft.content);
    setSuggestedTopicMeta(null);
    setEvaluation(null);
    setRealtimeResult(null);
    setSavedSuccess(false);
    setDraftSavedLabel('Loaded draft');
    setShowDraftsShelf(false);
  }

  function handleApplySingleOfflineFix(issue: OfflineProofIssue) {
    setContent((prev) => applyOfflineIssue(prev, issue));
    setDraftSavedLabel(null);
  }

  function handleApplyAllOfflineFixes() {
    if (offlineIssues.length === 0) return;
    setContent((prev) => applyAllOfflineIssues(prev, offlineIssues));
    setDraftSavedLabel(null);
  }

  const existingVocabSet = useMemo(() => {
    const s = new Set<string>();
    for (const v of vocabulary) {
      s.add(`${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`);
    }
    return s;
  }, [vocabulary]);

  useEffect(() => {
    if (
      !evaluation ||
      evaluation.evaluationStatus !== 'queued_for_reset' ||
      resetCountdown <= 0
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [evaluation, resetCountdown]);

  useEffect(() => {
    if (
      evaluation?.evaluationStatus === 'queued_for_reset' &&
      resetCountdown === 0 &&
      !evaluating &&
      content.trim().length >= 20
    ) {
      void handleEvaluateDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCountdown]);

  function handleLoadSlotInStudio(slot: CalendarSlot) {
    if (!activeSlotId) {
      setPreLoadSnapshot({
        mode,
        tone,
        topic,
        daySlot,
        activeSlotId,
        content,
      });
    }
    setMode(slot.mode);
    setTone(slot.tone);
    setTopic(slot.topic);
    setDaySlot(`${slot.dayOfWeek} · ${slot.slotLabel}`);
    setActiveSlotId(slot.id);
    setCheckedAngles({});
    setShowPivotInput(false);
    setErrorMessage(null);
  }

  function handleUndoLoadTask() {
    if (preLoadSnapshot) {
      setMode(preLoadSnapshot.mode);
      setTone(preLoadSnapshot.tone);
      setTopic(preLoadSnapshot.topic);
      setDaySlot(preLoadSnapshot.daySlot);
      setActiveSlotId(preLoadSnapshot.activeSlotId);
      setContent(preLoadSnapshot.content);
    } else {
      setActiveSlotId(undefined);
    }
    setPreLoadSnapshot(null);
    setShowPivotInput(false);
    setCheckedAngles({});
    setErrorMessage(null);
  }

  async function handleUniversalPivot() {
    if (!activeLinkedSlot || pivotFocus.trim().length < 3) return;
    setPivoting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/pivot-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: activeLinkedSlot,
          customFocus: pivotFocus.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to apply Universal Pivot.');
      const nextTopic = String(data.topic || pivotFocus.trim());
      const nextSlot: CalendarSlot = {
        ...activeLinkedSlot,
        topic: nextTopic,
        topicPrimer: String(data.topicPrimer || activeLinkedSlot.topicPrimer || ''),
        suggestions:
          Array.isArray(data.suggestions) && data.suggestions.length > 0
            ? data.suggestions
            : activeLinkedSlot.suggestions,
      };
      onUpdateSlot(nextSlot);
      setTopic(nextTopic);
      setPivotFocus('');
      setShowPivotInput(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to apply Universal Pivot.'
      );
    } finally {
      setPivoting(false);
    }
  }

  function applyTextReplacement(original: string, replacement: string) {
    const cleanRep = replacement.split('/')[0].trim();
    if (!original || !content.includes(original)) {
      setErrorMessage(
        `Could not locate exact phrase "${original}" in the current draft.`
      );
      return;
    }
    setContent((prev) => prev.replace(original, cleanRep));
    setErrorMessage(null);
  }

  function handleApplyAllLiveSuggestions() {
    if (!realtimeResult) return;
    const pairs = [
      ...realtimeResult.grammarAlerts.map((fix) => ({
        original: fix.original,
        replacement: fix.corrected,
      })),
      ...realtimeResult.vocabUpgrades.map((v) => ({
        original: v.used,
        replacement: v.betterAlternative,
      })),
    ];
    const { updatedText, appliedCount } = applyMultipleReplacements(
      content,
      pairs
    );
    setContent(updatedText);
    setErrorMessage(null);
    setLiveAppliedNotice(
      appliedCount > 0
        ? `Applied ${appliedCount} live suggestion${appliedCount === 1 ? '' : 's'} to your draft.`
        : 'All suggested phrases have already been applied.'
    );
  }

  function handleApplyAllEvaluationFixes() {
    if (!evaluation) return;
    const pairs = evaluation.grammarFixes.map((fix) => ({
      original: fix.original,
      replacement: fix.corrected,
    }));
    const { updatedText, appliedCount } = applyMultipleReplacements(
      content,
      pairs
    );
    setContent(updatedText);
    setErrorMessage(null);
    setLiveAppliedNotice(
      appliedCount > 0
        ? `Applied ${appliedCount} grammar fix${appliedCount === 1 ? '' : 'es'} to your draft.`
        : 'All grammar fixes were already applied.'
    );
  }

  function handleSaveVocabItem(item: VocabSuggestion, sessionId?: string) {
    const key = `${item.used.toLowerCase()}->${item.betterAlternative.toLowerCase()}`;
    if (existingVocabSet.has(key) || savedVocabKeys.has(key)) return;
    onAddVocabEntry({
      id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      used: item.used,
      betterAlternative: item.betterAlternative,
      explanation: item.explanation,
      contextSnippet: item.contextSnippet || topic || 'Draft practice',
      mode,
      dateAdded: todayISO,
      mastered: false,
      sessionId,
    });
    setSavedVocabKeys((prev) => new Set(prev).add(key));
  }

  async function handleRealtimeAssist() {
    setErrorMessage(null);
    if (content.trim().length < 15) {
      setErrorMessage(
        'Write at least one full sentence before running live vocabulary & grammar assist.'
      );
      return;
    }
    setRealtimeLoading(true);
    try {
      const res = await fetch('/api/realtime-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode: MODE_LABELS[mode],
          tone: TONE_LABELS[tone],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Live assist request failed.');
      }
      setRealtimeResult(data as RealtimeAssistResult);
    } catch {
      const fallback = buildQueuedProvisionalEvaluation(content, mode, tone);
      setRealtimeResult({
        toneAlignment: fallback.toneVerdict,
        clarityNudge: fallback.flowVerdict,
        grammarAlerts: fallback.grammarFixes,
        vocabUpgrades: [],
        modelUsed: 'queued-pending-reset',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
        quotaQueued: true,
      });
    } finally {
      setRealtimeLoading(false);
    }
  }

  async function handleEvaluateDraft(isAutoRetry = false) {
    setErrorMessage(null);
    if (!isAutoRetry) {
      setSavedSuccess(false);
      setPromotedVocabBanner(null);
    }

    const effectiveTopic =
      topic.trim() ||
      activeLinkedSlot?.topic ||
      `${MODE_LABELS[mode]} Practice (${todayISO})`;
    if (!topic.trim()) {
      setTopic(effectiveTopic);
    }

    if (content.trim().length < 20) {
      setErrorMessage(
        'Write at least 20 characters before requesting a full rubric evaluation.'
      );
      return;
    }

    setEvaluating(true);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode: MODE_LABELS[mode],
          tone: TONE_LABELS[tone],
          topic: effectiveTopic,
          topicPrimer: activeLinkedSlot?.topicPrimer || '',
          previousSessionSummary: coachContext.previousSessionSummary,
          practicingVocab: coachContext.practicingWords.map(
            (v) => v.betterAlternative
          ),
          studentProfile,
        }),
      });
      const data = (await res.json()) as EvaluationPayload & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Evaluation request failed.');
      }
      setEvaluation(data);
      if (data.evaluationStatus === 'queued_for_reset') {
        const secs = data.quotaResetSeconds || 30;
        setInitialResetTotal(secs);
        setResetCountdown(secs);
      } else {
        setResetCountdown(0);
      }
    } catch {
      const fallback = buildQueuedProvisionalEvaluation(content, mode, tone);
      setInitialResetTotal(30);
      setResetCountdown(30);
      setEvaluation({
        evaluationStatus: 'queued_for_reset',
        modelUsed: 'queued-pending-reset',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
        quotaResetSeconds: 30,
        ...fallback,
      });
    } finally {
      setEvaluating(false);
    }
  }

  function handleSaveEvaluatedSession() {
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

    const newSession: WritingSession = {
      id: sessionId,
      date: todayISO,
      daySlot: daySlot || 'Studio Session',
      mode,
      promptCategory: MODE_LABELS[mode],
      tone,
      topicDescription:
        topic.trim() || `${MODE_LABELS[mode]} Practice (${todayISO})`,
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
      modelUsed: evaluation.modelUsed || 'gemini-2.5-flash',
      queuedAt: isQueued ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };

    const newVocab: VocabEntry[] = evaluation.vocabUpgrades
      .filter((v) => {
        const key = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
        return !existingVocabSet.has(key) && !savedVocabKeys.has(key);
      })
      .map((v, idx) => ({
        id: `vocab-${Date.now()}-${idx}`,
        used: v.used,
        betterAlternative: v.betterAlternative,
        explanation: v.explanation,
        contextSnippet: v.contextSnippet || topic.trim(),
        mode,
        dateAdded: todayISO,
        mastered: false,
        sessionId,
      }));

    const promoted = onSaveSession(
      newSession,
      newVocab,
      activeSlotId,
      evaluation.masteredWordsUsed
    );
    if (promoted.length > 0) {
      setPromotedVocabBanner(promoted);
    }
    setSavedSuccess(true);
  }

  const evalTotal = evaluation ? computeTotalScore(evaluation.scores) : 0;
  const evalPct = evaluation ? computePercentage(evalTotal) : 0;
  const evalIntl = evaluation
    ? deriveInternationalMetrics({
        scores: evaluation.scores,
        content,
        internationalMetrics: evaluation.internationalMetrics,
      })
    : null;

  const hasRightCoachingDrawer = Boolean(realtimeResult || evaluation);
  const targetWordGoal = activeLinkedSlot?.targetWords || 200;
  const wordGoalPct = Math.min(
    100,
    Math.round((diagnostics.wordCount / Math.max(1, targetWordGoal)) * 100)
  );
  const queueProgressPct =
    initialResetTotal > 0
      ? Math.min(
          96,
          Math.max(
            12,
            Math.round(
              ((initialResetTotal - resetCountdown) / initialResetTotal) * 100
            )
          )
        )
      : 50;

  return (
    <div
      className={
        focusMode
          ? 'min-h-screen bg-canvas px-4 py-6 sm:py-10'
          : `${hasRightCoachingDrawer ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-5`
      }
    >
      {/* Minimal Editorial Studio Header */}
      <div
        className={`flex flex-wrap items-end justify-between gap-4 ${
          focusMode ? 'max-w-3xl mx-auto mb-8' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              {focusMode
                ? 'Focused Manuscript'
                : studentProfile?.displayName
                  ? `Write, ${studentProfile.displayName}`
                  : 'Writing Studio'}
            </h1>
            {pendingEvalSessionsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-mono-tabular border border-status-warning-border bg-status-warning-soft text-status-warning">
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span>{pendingEvalSessionsCount} queued</span>
              </span>
            )}
          </div>
          {!focusMode && (
            <p className="text-xs text-ink-muted mt-1 font-mono-tabular">
              {formattedToday}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!focusMode && (
            <button
              type="button"
              data-testid="random-topic-button"
              onClick={handleSuggestRandomTopic}
              disabled={suggestingTopic}
              title="Pick a fresh, non-repeating random topic to write on"
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"
            >
              {suggestingTopic ? (
                <Sparkles
                  className="w-3.5 h-3.5 text-ink-primary animate-pulse"
                  aria-hidden="true"
                />
              ) : (
                <Dices className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
              )}
              <span>
                {suggestingTopic
                  ? 'Picking a topic...'
                  : 'Want a random topic?'}
              </span>
            </button>
          )}

          {!focusMode && (
            <button
              type="button"
              data-testid="drafts-toggle-button"
              onClick={() => setShowDraftsShelf((v) => !v)}
              aria-expanded={showDraftsShelf}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap ${
                showDraftsShelf ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Drafts{savedDrafts.length > 0 ? ` (${savedDrafts.length})` : ''}
              </span>
            </button>
          )}

          {focusMode && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleFocusMode}
            aria-pressed={focusMode}
            className="btn-ghost inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium whitespace-nowrap"
          >
            {focusMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Exit Focus</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Focus</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Saved Drafts Shelf */}
      {!focusMode && showDraftsShelf && (
        <section
          aria-label="Saved drafts"
          data-testid="saved-drafts-shelf"
          className="card-surface p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold text-ink-primary">
                Saved Drafts
              </h2>
              <p className="text-[11px] text-ink-muted">
                Stored privately on this device. Click any draft to resume writing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDraftsShelf(false)}
              aria-label="Close drafts shelf"
              className="btn-ghost p-1"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {savedDrafts.length === 0 ? (
            <div className="py-3 text-xs text-ink-muted">
              No saved drafts yet. Use <strong className="text-ink-secondary font-medium">Save Draft</strong> below the editor (or press <span className="font-mono-tabular">Ctrl/Cmd + S</span>) anytime.
            </div>
          ) : (
            <div className="divide-y divide-border-subtle border-t border-border-subtle">
              {savedDrafts.map((draft) => {
                const isActive = activeDraftId === draft.id;
                return (
                  <div
                    key={draft.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadDraft(draft)}
                      className="flex-1 text-left min-w-0 group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-ink-primary group-hover:underline truncate">
                          {draft.topicDescription || 'Untitled Draft'}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-mono-tabular text-status-success shrink-0">
                            · Editing
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-muted font-mono-tabular mt-0.5">
                        {MODE_LABELS[draft.mode]} · {draft.wordCount}w · {draft.date}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadDraft(draft)}
                        className="btn-secondary px-2.5 py-1 text-[11px] font-medium"
                      >
                        Resume
                      </button>
                      {onDeleteDraft && (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteDraft(draft.id);
                            if (activeDraftId === draft.id) {
                              setActiveDraftId(null);
                            }
                          }}
                          aria-label={`Delete draft ${draft.topicDescription}`}
                          className="btn-ghost p-1.5 text-ink-muted hover:text-status-danger"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Whisper-Quiet Today / Unfinished Scheduled Task Strip (shown only when a task is due) */}
      {!focusMode && visibleWriteTasks.length > 0 && (
        <section
          aria-label="Scheduled writing task due today"
          data-testid="minimal-today-strip"
          className="card-surface overflow-hidden"
        >
          {(showAllDueTasks ? visibleWriteTasks : visibleWriteTasks.slice(0, 1)).map(
            (slot, index) => {
              const isDueToday = slot.scheduledDate === todayISO;
              const isLoaded = activeSlotId === slot.id;
              return (
                <div
                  key={slot.id}
                  className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
                    index > 0 ? 'border-t border-border-subtle' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <CalendarClock
                      className="w-3.5 h-3.5 text-ink-muted shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs min-w-0">
                      <span
                        className={`font-mono-tabular text-[11px] font-semibold shrink-0 ${
                          slot.completed
                            ? 'text-status-success'
                            : isDueToday
                              ? 'text-status-info'
                              : 'text-status-warning'
                        }`}
                      >
                        {slot.completed
                          ? 'Completed'
                          : isDueToday
                            ? 'Today'
                            : `Unfinished · ${slot.scheduledDate}`}
                      </span>
                      <span className="text-ink-muted" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-medium text-ink-primary truncate max-w-md sm:max-w-lg">
                        {slot.topic}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleLoadSlotInStudio(slot)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                        isLoaded ? 'btn-primary' : 'btn-secondary'
                      }`}
                    >
                      {isLoaded ? (
                        <>
                          <Check className="w-3 h-3" aria-hidden="true" />
                          <span>Loaded</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          <span>Write Here</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenScheduledPopup(slot)}
                      title="Open in quick-write popup"
                      className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      <span className="hidden sm:inline">Popup</span>
                    </button>

                    {index === 0 && visibleWriteTasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowAllDueTasks((v) => !v)}
                        className="btn-ghost inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-mono-tabular text-ink-muted whitespace-nowrap"
                      >
                        {showAllDueTasks ? (
                          <>
                            <ChevronUp className="w-3 h-3" aria-hidden="true" />
                            <span>Less</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" aria-hidden="true" />
                            <span>+{visibleWriteTasks.length - 1}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </section>
      )}

      {/* Main Manuscript + On-Demand Coaching Layout */}
      <div
        className={
          focusMode
            ? 'max-w-3xl mx-auto'
            : hasRightCoachingDrawer
              ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'
              : 'max-w-4xl mx-auto'
        }
      >
        <div
          className={
            focusMode || !hasRightCoachingDrawer
              ? 'space-y-4'
              : 'lg:col-span-7 space-y-4'
          }
        >
          <div className="card-surface overflow-hidden">
            {!focusMode && !activeLinkedSlot && (
              <div className="px-5 py-3.5 border-b border-border-subtle bg-subtle/60 flex flex-wrap items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Writing practice mode"
                  className="segmented-track flex flex-wrap items-center gap-1"
                >
                  {(Object.keys(MODE_LABELS) as WritingMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      data-active={mode === m ? 'true' : 'false'}
                      onClick={() => {
                        setMode(m);
                        if (m === 'friend') setTone('conversational');
                        else if (m === 'email') setTone('formal-executive');
                        else if (m === 'technical') setTone('academic-technical');
                        else if (m === 'linkedin') setTone('professional-warm');
                        else if (m === 'creative') setTone('narrative-vivid');
                      }}
                      className="segmented-item px-2.5 py-1.5 text-xs whitespace-nowrap"
                    >
                      {MODE_LABELS[m]}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="tone-select"
                    className="inline-flex items-center gap-1 text-xs text-ink-muted whitespace-nowrap"
                  >
                    <span>Tone</span>
                  </label>
                  <select
                    id="tone-select"
                    value={tone}
                    title="Select target writing tone"
                    onChange={(e) => setTone(e.target.value as ToneSetting)}
                    className="input-tactile px-2.5 py-1.5 text-xs font-medium"
                  >
                    {Object.entries(TONE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Unified Locked Task Header + Brief when a scheduled task is loaded */}
            {activeLinkedSlot && !focusMode && (
              <>
                <div
                  data-testid="locked-task-bar"
                  className="relative px-5 py-3 border-b border-border-subtle bg-subtle/80 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      title="Mode and tone are locked to this scheduled session"
                      className="w-6 h-6 rounded-md border border-border-default bg-surface inline-flex items-center justify-center shrink-0"
                    >
                      <Lock
                        className="w-3 h-3 text-ink-primary"
                        aria-hidden="true"
                      />
                    </span>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs min-w-0">
                      <span className="font-semibold text-ink-primary whitespace-nowrap">
                        {MODE_LABELS[mode]}
                      </span>
                      <span className="text-ink-muted" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-ink-secondary whitespace-nowrap">
                        {TONE_LABELS[tone]}
                      </span>
                      <span className="text-ink-muted" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono-tabular text-[11px] text-ink-muted whitespace-nowrap">
                        {activeLinkedSlot.dayOfWeek} {activeLinkedSlot.scheduledDate}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-tabular text-[11px] text-ink-secondary pr-1 whitespace-nowrap">
                      {diagnostics.wordCount}/{activeLinkedSlot.targetWords}w
                      <span className="text-ink-muted"> ({wordGoalPct}%)</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-px bg-border-default"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPivotInput((v) => !v)}
                      className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      <Shuffle className="w-3 h-3" aria-hidden="true" />
                      <span>Pivot</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUndoLoadTask}
                      aria-label="Unlock mode and detach scheduled task"
                      className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      <Unlock className="w-3 h-3" aria-hidden="true" />
                      <span>Unlock</span>
                    </button>
                  </div>

                  {/* Subtle bottom hairline progress bar toward scheduled word target */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-border-subtle overflow-hidden"
                  >
                    <div
                      className="h-full bg-accent transition-transform duration-200 origin-left"
                      style={{
                        transform: `scaleX(${Math.min(1, wordGoalPct / 100)})`,
                      }}
                    />
                  </div>
                </div>

                <div className="px-5 py-3.5 border-b border-border-subtle bg-subtle/35 space-y-2.5">
                  {activeLinkedSlot.topicPrimer && (
                    <div className="text-xs text-ink-secondary leading-relaxed">
                      <span className="font-semibold text-ink-primary">
                        Brief:{' '}
                      </span>
                      {activeLinkedSlot.topicPrimer}
                    </div>
                  )}

                  <div className="text-[11px] text-ink-secondary">
                    <span className="font-semibold text-status-warning">
                      Coach Focus:{' '}
                    </span>
                    {activeLinkedSlot.feedbackReminder || coachContext.activeReminder}
                  </div>

                {showPivotInput && (
                  <div className="p-3 rounded-md border border-border-default bg-surface space-y-2">
                    <div className="text-[11px] text-ink-secondary">
                      {activeLinkedSlot.pivotRule ||
                        'Swap to any familiar circuit, sensor, email scenario, or story while keeping the same tone.'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={pivotFocus}
                        onChange={(e) => setPivotFocus(e.target.value)}
                        placeholder="e.g., Ultrasonic tank level sensor / Capstone PCB status email..."
                        aria-label="Universal Pivot custom focus"
                        className="input-tactile flex-1 min-w-[200px] px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        disabled={pivoting || pivotFocus.trim().length < 3}
                        onClick={handleUniversalPivot}
                        className="btn-primary px-3 py-1.5 text-xs font-medium"
                      >
                        {pivoting ? 'Pivoting...' : 'Apply Pivot'}
                      </button>
                    </div>
                  </div>
                )}

                {activeLinkedSlot.suggestions &&
                  activeLinkedSlot.suggestions.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      {activeLinkedSlot.suggestions.map((angle, idx) => {
                        const key = `${activeLinkedSlot.id}-${idx}`;
                        const done = Boolean(checkedAngles[key]);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              setCheckedAngles((prev) => ({
                                ...prev,
                                [key]: !done,
                              }))
                            }
                            className={`text-left p-2 rounded-sm border text-[11px] leading-snug flex items-start gap-1.5 transition-colors cursor-pointer ${
                              done
                                ? 'border-status-success-border bg-status-success-soft text-status-success line-through'
                                : 'border-border-subtle bg-surface text-ink-secondary hover:border-border-strong'
                            }`}
                          >
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                done
                                  ? 'text-status-success'
                                  : 'text-ink-muted'
                              }`}
                              aria-hidden="true"
                            />
                            <span>{angle}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  </div>
              </>
            )}

            {/* Manuscript Body */}
            <div className="p-5 sm:p-8 space-y-5">
              {/* Quiet Random Topic Starter Hint (only when drawn from zero-API deck) */}
              {!activeLinkedSlot && !focusMode && suggestedTopicMeta && (
                <div
                  data-testid="random-topic-hint"
                  className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-subtle text-xs"
                >
                  <div className="text-ink-secondary leading-relaxed">
                    <span className="font-medium text-ink-primary">
                      {suggestedTopicMeta.category}:{' '}
                    </span>
                    {suggestedTopicMeta.hint}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono-tabular text-ink-muted">
                    <span>
                      {suggestedTopicMeta.position}/{suggestedTopicMeta.total}
                    </span>
                    <button
                      type="button"
                      onClick={handleSuggestRandomTopic}
                      className="inline-link-tactile text-ink-secondary hover:text-ink-primary font-sans font-medium"
                    >
                      Another
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestedTopicMeta(null)}
                      aria-label="Dismiss topic hint"
                      className="btn-ghost p-0.5"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              <div className="border-b border-border-subtle pb-3">
                <label htmlFor="draft-topic" className="sr-only">
                  Session topic or title
                </label>
                <textarea
                  id="draft-topic"
                  rows={topic.length > 58 ? 2 : 1}
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value.replace(/\r?\n/g, ' '));
                    setDraftSavedLabel(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('writing-editor')?.focus();
                    }
                  }}
                  placeholder="Give your draft a title..."
                  className="w-full font-display text-xl sm:text-2xl leading-snug font-medium bg-transparent text-ink-primary placeholder:text-ink-muted focus:outline-none resize-none overflow-hidden"
                />
              </div>

              <div>
                <label htmlFor="writing-editor" className="sr-only">
                  Writing editor
                </label>
                <textarea
                  id="writing-editor"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setSavedSuccess(false);
                    setDraftSavedLabel(null);
                    setPromotedVocabBanner(null);
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                      e.preventDefault();
                      handleSaveDraftClick();
                    }
                  }}
                  rows={focusMode ? 17 : 8}
                  placeholder={
                    mode === 'linkedin'
                      ? 'Open with a sharp observation or a lesson worth sharing...'
                      : mode === 'email'
                        ? 'Lead clearly with your purpose in the opening line...'
                        : mode === 'friend'
                          ? 'Write naturally, as if catching up with a close friend...'
                          : mode === 'technical'
                            ? 'Explain the core idea clearly, step by step, without jargon...'
                            : mode === 'creative'
                              ? 'Begin with a concrete image, sound, or turning point...'
                              : 'Begin writing freely — your words stay private and encrypted...'
                  }
                  className="w-full bg-transparent text-[15px] sm:text-base leading-[1.85] text-ink-primary placeholder:text-ink-muted resize-y focus:outline-none"
                />
              </div>

              {/* Instant Live Offline Proofreader Strip (0 API tokens, updates live on type) */}
              {liveOfflineCheckEnabled &&
                offlineIssues.length > 0 &&
                showOfflinePanel && (
                  <div
                    data-testid="live-offline-proofreader"
                    className="rounded-lg border border-border-default bg-subtle/60 px-3.5 py-2.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2 text-ink-secondary">
                        <span className="font-semibold text-ink-primary">
                          Live Proofreader
                        </span>
                        <span className="text-ink-muted">·</span>
                        <span className="font-mono-tabular text-ink-muted">
                          {offlineIssues.length}{' '}
                          {offlineIssues.length === 1 ? 'fix' : 'fixes'} · Offline
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleApplyAllOfflineFixes}
                          className="inline-link-tactile text-ink-primary font-medium"
                        >
                          Fix all
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowOfflinePanel(false)}
                          aria-label="Hide live offline suggestions"
                          className="btn-ghost p-0.5"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {offlineIssues.slice(0, 6).map((issue) => {
                        const categoryColor =
                          issue.category === 'spelling'
                            ? 'text-status-danger'
                            : issue.category === 'punctuation'
                              ? 'text-status-info'
                              : 'text-status-warning';
                        const displayOriginal =
                          issue.original.trim() === ''
                            ? 'extra space'
                            : issue.original;
                        const displayReplacement =
                          issue.replacement === ' ' ? 'single space' : issue.replacement;
                        return (
                          <button
                            key={issue.id}
                            type="button"
                            onClick={() => handleApplySingleOfflineFix(issue)}
                            title={`${issue.rule} — click to apply`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border-default bg-surface hover:border-border-strong text-[11px] transition-colors cursor-pointer"
                          >
                            <span className="line-through text-ink-muted">
                              {displayOriginal}
                            </span>
                            <span className="text-ink-muted" aria-hidden="true">
                              →
                            </span>
                            <span className="font-medium text-ink-primary">
                              {displayReplacement}
                            </span>
                            <span
                              className={`text-[10px] capitalize ${categoryColor}`}
                            >
                              {issue.category}
                            </span>
                          </button>
                        );
                      })}
                      {offlineIssues.length > 6 && (
                        <span className="self-center text-[11px] font-mono-tabular text-ink-muted px-1">
                          +{offlineIssues.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

              {/* Minimal Manuscript Footer */}
              <div className="pt-4 border-t border-border-subtle flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono-tabular text-ink-muted">
                  <span className="font-semibold text-ink-primary">
                    {diagnostics.wordCount} words
                  </span>
                  {diagnostics.wordCount > 0 && (
                    <>
                      <span>·</span>
                      <span>{diagnostics.sentenceCount} sentences</span>
                      <span>·</span>
                      <span>FK {readability.fkGradeLevel}</span>
                    </>
                  )}

                  <span>·</span>
                  {liveOfflineCheckEnabled ? (
                    offlineIssues.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowOfflinePanel((v) => !v)}
                        className="inline-flex items-center gap-1 text-status-warning hover:underline cursor-pointer"
                      >
                        <span>
                          {offlineIssues.length} live{' '}
                          {offlineIssues.length === 1 ? 'fix' : 'fixes'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onToggleLiveOfflineCheck}
                        title="Instant offline grammar & punctuation check is active — click to pause"
                        className="inline-flex items-center gap-1 text-status-success hover:opacity-80 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        <span>Live Check</span>
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={onToggleLiveOfflineCheck}
                      title="Enable instant offline grammar & punctuation check"
                      className="text-ink-muted hover:text-ink-primary cursor-pointer"
                    >
                      Live Check Off
                    </button>
                  )}

                  {draftSavedLabel && (
                    <>
                      <span>·</span>
                      <span
                        data-testid="draft-saved-status"
                        className="text-status-success"
                      >
                        {draftSavedLabel}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onSaveDraft && (
                    <button
                      type="button"
                      data-testid="save-draft-button"
                      onClick={handleSaveDraftClick}
                      className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Save Draft</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleRealtimeAssist}
                    disabled={realtimeLoading || evaluating}
                    title="Deep AI tone & vocabulary check"
                    className="btn-ghost inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium whitespace-nowrap"
                  >
                    <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{realtimeLoading ? 'Checking...' : 'AI Polish'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEvaluateDraft(false)}
                    disabled={evaluating || realtimeLoading}
                    className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {evaluating ? 'Evaluating...' : 'Evaluate & Score'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-md border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* Right Column Coaching Drawer */}
        {hasRightCoachingDrawer && (
          <aside className="lg:col-span-5 space-y-5">
            {realtimeResult && (
              <div className="card-surface p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-ink-primary">
                        Real-Time Coach
                      </h2>
                      {realtimeResult.modelUsed && (
                        <span className="text-[10px] font-mono-tabular px-2 py-0.5 rounded-sm bg-subtle border border-border-subtle text-ink-secondary">
                          {realtimeResult.modelUsed}
                          {realtimeResult.thinkingLevelUsed
                            ? ` · ${realtimeResult.thinkingLevelUsed}`
                            : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                      {realtimeResult.toneAlignment}
                    </p>
                    <p className="text-xs text-ink-primary mt-1.5 leading-relaxed">
                      <span className="font-medium">Clarity nudge:</span> {realtimeResult.clarityNudge}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {(realtimeResult.grammarAlerts.length > 0 ||
                      realtimeResult.vocabUpgrades.length > 0) && (
                      <button
                        type="button"
                        onClick={handleApplyAllLiveSuggestions}
                        className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Apply All</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRealtimeResult(null)}
                      aria-label="Close live coach"
                      className="btn-ghost p-1.5"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {liveAppliedNotice && (
                  <div className="p-2.5 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success">
                    {liveAppliedNotice}
                  </div>
                )}

                {realtimeResult.grammarAlerts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-ink-secondary">
                      Grammar Quick Fixes
                    </h3>
                    {realtimeResult.grammarAlerts.map((fix, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-md bg-subtle border border-border-subtle text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            <span className="line-through text-ink-muted">
                              {fix.original}
                            </span>{' '}
                            →{' '}
                            <span className="font-semibold text-status-success">
                              {fix.corrected}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              applyTextReplacement(fix.original, fix.corrected)
                            }
                            className="inline-link-tactile text-[11px] font-medium whitespace-nowrap cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          {fix.category} · {fix.rule}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {realtimeResult.vocabUpgrades.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-ink-secondary">
                      Real-Time Vocabulary Upgrades
                    </h3>
                    {realtimeResult.vocabUpgrades.map((v, idx) => {
                      const key = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
                      const alreadySaved =
                        existingVocabSet.has(key) || savedVocabKeys.has(key);
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-md bg-subtle border border-border-subtle text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              <span className="line-through text-ink-muted">
                                {v.used}
                              </span>{' '}
                              →{' '}
                              <span className="font-semibold text-ink-primary">
                                {v.betterAlternative}
                              </span>
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  applyTextReplacement(
                                    v.used,
                                    v.betterAlternative
                                  )
                                }
                                className="inline-link-tactile text-[11px] font-medium cursor-pointer"
                              >
                                Use
                              </button>
                              <button
                                type="button"
                                disabled={alreadySaved}
                                onClick={() => handleSaveVocabItem(v)}
                                className="inline-link-tactile text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                {alreadySaved ? 'Saved' : '+ Library'}
                              </button>
                            </div>
                          </div>
                          <div className="text-[11px] text-ink-muted">
                            {v.explanation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {evaluation && evalIntl && (
              <div className="card-surface p-5 space-y-4">
                {evaluation.evaluationStatus === 'queued_for_reset' && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="p-4 rounded-md border border-status-warning-border bg-status-warning-soft space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-status-warning">
                        <Clock
                          className="w-4 h-4"
                          aria-hidden="true"
                        />
                        <span>
                          Writing Accepted · Evaluation Done When Limit Resets
                        </span>
                      </div>
                      <span className="text-[11px] font-mono-tabular font-semibold text-status-warning">
                        {resetCountdown > 0
                          ? `Reset in ${resetCountdown}s`
                          : 'Re-checking...'}
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
                      <div
                        className="h-full bg-status-warning transition-all duration-500"
                        style={{ width: `${queueProgressPct}%` }}
                      />
                    </div>

                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      All AI model tiers reached their current rate limit. Your writing is accepted now with provisional metrics below and will automatically finalize full AI evaluation when the limit resets.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleEvaluateDraft(true)}
                        disabled={evaluating}
                        className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${evaluating ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>
                          {evaluating ? 'Checking Limit...' : 'Retry AI Now'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {promotedVocabBanner && promotedVocabBanner.length > 0 && (
                  <div className="p-3 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success">
                    <span className="font-semibold">Auto-Mastered in Library: </span>
                    {promotedVocabBanner.join(', ')}
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                      <span>
                        CEFR {evaluation.cefrLevel} · IELTS{' '}
                        {evalIntl.ieltsBand.toFixed(1)} · TOEFL{' '}
                        {evalIntl.toeflEquivalent}/30
                      </span>
                      {evaluation.modelUsed && (
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono-tabular bg-subtle border border-border-subtle text-ink-secondary">
                          {evaluation.modelUsed === 'queued-pending-reset'
                            ? 'Provisional · Queued'
                            : `${evaluation.modelUsed}${evaluation.thinkingLevelUsed ? ` (${evaluation.thinkingLevelUsed})` : ''}`}
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-semibold font-mono-tabular text-ink-primary mt-0.5">
                      {evalTotal}/60{' '}
                      <span className="text-sm font-medium text-ink-secondary">
                        ({evalPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveEvaluatedSession}
                    disabled={savedSuccess}
                    className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
                  >
                    {savedSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {evaluation.evaluationStatus === 'queued_for_reset'
                            ? 'Accepted & Queued'
                            : 'Saved to Studio'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {evaluation.evaluationStatus === 'queued_for_reset'
                            ? 'Accept & Save Writing'
                            : 'Save Session'}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {RUBRIC_DIMENSIONS.map((dim) => (
                    <div
                      key={dim.key}
                      className="p-2.5 rounded-md bg-subtle border border-border-subtle"
                    >
                      <div className="text-[11px] text-ink-muted truncate">
                        {dim.label}
                      </div>
                      <div className="text-sm font-semibold font-mono-tabular text-ink-primary mt-0.5">
                        {evaluation.scores[dim.key]}/10
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-md bg-subtle border border-border-subtle space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-primary">
                    <span>International Validation Benchmarks</span>
                    <span className="font-mono-tabular text-ink-secondary">
                      Feedback Applied: {evaluation.feedbackImplemented}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono-tabular">
                    <div>
                      <span className="text-ink-muted">Lexical Resource:</span>{' '}
                      <span className="font-semibold text-ink-primary">
                        {evalIntl.lexicalResource}/10
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Cohesion:</span>{' '}
                      <span className="font-semibold text-ink-primary">
                        {evalIntl.coherenceCohesion}/10
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Task Achievement:</span>{' '}
                      <span className="font-semibold text-ink-primary">
                        {evalIntl.taskAchievement}/10
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Register Control:</span>{' '}
                      <span className="font-semibold text-ink-primary">
                        {evalIntl.registerControl}/10
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Flesch Ease:</span>{' '}
                      <span className="font-semibold text-ink-primary">
                        {evalIntl.fleschReadingEase}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">FK Grade:</span>{' '}
                      <span className="font-semibold text-ink-primary">
                        {evalIntl.fkGradeLevel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs leading-relaxed">
                  <div>
                    <span className="font-semibold text-ink-primary">
                      Tone &amp; Flow:{' '}
                    </span>
                    <span className="text-ink-secondary">
                      {evaluation.toneVerdict} {evaluation.flowVerdict}
                    </span>
                  </div>

                  <div>
                    <span className="font-semibold text-ink-primary">
                      What Changed for the Better:{' '}
                    </span>
                    <span className="text-ink-secondary">
                      {evaluation.whatImproved}
                    </span>
                  </div>

                  <div>
                    <span className="font-semibold text-ink-primary">
                      Strict Improvements:{' '}
                    </span>
                    <span className="text-ink-secondary">
                      {evaluation.strictImprovements}
                    </span>
                  </div>
                </div>

                {evaluation.grammarFixes.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-ink-primary">
                        Pinpointed Grammar &amp; Mechanics
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyAllEvaluationFixes}
                        className="inline-link-tactile text-xs font-medium whitespace-nowrap cursor-pointer"
                      >
                        Apply All Fixes
                      </button>
                    </div>
                    {evaluation.grammarFixes.map((fix, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-md bg-subtle border border-border-subtle text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            <span className="line-through text-ink-muted">
                              {fix.original}
                            </span>{' '}
                            →{' '}
                            <span className="font-semibold text-status-success">
                              {fix.corrected}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              applyTextReplacement(fix.original, fix.corrected)
                            }
                            className="inline-link-tactile text-[11px] font-medium cursor-pointer"
                          >
                            Apply Fix
                          </button>
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          {fix.rule}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {evaluation.vocabUpgrades.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                    <div className="text-xs font-semibold text-ink-primary flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                      <span>Vocabulary Upgrades</span>
                    </div>
                    {evaluation.vocabUpgrades.map((v, idx) => {
                      const key = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
                      const alreadySaved =
                        existingVocabSet.has(key) || savedVocabKeys.has(key);
                      return (
                        <div
                          key={idx}
                          className="p-2 rounded-md bg-subtle border border-border-subtle text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              <span className="line-through text-ink-muted">
                                {v.used}
                              </span>{' '}
                              →{' '}
                              <span className="font-semibold text-ink-primary">
                                {v.betterAlternative}
                              </span>
                            </span>
                            <button
                              type="button"
                              disabled={alreadySaved}
                              onClick={() => handleSaveVocabItem(v)}
                              className="inline-link-tactile text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              {alreadySaved ? 'In Library' : 'Save Word'}
                            </button>
                          </div>
                          <div className="text-[11px] text-ink-muted mt-0.5">
                            {v.explanation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
