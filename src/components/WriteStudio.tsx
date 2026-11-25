import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Dices,
  ExternalLink,
  EyeOff,
  FileText,
  Flame,
  History,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type {
  AudienceOption,
  CalendarSlot,
  CalqueFix,
  CoachHighlightPoint,
  CoachPresetId,
  DrillMeta,
  DrillType,
  DrillVerdict,
  EvaluationRoutingMeta,
  FeedbackImplementationDetail,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  PinpointedRewrite,
  RewrittenSample,
  RubricMetricNotes,
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
  TONE_LABELS,
  analyzeDraftLocally,
  applyMultipleReplacements,
  computePercentage,
  computeTotalScore,
  deriveInternationalMetrics,
  getVisibleWritePageTasks,
  type CoachPerformanceContext,
} from '../utils/analytics';
import { drawNextCurriculumRandomTopic } from '../utils/topicDeck';
import { buildAdaptivePromptContext } from '../utils/adaptivePromptProfile';
import { getApiUrl, safeParseJsonResponse } from '../utils/apiBase';
import { QuickAddVocabModal } from './QuickAddVocabModal';
import {
  applyAllOfflineIssues,
  applyOfflineIssue,
  runOfflineProofread,
  type OfflineProofIssue,
} from '../utils/offlineProofreader';
import {
  buildInstantLocalEvaluation,
  getStudioGreeting,
  inferSuitableTitle,
  resolveRandomTopicDismiss,
} from '../utils/fastEvaluate';
import { selectDynamicEvaluationRoute } from '../utils/evaluationRouter';
import { computeDailyInkProgress } from '../utils/inkGoal';
import { InkDropGoalWell } from './InkDropGoalWell';
import {
  EvaluationLoadingCard,
  EvaluationReportView,
} from './EvaluationReportView';
import { computeProseDiagnostics } from '../utils/proseDiagnostics';
import {
  COMPRESSION_ROUNDS,
  computeCompressionMetrics,
  countSprintWords,
  formatCountdownMMSS,
} from '../utils/compressionSprint';
import {
  compareSkeletonReconstruction,
  parseSkeletonClues,
  pickOfflineSkeletonPassage,
  type SkeletonPassage,
} from '../utils/skeletonDrill';
import {
  checkRoomAJargon,
  combineThreeRoomsForEvaluation,
  evaluateRegisterShift,
} from '../utils/audienceLadder';
import {
  pickRandomConstraint,
  type ConstraintChallenge,
} from '../utils/constraintChallenges';
import {
  ConstraintPickerDrawer,
  LiveConstraintRail,
} from './ConstraintStudioPanel';
import {
  createIdlePostEvalClearState,
  dismissPostEvalClear,
  readAutoClearPreference,
  setPostEvalClearPaused,
  startPostEvalClearPrompt,
  tickPostEvalClear,
  togglePostEvalAutoClear,
  transitionToClearedUndo,
  writeAutoClearPreference,
  type PostEvalClearState,
} from '../utils/postEvalClear';
import { PostEvalClearPopup } from './PostEvalClearPopup';
import {
  DEFAULT_FLOW_SPRINT_SECONDS,
  shouldBlockFlowBeforeInput,
  shouldBlockFlowKeydown,
} from '../utils/noBackspaceGuard';
import {
  computeTimeCapsuleDelta,
  findTimeCapsuleCandidate,
} from '../utils/timeCapsule';
import { playTactileClick } from '../utils/tactileSound';
import { formatMobileStudioSummary } from '../utils/mobileViewport';

const AUDIENCE_OPTIONS: AudienceOption[] = [
  'Interviewer',
  'Hiring Manager',
  'Professor',
  'LinkedIn Reader',
  'Friend',
];

const DRILL_OPTIONS: Array<{ id: DrillType; label: string; duration: string }> = [
  { id: 'standard', label: 'Standard', duration: '10m' },
  { id: 'compression-432', label: '4/3/2 Sprint', duration: '6m' },
  { id: 'skeleton', label: 'Skeleton', duration: '8m' },
  { id: 'three-rooms', label: '3 Rooms', duration: '10m' },
];

