import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Lightbulb,
  MessageSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  CoachHighlightPoint,
  ConversationBenchmarkReport,
  ConversationMessage,
  ConversationPace,
  ConversationRecast,
  ConversationScenario,
  ConversationTurnInTimeAnalysis,
  EvaluationRoutingMeta,
  FeedbackImplementationDetail,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  PinpointedRewrite,
  RewrittenSample,
  RubricMetricNotes,
  RubricScores,
  SavedConversationThread,
  StudentProfile,
  VocabEntry,
  VocabSuggestion,
  WritingSession,
} from '../types';
import {
  MODE_LABELS,
  TONE_LABELS,
  analyzeDraftLocally,
  computePercentage,
  computeTotalScore,
  deriveInternationalMetrics,
  type CoachPerformanceContext,
} from '../utils/analytics';
import {
  analyzeConversationMetrics,
  buildConversationTranscript,
  buildOfflineConversationReply,
  createCustomConversationScenario,
  detectUsedTargetWords,
  getConversationScenarios,
  pickFreshOpeningLine,
} from '../utils/conversationEngine';
import {
  aggregateConversationTelemetry,
  buildOfflineConversationBenchmark,
  computeInTimeComposite,
} from '../utils/conversationBenchmark';
import { selectDynamicEvaluationRoute } from '../utils/evaluationRouter';
import { buildInstantLocalEvaluation } from '../utils/fastEvaluate';
import { runOfflineProofread } from '../utils/offlineProofreader';
import { getApiUrl, safeParseJsonResponse } from '../utils/apiBase';
import {
  EvaluationLoadingCard,
  EvaluationReportView,
} from './EvaluationReportView';
import { ConversationBenchmarkView } from './ConversationBenchmarkView';

const THREADS_STORAGE_KEY = 'quillit_converse_threads_v1';
const RECENT_OPENINGS_STORAGE_KEY = 'quillit_converse_recent_openings_v1';

interface ConverseEvaluationPayload {
  evaluationStatus?: 'completed' | 'queued_for_reset';
  modelUsed?: string;
  thinkingLevelUsed?: string;
  routingMeta?: EvaluationRoutingMeta;
  suggestedTitle?: string;
  scores: RubricScores;
  metricNotes?: RubricMetricNotes;
  cefrLevel: string;
  internationalMetrics?: InternationalMetrics;
  toneVerdict: string;
  flowVerdict: string;
  feedbackImplemented: FeedbackImplementedStatus;
  feedbackCheck?: FeedbackImplementationDetail;
  whatImproved: string;
  whatImprovedPoints?: CoachHighlightPoint[];
  strictImprovements: string;
  pinpointedRewrites?: PinpointedRewrite[];
  rewrittenSample?: RewrittenSample;
  masteredWordsUsed?: string[];
  grammarFixes: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
  conversationBenchmark?: ConversationBenchmarkReport;
}

interface ConverseStudioProps {
  todayISO: string;
  studentProfile?: StudentProfile;
  vocabulary: VocabEntry[];
  coachContext: CoachPerformanceContext;
  onSaveSession: (
    session: WritingSession,
    newVocabEntries: VocabEntry[],
    linkedSlotId?: string,
    aiMasteredWords?: string[]
  ) => string[];
  onAddVocabEntry: (entry: VocabEntry) => void;
  onConverseStatusChange?: (state: {
    inProgress: boolean;
    hasCompletedResult: boolean;
    hasActiveChat: boolean;
  }) => void;
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function loadSavedThreads(): SavedConversationThread[] {
  try {
    const raw = localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 12);
  } catch {
    return [];
  }
}

function persistSavedThreads(threads: SavedConversationThread[]): void {
  try {
    localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads.slice(0, 12)));
  } catch {
    // ignore storage quota limits
  }
}

