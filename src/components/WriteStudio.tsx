import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Feather,
  FileText,
  Layers,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Shuffle,
  Sparkles,
  Sun,
  Trash2,
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
  SessionTargetCheck,
  StudentProfile,
  ToneCheck,
  ToneSetting,
  UnifiedEdit,
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
  type PracticeWeaknessPayload,
} from '../utils/analytics';
import {
  drawNextCurriculumRandomTopic,
  loadRefinedTopicsCache,
  saveRefinedTopicsCache,
  shouldRefreshPeriodicTopics,
  type CuratedRandomTopic,
} from '../utils/topicDeck';
import { buildAdaptivePromptContext } from '../utils/adaptivePromptProfile';
import { apiFetch, safeParseJsonResponse } from '../utils/apiBase';
import { QuickAddVocabModal } from './QuickAddVocabModal';
import { SessionBriefCard } from './SessionBriefCard';
import {
  buildSessionBrief,
  detectUsedTargetVocab,
  pickDefaultBriefSlot,
} from '../utils/sessionBrief';
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
  canAdvanceCompressionRound,
  computeCompressionMetrics,
  countSprintWords,
  formatCountdownMMSS,
} from '../utils/compressionSprint';
import {
  isCurrentDraftEvaluatedClean,
  resolveStudioFooterAction,
} from '../utils/writeStudioLifecycle';
import {
  compareSkeletonReconstruction,
  extractSentenceSkeletonClues,
  findBestTopicSkeletonPassage,
  getInitialSkeletonClues,
  isCustomUserTopic,
  type SkeletonPassage,
  type SkeletonPhase,
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
import { LiveConstraintRail } from './ConstraintStudioPanel';
import { DeskControlRibbon } from './write-addons/DeskControlRibbon';
import { PracticeAddonStage } from './write-addons/PracticeAddonStage';
import { TextAnalysisDrawer } from './write-addons/TextAnalysisDrawer';
import { ThreeRoomsDesk } from './write-addons/ThreeRoomsDesk';
import { WritingFlowMeter } from './write-addons/WritingFlowMeter';
import { SentenceFocusOverlay } from './write-addons/SentenceFocusOverlay';
import { findPhraseRangeInDraft } from '../utils/sentenceFocus';
import {
  analyzeWritingSample,
  type ProfessionalVocabAlternative,
} from '../utils/textAnalysis';
import {
  TYPING_ROLLING_WINDOW_MS,
  computeTypingFlowMetrics,
  createInitialTypingFlowState,
  recordTypingProgress,
  type TypingFlowTrackerState,
} from '../utils/typingFlow';
import {
  SLOW_EVAL_THRESHOLD_MS,
  addSkeletonClue,
  computeTimerRemainingRatio,
  removeSkeletonClueAt,
  shouldCollapseWriteHeader,
  updateSkeletonClueAt,
} from '../utils/writeStudioAddons';
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
  getTimeCapsuleStatus,
} from '../utils/timeCapsule';
import { playTactileClick } from '../utils/tactileSound';

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
  // v3.1 & v4.0 fields
  spokenReadinessScore?: number;
  signalNoiseRatio?: number;
  audienceReaction?: string;
  calqueFixes?: CalqueFix[];
  drillVerdict?: DrillVerdict;
  edits?: UnifiedEdit[];
  toneCheck?: ToneCheck;
  nextDraftPriority?: string;
  targetCheck?: SessionTargetCheck;
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
  onChangeDailyWordGoal?: (nextGoal: number) => void;
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
  requestedPracticeWord?: string | null;
  onClearRequestedPracticeWord?: () => void;
  requestedDrillToken?: {
    drill: DrillType;
    nonce: number;
    originSession?: WritingSession | null;
  } | null;
  requestedWeaknessToken?: {
    payload: PracticeWeaknessPayload;
    nonce: number;
  } | null;
}

const COMPLETED_SKELETON_IDS_KEY = 'quillit_completed_skeleton_ids_v1';