interface EvaluationPayload {
  evaluationStatus?: 'completed' | 'queued_for_reset';
  modelUsed?: string;
  thinkingLevelUsed?: string;
  routingMeta?: EvaluationRoutingMeta;
  downgraded?: boolean;
  cached?: boolean;
  isProvisionalInstant?: boolean;
  suggestedTitle?: string;
  quotaResetSeconds?: number;
  quotaResetAt?: string;
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
  // v3.1 fields
  spokenReadinessScore?: number;
  signalNoiseRatio?: number;
  audienceReaction?: string;
  calqueFixes?: CalqueFix[];
  drillVerdict?: DrillVerdict;
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
  customCoachPrompt?: string;
  coachPresets?: CoachPresetId[];
  tactileSoundEnabled?: boolean;
  autoReloadSchedule: boolean;
  refreshingSchedule: boolean;
  scheduleError: string | null;
  activeAiModelLabel?: string;
  pendingEvalSessionsCount?: number;
  dailyWordGoal?: number;
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
  initialDrillType?: DrillType;
  initialTimeCapsuleOrigin?: WritingSession | null;
  linkedCalendarSlotId?: string;
  onSaveSession: (
    session: WritingSession,
    newVocabEntries: VocabEntry[],
    linkedSlotId?: string,
    aiMasteredWords?: string[]
  ) => string[];
  onSaveDraft?: (draft: WritingSession) => void;
  onDeleteDraft?: (draftId: string) => void;
  usedCurriculumIds?: string[];
  onRecordUsedCurriculumId?: (curriculumId: string) => void;
  onAddVocabEntry: (entry: VocabEntry) => void;
  onOpenScheduledPopup: (slot: CalendarSlot) => void;
  onEvaluationStateChange?: (state: {
    inProgress: boolean;
    hasCompletedResult: boolean;
  }) => void;
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
  customCoachPrompt,
  coachPresets,
  tactileSoundEnabled = false,
  pendingEvalSessionsCount = 0,
  dailyWordGoal,
  liveOfflineCheckEnabled = true,
  onToggleLiveOfflineCheck,
  onUpdateSlot,
  initialMode,
  initialTone,
  initialTopic,
  initialDaySlot,
  initialDrillType = 'standard',
  initialTimeCapsuleOrigin = null,
  linkedCalendarSlotId,
  onSaveSession,
  onSaveDraft,
  onDeleteDraft,
  usedCurriculumIds = [],
  onRecordUsedCurriculumId,
  onAddVocabEntry,
  onOpenScheduledPopup,
  onEvaluationStateChange,
}: WriteStudioProps) {
  const [mode, setMode] = useState<WritingMode>(initialMode);
  const [tone, setTone] = useState<ToneSetting>(initialTone);
  const [audience, setAudience] = useState<AudienceOption>('Interviewer');
  const [topic, setTopic] = useState(
    initialTimeCapsuleOrigin?.topicDescription || initialTopic
  );
  const [daySlot, setDaySlot] = useState(initialDaySlot);
  const [activeSlotId, setActiveSlotId] = useState<string | undefined>(
    linkedCalendarSlotId
  );
  const [content, setContent] = useState('');
  const [debouncedContent, setDebouncedContent] = useState('');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftSavedLabel, setDraftSavedLabel] = useState<string | null>(null);
  const [showDraftsShelf, setShowDraftsShelf] = useState(false);

  // v3.1 Practice Mechanics State
  const [activeDrill, setActiveDrill] = useState<DrillType>(
    initialTimeCapsuleOrigin ? 'time-capsule' : initialDrillType
  );
  const [activeConstraint, setActiveConstraint] =
    useState<ConstraintChallenge | null>(null);
  const [showConstraintPicker, setShowConstraintPicker] = useState(false);

  // 4/3/2 Compression Sprint State
  const [sprintRoundIdx, setSprintRoundIdx] = useState<0 | 1 | 2>(0);
  const [sprintRounds, setSprintRounds] = useState<[string, string, string]>([
    '',
    '',
    '',
  ]);
  const [sprintSecondsLeft, setSprintSecondsLeft] = useState<number>(
    COMPRESSION_ROUNDS[0].durationSec
  );
  const [sprintRunning, setSprintRunning] = useState(false);
  const [sprintAutoPaused, setSprintAutoPaused] = useState(false);
  const [showPrevRoundsDrawer, setShowPrevRoundsDrawer] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const evalAsideRef = useRef<HTMLElement | null>(null);

  // Post-Evaluation 3s Smart Clear & Non-Destructive Undo State
  const [clearPopupState, setClearPopupState] = useState<PostEvalClearState>(() =>
    createIdlePostEvalClearState('editor', readAutoClearPreference())
  );
  const [lastEvaluatedSnapshot, setLastEvaluatedSnapshot] = useState<{
    topic: string;
    content: string;
    roomAText: string;
    roomBText: string;
  } | null>(null);
  const lastClearedDraftRef = useRef<{
    topic: string;
    content: string;
    roomAText: string;
    roomBText: string;
    activeDraftId: string | null;
    activeSlotId: string | undefined;
    loggedSessionId: string | null;
  } | null>(null);

  // Skeleton Reconstruction State
  const [skeletonPassage, setSkeletonPassage] = useState<SkeletonPassage>(() =>
    pickOfflineSkeletonPassage(initialMode)
  );
  const [skeletonPhase, setSkeletonPhase] = useState<'study' | 'reconstruct'>(
    'study'
  );
  const [skeletonCluesInput, setSkeletonCluesInput] = useState('');
  const [skeletonLoading, setSkeletonLoading] = useState(false);
  const [seenSkeletonIds, setSeenSkeletonIds] = useState<string[]>([]);

  // 3 Rooms Audience Ladder State
  const [roomAText, setRoomAText] = useState('');
  const [roomBText, setRoomBText] = useState('');
  const [mobileRoomTab, setMobileRoomTab] = useState<'roomA' | 'roomB'>('roomA');

  // Time Capsule Origin Session State
  const [timeCapsuleOrigin, setTimeCapsuleOrigin] =
    useState<WritingSession | null>(initialTimeCapsuleOrigin);

  // 3-Minute "No-Backspace" Flow Sprint State
  const [flowLockActive, setFlowLockActive] = useState(false);
  const [flowSecondsLeft, setFlowSecondsLeft] = useState<number>(
    DEFAULT_FLOW_SPRINT_SECONDS
  );
  const [flowShakeTick, setFlowShakeTick] = useState(0);
  const [flowHintVisible, setFlowHintVisible] = useState(false);
  const flowHintTimerRef = useRef<number | null>(null);
  const flowLockUsedInDraftRef = useRef(false);

  // 2-Second Vanishing Desk (fades non-essential chrome during continuous typing)
  const [chromeFaded, setChromeFaded] = useState(false);
  const typingFadeTimerRef = useRef<number | null>(null);

  // Revise & Lift (Pass 2) State
  const [revisionContext, setRevisionContext] = useState<{
    pass1SessionId: string;
    pass1Score: number;
    focusItems: string[];
  } | null>(null);
  const [lastRevisionDelta, setLastRevisionDelta] = useState<number | undefined>(
    undefined
  );

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

  // Non-repeating 52-week curriculum randomizer
  const lastDrawnCurriculumIdRef = useRef<string | null>(null);
  const topicTimerRef = useRef<number | null>(null);
  const contentSnapshotAtTopicPickRef = useRef<string>('');
  const previousTopicAtPickRef = useRef<string>('');
  const loadedRandomTopicRef = useRef<string | null>(null);
  const activeLoggedSessionIdRef = useRef<string | null>(null);
  const autoTitledSessionRef = useRef<boolean>(false);
  const latestTopicRef = useRef<string>(topic);

  const [suggestingTopic, setSuggestingTopic] = useState(false);
  const [askingAiTopic, setAskingAiTopic] = useState(false);
  const [suggestedTopicMeta, setSuggestedTopicMeta] = useState<{
    hint: string;
    category: string;
    isAi?: boolean;
  } | null>(null);

  const [showPivotInput, setShowPivotInput] = useState(false);
  const [pivotFocus, setPivotFocus] = useState('');
  const [pivoting, setPivoting] = useState(false);

  const [showOfflinePanel, setShowOfflinePanel] = useState(true);
  const [showAllDueTasks, setShowAllDueTasks] = useState(false);

  const [liveAppliedNotice, setLiveAppliedNotice] = useState<string | null>(null);
  const [showQuickAddVocab, setShowQuickAddVocab] = useState(false);
  const [quickVocabToast, setQuickVocabToast] = useState<string | null>(null);
  const quickVocabToastTimerRef = useRef<number | null>(null);

  const [checkedAngles, setCheckedAngles] = useState<Record<string, boolean>>({});

  const [evaluating, setEvaluating] = useState(false);
  const [evaluatingTierLabel, setEvaluatingTierLabel] =
    useState<string>('Hydrogen · Medium');
  const [evaluation, setEvaluation] = useState<EvaluationPayload | null>(null);
  const [lastSubmittedDrillMeta, setLastSubmittedDrillMeta] = useState<
    DrillMeta | undefined
  >(undefined);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [autoTitledBanner, setAutoTitledBanner] = useState<string | null>(null);
  const [promotedVocabBanner, setPromotedVocabBanner] = useState<string[] | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedVocabKeys, setSavedVocabKeys] = useState<Set<string>>(new Set());

  const [resetCountdown, setResetCountdown] = useState<number>(0);
  const [initialResetTotal, setInitialResetTotal] = useState<number>(30);

  // Sync latest topic ref
  useEffect(() => {
    latestTopicRef.current = topic;
  }, [topic]);

  // Report evaluation progress to Header (PSR-08)
  useEffect(() => {
    onEvaluationStateChange?.({
      inProgress: evaluating,
      hasCompletedResult: Boolean(evaluation),
    });
  }, [evaluating, evaluation, onEvaluationStateChange]);

  // 80ms debounce for live offline proofreader & prose diagnostics
  const effectiveDraftText = useMemo(() => {
    if (activeDrill === 'three-rooms') {
      return `${roomAText.trim()}\n\n${roomBText.trim()}`.trim();
    }
    return content;
  }, [activeDrill, content, roomAText, roomBText]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedContent(effectiveDraftText);
    }, 80);
    return () => window.clearTimeout(t);
  }, [effectiveDraftText]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (topicTimerRef.current !== null) window.clearTimeout(topicTimerRef.current);
      if (flowHintTimerRef.current !== null) window.clearTimeout(flowHintTimerRef.current);
      if (typingFadeTimerRef.current !== null) window.clearTimeout(typingFadeTimerRef.current);
    };
  }, []);

  // Auto-pause timers when browser tab is hidden (visibilitychange)
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        setSprintRunning((wasRunning) => {
          if (wasRunning) setSprintAutoPaused(true);
          return false;
        });
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // On mobile (<1024px), gently scroll to evaluation scorecard once complete
  useEffect(() => {
    if (!evaluation || evaluating) return;
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.setTimeout(() => {
        evalAsideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }, [evaluation, evaluating]);

  // 4/3/2 Compression Sprint Countdown Timer
  useEffect(() => {
    if (!sprintRunning || activeDrill !== 'compression-432') return;
    if (sprintSecondsLeft <= 0) {
      setSprintRunning(false);
      return;
    }
    const timer = window.setInterval(() => {
      setSprintSecondsLeft((prev) => {
        if (prev <= 1) {
          setSprintRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sprintRunning, activeDrill, sprintSecondsLeft]);

  // 3-Minute No-Backspace Flow Sprint Countdown Timer (auto-pauses when tab hidden)
  useEffect(() => {
    if (!flowLockActive) return;
    if (flowSecondsLeft <= 0) {
      setFlowLockActive(false);
      setFlowHintVisible(false);
      return;
    }
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setFlowSecondsLeft((prev) => {
        if (prev <= 1) {
          setFlowLockActive(false);
          setFlowHintVisible(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [flowLockActive, flowSecondsLeft]);

  // Restore vanishing chrome on pointer move or Escape
  useEffect(() => {
    if (!chromeFaded) return;
    const restore = () => setChromeFaded(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChromeFaded(false);
    };
    window.addEventListener('pointermove', restore, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', restore);
      window.removeEventListener('keydown', onKey);
    };
  }, [chromeFaded]);

  function scheduleVanishingDesk() {
    if (typingFadeTimerRef.current !== null) {
      window.clearTimeout(typingFadeTimerRef.current);
    }
    typingFadeTimerRef.current = window.setTimeout(() => {
      if (effectiveDraftText.trim().length >= 30 && !evaluating) {
        setChromeFaded(true);
      }
    }, 2000);
  }

  function triggerFlowBlockFeedback() {
    setFlowShakeTick((t) => t + 1);
    setFlowHintVisible(true);
    if (flowHintTimerRef.current !== null) {
      window.clearTimeout(flowHintTimerRef.current);
    }
    flowHintTimerRef.current = window.setTimeout(() => {
      setFlowHintVisible(false);
    }, 2200);
  }

  function handleToggleFlowSprint() {
    playTactileClick(tactileSoundEnabled);
    if (flowLockActive) {
      setFlowLockActive(false);
      setFlowHintVisible(false);
      return;
    }
    flowLockUsedInDraftRef.current = true;
    setFlowSecondsLeft(DEFAULT_FLOW_SPRINT_SECONDS);
    setFlowLockActive(true);
    setFlowHintVisible(false);
    window.setTimeout(() => document.getElementById('writing-editor')?.focus(), 40);
  }

  function handleSelectDrill(nextDrill: DrillType) {
    playTactileClick(tactileSoundEnabled);
    setActiveDrill(nextDrill);
    setErrorMessage(null);
    setEvaluation(null);
    setSavedSuccess(false);
    setRevisionContext(null);

    if (nextDrill === 'compression-432') {
      setSprintRoundIdx(0);
      setSprintRounds(['', '', '']);
      setSprintSecondsLeft(COMPRESSION_ROUNDS[0].durationSec);
      setSprintRunning(false);
      setShowPrevRoundsDrawer(false);
    } else if (nextDrill === 'skeleton') {
      setSkeletonPhase('study');
      const picked = pickOfflineSkeletonPassage(mode, seenSkeletonIds);
      setSkeletonPassage(picked);
      setSkeletonCluesInput(picked.signatureMoves.join(', '));
      setTopic(`Skeleton: ${picked.title}`);
    } else if (nextDrill === 'three-rooms') {
      if (!topic.trim()) {
        setTopic('Explain PID feedback loops in two contrasting registers');
      }
    }
  }

  async function handleNextSkeletonPassage() {
    playTactileClick(tactileSoundEnabled);
    setSkeletonLoading(true);
    const nextSeen = Array.from(new Set([...seenSkeletonIds, skeletonPassage.id]));
    setSeenSkeletonIds(nextSeen);
    try {
      const res = await fetch(getApiUrl('/api/skeleton-passage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          focusTheme: topic.trim() || undefined,
          excludeIds: nextSeen,
          studentProfile,
        }),
      });
      const data = await safeParseJsonResponse<{
        passage?: Partial<SkeletonPassage> & { passage?: string };
      }>(res);
      const rawPassage = data?.passage;
      const resolvedText = rawPassage?.text || rawPassage?.passage;
      if (res.ok && rawPassage && resolvedText) {
        const normalized: SkeletonPassage = {
          id: rawPassage.id || `skel-ai-${Date.now()}`,
          title: rawPassage.title || 'High-Craft Passage',
          domain: rawPassage.domain || 'technical',
          mode: rawPassage.mode || mode,
          text: resolvedText,
          wordCount:
            rawPassage.wordCount || resolvedText.trim().split(/\s+/).filter(Boolean).length,
          signatureMoves: Array.isArray(rawPassage.signatureMoves)
            ? rawPassage.signatureMoves
            : [],
        };
        setSkeletonPassage(normalized);
        setSkeletonCluesInput(normalized.signatureMoves.join(', '));
        setTopic(`Skeleton: ${normalized.title}`);
        setSkeletonPhase('study');
        return;
      }
    } catch {
      // Offline bank fallback below
    } finally {
      setSkeletonLoading(false);
    }
    const localPick = pickOfflineSkeletonPassage(mode, nextSeen);
    setSkeletonPassage(localPick);
    setSkeletonCluesInput(localPick.signatureMoves.join(', '));
    setTopic(`Skeleton: ${localPick.title}`);
    setSkeletonPhase('study');
  }

  function handleAdvanceCompressionRound() {
    playTactileClick(tactileSoundEnabled);
    const updated: [string, string, string] = [...sprintRounds] as [
      string,
      string,
      string,
    ];
    updated[sprintRoundIdx] = content.trim();
    setSprintRounds(updated);

    if (sprintRoundIdx < 2) {
      const nextIdx = (sprintRoundIdx + 1) as 1 | 2;
      setSprintRoundIdx(nextIdx);
      setContent(updated[nextIdx] || '');
      setSprintSecondsLeft(COMPRESSION_ROUNDS[nextIdx].durationSec);
      setSprintRunning(false);
      window.setTimeout(
        () => document.getElementById('writing-editor')?.focus(),
        40
      );
    }
  }

  const diagnostics = useMemo(
    () => analyzeDraftLocally(effectiveDraftText),
    [effectiveDraftText]
  );

  // Live Zero-Quota Prose Diagnostics (Sentence Rhythm Strip + Signal/Noise + Calques)
  const liveProseDiagnostics = useMemo(
    () => computeProseDiagnostics(debouncedContent),
    [debouncedContent]
  );

  // Live Deterministic Constraint Evaluation
  const constraintResult = useMemo(
    () => (activeConstraint ? activeConstraint.check(debouncedContent) : null),
    [activeConstraint, debouncedContent]
  );

  // Room A Jargon Detector (for 3 Rooms)
  const roomAJargonCheck = useMemo(
    () => (activeDrill === 'three-rooms' ? checkRoomAJargon(roomAText) : null),
    [activeDrill, roomAText]
  );

  const roomAWordCount = useMemo(
    () => analyzeDraftLocally(roomAText).wordCount,
    [roomAText]
  );
  const roomBWordCount = useMemo(
    () => analyzeDraftLocally(roomBText).wordCount,
    [roomBText]
  );

  // Eligible Time Capsule candidate from user history
  const timeCapsuleCandidate = useMemo(
    () => findTimeCapsuleCandidate(sessions, todayISO),
    [sessions, todayISO]
  );

  const effectiveDailyWordGoal =
    dailyWordGoal || studentProfile?.targetWordGoal || 250;
  const dailyInkProgress = useMemo(
    () =>
      computeDailyInkProgress({
        todayISO,
        sessions,
        currentWordCount: diagnostics.wordCount,
        activeDraftId,
        activeLoggedSessionId: activeLoggedSessionIdRef.current,
        dailyWordGoal: effectiveDailyWordGoal,
      }),
    [
      todayISO,
      sessions,
      diagnostics.wordCount,
      activeDraftId,
      savedSuccess,
      effectiveDailyWordGoal,
    ]
  );

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

  function handleLaunchTimeCapsuleFromStudio() {
    if (!timeCapsuleCandidate) return;
    playTactileClick(tactileSoundEnabled);
    setTimeCapsuleOrigin(timeCapsuleCandidate.session);
    setActiveDrill('time-capsule');
    setMode(timeCapsuleCandidate.session.mode);
    setTone(timeCapsuleCandidate.session.tone);
    setTopic(timeCapsuleCandidate.session.topicDescription);
    setContent('');
    setEvaluation(null);
    setSavedSuccess(false);
    setRevisionContext(null);
  }

  function handleLocateConstraintSpan(start: number, end: number) {
    const el = document.getElementById(
      'writing-editor'
    ) as HTMLTextAreaElement | null;
    if (!el) return;
    playTactileClick(tactileSoundEnabled);
    el.focus();
    el.setSelectionRange(start, end);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function executeClearEditorForFreshPage() {
    lastClearedDraftRef.current = {
      topic,
      content,
      roomAText,
      roomBText,
      activeDraftId,
      activeSlotId,
      loggedSessionId: activeLoggedSessionIdRef.current,
    };
    setTopic('');
    setContent('');
    setDebouncedContent('');
    setRoomAText('');
    setRoomBText('');
    setActiveDraftId(null);
    setActiveSlotId(undefined);
    setDraftSavedLabel(null);
    setAutoTitledBanner(null);
    setLiveAppliedNotice(null);
    setErrorMessage(null);
    setSprintRunning(false);
    setSprintAutoPaused(false);
    setSprintRoundIdx(0);
    setSprintRounds(['', '', '']);
    setSprintSecondsLeft(COMPRESSION_ROUNDS[0].durationSec);
    setFlowLockActive(false);
    setFlowSecondsLeft(DEFAULT_FLOW_SPRINT_SECONDS);
    setRevisionContext(null);
    activeLoggedSessionIdRef.current = null;
    playTactileClick(tactileSoundEnabled);
  }

  function handleRestoreClearedEditor() {
    const snap = lastClearedDraftRef.current;
    if (!snap) {
      setClearPopupState((prev) => dismissPostEvalClear(prev));
      return;
    }
    setTopic(snap.topic);
    setContent(snap.content);
    setDebouncedContent(snap.content);
    setRoomAText(snap.roomAText);
    setRoomBText(snap.roomBText);
    setActiveDraftId(snap.activeDraftId);
    setActiveSlotId(snap.activeSlotId);
    activeLoggedSessionIdRef.current = snap.loggedSessionId;
    lastClearedDraftRef.current = null;
    setClearPopupState((prev) => dismissPostEvalClear(prev));
    playTactileClick(tactileSoundEnabled);
    window.setTimeout(() => document.getElementById('writing-editor')?.focus(), 50);
  }

  const executeClearEditorRef = useRef(executeClearEditorForFreshPage);
  executeClearEditorRef.current = executeClearEditorForFreshPage;

  useEffect(() => {
    if (clearPopupState.phase === 'idle' || clearPopupState.paused) return;
    if (
      clearPopupState.phase === 'countdown' &&
      !clearPopupState.autoClearEnabled
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setClearPopupState((prev) => {
        const { nextState, shouldExecuteClear, shouldExpireUndo } =
          tickPostEvalClear(prev, 100);
        if (shouldExecuteClear) {
          window.setTimeout(() => executeClearEditorRef.current(), 0);
        }
        if (shouldExpireUndo) {
          lastClearedDraftRef.current = null;
        }
        return nextState;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [
    clearPopupState.phase,
    clearPopupState.paused,
    clearPopupState.autoClearEnabled,
  ]);

  function handleStartRevisionPass() {
    if (!evaluation) return;
    playTactileClick(tactileSoundEnabled);
    // If editor was cleared after evaluation, restore the evaluated draft cleanly for Pass 2
    if (!content.trim() && lastEvaluatedSnapshot?.content) {
      setTopic(lastEvaluatedSnapshot.topic);
      setContent(lastEvaluatedSnapshot.content);
      setDebouncedContent(lastEvaluatedSnapshot.content);
      if (lastEvaluatedSnapshot.roomAText) {
        setRoomAText(lastEvaluatedSnapshot.roomAText);
      }
      if (lastEvaluatedSnapshot.roomBText) {
        setRoomBText(lastEvaluatedSnapshot.roomBText);
      }
    }
    setClearPopupState((prev) => dismissPostEvalClear(prev));
    const pass1Id =
      activeLoggedSessionIdRef.current || `SESSION_${todayISO.replace(/-/g, '')}`;
    const pass1Score = computeTotalScore(evaluation.scores);
    const focusItems: string[] = [];

    for (const rw of evaluation.pinpointedRewrites ?? []) {
      if (focusItems.length < 3 && rw.rule) {
        focusItems.push(rw.rule);
      }
    }
    for (const fix of evaluation.grammarFixes ?? []) {
      if (focusItems.length < 3 && fix.rule) {
        focusItems.push(`${fix.original} → ${fix.corrected} (${fix.rule})`);
      }
    }
    if (focusItems.length === 0 && evaluation.strictImprovements) {
      focusItems.push(evaluation.strictImprovements);
    }

    setRevisionContext({
      pass1SessionId: pass1Id,
      pass1Score,
      focusItems: focusItems.slice(0, 3),
    });
    // Reset activeLoggedSessionIdRef so Pass 2 logs as its own tracked revision session
    activeLoggedSessionIdRef.current = null;
    setSavedSuccess(false);
    window.setTimeout(() => document.getElementById('writing-editor')?.focus(), 50);
  }

  function handleSuggestRandomTopic() {
    if (suggestingTopic || askingAiTopic) return;
    setErrorMessage(null);
    setSuggestingTopic(true);

    const isReplacingExistingRandom =
      suggestedTopicMeta !== null &&
      loadedRandomTopicRef.current !== null &&
      topic.trim() === loadedRandomTopicRef.current.trim();
    if (!isReplacingExistingRandom) {
      previousTopicAtPickRef.current = topic;
    }
    contentSnapshotAtTopicPickRef.current = content;

    if (topicTimerRef.current !== null) {
      window.clearTimeout(topicTimerRef.current);
    }

    const usedTitles = [
      ...calendarSlots.map((s) => s.topic),
      ...sessions.map((s) => s.topicDescription),
      ...(loadedRandomTopicRef.current ? [loadedRandomTopicRef.current] : []),
    ];

    topicTimerRef.current = window.setTimeout(() => {
      const draw = drawNextCurriculumRandomTopic({
        usedCurriculumIds,
        usedTopicTitles: usedTitles,
        lastShownId: lastDrawnCurriculumIdRef.current,
      });
      lastDrawnCurriculumIdRef.current = draw.id;
      if (draw.curriculumId && onRecordUsedCurriculumId) {
        onRecordUsedCurriculumId(draw.curriculumId);
      }

      if (activeSlotId) {
        setActiveSlotId(undefined);
        setPreLoadSnapshot(null);
      }
      loadedRandomTopicRef.current = draw.title;
      setTopic(draw.title);
      setMode(draw.mode);
      setTone(draw.tone);
      setDaySlot(draw.category);
      setSuggestedTopicMeta({
        hint: draw.hint,
        category: draw.category,
        isAi: false,
      });
      setSuggestingTopic(false);
    }, 220);
  }

  async function handleAskAiForFreshTopic() {
    if (askingAiTopic || suggestingTopic) return;
    setErrorMessage(null);
    setAskingAiTopic(true);

    const isReplacingExistingRandom =
      suggestedTopicMeta !== null &&
      loadedRandomTopicRef.current !== null &&
      topic.trim() === loadedRandomTopicRef.current.trim();
    if (!isReplacingExistingRandom) {
      previousTopicAtPickRef.current = topic;
    }
    contentSnapshotAtTopicPickRef.current = content;

    const existingTopics = [
      ...calendarSlots.map((s) => s.topic),
      ...sessions.map((s) => s.topicDescription),
      ...(topic.trim() ? [topic.trim()] : []),
    ];

    try {
      const adaptiveWritingProfile = buildAdaptivePromptContext(
        studentProfile,
        sessions,
        vocabulary,
        todayISO
      );
      const res = await fetch(getApiUrl('/api/topics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: MODE_LABELS[mode],
          tone: TONE_LABELS[tone],
          existingTopics,
          studentProfile,
          adaptiveWritingProfile,
        }),
      });
      const data = await safeParseJsonResponse<{
        prompts?: Array<{
          title: string;
          guidance: string;
          category: string;
          targetWords?: number;
        }>;
      }>(res);
      const firstPrompt = data?.prompts?.[0];
      if (!res.ok || !firstPrompt?.title) {
        throw new Error('AI topic generator unavailable');
      }
      if (activeSlotId) {
        setActiveSlotId(undefined);
        setPreLoadSnapshot(null);
      }
      loadedRandomTopicRef.current = firstPrompt.title;
      setTopic(firstPrompt.title);
      setDaySlot(`AI Topic · ${firstPrompt.category || MODE_LABELS[mode]}`);
      setSuggestedTopicMeta({
        hint: firstPrompt.guidance,
        category: `AI Fresh Topic · ${firstPrompt.category || MODE_LABELS[mode]}`,
        isAi: true,
      });
    } catch {
      const draw = drawNextCurriculumRandomTopic({
        usedCurriculumIds,
        usedTopicTitles: existingTopics,
        lastShownId: lastDrawnCurriculumIdRef.current,
      });
      lastDrawnCurriculumIdRef.current = draw.id;
      if (draw.curriculumId && onRecordUsedCurriculumId) {
        onRecordUsedCurriculumId(draw.curriculumId);
      }
      loadedRandomTopicRef.current = draw.title;
      setTopic(draw.title);
      setMode(draw.mode);
      setTone(draw.tone);
      setDaySlot(draw.category);
      setSuggestedTopicMeta({
        hint: draw.hint,
        category: draw.category,
        isAi: false,
      });
    } finally {
      setAskingAiTopic(false);
    }
  }

  function handleDismissRandomTopic() {
    const resolution = resolveRandomTopicDismiss({
      currentTopic: topic,
      currentContent: content,
      loadedRandomTopic: loadedRandomTopicRef.current,
      contentSnapshotAtPick: contentSnapshotAtTopicPickRef.current,
      previousTopicAtPick: previousTopicAtPickRef.current,
    });
    if (!resolution.keptTopic) {
      setTopic(resolution.nextTopic);
    }
    loadedRandomTopicRef.current = null;
    setSuggestedTopicMeta(null);
  }

  function handleSaveDraftClick() {
    if (!onSaveDraft) return;
    setErrorMessage(null);
    if (!topic.trim() && !effectiveDraftText.trim()) {
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
      content: effectiveDraftText,
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
      audience,
      drillType: activeDrill,
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
    if (draft.audience) setAudience(draft.audience);
    if (draft.drillType) setActiveDrill(draft.drillType);
    setSuggestedTopicMeta(null);
    loadedRandomTopicRef.current = null;
    setEvaluation(null);
    setSavedSuccess(false);
    setAutoTitledBanner(null);
    activeLoggedSessionIdRef.current = null;
    setDraftSavedLabel('Loaded draft');
    setShowDraftsShelf(false);
  }

  function handleApplySingleOfflineFix(issue: OfflineProofIssue) {
    if (activeDrill === 'three-rooms') {
      if (roomAText.includes(issue.original)) {
        setRoomAText((prev) => applyOfflineIssue(prev, issue));
      } else {
        setRoomBText((prev) => applyOfflineIssue(prev, issue));
      }
    } else {
      setContent((prev) => applyOfflineIssue(prev, issue));
    }
    setDraftSavedLabel(null);
  }

  function handleApplyAllOfflineFixes() {
    if (offlineIssues.length === 0) return;
    if (activeDrill !== 'three-rooms') {
      setContent((prev) => applyAllOfflineIssues(prev, offlineIssues));
    }
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
      effectiveDraftText.trim().length >= 20
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
    if (slot.recommendedDrill) {
      setActiveDrill(slot.recommendedDrill);
    }
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
      const res = await fetch(getApiUrl('/api/pivot-topic'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: activeLinkedSlot,
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
    const cleanRep = replacement.trim();
    if (!original) return;
    if (activeDrill === 'three-rooms') {
      if (roomAText.includes(original)) {
        setRoomAText((prev) => prev.replace(original, cleanRep));
        setLiveAppliedNotice('Applied suggested revision to Room A.');
        return;
      }
      if (roomBText.includes(original)) {
        setRoomBText((prev) => prev.replace(original, cleanRep));
        setLiveAppliedNotice('Applied suggested revision to Room B.');
        return;
      }
    }
    if (content.includes(original)) {
      setContent((prev) => prev.replace(original, cleanRep));
      setErrorMessage(null);
      setLiveAppliedNotice('Applied suggested revision to your draft.');
      return;
    }
    setErrorMessage(
      `Could not locate exact phrase "${original.slice(0, 60)}" in the current draft.`
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

  function buildCurrentDrillContextAndMeta(submittedText: string): {
    drillContext: Record<string, unknown>;
    drillMeta: DrillMeta;
    localDrillVerdict?: DrillVerdict;
  } {
    const baseMeta: DrillMeta = {
      drillType: activeDrill,
      audience,
      flowSprintUsed: flowLockUsedInDraftRef.current || undefined,
      constraintId: activeConstraint?.id,
      constraintLabel: activeConstraint?.shortLabel,
      constraintViolations: constraintResult?.violationCount,
    };

    if (activeDrill === 'compression-432') {
      const roundsSnapshot: [string, string, string] = [...sprintRounds] as [
        string,
        string,
        string,
      ];
      roundsSnapshot[sprintRoundIdx] = submittedText;
      const wordCounts: [number, number, number] = [
        countSprintWords(roundsSnapshot[0]),
        countSprintWords(roundsSnapshot[1]),
        countSprintWords(roundsSnapshot[2]),
      ];
      const summary = computeCompressionMetrics(wordCounts);
      const drillMeta: DrillMeta = {
        ...baseMeta,
        compressionWordCounts: wordCounts,
        compressionRatio: summary.compressionRatioPct,
      };
      return {
        drillContext: {
          drillType: 'compression-432',
          drillPayload: {
            rounds: roundsSnapshot,
            roundWordCounts: wordCounts,
            constraintLabel: activeConstraint?.shortLabel,
            constraintPassed: constraintResult?.passed,
            noBackspaceUsed: flowLockUsedInDraftRef.current,
          },
        },
        drillMeta,
        localDrillVerdict: {
          headline: `4/3/2 Compression · ${summary.summaryLabel}`,
          badge: `${summary.compressionRatioPct}% tighter`,
          compressionRatio: summary.compressionRatioPct,
          summary: summary.hitTargetCurve
            ? 'All three compression rounds stepped down cleanly. Review your sharpest version below.'
            : 'Compression sprint logged. Complete all 3 rounds stepping down word count to sharpen density.',
        },
      };
    }

    if (activeDrill === 'skeleton') {
      const clues = parseSkeletonClues(skeletonCluesInput);
      const diff = compareSkeletonReconstruction(
        skeletonPassage.text,
        submittedText
      );
      const drillMeta: DrillMeta = {
        ...baseMeta,
        skeletonPassageId: skeletonPassage.id,
        skeletonTitle: skeletonPassage.title,
        skeletonOriginalText: skeletonPassage.text,
        skeletonClues: clues,
      };
      return {
        drillContext: {
          drillType: 'skeleton',
          drillPayload: {
            masterPassage: skeletonPassage.text,
            skeletonTitle: skeletonPassage.title,
            skeletonClues: clues,
            constraintLabel: activeConstraint?.shortLabel,
            constraintPassed: constraintResult?.passed,
          },
        },
        drillMeta,
        localDrillVerdict: {
          headline: 'Skeleton Reconstruction Complete',
          badge: `${diff.originalityPct}% fresh wording`,
          skeletonAlignmentNote: diff.cadenceNote,
          summary: diff.cadenceNote,
        },
      };
    }

    if (activeDrill === 'three-rooms') {
      const ladder = evaluateRegisterShift(roomAText, roomBText);
      const drillMeta: DrillMeta = {
        ...baseMeta,
        roomsJargonCount: ladder.roomAJargonCount,
        roomAText: roomAText.trim(),
        roomBText: roomBText.trim(),
      };
      return {
        drillContext: {
          drillType: 'three-rooms',
          drillPayload: {
            roomA: roomAText.trim(),
            roomB: roomBText.trim(),
            constraintLabel: activeConstraint?.shortLabel,
            constraintPassed: constraintResult?.passed,
          },
        },
        drillMeta,
        localDrillVerdict: {
          headline: 'Audience Ladder · Register Shift',
          badge: `${ladder.lexicalShiftPct}% shift`,
          registerShiftScore: ladder.lexicalShiftPct,
          summary: ladder.summary,
        },
      };
    }

    if (activeDrill === 'time-capsule' && timeCapsuleOrigin) {
      const drillMeta: DrillMeta = {
        ...baseMeta,
        timeCapsuleOriginSessionId: timeCapsuleOrigin.id,
        timeCapsuleOriginText: timeCapsuleOrigin.content,
        timeCapsuleOriginScore: timeCapsuleOrigin.totalScore,
        timeCapsuleOriginDate: timeCapsuleOrigin.date,
      };
      return {
        drillContext: {
          drillType: 'time-capsule',
          drillPayload: {
            pastDraft: timeCapsuleOrigin.content,
            pastScore: timeCapsuleOrigin.totalScore,
            pastDate: timeCapsuleOrigin.date,
          },
        },
        drillMeta,
      };
    }

    return {
      drillContext: {
        drillType: 'standard',
        drillPayload: {
          constraintLabel: activeConstraint?.shortLabel,
          constraintRule: activeConstraint?.rule,
          constraintPassed: constraintResult?.passed,
          constraintViolations: constraintResult?.violationCount,
          constraintAdherenceScore: constraintResult?.adherenceScore,
          constraintExcerpts: constraintResult?.matches
            .slice(0, 5)
            .map((m) => m.excerpt),
          noBackspaceUsed: flowLockUsedInDraftRef.current,
        },
      },
      drillMeta: baseMeta,
      localDrillVerdict:
        activeConstraint && constraintResult
          ? {
              headline: `Constraint · ${activeConstraint.shortLabel}`,
              badge: constraintResult.passed
                ? `${constraintResult.adherenceScore}% Clean`
                : `${constraintResult.adherenceScore}% · ${constraintResult.violationCount} flag${
                    constraintResult.violationCount === 1 ? '' : 's'
                  }`,
              summary: constraintResult.passed
                ? `Zero rule violations. ${activeConstraint.whyItMatters}`
                : `${constraintResult.details.replace(/\.?$/, '.')} Review the highlighted spans in the editor to reach 100% adherence.`,
            }
          : undefined,
    };
  }

  function persistEvaluatedSession(
    evalPayload: EvaluationPayload,
    resolvedTopic: string,
    draftText: string,
    stableSessionId: string,
    drillMeta: DrillMeta,
    resolvedVerdict?: DrillVerdict
  ) {
    const isQueued = evalPayload.evaluationStatus === 'queued_for_reset';
    const totalScore = computeTotalScore(evalPayload.scores);
    const percentage = computePercentage(totalScore);
    const draftDiagnostics = analyzeDraftLocally(draftText);
    const localProse = computeProseDiagnostics(draftText);

    const intl = deriveInternationalMetrics({
      scores: evalPayload.scores,
      content: draftText.trim(),
      internationalMetrics: evalPayload.internationalMetrics,
    });

    const revisionDelta = revisionContext
      ? totalScore - revisionContext.pass1Score
      : undefined;
    setLastRevisionDelta(revisionDelta);

    let finalVerdict = evalPayload.drillVerdict ?? resolvedVerdict;
    if (activeDrill === 'time-capsule' && timeCapsuleOrigin) {
      const tcDelta = computeTimeCapsuleDelta(timeCapsuleOrigin, {
        totalScore,
        percentage,
        wordCount: draftDiagnostics.wordCount,
        spokenReadinessScore:
          evalPayload.spokenReadinessScore ?? localProse.baselineSpokenReadiness,
        signalNoiseRatio:
          evalPayload.signalNoiseRatio ?? localProse.signalNoiseRatio,
      });
      if (!finalVerdict) {
        finalVerdict = {
          headline: tcDelta.headline,
          badge: `${tcDelta.scoreDelta >= 0 ? '+' : ''}${tcDelta.scoreDelta} pts`,
          timeCapsuleDelta: tcDelta.scoreDelta,
          summary: `Compared blind against your ${timeCapsuleOrigin.date} draft (${timeCapsuleOrigin.totalScore}/60 → ${totalScore}/60).`,
        };
      }
    }

    const sessionRecord: WritingSession = {
      id: stableSessionId,
      date: todayISO,
      daySlot: daySlot || 'Studio Session',
      mode,
      promptCategory: MODE_LABELS[mode],
      tone,
      topicDescription: resolvedTopic,
      content: draftText.trim(),
      wordCount: draftDiagnostics.wordCount,
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
      spokenReadinessScore:
        evalPayload.spokenReadinessScore ?? localProse.baselineSpokenReadiness,
      signalNoiseRatio:
        evalPayload.signalNoiseRatio ?? localProse.signalNoiseRatio,
      audienceReaction: evalPayload.audienceReaction,
      audience,
      calqueFixes:
        evalPayload.calqueFixes && evalPayload.calqueFixes.length > 0
          ? evalPayload.calqueFixes
          : localProse.calqueFixes.length > 0
            ? localProse.calqueFixes
            : undefined,
      drillType: activeDrill,
      drillMeta,
      drillVerdict: finalVerdict,
      revisionOfSessionId: revisionContext?.pass1SessionId,
      revisionDelta,
      status: 'Completed',
      evaluationPending: isQueued,
      modelUsed: evalPayload.modelUsed || 'gemini-4-hydrogen',
      queuedAt: isQueued ? new Date().toISOString() : undefined,
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
        contextSnippet: v.contextSnippet || resolvedTopic,
        mode,
        dateAdded: todayISO,
        mastered: false,
        sessionId: stableSessionId,
      }));

    const promoted = onSaveSession(
      sessionRecord,
      newVocab,
      activeSlotId,
      evalPayload.masteredWordsUsed
    );
    if (promoted && promoted.length > 0) {
      setPromotedVocabBanner(promoted);
    }
    if (activeDraftId && onDeleteDraft) {
      onDeleteDraft(activeDraftId);
      setActiveDraftId(null);
      setDraftSavedLabel(null);
    }
    setSavedSuccess(true);
  }

  async function handleEvaluateDraft(isAutoRetry = false) {
    setErrorMessage(null);
    setLiveAppliedNotice(null);
    setChromeFaded(false);

    const submittedDraft =
      activeDrill === 'three-rooms'
        ? combineThreeRoomsForEvaluation(roomAText, roomBText)
        : content.trim();

    if (submittedDraft.trim().length < 20) {
      setErrorMessage(
        activeDrill === 'three-rooms'
          ? 'Write at least a couple of sentences across Room A and Room B before evaluating.'
          : 'Write at least 20 characters before requesting an evaluation.'
      );
      return;
    }

    const wasTopicBlank = !topic.trim() && !activeLinkedSlot?.topic;
    const fallbackTopic =
      topic.trim() ||
      activeLinkedSlot?.topic ||
      inferSuitableTitle(submittedDraft, mode);

    if (!isAutoRetry) {
      autoTitledSessionRef.current = wasTopicBlank;
      setAutoTitledBanner(null);
      setPromotedVocabBanner(null);
    }

    const stableSessionId =
      activeLoggedSessionIdRef.current ||
      `SESSION_${todayISO.replace(/-/g, '')}_${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;
    activeLoggedSessionIdRef.current = stableSessionId;

    const { drillContext, drillMeta, localDrillVerdict } =
      buildCurrentDrillContextAndMeta(submittedDraft);
    setLastSubmittedDrillMeta(drillMeta);

    const draftDiag = analyzeDraftLocally(submittedDraft);
    const predictedRoute = selectDynamicEvaluationRoute({
      wordCount: draftDiag.wordCount,
      mode: MODE_LABELS[mode],
      tone: TONE_LABELS[tone],
      topic: wasTopicBlank ? '' : fallbackTopic,
      topicPrimer: activeLinkedSlot?.topicPrimer || '',
      hasPreviousSessionSummary: Boolean(coachContext.previousSessionSummary),
      practicingVocabCount: coachContext.practicingWords.length,
    });
    setEvaluatingTierLabel(predictedRoute.primary.tierLabel);

    // Single-pass atomic evaluation (PSR-01: zero provisional score jump)
    setClearPopupState((prev) => dismissPostEvalClear(prev));
    setEvaluating(true);
    try {
      const res = await fetch(getApiUrl('/api/evaluate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: submittedDraft,
          mode: MODE_LABELS[mode],
          tone: TONE_LABELS[tone],
          topic: wasTopicBlank ? '' : fallbackTopic,
          needsAutoTitle: wasTopicBlank,
          topicPrimer: activeLinkedSlot?.topicPrimer || '',
          previousSessionSummary: coachContext.previousSessionSummary,
          practicingVocab: coachContext.practicingWords.map(
            (v) => v.betterAlternative
          ),
          studentProfile,
          audience,
          customCoachPrompt: customCoachPrompt || undefined,
          coachPresets:
            coachPresets && coachPresets.length > 0 ? coachPresets : undefined,
          drillContext,
        }),
      });
      const data = await safeParseJsonResponse<
        EvaluationPayload & { error?: string }
      >(res);
      if (!res.ok || !data) {
        throw new Error('Static host or API unavailable');
      }
      if (data.error) {
        throw new Error(data.error);
      }

      let finalTopic = latestTopicRef.current.trim() || fallbackTopic;
      if (
        wasTopicBlank &&
        data.suggestedTitle &&
        data.suggestedTitle.trim().length >= 4
      ) {
        finalTopic = data.suggestedTitle.trim();
        setTopic(finalTopic);
        setAutoTitledBanner(finalTopic);
      } else if (wasTopicBlank) {
        finalTopic = fallbackTopic;
        setTopic(finalTopic);
        setAutoTitledBanner(finalTopic);
      }

      const finalEval: EvaluationPayload = {
        ...data,
        drillVerdict: data.drillVerdict ?? localDrillVerdict,
        isProvisionalInstant: false,
      };
      setEvaluation(finalEval);
      setLastEvaluatedSnapshot({
        topic: finalTopic,
        content: submittedDraft,
        roomAText,
        roomBText,
      });

      persistEvaluatedSession(
        finalEval,
        finalTopic,
        submittedDraft,
        stableSessionId,
        drillMeta,
        finalEval.drillVerdict
      );

      if (data.evaluationStatus === 'queued_for_reset') {
        const secs = data.quotaResetSeconds || 30;
        setInitialResetTotal(secs);
        setResetCountdown(secs);
      } else {
        setResetCountdown(0);
        setClearPopupState((prev) => startPostEvalClearPrompt(prev));
      }
    } catch {
      const currentOfflineIssues = runOfflineProofread(submittedDraft);
      const offlineEval = buildInstantLocalEvaluation(
        submittedDraft,
        mode,
        tone,
        currentOfflineIssues,
        fallbackTopic
      );
      const localProse = computeProseDiagnostics(submittedDraft);
      const mergedOffline: EvaluationPayload = {
        ...offlineEval,
        spokenReadinessScore: localProse.baselineSpokenReadiness,
        signalNoiseRatio: localProse.signalNoiseRatio,
        audienceReaction: `As a ${audience.toLowerCase()}, the main idea comes across — tighten filler transitions and test reading it aloud once.`,
        calqueFixes: localProse.calqueFixes,
        drillVerdict: localDrillVerdict,
      };
      if (wasTopicBlank) {
        setTopic(fallbackTopic);
        setAutoTitledBanner(fallbackTopic);
      }
      setEvaluation(mergedOffline);
      setLastEvaluatedSnapshot({
        topic: fallbackTopic,
        content: submittedDraft,
        roomAText,
        roomBText,
      });
      persistEvaluatedSession(
        mergedOffline,
        fallbackTopic,
        submittedDraft,
        stableSessionId,
        drillMeta,
        localDrillVerdict
      );
      setResetCountdown(0);
      setClearPopupState((prev) => startPostEvalClearPrompt(prev));
    } finally {
      setEvaluating(false);
    }
  }

  const evalIntl = evaluation
    ? deriveInternationalMetrics({
        scores: evaluation.scores,
        content: effectiveDraftText,
        internationalMetrics: evaluation.internationalMetrics,
      })
    : null;

  const hasRightCoachingDrawer = !focusMode && (evaluating || Boolean(evaluation));
  const studioGreeting = useMemo(
    () => getStudioGreeting(studentProfile?.displayName),
    [studentProfile?.displayName]
  );

  const offlineCategorySummary = useMemo(() => {
    let spelling = 0;
    let grammar = 0;
    let punctuation = 0;
    for (const item of offlineIssues) {
      if (item.category === 'spelling') spelling += 1;
      else if (item.category === 'grammar') grammar += 1;
      else punctuation += 1;
    }
    const parts: string[] = [];
    if (spelling > 0) parts.push(`${spelling} spelling`);
    if (grammar > 0) parts.push(`${grammar} grammar`);
    if (punctuation > 0) parts.push(`${punctuation} spacing`);
    return parts.join(' · ');
  }, [offlineIssues]);

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

  const currentSprintSpec = COMPRESSION_ROUNDS[sprintRoundIdx];
  const parsedSkeletonClues = useMemo(
    () => parseSkeletonClues(skeletonCluesInput),
    [skeletonCluesInput]
  );

  return (
    <div
      className={
        focusMode
          ? 'min-h-screen bg-canvas px-3 sm:px-4 py-4 sm:py-10'
          : `${hasRightCoachingDrawer ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-3 sm:px-6 py-4 sm:py-9 space-y-3.5 sm:space-y-5`
      }
    >
      {/* Minimal Editorial Studio Header (fades quietly during continuous typing) */}
      <div
        data-faded={chromeFaded ? 'true' : 'false'}
        className={`vanishing-chrome flex flex-wrap items-end justify-between gap-4 ${
          focusMode ? 'max-w-3xl mx-auto mb-8' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              data-testid="studio-greeting-headline"
              className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary"
            >
              {focusMode ? 'Focused Manuscript' : studioGreeting.headline}
            </h1>
            {pendingEvalSessionsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-mono-tabular border border-status-warning-border bg-status-warning-soft text-status-warning">
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span>{pendingEvalSessionsCount} queued</span>
              </span>
            )}
          </div>
          {!focusMode && (
            <p className="text-xs text-ink-muted mt-1 flex flex-wrap items-center gap-x-2">
              <span>{studioGreeting.sublinePrefix}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{formattedToday}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          {!focusMode && (
            <button
              type="button"
              data-testid="random-topic-button"
              onClick={handleSuggestRandomTopic}
              disabled={suggestingTopic}
              title="Pick a fresh, non-repeating random topic to write on"
              className="btn-secondary inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-0 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium whitespace-nowrap"
            >
              {suggestingTopic ? (
                <Sparkles
                  className="w-3.5 h-3.5 text-ink-primary animate-pulse"
                  aria-hidden="true"
                />
              ) : (
                <Dices className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
              )}
              <span className="sm:hidden">
                {suggestingTopic ? 'Picking...' : 'Topic'}
              </span>
              <span className="hidden sm:inline">
                {suggestingTopic ? 'Picking...' : 'Random Topic'}
              </span>
            </button>
          )}

          {!focusMode && (
            <button
              type="button"
              data-testid="quick-add-vocab-button"
              onClick={() => setShowQuickAddVocab(true)}
              title="Quickly save a new word and definition to your vocabulary bank"
              className="btn-secondary inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:py-2 text-xs font-medium whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
              <span>Quick Add</span>
            </button>
          )}

          {!focusMode && (
            <button
              type="button"
              data-testid="drafts-toggle-button"
              onClick={() => setShowDraftsShelf((v) => !v)}
              aria-expanded={showDraftsShelf}
              className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-0 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium whitespace-nowrap ${
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
          className="card-surface drawer-reveal p-4 sm:p-5 space-y-3"
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

      {/* Whisper-Quiet Today / Open Scheduled Task Strip */}
      {!focusMode && visibleWriteTasks.length > 0 && (
        <section
          aria-label="Scheduled writing task due today"
          data-testid="minimal-today-strip"
          data-faded={chromeFaded ? 'true' : 'false'}
          className="vanishing-chrome card-surface overflow-hidden"
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
                              : 'text-ink-secondary'
                        }`}
                      >
                        {slot.completed
                          ? 'Completed'
                          : isDueToday
                            ? 'Today · 10 min'
                            : `Still open — 10 min · ${slot.scheduledDate}`}
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
            {/* Top Mode, Audience & Tone Ribbon (Auto-Collapsible on Mobile) */}
            {!focusMode && !activeLinkedSlot && (
              <div
                data-faded={chromeFaded ? 'true' : 'false'}
                className="vanishing-chrome px-3 sm:px-5 py-2 sm:py-3 border-b border-border-subtle bg-subtle/55 space-y-2"
              >
                {/* Mobile-only 1-Line Studio Setup Summary + Expand Toggle */}
                <div className="flex sm:hidden items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 text-xs">
                    <span className="font-medium text-ink-primary truncate">
                      {formatMobileStudioSummary({
                        modeLabel: MODE_LABELS[mode],
                        drillLabel:
                          DRILL_OPTIONS.find((d) => d.id === activeDrill)?.label ??
                          'Standard',
                        toneLabel: TONE_LABELS[tone],
                        constraintShortLabel: activeConstraint?.shortLabel ?? null,
                        flowLockActive,
                      })}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="mobile-studio-options-toggle"
                    aria-expanded={mobileControlsOpen}
                    onClick={() => {
                      playTactileClick(tactileSoundEnabled);
                      setMobileControlsOpen((v) => !v);
                    }}
                    className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                      mobileControlsOpen ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{mobileControlsOpen ? 'Done' : 'Options'}</span>
                  </button>
                </div>

                <div
                  className={`${
                    mobileControlsOpen ? 'flex drawer-reveal' : 'hidden sm:flex'
                  } flex-col gap-2 min-w-0`}
                >
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2 min-w-0">
                  <div
                    role="tablist"
                    aria-label="Writing practice mode"
                    className="segmented-track flex flex-nowrap sm:flex-wrap items-center gap-0.5 overflow-x-auto scrollbar-none scroll-smooth-touch w-full sm:w-auto min-w-0"
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
                          if (m === 'friend') {
                            setTone('conversational');
                            setAudience('Friend');
                          } else if (m === 'email') {
                            setTone('formal-executive');
                            setAudience('Hiring Manager');
                          } else if (m === 'technical') {
                            setTone('academic-technical');
                            setAudience('Interviewer');
                          } else if (m === 'linkedin') {
                            setTone('professional-warm');
                            setAudience('LinkedIn Reader');
                          } else if (m === 'creative') {
                            setTone('narrative-vivid');
                            setAudience('Friend');
                          }
                        }}
                        className="segmented-item px-2.5 py-1 text-xs whitespace-nowrap"
                      >
                        {MODE_LABELS[m]}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
                    <label htmlFor="audience-select" className="sr-only">
                      Target audience
                    </label>
                    <select
                      id="audience-select"
                      data-testid="audience-select"
                      value={audience}
                      title="Target reader for Audience Gut-Reaction"
                      onChange={(e) =>
                        setAudience(e.target.value as AudienceOption)
                      }
                      className="input-tactile w-full sm:w-auto min-w-0 px-2 py-1 text-xs font-medium truncate"
                    >
                      {AUDIENCE_OPTIONS.map((aud) => (
                        <option key={aud} value={aud}>
                          For: {aud}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="tone-select" className="sr-only">
                      Target tone
                    </label>
                    <select
                      id="tone-select"
                      value={tone}
                      title="Select target writing tone"
                      onChange={(e) => setTone(e.target.value as ToneSetting)}
                      className="input-tactile w-full sm:w-auto min-w-0 px-2 py-1 text-xs font-medium truncate"
                    >
                      {Object.entries(TONE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Practice Mechanic Selector + Constraint Chip + 3-Min Flow Toggle */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2 pt-2 border-t border-border-subtle/70 min-w-0">
                  <div
                    role="tablist"
                    aria-label="10-minute practice mechanic"
                    className="segmented-track flex sm:inline-flex flex-nowrap sm:flex-wrap items-center gap-0.5 overflow-x-auto scrollbar-none scroll-smooth-touch w-full sm:w-auto min-w-0"
                  >
                    {DRILL_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="tab"
                        data-testid={`drill-tab-${opt.id}`}
                        aria-selected={activeDrill === opt.id}
                        data-active={activeDrill === opt.id ? 'true' : 'false'}
                        onClick={() => handleSelectDrill(opt.id)}
                        className="segmented-item inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                      >
                        <span>{opt.label}</span>
                        <span className="font-mono-tabular text-[10px] opacity-65">
                          {opt.duration}
                        </span>
                      </button>
                    ))}
                    {timeCapsuleCandidate && (
                      <button
                        type="button"
                        role="tab"
                        data-testid="drill-tab-time-capsule"
                        aria-selected={activeDrill === 'time-capsule'}
                        data-active={
                          activeDrill === 'time-capsule' ? 'true' : 'false'
                        }
                        onClick={handleLaunchTimeCapsuleFromStudio}
                        className="segmented-item inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                      >
                        <History className="w-3 h-3" aria-hidden="true" />
                        <span>Time Capsule</span>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="constraint-picker-toggle"
                      data-active={activeConstraint ? 'true' : 'false'}
                      onClick={() => setShowConstraintPicker((v) => !v)}
                      className="btn-chip inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                      <span>
                        {activeConstraint
                          ? activeConstraint.shortLabel
                          : '+ Constraint'}
                      </span>
                      {activeConstraint && constraintResult && (
                        <span
                          className={`font-mono-tabular text-[10px] ${
                            constraintResult.passed
                              ? 'text-status-success'
                              : 'text-status-warning'
                          }`}
                        >
                          · {constraintResult.adherenceScore}%
                        </span>
                      )}
                    </button>
                    {activeConstraint && (
                      <button
                        type="button"
                        onClick={() => setActiveConstraint(null)}
                        aria-label="Clear active constraint"
                        className="btn-ghost p-1"
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="flow-sprint-toggle"
                      data-active={flowLockActive ? 'true' : 'false'}
                      aria-pressed={flowLockActive}
                      onClick={handleToggleFlowSprint}
                      title="3-Minute No-Backspace Flow Sprint: disables deleting so you draft forward without self-editing"
                      className="btn-chip inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      <Flame className="w-3 h-3" aria-hidden="true" />
                      <span className="font-mono-tabular">
                        {flowLockActive
                          ? `Flow ${formatCountdownMMSS(flowSecondsLeft)}`
                          : '3m Flow'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* QuillBot-Inspired Categorized Constraint Studio Drawer */}
                {showConstraintPicker && (
                  <ConstraintPickerDrawer
                    mode={mode}
                    modeLabel={MODE_LABELS[mode]}
                    draftText={effectiveDraftText}
                    activeConstraint={activeConstraint}
                    onSelect={(ch) => {
                      playTactileClick(tactileSoundEnabled);
                      setActiveConstraint(ch);
                      setShowConstraintPicker(false);
                    }}
                    onRollRandom={() => {
                      playTactileClick(tactileSoundEnabled);
                      setActiveConstraint(
                        pickRandomConstraint(activeConstraint?.id, mode)
                      );
                      setShowConstraintPicker(false);
                    }}
                    onClose={() => setShowConstraintPicker(false)}
                  />
                )}
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
                                  done ? 'text-status-success' : 'text-ink-muted'
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

            {/* ======================================================= */}
            {/* CONTEXTUAL DRILL SURFACES (Only active mechanic renders) */}
            {/* ======================================================= */}

            {/* 1. 4/3/2 COMPRESSION SPRINT BAR */}
            {activeDrill === 'compression-432' && !focusMode && (
              <div
                data-testid="compression-sprint-panel"
                className="px-5 py-3.5 border-b border-border-subtle bg-subtle/45 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-ink-primary">
                      {currentSprintSpec.label}
                    </span>
                    <span className="text-ink-muted">·</span>
                    <span className="font-mono-tabular text-ink-secondary">
                      Target {currentSprintSpec.minWords}–
                      {currentSprintSpec.maxWords}w
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {sprintAutoPaused && !sprintRunning && (
                      <span
                        data-testid="sprint-paused-pill"
                        className="px-1.5 py-0.5 rounded-sm border border-border-default bg-surface text-[10px] font-mono-tabular text-ink-secondary"
                      >
                        Paused
                      </span>
                    )}
                    <span
                      data-testid="sprint-timer-clock"
                      className="font-mono-tabular text-sm font-semibold text-ink-primary"
                    >
                      {formatCountdownMMSS(sprintSecondsLeft)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSprintAutoPaused(false);
                        setSprintRunning((r) => !r);
                      }}
                      aria-label={sprintRunning ? 'Pause timer' : 'Start timer'}
                      className="btn-secondary p-1.5"
                    >
                      {sprintRunning ? (
                        <Pause className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <Play className="w-3 h-3" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSprintRunning(false);
                        setSprintAutoPaused(false);
                        setSprintSecondsLeft(currentSprintSpec.durationSec);
                      }}
                      aria-label="Reset round timer"
                      className="btn-ghost p-1.5"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    </button>
                    {sprintRoundIdx < 2 && (
                      <button
                        type="button"
                        data-testid="sprint-next-round-button"
                        onClick={handleAdvanceCompressionRound}
                        className="btn-primary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium"
                      >
                        <span>Next Round</span>
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-ink-secondary">
                    {currentSprintSpec.guidance}
                  </span>
                  {sprintRoundIdx > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPrevRoundsDrawer((v) => !v)}
                      className="inline-link-tactile font-medium cursor-pointer whitespace-nowrap"
                    >
                      {showPrevRoundsDrawer
                        ? 'Hide Earlier Rounds'
                        : `Peek Round${sprintRoundIdx === 2 ? 's 1–2' : ' 1'}`}
                    </button>
                  )}
                </div>

                {showPrevRoundsDrawer && sprintRoundIdx > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-border-subtle">
                    {sprintRounds.slice(0, sprintRoundIdx).map((txt, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-sm bg-surface border border-border-subtle text-[11px] space-y-1"
                      >
                        <div className="font-mono-tabular font-semibold text-ink-muted">
                          Round {idx + 1} · {analyzeDraftLocally(txt).wordCount}w
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

            {/* 2. SKELETON RECONSTRUCTION STUDY / CLUE RAIL */}
            {activeDrill === 'skeleton' && !focusMode && (
              <div
                key={`skeleton-${skeletonPhase}`}
                data-testid="skeleton-drill-panel"
                className="drawer-reveal px-4 sm:px-5 py-3.5 sm:py-4 border-b border-border-subtle bg-subtle/45 space-y-3"
              >
                {skeletonPhase === 'study' ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-ink-primary">
                        Study Phase · Read for connectors &amp; cadence, jot 4 skeleton clues
                      </div>
                      <button
                        type="button"
                        disabled={skeletonLoading}
                        onClick={() => void handleNextSkeletonPassage()}
                        className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium"
                      >
                        <Shuffle className="w-3 h-3" aria-hidden="true" />
                        <span>
                          {skeletonLoading ? 'Loading...' : 'Next Passage'}
                        </span>
                      </button>
                    </div>

                    <blockquote
                      data-testid="skeleton-master-passage"
                      className="p-3.5 rounded-md border border-border-default bg-surface text-xs sm:text-[13px] text-ink-primary leading-relaxed"
                    >
                      {skeletonPassage.text}
                    </blockquote>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={skeletonCluesInput}
                        onChange={(e) => setSkeletonCluesInput(e.target.value)}
                        aria-label="4 skeleton clue phrases separated by commas"
                        placeholder="4 short clues separated by commas (e.g. sensor drift, moving average, real fault, noise filter)"
                        className="input-tactile flex-1 min-w-[220px] px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        data-testid="skeleton-hide-reconstruct-button"
                        onClick={() => {
                          playTactileClick(tactileSoundEnabled);
                          setSkeletonPhase('reconstruct');
                          window.setTimeout(
                            () =>
                              document.getElementById('writing-editor')?.focus(),
                            40
                          );
                        }}
                        className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                      >
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Hide &amp; Reconstruct</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-ink-muted">
                        Pinned Skeleton Rail · Rebuild in your own natural words
                      </div>
                      <div
                        data-testid="skeleton-clue-rail"
                        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono-tabular font-semibold text-ink-primary"
                      >
                        {parsedSkeletonClues.map((clue, idx) => (
                          <span key={idx}>
                            {idx + 1}. {clue}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSkeletonPhase('study')}
                      className="btn-ghost text-[11px] font-medium"
                    >
                      Peek Master
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. TIME CAPSULE SEALED BANNER */}
            {activeDrill === 'time-capsule' && timeCapsuleOrigin && !focusMode && (
              <div
                data-testid="time-capsule-seal-banner"
                className="px-5 py-3 border-b border-border-subtle bg-subtle/50 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
                  <span className="text-ink-secondary">
                    <strong className="text-ink-primary">Blind Retest</strong> ·
                    Your {timeCapsuleOrigin.date} draft is sealed until you submit.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDrill('standard');
                    setTimeCapsuleOrigin(null);
                  }}
                  className="btn-ghost text-[11px]"
                >
                  Exit Retest
                </button>
              </div>
            )}

            {/* 4. REVISE & LIFT (PASS 2) PINNED FOCUS BANNER */}
            {revisionContext && !focusMode && (
              <div
                data-testid="revision-focus-banner"
                className="px-5 py-3 border-b border-border-subtle bg-accent-soft/35 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink-primary font-mono-tabular">
                    Pass 2 · Revise &amp; Lift (Target: beat {revisionContext.pass1Score}/60)
                  </span>
                  <button
                    type="button"
                    onClick={() => setRevisionContext(null)}
                    aria-label="Cancel revision pass"
                    className="btn-ghost p-0.5"
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

            {/* Manuscript Body */}
            <div className="p-3.5 sm:p-8 space-y-4 sm:space-y-5">
              {/* Quiet Random Topic Starter Hint */}
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid="new-spark-button"
                      onClick={handleSuggestRandomTopic}
                      disabled={suggestingTopic || askingAiTopic}
                      className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
                    >
                      <Shuffle className="w-3 h-3" aria-hidden="true" />
                      <span>{suggestingTopic ? 'Drawing...' : 'New spark'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="ask-ai-topic-button"
                      onClick={() => void handleAskAiForFreshTopic()}
                      disabled={askingAiTopic || suggestingTopic}
                      className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
                    >
                      <Sparkles
                        className={`w-3 h-3 ${askingAiTopic ? 'animate-pulse text-ink-primary' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{askingAiTopic ? 'Asking AI...' : 'Ask AI'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="dismiss-random-topic-button"
                      onClick={handleDismissRandomTopic}
                      aria-label="Dismiss topic hint"
                      className="btn-ghost p-1"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Draft Title */}
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
                    autoTitledSessionRef.current = false;
                    setAutoTitledBanner(null);
                    setDraftSavedLabel(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('writing-editor')?.focus();
                    }
                  }}
                  placeholder="Give your draft a title (or leave blank to auto-title)..."
                  className="w-full font-display text-lg sm:text-2xl leading-snug font-medium bg-transparent text-ink-primary placeholder:text-ink-muted focus:outline-none resize-none overflow-hidden"
                />
              </div>

              {/* 3-Minute No-Backspace Flow Sprint Active Bar */}
              {flowLockActive && (
                <div
                  data-testid="flow-lock-banner"
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md border border-border-default bg-subtle/60 text-[11px]"
                >
                  <span className="inline-flex items-center gap-1.5 font-mono-tabular text-ink-primary font-medium">
                    <Flame className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                    <span>
                      {flowHintVisible
                        ? `Keep moving — editing unlocks in ${formatCountdownMMSS(flowSecondsLeft)}`
                        : `Flow Sprint active · ${formatCountdownMMSS(flowSecondsLeft)} remaining`}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid="flow-unlock-early-button"
                    onClick={() => {
                      setFlowLockActive(false);
                      setFlowHintVisible(false);
                    }}
                    className="inline-link-tactile font-medium cursor-pointer"
                  >
                    End Early &amp; Unlock Editing
                  </button>
                </div>
              )}

              {/* EDITOR SURFACE: Dual Canvas for 3 Rooms OR Clean 66ch Single Canvas */}
              {activeDrill === 'three-rooms' ? (
                <div data-testid="three-rooms-editor" className="space-y-3">
                  {/* Mobile Room Switcher */}
                  <div className="flex md:hidden items-center justify-between">
                    <div className="segmented-track inline-flex gap-0.5">
                      <button
                        type="button"
                        data-active={mobileRoomTab === 'roomA' ? 'true' : 'false'}
                        onClick={() => setMobileRoomTab('roomA')}
                        className="segmented-item px-3 py-1 text-xs font-medium"
                      >
                        Room A · 10-Yr-Old
                      </button>
                      <button
                        type="button"
                        data-active={mobileRoomTab === 'roomB' ? 'true' : 'false'}
                        onClick={() => setMobileRoomTab('roomB')}
                        className="segmented-item px-3 py-1 text-xs font-medium"
                      >
                        Room B · Interviewer
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Room A */}
                    <div
                      className={`p-4 rounded-md border border-border-subtle bg-subtle/30 space-y-2 ${
                        mobileRoomTab === 'roomB' ? 'hidden md:block' : 'block'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-ink-primary">
                          Room A · Curious 10-Year-Old
                        </span>
                        <span className="font-mono-tabular text-[11px] text-ink-muted">
                          {roomAWordCount}w (50–90w)
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-muted">
                        Plain everyday analogy — zero acronyms or jargon.
                      </p>
                      <textarea
                        id="room-a-editor"
                        data-testid="room-a-editor"
                        rows={7}
                        value={roomAText}
                        onChange={(e) => {
                          setRoomAText(e.target.value);
                          setSavedSuccess(false);
                        }}
                        placeholder="Explain it with a kitchen or playground analogy. Zero jargon..."
                        className="w-full bg-transparent text-[16px] sm:text-sm leading-[1.8] text-ink-primary placeholder:text-ink-muted focus:outline-none resize-y"
                      />
                      <div
                        data-testid="room-a-jargon-status"
                        className="pt-2 border-t border-border-subtle text-[11px] font-mono-tabular"
                      >
                        {!roomAJargonCheck || roomAJargonCheck.jargonHits.length === 0 ? (
                          <span className="text-status-success">
                            Jargon check clean
                          </span>
                        ) : (
                          <span className="text-status-warning">
                            Jargon in Room A: {roomAJargonCheck.jargonHits.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Room B */}
                    <div
                      className={`p-4 rounded-md border border-border-subtle bg-subtle/30 space-y-2 ${
                        mobileRoomTab === 'roomA' ? 'hidden md:block' : 'block'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-ink-primary">
                          Room B · Skeptical Senior Interviewer
                        </span>
                        <span className="font-mono-tabular text-[11px] text-ink-muted">
                          {roomBWordCount}w (70–120w)
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-muted">
                        Crisp executive defense — name failure modes and trade-offs.
                      </p>
                      <textarea
                        id="room-b-editor"
                        data-testid="room-b-editor"
                        rows={7}
                        value={roomBText}
                        onChange={(e) => {
                          setRoomBText(e.target.value);
                          setSavedSuccess(false);
                        }}
                        placeholder="State the failure mode, trade-off, and concrete fix sharply..."
                        className="w-full bg-transparent text-[16px] sm:text-sm leading-[1.8] text-ink-primary placeholder:text-ink-muted focus:outline-none resize-y"
                      />
                      <div className="pt-2 border-t border-border-subtle text-[11px] font-mono-tabular text-ink-muted">
                        Target: sharp engineering register
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={flowShakeTick}
                  className={flowShakeTick > 0 && flowHintVisible ? 'flow-shake' : ''}
                >
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
                      if (!revisionContext) {
                        activeLoggedSessionIdRef.current = null;
                      }
                      scheduleVanishingDesk();
                    }}
                    onBeforeInput={(e) => {
                      const nativeEvt = e.nativeEvent as InputEvent;
                      if (
                        shouldBlockFlowBeforeInput(flowLockActive, {
                          inputType: nativeEvt?.inputType,
                        }).blocked
                      ) {
                        e.preventDefault();
                        triggerFlowBlockFeedback();
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                        e.preventDefault();
                        handleSaveDraftClick();
                        return;
                      }
                      if (
                        shouldBlockFlowKeydown(flowLockActive, {
                          key: e.key,
                          metaKey: e.metaKey,
                          ctrlKey: e.ctrlKey,
                        }).blocked
                      ) {
                        e.preventDefault();
                        triggerFlowBlockFeedback();
                      }
                    }}
                    rows={focusMode ? 17 : 9}
                    placeholder={
                      activeDrill === 'skeleton'
                        ? 'Reconstruct the passage from your 4 skeleton clues in your own natural words...'
                        : activeDrill === 'compression-432'
                          ? `${currentSprintSpec.label}: ${currentSprintSpec.guidance}`
                          : mode === 'linkedin'
                            ? 'Open with a sharp observation or a lesson worth sharing...'
                            : mode === 'email'
                              ? 'Lead clearly with your purpose in the opening line...'
                              : mode === 'friend'
                                ? 'Write naturally, as if catching up with a close friend...'
                                : mode === 'technical'
                                  ? 'Explain the core idea clearly, step by step, without jargon...'
                                  : mode === 'creative'
                                    ? 'Begin with a concrete image, sound, or turning point...'
                                    : 'Begin writing freely. Your words stay private on this device...'
                    }
                    className="w-full max-w-[66ch] bg-transparent text-[16px] sm:text-base leading-[1.82] sm:leading-[1.85] text-ink-primary placeholder:text-ink-muted resize-y focus:outline-none"
                  />
                </div>
              )}

              {/* Live Constraint Adherence Rail (QuillBot-style inline inspector + click-to-locate) */}
              {activeConstraint && constraintResult && (
                <LiveConstraintRail
                  constraint={activeConstraint}
                  result={constraintResult}
                  wordCount={diagnostics.wordCount}
                  canLocateInEditor={activeDrill !== 'three-rooms'}
                  onLocateSpan={handleLocateConstraintSpan}
                  onOpenPicker={() => setShowConstraintPicker(true)}
                  onShuffle={() => {
                    playTactileClick(tactileSoundEnabled);
                    setActiveConstraint(
                      pickRandomConstraint(activeConstraint.id, mode)
                    );
                  }}
                  onClear={() => setActiveConstraint(null)}
                />
              )}

              {/* Live Zero-Quota Prose Diagnostics Bar (Signal/Noise + Sentence Rhythm Strip) */}
              {diagnostics.wordCount >= 8 && (
                <div
                  data-testid="live-prose-diagnostics"
                  className="pt-2.5 border-t border-border-subtle/70 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono-tabular text-ink-muted"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      Signal/Noise{' '}
                      <strong className="text-ink-primary">
                        {liveProseDiagnostics.signalNoiseRatio}%
                      </strong>
                    </span>

                    {/* Minimal Sentence Rhythm Strip */}
                    {liveProseDiagnostics.sentenceLengths.length > 0 && (
                      <div
                        className="inline-flex items-end gap-[2px] h-3.5"
                        title={`Sentence word lengths: ${liveProseDiagnostics.sentenceLengths.join(', ')}`}
                        aria-label={`Sentence rhythm across ${liveProseDiagnostics.sentenceLengths.length} sentences`}
                      >
                        {liveProseDiagnostics.sentenceLengths
                          .slice(0, 18)
                          .map((len, idx) => {
                            const heightPx = Math.max(
                              3,
                              Math.min(14, Math.round((len / 28) * 14))
                            );
                            const isLong = len >= 26;
                            return (
                              <span
                                key={idx}
                                className={`w-[3px] rounded-xs ${
                                  isLong ? 'bg-status-warning' : 'bg-ink-secondary/60'
                                }`}
                                style={{ height: `${heightPx}px` }}
                              />
                            );
                          })}
                      </div>
                    )}

                    {liveProseDiagnostics.calqueFixes.length > 0 && (
                      <span className="text-status-warning">
                        {liveProseDiagnostics.calqueFixes.length} phrasing{' '}
                        {liveProseDiagnostics.calqueFixes.length === 1
                          ? 'nudge'
                          : 'nudges'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Tactile Pen-and-Paper Daily Word Goal Ink-Drop Well */}
              <InkDropGoalWell progress={dailyInkProgress} />

              {/* Instant Live Offline Proofreader Strip */}
              {liveOfflineCheckEnabled &&
                offlineIssues.length > 0 &&
                showOfflinePanel && (
                  <div
                    data-testid="live-offline-proofreader"
                    className="rounded-md border border-border-subtle bg-subtle/45 px-3.5 py-2.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5 text-ink-secondary">
                        <span className="font-medium text-ink-primary">
                          Offline Proofreader
                        </span>
                        <span className="text-ink-muted">·</span>
                        <span className="font-mono-tabular text-ink-muted">
                          {offlineCategorySummary}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeDrill !== 'three-rooms' && (
                          <button
                            type="button"
                            onClick={handleApplyAllOfflineFixes}
                            className="inline-link-tactile text-ink-primary font-medium"
                          >
                            Fix all ({offlineIssues.length})
                          </button>
                        )}
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
                          issue.replacement === ' '
                            ? 'single space'
                            : issue.replacement;
                        return (
                          <button
                            key={issue.id}
                            type="button"
                            onClick={() => handleApplySingleOfflineFix(issue)}
                            title={`${issue.rule}. Click to apply`}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-border-subtle bg-surface hover:border-border-strong text-[11px] transition-colors cursor-pointer"
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
                            <span className={`text-[10px] capitalize ${categoryColor}`}>
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
                          {offlineIssues.length}{' '}
                          {offlineIssues.length === 1 ? 'fix' : 'fixes'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onToggleLiveOfflineCheck}
                        title="Instant offline spelling and grammar check is active. Click to pause"
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
                      title="Enable instant offline spelling and grammar check"
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

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
                  {onSaveDraft && (
                    <button
                      type="button"
                      data-testid="save-draft-button"
                      onClick={handleSaveDraftClick}
                      className="btn-secondary inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-2 text-xs font-medium whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Save Draft</span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="evaluate-score-button"
                    onClick={() => handleEvaluateDraft(false)}
                    disabled={evaluating}
                    className={`btn-primary inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-medium whitespace-nowrap ${
                      !onSaveDraft ? 'col-span-2' : ''
                    }`}
                  >
                    <Sparkles
                      className={`w-3.5 h-3.5 ${evaluating ? 'animate-pulse' : ''}`}
                      aria-hidden="true"
                    />
                    <span>
                      {evaluating
                        ? 'Evaluating...'
                        : revisionContext
                          ? 'Score Revision'
                          : 'Evaluate & Score'}
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

        {/* Right Column Coaching Drawer (Single-Pass Evaluation, Auto-Logged) */}
        {hasRightCoachingDrawer && (
          <aside ref={evalAsideRef} className="lg:col-span-5 space-y-5">
            {evaluating ? (
              <EvaluationLoadingCard
                wordCount={diagnostics.wordCount}
                modeLabel={MODE_LABELS[mode]}
                estimatedTierLabel={evaluatingTierLabel}
              />
            ) : evaluation && evalIntl ? (
              <div
                data-testid="evaluation-result-card"
                className="card-surface editorial-enter p-4 sm:p-5 space-y-4"
              >
                {liveAppliedNotice && (
                  <div className="p-2.5 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success">
                    {liveAppliedNotice}
                  </div>
                )}

                {autoTitledBanner && (
                  <div
                    data-testid="auto-title-banner"
                    className="px-3 py-2 rounded-md border border-border-subtle bg-subtle/60 text-[11px] text-ink-secondary flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      <span className="font-medium text-ink-primary">
                        Auto-titled:{' '}
                      </span>
                      {autoTitledBanner}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAutoTitledBanner(null)}
                      aria-label="Dismiss auto-title note"
                      className="btn-ghost p-0.5 shrink-0"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {evaluation.evaluationStatus === 'queued_for_reset' && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="p-4 rounded-md border border-status-warning-border bg-status-warning-soft space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-status-warning">
                        <Clock className="w-4 h-4" aria-hidden="true" />
                        <span>
                          Writing Logged · Deep AI Resumes When Limit Resets
                        </span>
                      </div>
                      <span className="text-[11px] font-mono-tabular font-semibold text-status-warning">
                        {resetCountdown > 0
                          ? `Reset in ${resetCountdown}s`
                          : 'Re-checking...'}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-border-subtle overflow-hidden">
                      <div
                        className="h-full bg-status-warning transition-all duration-500"
                        style={{ width: `${queueProgressPct}%` }}
                      />
                    </div>

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
                    <span className="font-semibold">
                      Auto-Mastered in Library:{' '}
                    </span>
                    {promotedVocabBanner.join(', ')}
                  </div>
                )}

                <EvaluationReportView
                  report={{
                    topic:
                      topic ||
                      evaluation.suggestedTitle ||
                      lastEvaluatedSnapshot?.topic ||
                      'Writing Session',
                    modeLabel: MODE_LABELS[mode],
                    scores: evaluation.scores,
                    metricNotes: evaluation.metricNotes,
                    cefrLevel: evaluation.cefrLevel,
                    internationalMetrics: evalIntl,
                    toneVerdict: evaluation.toneVerdict,
                    flowVerdict: evaluation.flowVerdict,
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
                    spokenReadinessScore: evaluation.spokenReadinessScore,
                    signalNoiseRatio: evaluation.signalNoiseRatio,
                    audienceReaction: evaluation.audienceReaction,
                    audience,
                    calqueFixes: evaluation.calqueFixes,
                    drillType: activeDrill,
                    drillMeta: lastSubmittedDrillMeta,
                    drillVerdict: evaluation.drillVerdict,
                    revisionDelta: lastRevisionDelta,
                  }}
                  draftContent={
                    effectiveDraftText || lastEvaluatedSnapshot?.content || ''
                  }
                  savedSuccess={savedSuccess}
                  existingVocabSet={existingVocabSet}
                  savedVocabKeys={savedVocabKeys}
                  onApplyTextReplacement={applyTextReplacement}
                  onApplyAllGrammarFixes={handleApplyAllEvaluationFixes}
                  onSaveVocabItem={(v) => handleSaveVocabItem(v)}
                  onStartRevision={handleStartRevisionPass}
                />
              </div>
            ) : null}
          </aside>
        )}
      </div>

      <PostEvalClearPopup
        state={clearPopupState}
        onClearNow={() => {
          executeClearEditorForFreshPage();
          setClearPopupState((prev) => transitionToClearedUndo(prev));
        }}
        onKeep={() =>
          setClearPopupState((prev) => dismissPostEvalClear(prev))
        }
        onRestore={handleRestoreClearedEditor}
        onToggleAutoClear={() =>
          setClearPopupState((prev) => {
            const next = togglePostEvalAutoClear(prev);
            writeAutoClearPreference(next.autoClearEnabled);
            return next;
          })
        }
        onPauseChange={(paused) =>
          setClearPopupState((prev) => setPostEvalClearPaused(prev, paused))
        }
        onDismissUndo={() => {
          lastClearedDraftRef.current = null;
          setClearPopupState((prev) => dismissPostEvalClear(prev));
        }}
      />

      {quickVocabToast && (
        <div
          role="status"
          data-testid="quick-add-vocab-toast"
          className="fixed mobile-floating-clearance right-3 sm:right-5 z-40 inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-status-success-border bg-surface text-xs text-ink-primary shadow-md"
        >
          <CheckCircle2
            className="w-3.5 h-3.5 text-status-success shrink-0"
            aria-hidden="true"
          />
          <span>{quickVocabToast}</span>
        </div>
      )}

      <QuickAddVocabModal
        open={showQuickAddVocab}
        mode={mode}
        todayISO={todayISO}
        existingVocabulary={vocabulary}
        onAdd={(entry) => {
          onAddVocabEntry(entry);
          setQuickVocabToast(`Added "${entry.betterAlternative}" to vocabulary`);
          if (quickVocabToastTimerRef.current !== null) {
            window.clearTimeout(quickVocabToastTimerRef.current);
          }
          quickVocabToastTimerRef.current = window.setTimeout(() => {
            setQuickVocabToast(null);
            quickVocabToastTimerRef.current = null;
          }, 3200);
        }}
        onClose={() => setShowQuickAddVocab(false)}
      />
    </div>
  );
}