function loadRecentOpenings(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(RECENT_OPENINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function recordRecentOpening(scenarioId: string, openingLine: string): string[] {
  const trimmed = openingLine.trim();
  const map = loadRecentOpenings();
  const existing = Array.isArray(map[scenarioId]) ? map[scenarioId] : [];
  if (!trimmed) return existing;
  const deduped = [
    trimmed,
    ...existing.filter((line) => line.trim().toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, 8);
  map[scenarioId] = deduped;
  try {
    localStorage.setItem(RECENT_OPENINGS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota limits
  }
  return deduped;
}

const PACE_OPTIONS: Array<{ id: ConversationPace; label: string; hint: string }> = [
  { id: 'relaxed', label: 'Relaxed', hint: 'Warm & patient follow-ups' },
  { id: 'natural', label: 'Natural', hint: 'Everyday spoken rhythm' },
  { id: 'challenging', label: 'Challenging', hint: 'Sharp probing questions' },
];

export function ConverseStudio({
  todayISO,
  studentProfile,
  vocabulary,
  coachContext,
  onSaveSession,
  onAddVocabEntry,
  onConverseStatusChange,
}: ConverseStudioProps) {
  const scenarios = useMemo(
    () => getConversationScenarios(studentProfile),
    [studentProfile]
  );

  const [pace, setPace] = useState<ConversationPace>('natural');
  const [customScenarioText, setCustomScenarioText] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<ConversationScenario | null>(
    null
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [replySparks, setReplySparks] = useState<string[]>([]);
  const [draftInput, setDraftInput] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [openingLoading, setOpeningLoading] = useState(false);
  const [editingOpener, setEditingOpener] = useState(false);
  const [openerDraft, setOpenerDraft] = useState('');
  const [coachTipsEnabled, setCoachTipsEnabled] = useState(true);
  const [expandedRecasts, setExpandedRecasts] = useState<Record<string, boolean>>({});
  const [showSparks, setShowSparks] = useState(false);
  const [showTargetWords, setShowTargetWords] = useState(false);
  const [showRecentDrawer, setShowRecentDrawer] = useState(false);
  const [savedThreads, setSavedThreads] = useState<SavedConversationThread[]>(() =>
    loadSavedThreads()
  );

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chatError, setChatError] = useState<string | null>(null);
  const [offlineModeNote, setOfflineModeNote] = useState(false);

  // Evaluation state (single-pass Conversational Fluency Benchmark)
  const [evaluating, setEvaluating] = useState(false);
  const [evaluatingTierLabel, setEvaluatingTierLabel] =
    useState('Hydrogen · Medium');
  const [evaluation, setEvaluation] = useState<ConverseEvaluationPayload | null>(
    null
  );
  const [loggedSuccess, setLoggedSuccess] = useState(false);
  const [promotedWords, setPromotedWords] = useState<string[]>([]);
  const [savedVocabKeys, setSavedVocabKeys] = useState<Set<string>>(new Set());

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Genuine client-side turn timing telemetry refs
  const partnerPromptedAtRef = useRef<number>(Date.now());
  const firstKeystrokeAtRef = useRef<number | null>(null);
  const revisionCountRef = useRef<number>(0);
  const prevDraftLenRef = useRef<number>(0);
  const openingRequestIdRef = useRef<number>(0);
  const openingSeedRef = useRef<number>(0);

  const practicingWordStrings = useMemo(
    () =>
      coachContext.practicingWords
        .map((v) => v.betterAlternative)
        .filter(Boolean)
        .slice(0, 10),
    [coachContext.practicingWords]
  );

  const existingVocabSet = useMemo(() => {
    const s = new Set<string>();
    for (const v of vocabulary) {
      s.add(`${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`);
    }
    return s;
  }, [vocabulary]);

  const metrics = useMemo(
    () => analyzeConversationMetrics(messages, practicingWordStrings),
    [messages, practicingWordStrings]
  );

  const liveTiming = useMemo(
    () =>
      aggregateConversationTelemetry({
        messages,
        pace,
        elapsedSeconds,
      }).timingSummary,
    [messages, pace, elapsedSeconds]
  );

  function resetTurnTimingClock() {
    partnerPromptedAtRef.current = Date.now();
    firstKeystrokeAtRef.current = null;
    revisionCountRef.current = 0;
    prevDraftLenRef.current = 0;
  }

  // Report status up to App header for quiet background dot when user switches tabs
  useEffect(() => {
    onConverseStatusChange?.({
      inProgress: evaluating || partnerTyping || openingLoading,
      hasCompletedResult: Boolean(evaluation),
      hasActiveChat: Boolean(activeScenario),
    });
  }, [
    evaluating,
    partnerTyping,
    openingLoading,
    evaluation,
    activeScenario,
    onConverseStatusChange,
  ]);

  // Live session timer while actively conversing before evaluation
  useEffect(() => {
    if (!activeScenario || evaluation) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeScenario, evaluation]);

  // Smoothly keep latest message in view
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, partnerTyping, openingLoading]);

  // Persist active thread into local history whenever messages update
  useEffect(() => {
    if (!activeThreadId || !activeScenario || messages.length <= 1) return;
    setSavedThreads((prev) => {
      const updatedEntry: SavedConversationThread = {
        id: activeThreadId,
        scenario: activeScenario,
        pace,
        messages,
        updatedAt: new Date().toISOString(),
        finalScore: evaluation ? computeTotalScore(evaluation.scores) : undefined,
        benchmarkIndex: evaluation?.conversationBenchmark?.benchmarkIndex,
        cefrLevel: evaluation?.cefrLevel,
      };
      const next = [
        updatedEntry,
        ...prev.filter((t) => t.id !== activeThreadId),
      ].slice(0, 12);
      persistSavedThreads(next);
      return next;
    });
  }, [activeThreadId, activeScenario, pace, messages, evaluation]);

  async function fetchFreshOpening(
    scenario: ConversationScenario,
    extraAvoid: string[] = []
  ) {
    const reqId = ++openingRequestIdRef.current;
    const storedAvoid = loadRecentOpenings()[scenario.id] || [];
    const avoidOpenings = Array.from(
      new Set([...extraAvoid, ...storedAvoid].filter(Boolean))
    ).slice(0, 8);

    setOpeningLoading(true);
    setEditingOpener(false);
    setOpenerDraft('');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7500);

    try {
      const res = await fetch(getApiUrl('/api/converse-opening'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          scenario,
          pace,
          studentProfile,
          avoidOpenings,
        }),
      });
      const data = await safeParseJsonResponse<{
        openingLine?: string;
        initialSparks?: string[];
        modelUsed?: string;
        error?: string;
      }>(res);

      if (openingRequestIdRef.current !== reqId) return;

      if (res.ok && data?.openingLine && data.openingLine.trim().length >= 8) {
        const freshLine = data.openingLine.trim();
        recordRecentOpening(scenario.id, freshLine);
        const openingMsg: ConversationMessage = {
          id: `msg-open-${Date.now()}`,
          role: 'partner',
          text: freshLine,
          timestamp: formatNowTime(),
          createdAtMs: Date.now(),
          modelUsed: data.modelUsed,
        };
        setMessages([openingMsg]);
        setReplySparks(
          Array.isArray(data.initialSparks) && data.initialSparks.length > 0
            ? data.initialSparks
            : scenario.initialSparks
        );
        setOfflineModeNote(false);
        resetTurnTimingClock();
        return;
      }
      throw new Error(data?.error || 'Dynamic opening unavailable');
    } catch {
      if (openingRequestIdRef.current !== reqId) return;
      openingSeedRef.current += 1;
      const freshLocal = pickFreshOpeningLine({
        scenario,
        studentProfile,
        avoidOpenings,
        seedIndex: openingSeedRef.current,
      });
      recordRecentOpening(scenario.id, freshLocal.openingLine);
      const openingMsg: ConversationMessage = {
        id: `msg-open-${Date.now()}`,
        role: 'partner',
        text: freshLocal.openingLine,
        timestamp: formatNowTime(),
        createdAtMs: Date.now(),
        modelUsed: 'rotated-opener',
      };
      setMessages([openingMsg]);
      setReplySparks(freshLocal.initialSparks);
      resetTurnTimingClock();
    } finally {
      window.clearTimeout(timeoutId);
      if (openingRequestIdRef.current === reqId) {
        setOpeningLoading(false);
        window.setTimeout(() => composerRef.current?.focus(), 60);
      }
    }
  }

  function startScenario(scenario: ConversationScenario) {
    const threadId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setActiveThreadId(threadId);
    setActiveScenario(scenario);
    setMessages([]);
    setReplySparks(scenario.initialSparks);
    setDraftInput('');
    setElapsedSeconds(0);
    setExpandedRecasts({});
    setShowSparks(false);
    setShowRecentDrawer(false);
    setChatError(null);
    setOfflineModeNote(false);
    setEvaluation(null);
    setLoggedSuccess(false);
    setPromotedWords([]);
    setEditingOpener(false);
    setOpenerDraft('');
    resetTurnTimingClock();
    void fetchFreshOpening(scenario);
  }

  function handleRegenerateOpener() {
    if (!activeScenario || openingLoading || partnerTyping || metrics.userTurnCount > 0) {
      return;
    }
    const currentLine = messages[0]?.text ? [messages[0].text] : [];
    void fetchFreshOpening(activeScenario, currentLine);
  }

  function handleStartEditOpener() {
    if (messages.length === 0 || messages[0].role !== 'partner' || metrics.userTurnCount > 0) {
      return;
    }
    setOpenerDraft(messages[0].text);
    setEditingOpener(true);
  }

  function handleSaveEditedOpener() {
    const trimmed = openerDraft.trim();
    if (!trimmed || messages.length === 0 || messages[0].role !== 'partner') {
      setEditingOpener(false);
      return;
    }
    setMessages((prev) =>
      prev.map((m, idx) =>
        idx === 0
          ? {
              ...m,
              text: trimmed,
              timestamp: formatNowTime(),
              createdAtMs: Date.now(),
              isEditedOpener: true,
            }
          : m
      )
    );
    if (activeScenario) {
      recordRecentOpening(activeScenario.id, trimmed);
    }
    setEditingOpener(false);
    resetTurnTimingClock();
    window.setTimeout(() => composerRef.current?.focus(), 40);
  }

  function handleStartCustomScenario(e: React.FormEvent) {
    e.preventDefault();
    if (customScenarioText.trim().length < 4) return;
    const custom = createCustomConversationScenario(customScenarioText);
    setCustomScenarioText('');
    startScenario(custom);
  }

  function handleResumeSavedThread(thread: SavedConversationThread) {
    setActiveThreadId(thread.id);
    setActiveScenario(thread.scenario);
    setPace(thread.pace);
    setMessages(thread.messages);
    setReplySparks(thread.scenario.initialSparks);
    setDraftInput('');
    setElapsedSeconds(0);
    setExpandedRecasts({});
    setShowSparks(false);
    setShowRecentDrawer(false);
    setChatError(null);
    setEvaluation(null);
    setLoggedSuccess(false);
    setPromotedWords([]);
    window.setTimeout(() => composerRef.current?.focus(), 80);
  }

  function handleDeleteSavedThread(threadId: string) {
    setSavedThreads((prev) => {
      const next = prev.filter((t) => t.id !== threadId);
      persistSavedThreads(next);
      return next;
    });
  }

  function handleExitToLobby() {
    openingRequestIdRef.current += 1;
    setActiveScenario(null);
    setActiveThreadId(null);
    setMessages([]);
    setEvaluation(null);
    setEvaluating(false);
    setOpeningLoading(false);
    setEditingOpener(false);
    setChatError(null);
    setDraftInput('');
  }

  async function handleSendMessage(overrideText?: string) {
    if (!activeScenario || partnerTyping || openingLoading || evaluating) return;
    const text = (overrideText ?? draftInput).trim();
    if (!text) return;

    setChatError(null);
    setShowSparks(false);
    setEditingOpener(false);

    const nowMs = Date.now();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const responseTimeMs = Math.max(400, nowMs - partnerPromptedAtRef.current);
    const thinkTimeMs =
      firstKeystrokeAtRef.current !== null
        ? Math.max(0, firstKeystrokeAtRef.current - partnerPromptedAtRef.current)
        : undefined;
    const composeTimeMs =
      firstKeystrokeAtRef.current !== null
        ? Math.max(400, nowMs - firstKeystrokeAtRef.current)
        : responseTimeMs;
    const wordsPerMinute = Math.min(
      180,
      Math.max(5, Math.round(wordCount / (composeTimeMs / 60_000)))
    );

    const usedInTurn = detectUsedTargetWords(text, practicingWordStrings);
    const userMsgId = `msg-u-${nowMs}`;
    const userMessage: ConversationMessage = {
      id: userMsgId,
      role: 'user',
      text,
      timestamp: formatNowTime(),
      createdAtMs: nowMs,
      usedTargetWords: usedInTurn,
      telemetry: {
        responseTimeMs,
        thinkTimeMs,
        composeTimeMs,
        wordCount,
        wordsPerMinute,
        revisionCount: revisionCountRef.current,
      },
    };

    const historyBeforeSend = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setDraftInput('');
    if (composerRef.current) {
      composerRef.current.style.height = 'auto';
    }
    setPartnerTyping(true);

    try {
      const res = await fetch(getApiUrl('/api/converse'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: activeScenario,
          pace,
          history: historyBeforeSend,
          latestUserMessage: text,
          studentProfile,
          practicingVocab: practicingWordStrings,
        }),
      });

      const data = await safeParseJsonResponse<{
        reply?: string;
        recast?: ConversationRecast | null;
        inTimeAnalysis?: ConversationTurnInTimeAnalysis;
        replySparks?: string[];
        modelUsed?: string;
        latencyMs?: number;
        error?: string;
      }>(res);

      if (!res.ok || !data?.reply) {
        throw new Error(data?.error || 'Live conversation API unavailable');
      }

      setOfflineModeNote(false);
      const partnerArrivedAt = Date.now();
      const partnerMessage: ConversationMessage = {
        id: `msg-p-${partnerArrivedAt}`,
        role: 'partner',
        text: data.reply,
        timestamp: formatNowTime(),
        createdAtMs: partnerArrivedAt,
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs,
      };

      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === userMsgId
              ? {
                  ...m,
                  ...(data.recast ? { recast: data.recast } : {}),
                  ...(data.inTimeAnalysis ? { inTimeAnalysis: data.inTimeAnalysis } : {}),
                }
              : m
          )
          .concat(partnerMessage)
      );

      if (Array.isArray(data.replySparks) && data.replySparks.length > 0) {
        setReplySparks(data.replySparks);
      }
      resetTurnTimingClock();
    } catch {
      // Seamless offline fallback on static hosts or dropped network
      setOfflineModeNote(true);
      const offlineReply = buildOfflineConversationReply(
        activeScenario,
        text,
        metrics.userTurnCount + 1
      );
      const partnerArrivedAt = Date.now();
      const partnerMessage: ConversationMessage = {
        id: `msg-p-${partnerArrivedAt}`,
        role: 'partner',
        text: offlineReply.reply,
        timestamp: formatNowTime(),
        createdAtMs: partnerArrivedAt,
        modelUsed: 'offline-partner',
      };
      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === userMsgId && offlineReply.inTimeAnalysis
              ? { ...m, inTimeAnalysis: offlineReply.inTimeAnalysis }
              : m
          )
          .concat(partnerMessage)
      );
      setReplySparks(offlineReply.replySparks);
      resetTurnTimingClock();
    } finally {
      setPartnerTyping(false);
      window.setTimeout(() => composerRef.current?.focus(), 40);
    }
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  }

  function handleComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    if (firstKeystrokeAtRef.current === null && val.trim().length > 0) {
      firstKeystrokeAtRef.current = Date.now();
    }
    if (val.length < prevDraftLenRef.current - 2) {
      revisionCountRef.current += 1;
    }
    prevDraftLenRef.current = val.length;

    setDraftInput(val);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function handleSaveVocabItem(item: VocabSuggestion) {
    if (!activeScenario) return;
    const key = `${item.used.toLowerCase()}->${item.betterAlternative.toLowerCase()}`;
    if (existingVocabSet.has(key) || savedVocabKeys.has(key)) return;
    onAddVocabEntry({
      id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      used: item.used,
      betterAlternative: item.betterAlternative,
      explanation: item.explanation,
      contextSnippet: item.contextSnippet || `Live Chat: ${activeScenario.title}`,
      mode: activeScenario.mode,
      dateAdded: todayISO,
      mastered: false,
    });
    setSavedVocabKeys((prev) => new Set(prev).add(key));
  }

  function persistConversationSession(
    evalPayload: ConverseEvaluationPayload,
    userTurnsText: string,
    dialogueTranscript: string
  ) {
    if (!activeScenario) return;
    const totalScore = computeTotalScore(evalPayload.scores);
    const percentage = computePercentage(totalScore);
    const draftDiag = analyzeDraftLocally(userTurnsText);
    const intl = deriveInternationalMetrics({
      scores: evalPayload.scores,
      content: userTurnsText,
      internationalMetrics: evalPayload.internationalMetrics,
    });

    const sessionId = `CHAT_${todayISO.replace(/-/g, '')}_${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    const sessionRecord: WritingSession = {
      id: sessionId,
      date: todayISO,
      daySlot: `Live Chat · ${activeScenario.title}`,
      mode: activeScenario.mode,
      promptCategory: `Live Conversation · ${MODE_LABELS[activeScenario.mode]}`,
      tone: activeScenario.tone,
      topicDescription:
        evalPayload.suggestedTitle?.trim() ||
        `Live Conversation: ${activeScenario.title}`,
      content: dialogueTranscript,
      wordCount: draftDiag.wordCount,
      scores: evalPayload.scores,
      metricNotes: evalPayload.metricNotes,
      totalScore,
      percentage,
      cefrLevel: evalPayload.cefrLevel,
      internationalMetrics: intl,
      toneVerdict: evalPayload.toneVerdict,
      flowVerdict: evalPayload.flowVerdict,
      feedbackImplemented: evalPayload.feedbackImplemented,
      feedbackCheck: evalPayload.feedbackCheck,
      whatImproved: evalPayload.whatImproved,
      whatImprovedPoints: evalPayload.whatImprovedPoints,
      strictImprovements: evalPayload.strictImprovements,
      pinpointedRewrites: evalPayload.pinpointedRewrites,
      rewrittenSample: evalPayload.rewrittenSample,
      grammarFixes: evalPayload.grammarFixes,
      vocabUpgrades: evalPayload.vocabUpgrades,
      routingMeta: evalPayload.routingMeta,
      status: 'Completed',
      evaluationPending: false,
      modelUsed: evalPayload.modelUsed || 'gemini-4-hydrogen',
      createdAt: new Date().toISOString(),
    };

    const newVocab: VocabEntry[] = (evalPayload.vocabUpgrades || [])
      .filter((v) => {
        const key = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
        return !existingVocabSet.has(key) && !savedVocabKeys.has(key);
      })
      .map((v, idx) => ({
        id: `vocab-${Date.now()}-${idx}`,
        used: v.used,
        betterAlternative: v.betterAlternative,
        explanation: v.explanation,
        contextSnippet: v.contextSnippet || `Live Chat: ${activeScenario.title}`,
        mode: activeScenario.mode,
        dateAdded: todayISO,
        mastered: false,
        sessionId,
      }));

    const mergedMastered = Array.from(
      new Set([
        ...(evalPayload.masteredWordsUsed || []),
        ...metrics.usedTargetVocab,
      ])
    );

    const promoted = onSaveSession(
      sessionRecord,
      newVocab,
      undefined,
      mergedMastered
    );
    if (promoted && promoted.length > 0) {
      setPromotedWords(promoted);
    }
    setLoggedSuccess(true);
  }

  async function handleFinishAndEvaluate() {
    if (
      !activeScenario ||
      !metrics.canEvaluate ||
      evaluating ||
      partnerTyping ||
      openingLoading
    ) {
      return;
    }

    setChatError(null);
    const { userTurnsText, dialogueTranscript } = buildConversationTranscript(
      messages,
      activeScenario
    );

    const predictedRoute = selectDynamicEvaluationRoute({
      wordCount: metrics.totalUserWords,
      mode: MODE_LABELS[activeScenario.mode],
      tone: TONE_LABELS[activeScenario.tone],
      topic: activeScenario.title,
      topicPrimer: activeScenario.settingBrief,
      hasPreviousSessionSummary: Boolean(coachContext.previousSessionSummary),
      practicingVocabCount: practicingWordStrings.length,
    });
    setEvaluatingTierLabel(predictedRoute.primary.tierLabel);
    setEvaluating(true);

    try {
      const res = await fetch(getApiUrl('/api/evaluate-conversation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: activeScenario,
          pace,
          messages,
          elapsedSeconds,
          previousSessionSummary: coachContext.previousSessionSummary,
          practicingVocab: practicingWordStrings,
          studentProfile,
        }),
      });

      const data = await safeParseJsonResponse<
        ConverseEvaluationPayload & { error?: string }
      >(res);

      if (!res.ok || !data || data.error) {
        throw new Error(data?.error || 'Conversation benchmark API unavailable');
      }

      setEvaluation(data);
      persistConversationSession(data, userTurnsText, dialogueTranscript);
    } catch {
      // Transparent offline benchmark fallback only if API is unreachable
      const offlineIssues = runOfflineProofread(userTurnsText);
      const localEval = buildInstantLocalEvaluation(
        userTurnsText,
        activeScenario.mode,
        activeScenario.tone,
        offlineIssues,
        `Live Chat: ${activeScenario.title}`
      );
      const offlineBench = buildOfflineConversationBenchmark({
        messages,
        userTurnsText,
        pace,
        elapsedSeconds,
        grammarFixes: localEval.grammarFixes,
      });
      const fallbackPayload: ConverseEvaluationPayload = {
        evaluationStatus: 'completed',
        modelUsed: localEval.modelUsed,
        routingMeta: localEval.routingMeta,
        suggestedTitle: localEval.suggestedTitle,
        scores: offlineBench.rubricScores,
        metricNotes: localEval.metricNotes,
        cefrLevel: offlineBench.cefrLevel,
        internationalMetrics: {
          ...localEval.internationalMetrics,
          ieltsBand: offlineBench.ieltsBand,
          toeflEquivalent: offlineBench.toeflEquivalent,
        },
        toneVerdict: offlineBench.benchmark.toneVerdict,
        flowVerdict: offlineBench.benchmark.pacingVerdict,
        feedbackImplemented: localEval.feedbackImplemented,
        feedbackCheck: localEval.feedbackCheck,
        whatImproved: localEval.whatImproved,
        whatImprovedPoints: localEval.whatImprovedPoints,
        strictImprovements: localEval.strictImprovements,
        pinpointedRewrites: localEval.pinpointedRewrites,
        rewrittenSample: localEval.rewrittenSample,
        grammarFixes: localEval.grammarFixes,
        vocabUpgrades: localEval.vocabUpgrades,
        conversationBenchmark: offlineBench.benchmark,
      };
      setEvaluation(fallbackPayload);
      persistConversationSession(fallbackPayload, userTurnsText, dialogueTranscript);
    } finally {
      setEvaluating(false);
    }
  }

  // =========================================================================
  // STAGE A: FRICTION-FREE SCENARIO LAUNCHER (1-Click Start)
  // =========================================================================
  if (!activeScenario) {
    return (
      <section
        aria-label="Live Conversation Practice"
        data-testid="converse-lobby"
        className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8 page-glide-enter"
      >
        {/* Editorial Header & Pace Selector */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-ink-primary">
              Live conversation
            </h1>
            <p className="text-sm text-ink-secondary">
              Real-time text dialogue built strictly for spoken-style fluency practice.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              role="radiogroup"
              aria-label="Conversation pace"
              className="segmented-track inline-flex items-center gap-0.5"
            >
              {PACE_OPTIONS.map((opt) => {
                const selected = pace === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-active={selected ? 'true' : 'false'}
                    onClick={() => setPace(opt.id)}
                    title={opt.hint}
                    className="segmented-item px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {savedThreads.length > 0 && (
              <button
                type="button"
                onClick={() => setShowRecentDrawer((v) => !v)}
                className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                <History className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                <span>Recent ({savedThreads.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Recent Chats Shelf */}
        {showRecentDrawer && savedThreads.length > 0 && (
          <div className="surface-card p-4 space-y-3 converse-recast-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink-primary">
                Recent Practice Conversations
              </span>
              <button
                type="button"
                onClick={() => setShowRecentDrawer(false)}
                className="text-ink-muted hover:text-ink-primary text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="divide-y divide-border-subtle">
              {savedThreads.map((thread) => {
                const uTurns = thread.messages.filter((m) => m.role === 'user').length;
                return (
                  <div
                    key={thread.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleResumeSavedThread(thread)}
                      className="text-left min-w-0 flex-1 group cursor-pointer"
                    >
                      <div className="text-sm font-medium text-ink-primary group-hover:underline truncate">
                        {thread.scenario.title} · {thread.scenario.personaName}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-ink-muted mt-0.5">
                        {uTurns} replies · {thread.pace}
                        {typeof thread.benchmarkIndex === 'number'
                          ? ` · Benchmark ${thread.benchmarkIndex}/100 (${thread.cefrLevel || 'B2'})`
                          : typeof thread.finalScore === 'number'
                            ? ` · Scored ${thread.finalScore}/60 (${thread.cefrLevel || 'B2'})`
                            : ' · In progress'}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete conversation ${thread.scenario.title}`}
                      onClick={() => handleDeleteSavedThread(thread.id)}
                      className="p-1.5 rounded-md text-ink-muted hover:text-status-danger hover:bg-subtle transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary 1-Click Scenario Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              data-testid={`scenario-card-${scenario.id}`}
              onClick={() => startScenario(scenario)}
              className="card-interactive surface-card text-left p-5 flex flex-col justify-between gap-4 cursor-pointer"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="w-8 h-8 rounded-full bg-subtle border border-border-default flex items-center justify-center text-[11px] font-mono-tabular font-semibold text-ink-primary shrink-0"
                    >
                      {scenario.personaInitials}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-ink-primary truncate">
                        {scenario.personaName}
                      </div>
                      <div className="text-[11px] text-ink-muted truncate">
                        {scenario.personaRole}
                      </div>
                    </div>
                  </div>
                  <ArrowRight
                    className="w-4 h-4 text-ink-muted card-arrow shrink-0"
                    aria-hidden="true"
                  />
                </div>

                <div className="space-y-1">
                  <h2 className="font-display text-lg font-medium text-ink-primary leading-snug">
                    {scenario.title}
                  </h2>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    {scenario.subtitle}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-border-subtle text-[11px] font-mono-tabular text-ink-muted flex items-center justify-between">
                <span>{MODE_LABELS[scenario.mode]}</span>
                <span className="text-ink-secondary">Start now</span>
              </div>
            </button>
          ))}
        </div>

        {/* Custom Scenario Direct Entry */}
        <form
          onSubmit={handleStartCustomScenario}
          className="surface-card border border-border-subtle rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <MessageSquare
              className="w-4 h-4 text-ink-muted shrink-0"
              aria-hidden="true"
            />
            <input
              type="text"
              value={customScenarioText}
              onChange={(e) => setCustomScenarioText(e.target.value)}
              placeholder="Or describe any real-life situation — e.g. Explaining a schedule slip to a client..."
              aria-label="Custom conversation scenario"
              className="w-full bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={customScenarioText.trim().length < 4}
            className="btn-primary inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap disabled:opacity-45"
          >
            <span>Start Custom Chat</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </form>
      </section>
    );
  }

  // =========================================================================
  // STAGE B: LIVE REAL-TIME CONVERSATION STAGE + SINGLE-PASS EVALUATION DRAWER
  // =========================================================================
  const showCoachPanel = evaluating || Boolean(evaluation);
  const { userTurnsText } = buildConversationTranscript(messages, activeScenario);

  return (
    <section
      aria-label={`Live conversation with ${activeScenario.personaName}`}
      data-testid="converse-stage"
      className={`${
        showCoachPanel ? 'max-w-6xl' : 'max-w-3xl'
      } mx-auto px-4 sm:px-6 py-5 sm:py-6 transition-all duration-300`}
    >
      <div
        className={`grid gap-5 items-start ${
          showCoachPanel ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'
        }`}
      >
        {/* LEFT / PRIMARY COLUMN: REAL-TIME CHAT SURFACE */}
        <div
          className={`${
            showCoachPanel ? 'lg:col-span-7 lg:sticky lg:top-20' : 'col-span-1'
          } surface-card flex flex-col overflow-hidden`}
          style={{ minHeight: 'calc(100vh - 138px)', maxHeight: 'calc(100vh - 118px)' }}
        >
          {/* Chat Stage Header */}
          <div className="px-4 sm:px-5 py-3.5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3 bg-surface">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={handleExitToLobby}
                aria-label="Back to conversation scenarios"
                className="btn-ghost p-1.5 -ml-1.5 rounded-md text-ink-secondary hover:text-ink-primary cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </button>

              <span
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-subtle border border-border-default flex items-center justify-center text-[11px] font-mono-tabular font-semibold text-ink-primary shrink-0"
              >
                {activeScenario.personaInitials}
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold text-ink-primary truncate">
                    {activeScenario.personaName}
                  </h1>
                  <span className="text-[11px] text-ink-muted hidden sm:inline">
                    · {activeScenario.personaRole}
                  </span>
                </div>
                <div className="text-[11px] font-mono-tabular text-ink-muted flex items-center gap-2">
                  <span className="truncate">{activeScenario.title}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {formatDuration(elapsedSeconds)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quiet Controls + Finish & Evaluate Primary CTA */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCoachTipsEnabled((v) => !v)}
                aria-pressed={coachTipsEnabled}
                title="Toggle subtle inline phrasing tips on your replies"
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                  coachTipsEnabled
                    ? 'border-border-strong bg-subtle text-ink-primary'
                    : 'border-border-subtle text-ink-muted hover:text-ink-secondary'
                }`}
              >
                Tips {coachTipsEnabled ? 'On' : 'Off'}
              </button>

              <button
                type="button"
                onClick={() => startScenario(activeScenario)}
                title="Restart this scenario"
                aria-label="Restart scenario"
                className="btn-ghost p-1.5 rounded-md text-ink-muted hover:text-ink-primary cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                data-testid="converse-evaluate-btn"
                disabled={
                  !metrics.canEvaluate || evaluating || partnerTyping || openingLoading
                }
                onClick={() => void handleFinishAndEvaluate()}
                title={
                  metrics.canEvaluate
                    ? 'Score this conversation with the 8-parameter Conversational Fluency Benchmark'
                    : `Send ${Math.max(1, metrics.turnsNeeded)} more ${
                        metrics.turnsNeeded === 1 ? 'reply' : 'replies'
                      } (${metrics.wordsNeeded > 0 ? `${metrics.wordsNeeded} more words` : 'ready'}) to evaluate`
                }
                className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap disabled:opacity-45"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {evaluating
                    ? 'Benchmarking...'
                    : evaluation
                      ? 'Re-benchmark'
                      : 'Finish & Evaluate'}
                </span>
              </button>
            </div>
          </div>

          {/* Subtle Session Metrics & Vocab Targets Bar */}
          <div className="px-4 sm:px-5 py-2 border-b border-border-subtle bg-subtle/40 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-ink-muted">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {metrics.userTurnCount}{' '}
                {metrics.userTurnCount === 1 ? 'reply' : 'replies'}
              </span>
              <span>·</span>
              <span>{metrics.totalUserWords} words</span>
              {liveTiming.avgResponseTimeSec !== null && (
                <>
                  <span>·</span>
                  <span data-testid="converse-live-avg-reply">
                    avg {liveTiming.avgResponseTimeSec}s reply
                  </span>
                </>
              )}
              {!metrics.canEvaluate && (
                <>
                  <span>·</span>
                  <span className="text-ink-secondary">
                    {metrics.turnsNeeded > 0
                      ? `${metrics.turnsNeeded} more ${
                          metrics.turnsNeeded === 1 ? 'reply' : 'replies'
                        } to unlock benchmark`
                      : `${metrics.wordsNeeded} more words to unlock benchmark`}
                  </span>
                </>
              )}
              {offlineModeNote && (
                <>
                  <span>·</span>
                  <span className="text-status-warning">Offline partner</span>
                </>
              )}
            </div>

            {practicingWordStrings.length > 0 && (
              <button
                type="button"
                onClick={() => setShowTargetWords((v) => !v)}
                className="inline-flex items-center gap-1 text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
              >
                <BookOpen className="w-3 h-3" aria-hidden="true" />
                <span>
                  Target words ({metrics.usedTargetVocab.length}/
                  {practicingWordStrings.length})
                </span>
                {showTargetWords ? (
                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                )}
              </button>
            )}
          </div>

          {/* Optional Collapsible Practicing Vocabulary Tray */}
          {showTargetWords && practicingWordStrings.length > 0 && (
            <div className="px-4 sm:px-5 py-2.5 border-b border-border-subtle bg-surface flex flex-wrap gap-2 text-[11px] converse-recast-in">
              {practicingWordStrings.map((word) => {
                const hit = metrics.usedTargetVocab.some(
                  (w) => w.toLowerCase() === word.toLowerCase()
                );
                return (
                  <span
                    key={word}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                      hit
                        ? 'border-status-success-border bg-status-success-soft text-status-success font-medium'
                        : 'border-border-subtle bg-subtle text-ink-secondary'
                    }`}
                  >
                    {hit && <Check className="w-3 h-3" aria-hidden="true" />}
                    <span>{word}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Scrollable Message Thread */}
          <div
            data-testid="converse-thread"
            aria-live="polite"
            className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-4"
          >
            {messages.map((msg, msgIdx) => {
              const isUser = msg.role === 'user';
              const isEditableOpener =
                msgIdx === 0 &&
                msg.role === 'partner' &&
                metrics.userTurnCount === 0 &&
                !openingLoading;
              const inTimeComposite = msg.inTimeAnalysis
                ? computeInTimeComposite(msg.inTimeAnalysis)
                : null;
              const hasLiveInsight = Boolean(
                coachTipsEnabled && isUser && (msg.recast || msg.inTimeAnalysis)
              );
              const recastOpen = Boolean(expandedRecasts[msg.id]);
              const replySec =
                typeof msg.telemetry?.responseTimeMs === 'number'
                  ? Math.round((msg.telemetry.responseTimeMs / 1000) * 10) / 10
                  : null;

              return (
                <div
                  key={msg.id}
                  data-testid={`chat-msg-${msg.role}`}
                  className={`flex flex-col converse-msg-in ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`flex items-end gap-2.5 max-w-[85%] sm:max-w-[78%] ${
                      isUser ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {!isUser && (
                      <span
                        aria-hidden="true"
                        className="w-6 h-6 rounded-full bg-subtle border border-border-default flex items-center justify-center text-[10px] font-mono-tabular font-semibold text-ink-secondary shrink-0 mb-0.5"
                      >
                        {activeScenario.personaInitials}
                      </span>
                    )}

                    {isEditableOpener && editingOpener ? (
                      <div className="w-full min-w-[260px] sm:min-w-[360px] p-3 rounded-xl bg-subtle border border-border-strong space-y-2">
                        <label
                          htmlFor="converse-opener-editor"
                          className="block text-[10px] font-mono-tabular uppercase tracking-wider text-ink-muted"
                        >
                          Customize opening line from {activeScenario.personaName}
                        </label>
                        <textarea
                          id="converse-opener-editor"
                          data-testid="converse-edit-opener-input"
                          rows={3}
                          value={openerDraft}
                          onChange={(e) => setOpenerDraft(e.target.value)}
                          className="input-tactile w-full resize-none px-3 py-2 text-sm leading-relaxed"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingOpener(false)}
                            className="btn-ghost px-2.5 py-1 text-xs text-ink-secondary cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            data-testid="converse-save-opener-btn"
                            disabled={openerDraft.trim().length < 4}
                            onClick={handleSaveEditedOpener}
                            className="btn-primary px-3 py-1 text-xs font-medium disabled:opacity-45"
                          >
                            Save opener
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        data-testid={
                          msgIdx === 0 && msg.role === 'partner'
                            ? 'converse-opening-text'
                            : undefined
                        }
                        className={`px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-accent text-ink-inverse rounded-2xl rounded-br-sm'
                            : 'bg-subtle text-ink-primary border border-border-subtle rounded-2xl rounded-bl-sm'
                        }`}
                      >
                        {msg.text}
                      </div>
                    )}
                  </div>

                  {/* Quiet Timestamp + Telemetry + Opener Controls + Optional Collapsible In-Time Insight */}
                  <div
                    className={`mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono-tabular text-ink-muted ${
                      isUser ? 'pr-1 justify-end' : 'pl-8 justify-start'
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {msg.isEditedOpener && <span>· customized</span>}
                    {isUser && replySec !== null && (
                      <span data-testid={`turn-latency-${msg.id}`}>
                        · {replySec}s reply
                      </span>
                    )}
                    {msg.usedTargetWords && msg.usedTargetWords.length > 0 && (
                      <span className="text-status-success">
                        · used {msg.usedTargetWords.join(', ')}
                      </span>
                    )}
                    {isEditableOpener && !editingOpener && (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          data-testid="converse-new-opener-btn"
                          onClick={handleRegenerateOpener}
                          className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" aria-hidden="true" />
                          <span>New opener</span>
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          data-testid="converse-edit-opener-btn"
                          onClick={handleStartEditOpener}
                          className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" aria-hidden="true" />
                          <span>Edit opener</span>
                        </button>
                      </>
                    )}
                    {hasLiveInsight && (
                      <button
                        type="button"
                        data-testid={`recast-toggle-${msg.id}`}
                        onClick={() =>
                          setExpandedRecasts((prev) => ({
                            ...prev,
                            [msg.id]: !prev[msg.id],
                          }))
                        }
                        className="inline-link-tactile text-[11px] font-sans font-medium text-ink-secondary hover:text-ink-primary cursor-pointer"
                      >
                        {recastOpen
                          ? 'Hide turn note'
                          : msg.recast
                            ? '1 phrasing tip'
                            : inTimeComposite !== null
                              ? `In-time · ${inTimeComposite}/10`
                              : 'Turn note'}
                      </button>
                    )}
                  </div>

                  {hasLiveInsight && recastOpen && (
                    <div
                      data-testid="converse-recast-card"
                      className="mt-1.5 max-w-[85%] sm:max-w-[76%] p-3 rounded-md bg-subtle border border-border-default text-xs space-y-2 converse-recast-in"
                    >
                      {msg.recast && (
                        <div className="space-y-1">
                          <div className="text-[11px] text-ink-secondary">
                            <span className="line-through text-ink-muted">
                              &ldquo;{msg.recast.original}&rdquo;
                            </span>{' '}
                            <span className="text-ink-muted">&rarr;</span>{' '}
                            <span className="font-medium text-status-success">
                              &ldquo;{msg.recast.naturalVersion}&rdquo;
                            </span>
                          </div>
                          <p className="text-[11px] text-ink-secondary leading-relaxed">
                            {msg.recast.tip}
                          </p>
                        </div>
                      )}
                      {msg.inTimeAnalysis && (
                        <div
                          className={
                            msg.recast ? 'pt-2 border-t border-border-subtle space-y-1' : 'space-y-1'
                          }
                        >
                          <div className="text-[10px] font-mono-tabular text-ink-muted">
                            Context {msg.inTimeAnalysis.contextAlignment}/10 · Tone{' '}
                            {msg.inTimeAnalysis.toneMatch}/10 · Grammar{' '}
                            {msg.inTimeAnalysis.grammarAccuracy}/10 · Flow{' '}
                            {msg.inTimeAnalysis.naturalness}/10 · Vocab{' '}
                            {msg.inTimeAnalysis.vocabQuality}/10
                          </div>
                          <p className="text-[11px] text-ink-secondary leading-relaxed">
                            {msg.inTimeAnalysis.turnNote}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Partner Typing / Fresh Opening Indicator */}
            {(partnerTyping || openingLoading) && (
              <div
                data-testid="converse-typing-indicator"
                className="flex items-end gap-2.5 converse-msg-in"
              >
                <span
                  aria-hidden="true"
                  className="w-6 h-6 rounded-full bg-subtle border border-border-default flex items-center justify-center text-[10px] font-mono-tabular font-semibold text-ink-secondary shrink-0 mb-0.5"
                >
                  {activeScenario.personaInitials}
                </span>
                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-subtle border border-border-subtle inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-muted converse-typing-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-muted converse-typing-dot converse-typing-dot-2" />
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-muted converse-typing-dot converse-typing-dot-3" />
                  </span>
                  {openingLoading && (
                    <span className="text-[11px] text-ink-muted">
                      Crafting a fresh opener...
                    </span>
                  )}
                  <span className="sr-only">
                    {activeScenario.personaName} is typing
                  </span>
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Error Notice (if any) */}
          {chatError && (
            <div
              role="alert"
              className="mx-4 sm:mx-5 mb-2 px-3 py-2 rounded-md border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
            >
              {chatError}
            </div>
          )}

          {/* Anti-Stall Reply Sparks & Message Composer */}
          <div className="border-t border-border-subtle bg-surface px-4 sm:px-5 py-3 space-y-2.5">
            {replySparks.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  data-testid="converse-sparks-toggle"
                  onClick={() => setShowSparks((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                >
                  <Lightbulb className="w-3 h-3" aria-hidden="true" />
                  <span>{showSparks ? 'Hide reply ideas' : 'Need a reply idea?'}</span>
                </button>

                {showSparks && (
                  <div className="flex flex-wrap gap-1.5 converse-recast-in">
                    {replySparks.map((spark, idx) => (
                      <button
                        key={`spark-${idx}`}
                        type="button"
                        onClick={() => {
                          setDraftInput((prev) =>
                            prev.trim() ? prev : `${spark}: `
                          );
                          setShowSparks(false);
                          composerRef.current?.focus();
                        }}
                        className="text-left px-2.5 py-1.5 rounded-md border border-border-subtle bg-subtle hover:border-border-strong text-[11px] text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
                      >
                        {spark}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                rows={1}
                value={draftInput}
                onChange={handleComposerChange}
                onKeyDown={handleComposerKeyDown}
                disabled={partnerTyping || openingLoading || evaluating}
                aria-label="Conversation reply input"
                placeholder={`Reply to ${activeScenario.personaName}... (Enter to send)`}
                className="input-tactile flex-1 resize-none px-3.5 py-2.5 text-sm leading-relaxed max-h-[140px]"
              />
              <button
                type="button"
                data-testid="converse-send-btn"
                disabled={!draftInput.trim() || partnerTyping || openingLoading || evaluating}
                onClick={() => void handleSendMessage()}
                aria-label="Send message"
                className="btn-primary h-[42px] px-3.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium shrink-0 disabled:opacity-45"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SINGLE-PASS AUTHORITATIVE EVALUATION REPORT */}
        {showCoachPanel && (
          <aside
            aria-label="Conversation evaluation report"
            className="lg:col-span-5 surface-card p-5 space-y-4"
          >
            {evaluating && (
              <EvaluationLoadingCard
                wordCount={metrics.totalUserWords}
                modeLabel={`Live Chat · ${MODE_LABELS[activeScenario.mode]}`}
                estimatedTierLabel={evaluatingTierLabel}
              />
            )}

            {!evaluating && evaluation && (
              <div data-testid="converse-evaluation-card" className="space-y-4">
                {promotedWords.length > 0 && (
                  <div className="px-3 py-2 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success">
                    Promoted to Mastered Vocabulary:{' '}
                    <span className="font-semibold">
                      {promotedWords.join(', ')}
                    </span>
                  </div>
                )}

                {evaluation.conversationBenchmark ? (
                  <ConversationBenchmarkView
                    data={{
                      scenarioTitle:
                        evaluation.suggestedTitle || activeScenario.title,
                      partnerName: activeScenario.personaName,
                      pace,
                      benchmark: evaluation.conversationBenchmark,
                      scores: evaluation.scores,
                      cefrLevel: evaluation.cefrLevel,
                      internationalMetrics: deriveInternationalMetrics({
                        scores: evaluation.scores,
                        content: userTurnsText,
                        internationalMetrics: evaluation.internationalMetrics,
                      }),
                      feedbackImplemented: evaluation.feedbackImplemented,
                      feedbackCheck: evaluation.feedbackCheck,
                      whatImproved: evaluation.whatImproved,
                      whatImprovedPoints: evaluation.whatImprovedPoints,
                      strictImprovements: evaluation.strictImprovements,
                      pinpointedRewrites: evaluation.pinpointedRewrites,
                      grammarFixes: evaluation.grammarFixes,
                      vocabUpgrades: evaluation.vocabUpgrades,
                      routingMeta: evaluation.routingMeta,
                      modelUsed: evaluation.modelUsed,
                    }}
                    savedSuccess={loggedSuccess}
                    existingVocabSet={existingVocabSet}
                    savedVocabKeys={savedVocabKeys}
                    onSaveVocabItem={handleSaveVocabItem}
                  />
                ) : (
                  <EvaluationReportView
                    report={{
                      topic:
                        evaluation.suggestedTitle ||
                        `Live Chat: ${activeScenario.title}`,
                      modeLabel: `Live Chat · ${MODE_LABELS[activeScenario.mode]}`,
                      scores: evaluation.scores,
                      metricNotes: evaluation.metricNotes,
                      cefrLevel: evaluation.cefrLevel,
                      toneVerdict: evaluation.toneVerdict,
                      flowVerdict: evaluation.flowVerdict,
                      internationalMetrics: deriveInternationalMetrics({
                        scores: evaluation.scores,
                        content: userTurnsText,
                        internationalMetrics: evaluation.internationalMetrics,
                      }),
                      feedbackImplemented: evaluation.feedbackImplemented,
                      feedbackCheck: evaluation.feedbackCheck,
                      whatImproved: evaluation.whatImproved,
                      whatImprovedPoints: evaluation.whatImprovedPoints,
                      strictImprovements: evaluation.strictImprovements,
                      pinpointedRewrites: evaluation.pinpointedRewrites,
                      rewrittenSample: evaluation.rewrittenSample,
                      grammarFixes: evaluation.grammarFixes,
                      vocabUpgrades: evaluation.vocabUpgrades,
                      routingMeta: evaluation.routingMeta,
                      modelUsed: evaluation.modelUsed,
                    }}
                    defaultView="summary"
                    savedSuccess={loggedSuccess}
                    existingVocabSet={existingVocabSet}
                    savedVocabKeys={savedVocabKeys}
                    onSaveVocabItem={handleSaveVocabItem}
                  />
                )}

                <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => startScenario(activeScenario)}
                    className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Practice Again</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExitToLobby}
                    className="inline-link-tactile text-xs font-medium cursor-pointer"
                  >
                    Switch Scenario
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