function loadCompletedSkeletonIds(): string[] {
  try {
    const raw = localStorage.getItem(COMPLETED_SKELETON_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
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
  onChangeDailyWordGoal,
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
  requestedPracticeWord = null,
  onClearRequestedPracticeWord,
  requestedDrillToken = null,
  requestedWeaknessToken = null,
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
  const [sprintAutoArmed, setSprintAutoArmed] = useState(true);
  const sprintAutoArmedRef = useRef(true);
  const [sprintEmptyGuardMessage, setSprintEmptyGuardMessage] = useState<string | null>(null);
  const [sprintEmptyGuardTick, setSprintEmptyGuardTick] = useState(0);
  const [sprintCompleted, setSprintCompleted] = useState(false);
  const [showPrevRoundsDrawer, setShowPrevRoundsDrawer] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [slowEvalNotice, setSlowEvalNotice] = useState<string | null>(null);
  const evalAsideRef = useRef<HTMLElement | null>(null);
  const topicTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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
    sprintRoundIdx: 0 | 1 | 2;
    sprintRounds: [string, string, string];
    sprintCompleted: boolean;
  } | null>(null);

  // Skeleton Reconstruction State (editable anchor keywords + auto-rotating passages)
  const [completedSkeletonIds, setCompletedSkeletonIds] = useState<string[]>(() =>
    loadCompletedSkeletonIds()
  );
  const [skeletonDomainFilter, setSkeletonDomainFilter] = useState<
    SkeletonPassage['domain'] | 'all'
  >('all');
  const [skeletonPassage, setSkeletonPassage] = useState<SkeletonPassage>(() =>
    findBestTopicSkeletonPassage({
      topic: initialTopic,
      mode: initialMode,
      completedIds: loadCompletedSkeletonIds(),
    }).passage
  );
  const [skeletonPhase, setSkeletonPhase] = useState<SkeletonPhase>('study');
  const [skeletonClues, setSkeletonClues] = useState<string[]>(() =>
    getInitialSkeletonClues(
      findBestTopicSkeletonPassage({
        topic: initialTopic,
        mode: initialMode,
        completedIds: loadCompletedSkeletonIds(),
      }).passage
    )
  );
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

  // Real-Time WPM & Typing Flow Cadence Tracker
  const [typingFlowState, setTypingFlowState] = useState<TypingFlowTrackerState>(
    () => createInitialTypingFlowState()
  );
  const [typingFlowNowMs, setTypingFlowNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (typingFlowState.lastKeystrokeAt === null) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTypingFlowNowMs(now);
      if (
        typingFlowState.lastKeystrokeAt !== null &&
        now - typingFlowState.lastKeystrokeAt > TYPING_ROLLING_WINDOW_MS + 1200
      ) {
        window.clearInterval(interval);
      }
    }, 900);
    return () => window.clearInterval(interval);
  }, [typingFlowState.lastKeystrokeAt]);

  const typingFlowMetrics = useMemo(
    () => computeTypingFlowMetrics(typingFlowState, typingFlowNowMs),
    [typingFlowState, typingFlowNowMs]
  );

  const trackEditorTyping = useCallback((prevText: string, nextText: string) => {
    const now = Date.now();
    setTypingFlowNowMs(now);
    setTypingFlowState((prev) =>
      recordTypingProgress(prev, prevText, nextText, now)
    );
  }, []);

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

  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [freeWriteMode, setFreeWriteMode] = useState(false);
  const autoBriefBoundRef = useRef(false);
  const [pivoting, setPivoting] = useState(false);

  const [showOfflinePanel, setShowOfflinePanel] = useState(true);
  const [showTextAnalysis, setShowTextAnalysis] = useState(false);
  const [showAllDueTasks, setShowAllDueTasks] = useState(false);

  const [liveAppliedNotice, setLiveAppliedNotice] = useState<string | null>(null);
  const [showQuickAddVocab, setShowQuickAddVocab] = useState(false);
  const [quickVocabToast, setQuickVocabToast] = useState<string | null>(null);
  const quickVocabToastTimerRef = useRef<number | null>(null);

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

  // Sync latest topic ref and auto-size #draft-topic so long multi-line prompts are never clipped
  useEffect(() => {
    latestTopicRef.current = topic;
    const el = topicTextareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [topic, focusMode]);

  useEffect(() => {
    function handleResize() {
      const el = topicTextareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Sync external drill launch requests (e.g., from Daily Practice Suggestion popup)
  useEffect(() => {
    if (!requestedDrillToken) return;
    if (requestedDrillToken.drill === 'time-capsule') {
      if (requestedDrillToken.originSession) {
        setTimeCapsuleOrigin(requestedDrillToken.originSession);
        setActiveDrill('time-capsule');
        setMode(requestedDrillToken.originSession.mode);
        setTone(requestedDrillToken.originSession.tone);
        setTopic(requestedDrillToken.originSession.topicDescription);
        setContent('');
        setEvaluation(null);
        setSavedSuccess(false);
        setRevisionContext(null);
      } else {
        handleLaunchTimeCapsuleFromStudio();
      }
      return;
    }
    handleSelectDrill(requestedDrillToken.drill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDrillToken?.nonce]);

  const [activeWeaknessReminder, setActiveWeaknessReminder] = useState<{
    pillarLabel: string;
    feedbackReminder: string;
  } | null>(null);

  // Sync external "Practice This Weakness" launch from Diagnostic Dashboard
  useEffect(() => {
    if (!requestedWeaknessToken) return;
    const p = requestedWeaknessToken.payload;
    setActiveDrill('standard');
    setMode(p.mode);
    setTone(p.tone);
    setAudience(p.audience);
    setTopic(p.topic);
    setContent('');
    setEvaluation(null);
    setSavedSuccess(false);
    setRevisionContext(null);
    setSuggestedTopicMeta(null);
    setActiveWeaknessReminder({
      pillarLabel: p.pillarLabel,
      feedbackReminder: p.feedbackReminder,
    });
    window.setTimeout(() => document.getElementById('writing-editor')?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedWeaknessToken?.nonce]);

  const [sentenceFocusMode, setSentenceFocusMode] = useState(false);
  const [editorCaretIndex, setEditorCaretIndex] = useState(0);
  const [editorScrollTop, setEditorScrollTop] = useState(0);

  function handleLocateEvaluationPhrase(phrase: string) {
    if (activeDrill === 'three-rooms') return;
    const range = findPhraseRangeInDraft(content, phrase);
    if (!range) return;
    const el = document.getElementById('writing-editor') as HTMLTextAreaElement | null;
    if (!el) return;
    el.focus();
    el.setSelectionRange(range.start, range.end);
    setEditorCaretIndex(range.start);
  }

  function applySkeletonPassage(
    picked: SkeletonPassage,
    options?: { preserveUserTopic?: boolean; explicitClues?: string[] }
  ) {
    const resolvedClues =
      options?.explicitClues && options.explicitClues.length > 0
        ? options.explicitClues.slice(0, 4)
        : getInitialSkeletonClues(picked);
    setSkeletonPassage({
      ...picked,
      sentenceClues: resolvedClues,
    });
    setSkeletonClues(resolvedClues);
    const keepUserTopic = options?.preserveUserTopic ?? isCustomUserTopic(topic);
    if (!keepUserTopic) {
      setTopic(`Skeleton: ${picked.title}`);
    }
    setSkeletonPhase('study');
  }

  function handleSelectDrill(nextDrill: DrillType) {
    playTactileClick(tactileSoundEnabled);
    setActiveDrill(nextDrill);
    setErrorMessage(null);
    setSlowEvalNotice(null);
    setEvaluation(null);
    setLastEvaluatedSnapshot(null);
    setSavedSuccess(false);
    setRevisionContext(null);
    setSprintCompleted(false);

    if (nextDrill === 'compression-432') {
      setSprintRoundIdx(0);
      setSprintRounds(['', '', '']);
      setSprintSecondsLeft(COMPRESSION_ROUNDS[0].durationSec);
      setSprintRunning(false);
      setSprintAutoPaused(false);
      setSprintEmptyGuardMessage(null);
      sprintAutoArmedRef.current = true;
      setSprintAutoArmed(true);
      setShowPrevRoundsDrawer(false);
    } else if (nextDrill === 'skeleton') {
      const hasTopic = isCustomUserTopic(topic);
      const { passage: picked } = findBestTopicSkeletonPassage({
        topic: hasTopic ? topic : '',
        mode,
        completedIds: [...completedSkeletonIds, ...seenSkeletonIds],
        currentId: skeletonPassage.id,
        domainFilter: skeletonDomainFilter,
      });
      setSeenSkeletonIds((prev) => Array.from(new Set([...prev, picked.id])));
      applySkeletonPassage(picked, { preserveUserTopic: hasTopic });
    } else if (nextDrill === 'three-rooms') {
      if (!topic.trim()) {
        setTopic('Explain one tricky idea simply, then defend it to an expert');
      }
    }
  }

  function handleChangeSkeletonDomainFilter(
    nextDomain: SkeletonPassage['domain'] | 'all'
  ) {
    playTactileClick(tactileSoundEnabled);
    setSkeletonDomainFilter(nextDomain);
    const hasTopic = isCustomUserTopic(topic);
    const { passage: picked } = findBestTopicSkeletonPassage({
      topic: hasTopic ? topic : '',
      mode,
      completedIds: completedSkeletonIds,
      currentId: skeletonPassage.id,
      domainFilter: nextDomain,
    });
    applySkeletonPassage(picked, { preserveUserTopic: hasTopic });
  }

  async function requestSkeletonPassage(options: { adaptToActiveTopic: boolean }) {
    playTactileClick(tactileSoundEnabled);
    setSkeletonLoading(true);
    const nextSeen = Array.from(new Set([...seenSkeletonIds, skeletonPassage.id]));
    setSeenSkeletonIds(nextSeen);
    const activeTopicStr = isCustomUserTopic(topic) ? topic.trim() : '';
    const shouldUseTopic = options.adaptToActiveTopic || Boolean(activeTopicStr);

    try {
      const res = await apiFetch('/api/skeleton-passage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          topic: shouldUseTopic ? activeTopicStr : undefined,
          domain: skeletonDomainFilter,
          focusTheme: activeTopicStr || undefined,
          excludeIds: options.adaptToActiveTopic
            ? completedSkeletonIds
            : [...completedSkeletonIds, ...nextSeen],
          studentProfile,
        }),
      });
      const data = await safeParseJsonResponse<{
        passage?: Partial<SkeletonPassage> & { passage?: string };
        sentenceClues?: string[];
        suggestedClues?: string[];
        adaptedToTopic?: string;
      }>(res);
      const rawPassage = data?.passage;
      const resolvedText = rawPassage?.text || rawPassage?.passage;
      if (res.ok && rawPassage && resolvedText) {
        const aiClues = Array.isArray(data?.sentenceClues)
          ? data.sentenceClues
          : Array.isArray(rawPassage.sentenceClues)
            ? rawPassage.sentenceClues
            : Array.isArray(data?.suggestedClues)
              ? data.suggestedClues
              : [];
        const normalized: SkeletonPassage = {
          id: rawPassage.id || `skel-ai-${Date.now()}`,
          title: rawPassage.title || 'High-Craft Passage',
          domain: rawPassage.domain || 'technical',
          mode: rawPassage.mode || mode,
          text: resolvedText,
          wordCount:
            rawPassage.wordCount ||
            resolvedText.trim().split(/\s+/).filter(Boolean).length,
          sentenceClues:
            aiClues.length > 0
              ? aiClues
              : extractSentenceSkeletonClues(resolvedText, 4),
          signatureMoves: Array.isArray(rawPassage.signatureMoves)
            ? rawPassage.signatureMoves
            : [],
          adaptedToTopic:
            data?.adaptedToTopic ||
            rawPassage.adaptedToTopic ||
            (shouldUseTopic && activeTopicStr ? activeTopicStr : undefined),
        };
        applySkeletonPassage(normalized, {
          preserveUserTopic: Boolean(activeTopicStr),
          explicitClues: normalized.sentenceClues,
        });
        return;
      }
    } catch {
      // Offline bank fallback below
    } finally {
      setSkeletonLoading(false);
    }

    const { passage: localPick } = findBestTopicSkeletonPassage({
      topic: shouldUseTopic ? activeTopicStr : '',
      mode,
      completedIds: options.adaptToActiveTopic
        ? completedSkeletonIds
        : [...completedSkeletonIds, ...nextSeen],
      currentId: options.adaptToActiveTopic ? null : skeletonPassage.id,
      domainFilter: skeletonDomainFilter,
    });
    applySkeletonPassage(localPick, {
      preserveUserTopic: Boolean(activeTopicStr),
    });
  }

  function handleNextSkeletonPassage() {
    void requestSkeletonPassage({ adaptToActiveTopic: false });
  }

  function handleAdaptSkeletonToTopic() {
    void requestSkeletonPassage({ adaptToActiveTopic: true });
  }

  function handleAdvanceCompressionRound() {
    playTactileClick(tactileSoundEnabled);
    const guard = canAdvanceCompressionRound(
      content,
      (sprintRoundIdx + 1) as 1 | 2 | 3
    );
    if (!guard.allowed) {
      setSprintEmptyGuardMessage(
        guard.reason || 'Write at least a few words before moving to the next stage.'
      );
      setSprintEmptyGuardTick((t) => t + 1);
      window.setTimeout(
        () => document.getElementById('writing-editor')?.focus(),
        40
      );
      return;
    }
    setSprintEmptyGuardMessage(null);

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
      setSprintAutoPaused(false);
      sprintAutoArmedRef.current = true;
      setSprintAutoArmed(true);
      window.setTimeout(
        () => document.getElementById('writing-editor')?.focus(),
        40
      );
    }
  }

  function handleEvaluateSprintFinal() {
    playTactileClick(tactileSoundEnabled);
    setSprintRunning(false);
    sprintAutoArmedRef.current = false;
    setSprintAutoArmed(false);
    setSprintEmptyGuardMessage(null);
    const updated: [string, string, string] = [...sprintRounds] as [
      string,
      string,
      string,
    ];
    updated[2] = content.trim();
    setSprintRounds(updated);
    void handleEvaluateDraft(false);
  }

  function handleStartNewSprint() {
    playTactileClick(tactileSoundEnabled);
    setClearPopupState((prev) => dismissPostEvalClear(prev));
    setTopic('');
    setContent('');
    setDebouncedContent('');
    setEvaluation(null);
    setLastEvaluatedSnapshot(null);
    setSavedSuccess(false);
    setDraftSavedLabel(null);
    setAutoTitledBanner(null);
    setErrorMessage(null);
    setSlowEvalNotice(null);
    setRevisionContext(null);
    setActiveDraftId(null);
    setActiveSlotId(undefined);
    activeLoggedSessionIdRef.current = null;
    setSprintCompleted(false);
    setSprintRoundIdx(0);
    setSprintRounds(['', '', '']);
    setSprintSecondsLeft(COMPRESSION_ROUNDS[0].durationSec);
    setSprintRunning(false);
    setSprintAutoPaused(false);
    setSprintEmptyGuardMessage(null);
    sprintAutoArmedRef.current = true;
    setSprintAutoArmed(true);
    setShowPrevRoundsDrawer(false);
    window.setTimeout(() => document.getElementById('writing-editor')?.focus(), 40);
  }

  function handleStartNewEntry() {
    playTactileClick(tactileSoundEnabled);
    setClearPopupState((prev) => dismissPostEvalClear(prev));
    setTopic('');
    setContent('');
    setDebouncedContent('');
    setRoomAText('');
    setRoomBText('');
    setEvaluation(null);
    setLastEvaluatedSnapshot(null);
    setSavedSuccess(false);
    setDraftSavedLabel(null);
    setAutoTitledBanner(null);
    setErrorMessage(null);
    setSlowEvalNotice(null);
    setRevisionContext(null);
    setActiveDraftId(null);
    setActiveSlotId(undefined);
    activeLoggedSessionIdRef.current = null;
    setSprintCompleted(false);
    window.setTimeout(() => document.getElementById('writing-editor')?.focus(), 40);
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

  // Live EIE Text Analysis & Vocabulary Library Comparison
  const liveTextAnalysis = useMemo(
    () =>
      analyzeWritingSample({
        text: debouncedContent,
        vocabulary,
        mode,
        tone,
        topic,
      }),
    [debouncedContent, vocabulary, mode, tone, topic]
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

  // Time Capsule natural-language readiness & eligible past topics
  const timeCapsuleStatus = useMemo(
    () => getTimeCapsuleStatus(sessions, todayISO),
    [sessions, todayISO]
  );
  const timeCapsuleCandidate = timeCapsuleStatus.candidate;

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

  // Auto-load today's next incomplete CalendarSlot into the calm Session Brief on first open
  useEffect(() => {
    if (autoBriefBoundRef.current) return;
    if (
      activeSlotId ||
      linkedCalendarSlotId ||
      initialTopic.trim().length > 0 ||
      initialTimeCapsuleOrigin ||
      freeWriteMode ||
      content.trim().length > 0
    ) {
      autoBriefBoundRef.current = true;
      return;
    }
    const defaultSlot = pickDefaultBriefSlot(calendarSlots, todayISO);
    if (!defaultSlot) return;
    autoBriefBoundRef.current = true;
    setActiveSlotId(defaultSlot.id);
    setMode(defaultSlot.mode);
    setTone(defaultSlot.tone);
    setTopic(defaultSlot.topic);
    setDaySlot(`${defaultSlot.dayOfWeek} · ${defaultSlot.slotLabel}`);
  }, [
    activeSlotId,
    linkedCalendarSlotId,
    initialTopic,
    initialTimeCapsuleOrigin,
    freeWriteMode,
    content,
    calendarSlots,
    todayISO,
  ]);

  const sessionBrief = useMemo(
    () =>
      buildSessionBrief({
        activeSlot: activeLinkedSlot,
        calendarSlots,
        sessions,
        vocabulary,
        studentProfile,
        todayISO,
        currentMode: mode,
        currentTone: tone,
        currentTopic: topic,
      }),
    [
      activeLinkedSlot,
      calendarSlots,
      sessions,
      vocabulary,
      studentProfile,
      todayISO,
      mode,
      tone,
      topic,
    ]
  );

  const usedBriefVocab = useMemo(
    () => detectUsedTargetVocab(effectiveDraftText, sessionBrief.vocabTargets),
    [effectiveDraftText, sessionBrief.vocabTargets]
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
    playTactileClick(tactileSoundEnabled);
    setActiveDrill('time-capsule');
    setErrorMessage(null);
    setSlowEvalNotice(null);
    setEvaluation(null);
    setSavedSuccess(false);
    setRevisionContext(null);

    if (timeCapsuleStatus.state === 'ready' && timeCapsuleStatus.candidate) {
      const origin = timeCapsuleStatus.candidate.session;
      setTimeCapsuleOrigin(origin);
      setMode(origin.mode);
      setTone(origin.tone);
      setTopic(origin.topicDescription);
      setContent('');
    } else {
      setTimeCapsuleOrigin(null);
    }
  }

  function handleSwitchTimeCapsuleTopic() {
    const candidates = timeCapsuleStatus.allEligibleCandidates;
    if (candidates.length <= 1) return;
    playTactileClick(tactileSoundEnabled);
    const currentIdx = candidates.findIndex(
      (c) => c.session.id === timeCapsuleOrigin?.id
    );
    const next = candidates[(currentIdx + 1) % candidates.length] ?? candidates[0];
    setTimeCapsuleOrigin(next.session);
    setMode(next.session.mode);
    setTone(next.session.tone);
    setTopic(next.session.topicDescription);
    setContent('');
    setEvaluation(null);
    setSavedSuccess(false);
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
      sprintRoundIdx,
      sprintRounds,
      sprintCompleted,
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
    setSprintCompleted(false);
    setSprintRoundIdx(0);
    setSprintRounds(['', '', '']);
    setSprintSecondsLeft(COMPRESSION_ROUNDS[0].durationSec);
    sprintAutoArmedRef.current = true;
    setSprintAutoArmed(true);
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
    setSprintRoundIdx(snap.sprintRoundIdx);
    setSprintRounds(snap.sprintRounds);
    setSprintCompleted(snap.sprintCompleted);
    if (snap.sprintCompleted) {
      sprintAutoArmedRef.current = false;
      setSprintAutoArmed(false);
    }
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
    if (activeDrill === 'compression-432') {
      setSprintRoundIdx(2);
      setSprintCompleted(true);
      setSprintRunning(false);
      sprintAutoArmedRef.current = false;
      setSprintAutoArmed(false);
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
      const cache = loadRefinedTopicsCache();
      const draw = drawNextCurriculumRandomTopic({
        usedCurriculumIds,
        usedTopicTitles: usedTitles,
        lastShownId: lastDrawnCurriculumIdRef.current,
        refinedTopics: cache.topics,
      });
      lastDrawnCurriculumIdRef.current = draw.id;
      if (draw.curriculumId && onRecordUsedCurriculumId) {
        onRecordUsedCurriculumId(draw.curriculumId);
      }

      const nextCache = {
        ...cache,
        drawsSinceRefresh: cache.drawsSinceRefresh + 1,
      };
      saveRefinedTopicsCache(nextCache);

      // Periodically refine and add fresh topics quietly in the background
      if (shouldRefreshPeriodicTopics(nextCache, todayISO)) {
        void (async () => {
          try {
            const adaptiveWritingProfile = buildAdaptivePromptContext(
              studentProfile,
              sessions,
              vocabulary,
              todayISO
            );
            const res = await apiFetch('/api/topics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mode: MODE_LABELS[draw.mode],
                tone: TONE_LABELS[draw.tone],
                existingTopics: usedTitles.slice(0, 14),
                studentProfile,
                adaptiveWritingProfile,
              }),
            });
            const data = await safeParseJsonResponse<{
              topics?: { title?: string; guidance?: string; category?: string }[];
            }>(res);
            if (res.ok && Array.isArray(data?.topics) && data.topics.length > 0) {
              const incoming: CuratedRandomTopic[] = data.topics
                .filter((t) => typeof t?.title === 'string' && t.title.trim().length > 6)
                .slice(0, 4)
                .map((t, idx) => ({
                  id: `refined-${Date.now()}-${idx}`,
                  title: String(t.title).trim(),
                  hint:
                    typeof t.guidance === 'string' && t.guidance.trim()
                      ? t.guidance.trim()
                      : 'Open with one concrete observation and keep sentences crisp.',
                  category:
                    typeof t.category === 'string' && t.category.trim()
                      ? t.category.trim()
                      : 'Fresh Prompt',
                  mode: draw.mode,
                  tone: draw.tone,
                  targetWords: 200,
                }));
              if (incoming.length > 0) {
                const latest = loadRefinedTopicsCache();
                saveRefinedTopicsCache({
                  updatedAtISO: todayISO,
                  drawsSinceRefresh: 0,
                  topics: [...latest.topics, ...incoming].slice(-18),
                });
              }
            }
          } catch {
            // Silent background topic refinement — never interrupt the writer
          }
        })();
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
    }, 200);
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
      const res = await apiFetch('/api/topics', {
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
    setFreeWriteMode(false);
    setBriefCollapsed(false);
    setMode(slot.mode);
    setTone(slot.tone);
    setTopic(slot.topic);
    setDaySlot(`${slot.dayOfWeek} · ${slot.slotLabel}`);
    setActiveSlotId(slot.id);
    if (slot.recommendedDrill) {
      setActiveDrill(slot.recommendedDrill);
    }
    setErrorMessage(null);
  }

  function handleEnterFreeWrite() {
    if (preLoadSnapshot) {
      setMode(preLoadSnapshot.mode);
      setTone(preLoadSnapshot.tone);
      setTopic(preLoadSnapshot.topic);
      setDaySlot(preLoadSnapshot.daySlot);
      setActiveSlotId(preLoadSnapshot.activeSlotId);
      setContent(preLoadSnapshot.content);
    } else {
      setActiveSlotId(undefined);
      setTopic('');
      setDaySlot('Free Write');
    }
    setPreLoadSnapshot(null);
    setFreeWriteMode(true);
    setErrorMessage(null);
  }

  async function handleUniversalPivot(customFocusRaw: string) {
    const cleanedFocus = customFocusRaw.trim();
    if (cleanedFocus.length < 3) return;
    setPivoting(true);
    setErrorMessage(null);
    try {
      const slotPayload = activeLinkedSlot ?? {
        mode,
        tone,
        dayOfWeek: sessionBrief.slotContext.split('·')[0]?.trim() || 'Today',
      };
      const res = await apiFetch('/api/pivot-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: slotPayload,
          customFocus: cleanedFocus,
        }),
      });
      const data = await safeParseJsonResponse<Record<string, unknown>>(res);
      if (res.ok && data && !data.error) {
        const nextTopic = String(data.topic || cleanedFocus);
        if (activeLinkedSlot) {
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
        }
        setTopic(nextTopic);
      } else {
        // Offline / static host graceful pivot: update directly without blocking
        if (activeLinkedSlot) {
          onUpdateSlot({
            ...activeLinkedSlot,
            topic: cleanedFocus,
          });
        }
        setTopic(cleanedFocus);
      }
    } catch {
      if (activeLinkedSlot) {
        onUpdateSlot({
          ...activeLinkedSlot,
          topic: cleanedFocus,
        });
      }
      setTopic(cleanedFocus);
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

  function handleSaveAnalysisAlternativeToLibrary(
    alt: ProfessionalVocabAlternative
  ) {
    handleSaveVocabItem({
      used: alt.original,
      betterAlternative: alt.professionalAlternative,
      explanation: alt.educationalNote,
      contextSnippet: topic || 'EIE Text Analysis',
      contextTag: alt.registerTag,
    });
    setQuickVocabToast(
      `Saved "${alt.professionalAlternative}" to your Vocabulary Library.`
    );
    if (quickVocabToastTimerRef.current !== null) {
      window.clearTimeout(quickVocabToastTimerRef.current);
    }
    quickVocabToastTimerRef.current = window.setTimeout(() => {
      setQuickVocabToast(null);
    }, 3200);
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
      const clues = skeletonClues.filter((c) => c.trim().length > 0);
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
      edits: evalPayload.edits,
      toneCheck: evalPayload.toneCheck,
      nextDraftPriority: evalPayload.nextDraftPriority,
      targetCheck: evalPayload.targetCheck,
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

    const verifiedMasteredWords = Array.from(
      new Set([
        ...(evalPayload.masteredWordsUsed ?? []),
        ...(evalPayload.targetCheck?.vocabUsed ?? []),
      ])
    );

    const promoted = onSaveSession(
      sessionRecord,
      newVocab,
      activeSlotId,
      verifiedMasteredWords
    );
    if (promoted && promoted.length > 0) {
      setPromotedVocabBanner(promoted);
    }
    if (activeDraftId && onDeleteDraft && activeDraftId !== stableSessionId) {
      onDeleteDraft(activeDraftId);
      setActiveDraftId(null);
      setDraftSavedLabel(null);
    }

    // Mark completed Skeleton passage so the next Skeleton session rotates fresh
    if (activeDrill === 'skeleton' && skeletonPassage?.id) {
      setCompletedSkeletonIds((prev) => {
        const next = Array.from(new Set([...prev, skeletonPassage.id]));
        try {
          localStorage.setItem(COMPLETED_SKELETON_IDS_KEY, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });
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

    // Single-pass atomic evaluation with slow-API draft resilience (>9s saves to Draft + unlocks UI)
    setClearPopupState((prev) => dismissPostEvalClear(prev));
    setSlowEvalNotice(null);
    setEvaluating(true);

    let deferredToDraft = false;
    const slowTimerId = window.setTimeout(() => {
      deferredToDraft = true;
      const pendingDraft: WritingSession = {
        id: stableSessionId,
        date: todayISO,
        daySlot: daySlot || 'Studio Session',
        mode,
        promptCategory: MODE_LABELS[mode],
        tone,
        topicDescription: fallbackTopic,
        content: submittedDraft,
        wordCount: draftDiag.wordCount,
        scores: {
          naturalVoiceFlow: 0,
          claritySimplicity: 0,
          grammarMechanics: 0,
          toneEngagement: 0,
          sentenceVarietyCadence: 0,
          concisenessDirectness: 0,
        },
        totalScore: 0,
        percentage: 0,
        cefrLevel: 'B2',
        toneVerdict: 'Awaiting AI Evaluation',
        flowVerdict: 'Awaiting AI Evaluation',
        feedbackImplemented: 'Baseline',
        whatImproved: 'Saved to Drafts while AI completes your evaluation.',
        strictImprovements: 'Evaluation in progress.',
        grammarFixes: [],
        vocabUpgrades: [],
        audience,
        drillType: activeDrill,
        drillMeta,
        status: 'Draft',
        evaluationPending: true,
        queuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      if (onSaveDraft) {
        onSaveDraft(pendingDraft);
      } else {
        onSaveSession(pendingDraft, [], activeSlotId);
      }
      setActiveDraftId(stableSessionId);
      setDraftSavedLabel('Saved to Drafts · Awaiting AI');
      setSlowEvalNotice(
        'AI is taking longer than usual — your entry is saved to Drafts and awaiting AI evaluation in the background. You can explore Dashboard or keep using Quillit freely.'
      );
      setEvaluating(false);
    }, SLOW_EVAL_THRESHOLD_MS);

    const activeMechanicsCheck = freeWriteMode
      ? undefined
      : sessionBrief.mechanicsCheck;
    const mergedPracticingVocab = Array.from(
      new Set([
        ...(freeWriteMode ? [] : sessionBrief.vocabTargets.map((v) => v.phrase)),
        ...coachContext.practicingWords.map((v) => v.betterAlternative),
      ])
    ).slice(0, 12);

    try {
      const res = await apiFetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: submittedDraft,
          mode: MODE_LABELS[mode],
          tone: TONE_LABELS[tone],
          topic: wasTopicBlank ? '' : fallbackTopic,
          needsAutoTitle: wasTopicBlank,
          topicPrimer: activeLinkedSlot?.topicPrimer || sessionBrief.topicPrimer || '',
          previousSessionSummary: coachContext.previousSessionSummary,
          activeMechanicsCheck,
          practicingVocab: mergedPracticingVocab,
          studentProfile,
          audience,
          customCoachPrompt: customCoachPrompt || undefined,
          coachPresets:
            coachPresets && coachPresets.length > 0 ? coachPresets : undefined,
          drillContext,
        }),
      });
      window.clearTimeout(slowTimerId);
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
      setSlowEvalNotice(null);
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
        if (activeDrill === 'compression-432' && sprintRoundIdx === 2) {
          setSprintCompleted(true);
          setSprintRunning(false);
          sprintAutoArmedRef.current = false;
          setSprintAutoArmed(false);
        }
        if (!deferredToDraft) {
          setClearPopupState((prev) => startPostEvalClearPrompt(prev));
        }
      }
    } catch {
      window.clearTimeout(slowTimerId);
      if (deferredToDraft) {
        // Already saved safely to Drafts with evaluationPending=true; let App background worker retry cleanly
        return;
      }
      const currentOfflineIssues = runOfflineProofread(submittedDraft);
      const offlineEval = buildInstantLocalEvaluation(
        submittedDraft,
        mode,
        tone,
        currentOfflineIssues,
        fallbackTopic,
        vocabulary,
        {
          activeMechanicsCheck,
          practicingVocab: mergedPracticingVocab,
        }
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
      if (activeDrill === 'compression-432' && sprintRoundIdx === 2) {
        setSprintCompleted(true);
        setSprintRunning(false);
        sprintAutoArmedRef.current = false;
        setSprintAutoArmed(false);
      }
      setClearPopupState((prev) => startPostEvalClearPrompt(prev));
    } finally {
      window.clearTimeout(slowTimerId);
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

  const hasCompletedEvaluation = Boolean(
    evaluation && evaluation.evaluationStatus !== 'queued_for_reset'
  );
  const draftEvaluatedClean = isCurrentDraftEvaluatedClean({
    activeDrill,
    content,
    roomAText,
    roomBText,
    lastEvaluatedSnapshot,
    hasCompletedEvaluation,
    evaluating,
  });
  const footerActionUi = resolveStudioFooterAction({
    activeDrill,
    sprintRoundIdx,
    sprintCompleted,
    currentWordCount: diagnostics.wordCount,
    minFinalWords: COMPRESSION_ROUNDS[2].minWords,
    evaluating,
    hasRevisionContext: Boolean(revisionContext),
    isDraftEvaluatedClean: draftEvaluatedClean,
    hasCompletedEvaluation,
    hasDraftText: effectiveDraftText.trim().length > 0,
  });

  function handleFooterPrimaryAction() {
    switch (footerActionUi.primaryAction.kind) {
      case 'advance-sprint':
        handleAdvanceCompressionRound();
        break;
      case 'submit-sprint':
        handleEvaluateSprintFinal();
        break;
      case 'new-sprint':
        handleStartNewSprint();
        break;
      case 'new-entry':
        handleStartNewEntry();
        break;
      case 'evaluate':
      case 're-evaluate':
      case 'score-revision':
        void handleEvaluateDraft(false);
        break;
      default:
        break;
    }
  }

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
  const isWriteSessionActive = shouldCollapseWriteHeader({
    wordCount: diagnostics.wordCount,
    sprintRunning,
    flowLockActive,
    focusMode,
  });

  return (
    <div
      data-session-active={isWriteSessionActive ? 'true' : 'false'}
      className={
        focusMode
          ? 'min-h-screen bg-canvas px-3 sm:px-4 py-4 sm:py-10'
          : `${hasRightCoachingDrawer ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-3 sm:space-y-4`
      }
    >
      {/* Calm Collapsible Editorial Studio Header — smoothly tucks away once drafting begins */}
      <div
        data-testid="studio-header-collapse"
        data-collapsed={isWriteSessionActive && !focusMode ? 'true' : 'false'}
        className={`session-header-collapse ${focusMode ? 'max-w-3xl mx-auto mb-6' : ''}`}
      >
        <div>
          <div
            data-faded={chromeFaded ? 'true' : 'false'}
            className="vanishing-chrome flex flex-wrap items-end justify-between gap-4 pb-1"
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
                    <span>{pendingEvalSessionsCount} awaiting AI</span>
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
                  className="btn-ghost inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:py-2 text-xs font-medium whitespace-nowrap"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                  <span>Word</span>
                </button>
              )}

              {!focusMode && (
                <button
                  type="button"
                  data-testid="drafts-toggle-button"
                  onClick={() => setShowDraftsShelf((v) => !v)}
                  aria-expanded={showDraftsShelf}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:py-2 text-xs font-medium whitespace-nowrap ${
                    showDraftsShelf ? 'btn-secondary text-ink-primary' : 'btn-ghost'
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
        </div>
      </div>

      {/* Whisper-quiet 1-line active writing strip when header collapses */}
      {isWriteSessionActive && !focusMode && (
        <div
          data-testid="active-session-bar"
          data-faded={chromeFaded ? 'true' : 'false'}
          className="vanishing-chrome drawer-reveal flex items-center justify-between gap-2 text-[11px] text-ink-muted px-0.5"
        >
          <span className="font-mono-tabular whitespace-nowrap truncate">
            <span className="hidden sm:inline">{formattedToday}</span>
            <span className="sm:hidden">Today</span> · {diagnostics.wordCount}w
            {pendingEvalSessionsCount > 0 ? ` · ${pendingEvalSessionsCount} awaiting AI` : ''}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleSuggestRandomTopic}
              disabled={suggestingTopic}
              className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px]"
            >
              <Dices className="w-3 h-3" aria-hidden="true" />
              <span>Topic</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDraftsShelf((v) => !v)}
              className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px]"
            >
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>Drafts{savedDrafts.length > 0 ? ` (${savedDrafts.length})` : ''}</span>
            </button>
            <button
              type="button"
              onClick={onToggleFocusMode}
              className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px]"
            >
              <Maximize2 className="w-3 h-3" aria-hidden="true" />
              <span>Focus</span>
            </button>
          </div>
        </div>
      )}

      {/* Optional Practice Word Nudge (from Vocabulary "Use in Write") */}
      {requestedPracticeWord && !focusMode && (
        <div
          data-testid="vocab-practice-nudge"
          className="drawer-reveal px-3.5 py-2.5 rounded-md border border-border-default bg-surface flex items-center justify-between gap-3 text-xs"
        >
          <span className="text-ink-secondary">
            Practice weaving{' '}
            <strong className="font-display text-ink-primary font-semibold">
              “{requestedPracticeWord}”
            </strong>{' '}
            naturally into today’s entry.
          </span>
          {onClearRequestedPracticeWord && (
            <button
              type="button"
              onClick={onClearRequestedPracticeWord}
              aria-label="Dismiss practice word reminder"
              className="btn-ghost p-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

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
                      <span className="font-medium text-ink-primary leading-snug break-words">
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
            {/* Minimal Animated Writing-Inspired Desk Control Ribbon (Always Unlocked) */}
            {!focusMode && (
              <div
                data-faded={chromeFaded ? 'true' : 'false'}
                className="vanishing-chrome"
              >
                <DeskControlRibbon
                  mode={mode}
                  audience={audience}
                  tone={tone}
                  activeDrill={activeDrill}
                  timeCapsuleStatus={timeCapsuleStatus}
                  activeConstraint={activeConstraint}
                  constraintResult={constraintResult}
                  showConstraintPicker={showConstraintPicker}
                  flowLockActive={flowLockActive}
                  flowSecondsLabel={formatCountdownMMSS(flowSecondsLeft)}
                  mobileControlsOpen={mobileControlsOpen}
                  draftText={effectiveDraftText}
                  onSelectMode={(m) => {
                    playTactileClick(tactileSoundEnabled);
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
                  onChangeAudience={setAudience}
                  onChangeTone={setTone}
                  onSelectDrill={handleSelectDrill}
                  onLaunchTimeCapsule={handleLaunchTimeCapsuleFromStudio}
                  onToggleConstraintPicker={() => {
                    playTactileClick(tactileSoundEnabled);
                    setShowConstraintPicker((v) => !v);
                  }}
                  onSelectConstraint={(ch) => {
                    playTactileClick(tactileSoundEnabled);
                    setActiveConstraint(ch);
                    setShowConstraintPicker(false);
                  }}
                  onRollConstraint={() => {
                    playTactileClick(tactileSoundEnabled);
                    setActiveConstraint(
                      pickRandomConstraint(activeConstraint?.id, mode)
                    );
                    setShowConstraintPicker(false);
                  }}
                  onCloseConstraintPicker={() => setShowConstraintPicker(false)}
                  onToggleFlowSprint={handleToggleFlowSprint}
                  sentenceFocusMode={sentenceFocusMode}
                  onToggleSentenceFocus={() => {
                    playTactileClick(tactileSoundEnabled);
                    setSentenceFocusMode((v) => !v);
                  }}
                  onToggleMobileControls={() => {
                    playTactileClick(tactileSoundEnabled);
                    setMobileControlsOpen((v) => !v);
                  }}
                />
              </div>
            )}

            {/* v4.1 Calm Editorial Session Brief Core */}
            {!focusMode && activeDrill === 'standard' && !freeWriteMode && (
              <SessionBriefCard
                brief={sessionBrief}
                usedVocabPhrases={usedBriefVocab}
                collapsed={briefCollapsed}
                onToggleCollapse={() => {
                  playTactileClick(tactileSoundEnabled);
                  setBriefCollapsed((v) => !v);
                }}
                onEnterFreeWrite={handleEnterFreeWrite}
                onApplyPivot={handleUniversalPivot}
                pivoting={pivoting}
                onInsertVocabPhrase={(phrase) => {
                  const el = document.getElementById(
                    'writing-editor'
                  ) as HTMLTextAreaElement | null;
                  if (!el) return;
                  const start = el.selectionStart ?? content.length;
                  const end = el.selectionEnd ?? content.length;
                  const prefix = start > 0 && !/\s$/.test(content.slice(0, start)) ? ' ' : '';
                  const next = `${content.slice(0, start)}${prefix}${phrase}${content.slice(end)}`;
                  setContent(next);
                  window.setTimeout(() => {
                    el.focus();
                    const caret = start + prefix.length + phrase.length;
                    el.setSelectionRange(caret, caret);
                  }, 10);
                }}
              />
            )}

            {!focusMode && activeDrill === 'standard' && freeWriteMode && (
              <div
                data-testid="free-write-strip"
                className="flex items-center justify-between gap-2 px-4 sm:px-6 py-2 border-b border-border-subtle bg-subtle/25 text-[11px]"
              >
                <span className="text-ink-muted">
                  Free write · open page without a brief
                </span>
                <button
                  type="button"
                  data-testid="restore-session-brief-btn"
                  onClick={() => {
                    setFreeWriteMode(false);
                    setBriefCollapsed(false);
                  }}
                  className="font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
                >
                  Show session brief
                </button>
              </div>
            )}

            {/* ======================================================= */}
            {/* CONTEXTUAL DRILL SURFACES (Animated Editorial Workbenches) */}
            {/* ======================================================= */}
            {!focusMode && (
              <PracticeAddonStage
                activeDrill={activeDrill}
                compressionRoundsSpec={COMPRESSION_ROUNDS}
                sprintRoundIdx={sprintRoundIdx}
                sprintSecondsLeft={sprintSecondsLeft}
                sprintRunning={sprintRunning}
                sprintAutoPaused={sprintAutoPaused}
                sprintAutoArmed={sprintAutoArmed}
                sprintRounds={sprintRounds}
                showPrevRoundsDrawer={showPrevRoundsDrawer}
                currentWordCount={diagnostics.wordCount}
                sprintEmptyGuardMessage={sprintEmptyGuardMessage}
                sprintEmptyGuardTick={sprintEmptyGuardTick}
                sprintCompleted={sprintCompleted}
                isDraftEvaluatedClean={draftEvaluatedClean}
                evaluating={evaluating}
                onToggleSprintTimer={() => {
                  setSprintAutoPaused(false);
                  setSprintRunning((r) => {
                    const next = !r;
                    // Respect explicit manual pause so typing doesn't immediately override user pause
                    if (!next) {
                      sprintAutoArmedRef.current = false;
                      setSprintAutoArmed(false);
                    }
                    return next;
                  });
                }}
                onResetSprintTimer={() => {
                  setSprintRunning(false);
                  setSprintAutoPaused(false);
                  setSprintEmptyGuardMessage(null);
                  sprintAutoArmedRef.current = true;
                  setSprintAutoArmed(true);
                  setSprintSecondsLeft(currentSprintSpec.durationSec);
                }}
                onAdvanceSprintRound={handleAdvanceCompressionRound}
                onEvaluateSprintFinal={handleEvaluateSprintFinal}
                onStartNewSprint={handleStartNewSprint}
                onStartSprintRevision={handleStartRevisionPass}
                onTogglePrevRounds={() => setShowPrevRoundsDrawer((v) => !v)}
                skeletonPhase={skeletonPhase}
                skeletonPassage={skeletonPassage}
                skeletonDomainFilter={skeletonDomainFilter}
                skeletonClues={skeletonClues}
                skeletonLoading={skeletonLoading}
                skeletonCompletedCount={completedSkeletonIds.length}
                activeTopic={topic}
                draftText={effectiveDraftText}
                onChangeSkeletonDomainFilter={handleChangeSkeletonDomainFilter}
                onUpdateSkeletonClue={(idx, val) =>
                  setSkeletonClues((prev) => updateSkeletonClueAt(prev, idx, val))
                }
                onAddSkeletonClue={(val) =>
                  setSkeletonClues((prev) => addSkeletonClue(prev, val))
                }
                onRemoveSkeletonClue={(idx) =>
                  setSkeletonClues((prev) => removeSkeletonClueAt(prev, idx))
                }
                onAutoDistillSkeletonClues={() => {
                  playTactileClick(tactileSoundEnabled);
                  setSkeletonClues(
                    extractSentenceSkeletonClues(skeletonPassage.text, 4)
                  );
                }}
                onNextSkeletonPassage={handleNextSkeletonPassage}
                onAdaptSkeletonToTopic={handleAdaptSkeletonToTopic}
                onSetSkeletonPhase={(nextPhase) => {
                  playTactileClick(tactileSoundEnabled);
                  setSkeletonPhase(nextPhase);
                }}
                onEnterReconstruct={() => {
                  playTactileClick(tactileSoundEnabled);
                  setSkeletonPhase('reconstruct');
                  window.setTimeout(
                    () => document.getElementById('writing-editor')?.focus(),
                    40
                  );
                }}
                timeCapsuleStatus={timeCapsuleStatus}
                selectedTimeCapsuleOrigin={timeCapsuleOrigin}
                onSwitchTimeCapsuleTopic={handleSwitchTimeCapsuleTopic}
                onStartWritingFromLockedCapsule={() => {
                  handleSelectDrill('standard');
                  window.setTimeout(
                    () => document.getElementById('writing-editor')?.focus(),
                    40
                  );
                }}
                onExitTimeCapsule={() => {
                  setActiveDrill('standard');
                  setTimeCapsuleOrigin(null);
                }}
                revisionContext={revisionContext}
                onCancelRevision={() => setRevisionContext(null)}
              />
            )}

            {/* Manuscript Body */}
            <div className="p-4 sm:p-7 space-y-4 sm:space-y-5">
              {/* Quiet Random Topic Starter Hint */}
              {!activeLinkedSlot && !focusMode && suggestedTopicMeta && (
                <div
                  data-testid="random-topic-hint"
                  className="drawer-reveal flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-subtle text-xs"
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

              {/* Active Targeted Weakness Coaching Reminder (launched from Dashboard) */}
              {activeWeaknessReminder && (
                <div
                  data-testid="active-weakness-reminder"
                  className="drawer-reveal flex items-start justify-between gap-2 pb-3 border-b border-border-subtle text-xs"
                >
                  <div className="text-ink-secondary leading-relaxed">
                    <span className="font-semibold text-ink-primary">
                      Targeted Drill ({activeWeaknessReminder.pillarLabel}):{' '}
                    </span>
                    {activeWeaknessReminder.feedbackReminder}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveWeaknessReminder(null)}
                    aria-label="Dismiss targeted drill reminder"
                    className="btn-ghost p-1 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {/* Draft Title (Auto-resizes vertically so long topics never clip) */}
              <div className="border-b border-border-subtle pb-3">
                <label htmlFor="draft-topic" className="sr-only">
                  Session topic or title
                </label>
                <textarea
                  ref={topicTextareaRef}
                  id="draft-topic"
                  rows={1}
                  value={topic}
                  onChange={(e) => {
                    const nextVal = e.target.value.replace(/\r?\n/g, ' ');
                    setTopic(nextVal);
                    e.currentTarget.style.height = 'auto';
                    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
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

              {/* 3-Minute No-Backspace Flow Sprint Active Ink-Stream Ribbon */}
              {flowLockActive && (
                <div
                  data-testid="flow-lock-banner"
                  className="drawer-reveal relative overflow-hidden rounded-md border border-border-default bg-subtle/45 px-3.5 py-2.5 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 font-mono-tabular text-ink-primary font-medium min-w-0">
                      <Feather
                        className="w-3.5 h-3.5 text-ink-primary ink-nib-breathe shrink-0"
                        aria-hidden="true"
                      />
                      <span className="sm:hidden truncate">
                        {flowHintVisible
                          ? `Keep flowing · ${formatCountdownMMSS(flowSecondsLeft)}`
                          : `Flow · ${formatCountdownMMSS(flowSecondsLeft)} · draft forward`}
                      </span>
                      <span className="hidden sm:inline truncate">
                        {flowHintVisible
                          ? `Keep ink flowing — editing unlocks in ${formatCountdownMMSS(flowSecondsLeft)}`
                          : `Flow Sprint · ${formatCountdownMMSS(flowSecondsLeft)} remaining · draft forward`}
                      </span>
                    </span>
                    <button
                      type="button"
                      data-testid="flow-unlock-early-button"
                      onClick={() => {
                        setFlowLockActive(false);
                        setFlowHintVisible(false);
                      }}
                      className="inline-link-tactile font-medium cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <span className="sm:hidden">Unlock</span>
                      <span className="hidden sm:inline">Unlock Editing</span>
                    </button>
                  </div>
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-border-subtle overflow-hidden"
                  >
                    <div
                      className="h-full w-full origin-left bg-accent ink-stream-line transition-transform duration-300 ease-linear"
                      style={{
                        transform: `scaleX(${computeTimerRemainingRatio(
                          flowSecondsLeft,
                          DEFAULT_FLOW_SPRINT_SECONDS
                        )})`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* EDITOR SURFACE: Open-Book Dual Spread for 3 Rooms OR Clean 66ch Single Canvas */}
              <div className="space-y-1.5">
                {/* Real-Time WPM & Subtle Typing Flow Indicator in the Editor Corner */}
                <div className="flex justify-end">
                  <WritingFlowMeter
                    metrics={typingFlowMetrics}
                    pulseSeq={typingFlowState.pulseSeq}
                    wordCount={diagnostics.wordCount}
                  />
                </div>

                {activeDrill === 'three-rooms' ? (
                  <ThreeRoomsDesk
                      roomAText={roomAText}
                      roomBText={roomBText}
                      roomAWordCount={roomAWordCount}
                      roomBWordCount={roomBWordCount}
                      jargonHits={roomAJargonCheck?.jargonHits ?? []}
                      mobileRoomTab={mobileRoomTab}
                      onChangeMobileRoomTab={setMobileRoomTab}
                      onChangeRoomA={(val) => {
                        trackEditorTyping(roomAText, val);
                        setRoomAText(val);
                        setSavedSuccess(false);
                      }}
                      onChangeRoomB={(val) => {
                        trackEditorTyping(roomBText, val);
                        setRoomBText(val);
                        setSavedSuccess(false);
                      }}
                    />
                ) : (
                  <div
                    key={flowShakeTick}
                    className={`relative mx-auto w-full max-w-[65ch] py-1 sm:py-2 ${
                      flowShakeTick > 0 && flowHintVisible ? 'flow-shake' : ''
                    }`}
                  >
                    <label htmlFor="writing-editor" className="sr-only">
                      Writing editor
                    </label>
                    {sentenceFocusMode && content.length > 0 && (
                      <SentenceFocusOverlay
                        text={content}
                        caretIndex={editorCaretIndex}
                        scrollTop={editorScrollTop}
                      />
                    )}
                    <textarea
                      id="writing-editor"
                      value={content}
                      onSelect={(e) => {
                        setEditorCaretIndex(e.currentTarget.selectionStart ?? 0);
                      }}
                      onKeyUp={(e) => {
                        setEditorCaretIndex(e.currentTarget.selectionStart ?? 0);
                      }}
                      onClick={(e) => {
                        setEditorCaretIndex(e.currentTarget.selectionStart ?? 0);
                      }}
                      onScroll={(e) => {
                        setEditorScrollTop(e.currentTarget.scrollTop);
                      }}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setEditorCaretIndex(e.currentTarget.selectionStart ?? nextVal.length);
                        trackEditorTyping(content, nextVal);
                        setContent(nextVal);
                        setSavedSuccess(false);
                        setDraftSavedLabel(null);
                        setPromotedVocabBanner(null);
                        if (nextVal.trim().length > 0 && sprintEmptyGuardMessage) {
                          setSprintEmptyGuardMessage(null);
                        }
                        if (!revisionContext) {
                          activeLoggedSessionIdRef.current = null;
                        }
                        // 4/3/2 Sprint: auto-start timer on first keystroke when armed & not yet completed
                        if (
                          activeDrill === 'compression-432' &&
                          !sprintCompleted &&
                          !evaluating &&
                          !sprintRunning &&
                          sprintSecondsLeft > 0 &&
                          sprintAutoArmedRef.current &&
                          nextVal.trim().length > 0
                        ) {
                          setSprintRunning(true);
                          setSprintAutoPaused(false);
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
                    rows={focusMode ? 17 : 10}
                    placeholder={
                      activeDrill === 'skeleton'
                        ? `Reconstruct the passage from your ${skeletonClues.length || 3} skeleton beats in your own natural words...`
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
                    className={`relative z-10 w-full bg-transparent text-[16px] sm:text-base leading-[1.82] sm:leading-[1.85] placeholder:text-ink-muted resize-y focus:outline-none ${
                      sentenceFocusMode && content.length > 0
                        ? 'text-transparent caret-ink-primary'
                        : 'text-ink-primary'
                    }`}
                  />
                </div>
              )}
              </div>

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

                  <button
                    type="button"
                    data-testid="toggle-text-analysis-btn"
                    aria-expanded={showTextAnalysis}
                    onClick={() => {
                      playTactileClick(tactileSoundEnabled);
                      setShowTextAnalysis((prev) => !prev);
                    }}
                    className={`px-2.5 py-1 rounded-sm border text-[11px] font-mono-tabular whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1.5 ${
                      showTextAnalysis
                        ? 'bg-accent text-ink-inverse border-accent'
                        : 'bg-surface text-ink-primary border-border-default hover:border-border-strong'
                    }`}
                  >
                    <span>
                      Analysis {liveTextAnalysis.overallScore}/100 ·{' '}
                      {liveTextAnalysis.suggestions.length}{' '}
                      {liveTextAnalysis.suggestions.length === 1 ? 'tip' : 'tips'}
                    </span>
                    {showTextAnalysis ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>
              )}

              {diagnostics.wordCount >= 8 && showTextAnalysis && (
                <TextAnalysisDrawer
                  report={liveTextAnalysis}
                  onClose={() => setShowTextAnalysis(false)}
                  onSaveAlternativeToLibrary={handleSaveAnalysisAlternativeToLibrary}
                />
              )}

              {/* Editorial Daily Word Goal Folio Gauge */}
              <InkDropGoalWell
                progress={dailyInkProgress}
                onChangeDailyWordGoal={onChangeDailyWordGoal}
              />

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
                  {footerActionUi.secondaryMode === 'revise' ? (
                    <button
                      type="button"
                      data-testid="footer-revise-button"
                      onClick={handleStartRevisionPass}
                      className="btn-secondary inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-2 text-xs font-medium whitespace-nowrap"
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Revise</span>
                    </button>
                  ) : (
                    onSaveDraft && (
                      <button
                        type="button"
                        data-testid="save-draft-button"
                        onClick={handleSaveDraftClick}
                        className="btn-secondary inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-2 text-xs font-medium whitespace-nowrap"
                      >
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Save Draft</span>
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    data-testid="evaluate-score-button"
                    data-action-kind={footerActionUi.primaryAction.kind}
                    onClick={handleFooterPrimaryAction}
                    disabled={footerActionUi.primaryAction.disabled}
                    className={`btn-primary inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-medium whitespace-nowrap ${
                      footerActionUi.secondaryMode !== 'revise' && !onSaveDraft
                        ? 'col-span-2'
                        : ''
                    }`}
                  >
                    {footerActionUi.primaryAction.kind === 'advance-sprint' ? (
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : footerActionUi.primaryAction.kind === 'new-sprint' ||
                      footerActionUi.primaryAction.kind === 'new-entry' ? (
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : footerActionUi.primaryAction.kind === 're-evaluate' ||
                      footerActionUi.primaryAction.kind === 'score-revision' ? (
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Sparkles
                        className={`w-3.5 h-3.5 ${evaluating ? 'animate-pulse' : ''}`}
                        aria-hidden="true"
                      />
                    )}
                    <span>{footerActionUi.primaryAction.label}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {slowEvalNotice && (
            <div
              role="status"
              data-testid="slow-eval-draft-notice"
              className="drawer-reveal p-3.5 rounded-md border border-status-warning-border bg-status-warning-soft text-xs text-status-warning flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2">
                <RefreshCw
                  className="w-3.5 h-3.5 mt-0.5 shrink-0 awaiting-ink-spinner"
                  aria-hidden="true"
                />
                <span className="leading-relaxed">{slowEvalNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setSlowEvalNotice(null)}
                aria-label="Dismiss background evaluation notice"
                className="p-0.5 opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

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
                    edits: evaluation.edits,
                    toneCheck: evaluation.toneCheck,
                    nextDraftPriority: evaluation.nextDraftPriority,
                    targetCheck: evaluation.targetCheck,
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
                  onLocatePhrase={handleLocateEvaluationPhrase}
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
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-1.5rem)] inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-status-success-border bg-elevated text-xs text-ink-primary shadow-md"
        >
          <CheckCircle2
            className="w-3.5 h-3.5 text-status-success shrink-0"
            aria-hidden="true"
          />
          <span className="truncate">{quickVocabToast}</span>
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
