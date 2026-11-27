export type ThemePreference = 'system' | 'light' | 'dark';

export type WritingMode =
  | 'journal'
  | 'linkedin'
  | 'email'
  | 'friend'
  | 'technical'
  | 'creative';

export type ToneSetting =
  | 'professional-warm'
  | 'conversational'
  | 'formal-executive'
  | 'academic-technical'
  | 'crisp-direct'
  | 'narrative-vivid';

export type AppView =
  | 'write'
  | 'converse'
  | 'dashboard'
  | 'calendar'
  | 'vocabulary'
  | 'vault';

export type FeedbackImplementedStatus = 'Baseline' | 'Yes' | 'Partial' | 'No';

export type TriWeeklyPillar =
  | 'technical-concept'
  | 'linkedin-email'
  | 'creative-story';

export type DrillType =
  | 'standard'
  | 'compression-432'
  | 'skeleton'
  | 'three-rooms'
  | 'time-capsule';

export type AudienceOption =
  | 'Interviewer'
  | 'Hiring Manager'
  | 'Professor'
  | 'LinkedIn Reader'
  | 'Friend';

export type CoachPresetId =
  | 'brutally-honest'
  | 'technical-interview-clarity'
  | 'ban-corporate-slop'
  | 'flag-literal-translations'
  | 'short-punchy-sentences';

export interface CalqueFix {
  phrase: string;
  naturalAlternative: string;
  reason: string;
}

export interface DrillMeta {
  drillType: DrillType;
  audience?: AudienceOption;
  constraintId?: string;
  constraintLabel?: string;
  constraintViolations?: number;
  flowSprintUsed?: boolean;
  flowBlockedDeletes?: number;
  compressionWordCounts?: [number, number, number];
  compressionRatio?: number;
  skeletonPassageId?: string;
  skeletonTitle?: string;
  skeletonOriginalText?: string;
  skeletonClues?: string[];
  roomsJargonCount?: number;
  roomAText?: string;
  roomBText?: string;
  timeCapsuleOriginSessionId?: string;
  timeCapsuleOriginDate?: string;
  timeCapsuleOriginScore?: number;
  timeCapsuleOriginText?: string;
}

export interface DrillVerdict {
  headline: string;
  summary: string;
  badge?: string;
  compressionRatio?: number;
  registerShiftScore?: number;
  skeletonAlignmentNote?: string;
  timeCapsuleDelta?: number;
}

export interface ProseDiagnosticsResult {
  wordCount: number;
  sentenceCount: number;
  sentenceLengths: number[];
  signalNoiseRatio: number; // 0-100
  fillerCount: number;
  fillerWordsFound: string[];
  calqueFixes: CalqueFix[];
  baselineSpokenReadiness: number; // 0-100
}

export interface RubricScores {
  naturalVoiceFlow: number;
  claritySimplicity: number;
  grammarMechanics: number;
  toneEngagement: number;
  sentenceVarietyCadence: number;
  concisenessDirectness: number;
}

export interface InternationalMetrics {
  ieltsBand: number; // 4.0 to 9.0 in 0.5 increments
  toeflEquivalent: number; // 0 to 30
  lexicalResource: number; // 1 to 10
  coherenceCohesion: number; // 1 to 10
  taskAchievement: number; // 1 to 10
  registerControl: number; // 1 to 10
  grammarAccuracy: number; // 1 to 10
  fleschReadingEase: number; // 0 to 100
  fkGradeLevel: number; // e.g., 9.2
}

export type ErrorTag =
  | 'subject-verb'
  | 'tense-shift'
  | 'article-preposition'
  | 'run-on-sentence'
  | 'word-choice'
  | 'regional-calque'
  | 'hedging-passive'
  | 'tone-mismatch'
  | 'repetition-filler'
  | 'punctuation-spacing';

export type EditDimension = 'grammar' | 'tone' | 'flow' | 'clarity' | 'calque';

export interface UnifiedEdit {
  original: string;
  improved: string;
  dimension: EditDimension;
  errorTag: ErrorTag;
  rule: string;
}

export interface ToneCheck {
  match: 'On Target' | 'Slightly Off' | 'Mismatch';
  audienceReaction: string;
  toneFix: string;
}

export interface GrammarFix {
  original: string;
  corrected: string;
  rule: string;
  category: string;
  errorTag?: ErrorTag;
}

export interface VocabSuggestion {
  used: string;
  betterAlternative: string;
  explanation: string;
  contextSnippet?: string;
  contextTag?: string;
}

export type VocabMasteryStage = 'new' | 'emerging' | 'building' | 'mastered';

export interface VocabEntry {
  id: string;
  used: string;
  betterAlternative: string;
  explanation: string;
  contextSnippet: string;
  mode: WritingMode;
  dateAdded: string; // YYYY-MM-DD
  mastered: boolean;
  sessionId?: string;
  aiCategory?: string;
  category?: string;
  correctUseCount?: number;
  usageCount?: number;
  masteryStage?: VocabMasteryStage;
}

export interface RewrittenSample {
  original: string;
  improved: string;
  why: string;
}

export type RubricMetricNotes = Partial<Record<keyof RubricScores, string>>;

export interface FeedbackImplementationDetail {
  status: FeedbackImplementedStatus;
  implemented: string;
  missed: string;
}

export interface CoachHighlightPoint {
  title: string;
  detail: string;
}

export interface PinpointedRewrite {
  original: string;
  rewrite: string;
  rule: string;
  category?: string;
  dimension?: EditDimension;
  errorTag?: ErrorTag;
}

export interface EvaluationRoutingMeta {
  model: string;
  thinkingLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' | 'STANDARD' | 'LOCAL';
  tierLabel: string;
  reason: string;
  latencyMs?: number;
}

export type TargetCheckStatus = 'Cleared' | 'Partial' | 'Missed' | 'Baseline';

export interface SessionTargetCheck {
  mechanicsStatus: TargetCheckStatus;
  mechanicsNote: string;
  vocabUsed: string[];
  vocabMissed: string[];
}

export interface WritingSession {
  id: string;
  date: string; // YYYY-MM-DD
  daySlot: string;
  mode: WritingMode;
  promptCategory: string;
  tone: ToneSetting;
  topicDescription: string;
  content: string;
  wordCount: number;
  scores: RubricScores;
  metricNotes?: RubricMetricNotes;
  totalScore: number; // /60
  percentage: number; // 0-100
  cefrLevel: string; // e.g., B2+, C1
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
  grammarFixes: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
  routingMeta?: EvaluationRoutingMeta;
  /** v3.1 High-Signal Evaluation & Practice Mechanic fields */
  spokenReadinessScore?: number; // 0-100
  signalNoiseRatio?: number; // 0-100
  audienceReaction?: string;
  audience?: AudienceOption;
  calqueFixes?: CalqueFix[];
  drillType?: DrillType;
  drillMeta?: DrillMeta;
  drillVerdict?: DrillVerdict;
  revisionOfSessionId?: string;
  revisionDelta?: number; // Pass 2 - Pass 1 total score delta (-60..60)
  /** v4.0 Unified Diagnostic Evaluation fields */
  edits?: UnifiedEdit[];
  toneCheck?: ToneCheck;
  nextDraftPriority?: string;
  /** v4.1 Closed-Loop Session Brief Target Check */
  targetCheck?: SessionTargetCheck;
  status: 'Completed' | 'Draft';
  evaluationPending?: boolean;
  modelUsed?: string;
  queuedAt?: string;
  createdAt: string;
}

export interface CalendarSlot {
  id: string;
  dayOfWeek: string;
  slotLabel: string;
  slotTime?: string;
  scheduledDate: string; // YYYY-MM-DD
  mode: WritingMode;
  tone: ToneSetting;
  promptCategory: string;
  topic: string;
  topicPrimer?: string;
  pivotRule?: string;
  feedbackReminder?: string;
  targetWords: number;
  completed: boolean;
  linkedSessionId?: string;
  suggestions?: string[];
  isTriWeekly?: boolean;
  pillar?: TriWeeklyPillar;
  curriculumTopicId?: string;
  source?: 'curriculum-52w' | 'ai-adapted' | 'manual';
  /** v3.1 4-5x/week 10-min practice mechanic badge */
  recommendedDrill?: DrillType;
  isConverseSlot?: boolean;
}

export interface TopicPrompt {
  id: string;
  mode: WritingMode;
  tone: ToneSetting;
  category: string;
  title: string;
  guidance: string;
  targetWords: number;
}

export interface StudentProfile {
  displayName?: string;
  collegeDegree: string;
  semester: string;
  collegeName: string;
  age: number;
  onboardingCompleted: boolean;
  /** 0 = Sun, 1 = Mon, ..., 6 = Sat */
  preferredDays?: number[];
  /** HH:MM 24h reminder preference e.g. '18:30' */
  reminderTime?: string;
  defaultMode?: WritingMode;
  targetWordGoal?: number;
}

export interface UserSettings {
  semesterLabel: string;
  dailyWordGoal: number;
  autoSaveVocab: boolean;
  focusModeDefault: boolean;
  liveOfflineCheck?: boolean;
  autoReloadSchedule?: boolean;
  studentProfile?: StudentProfile;
  notificationsEnabled?: boolean;
  lastNotifiedDate?: string;
  googleSpreadsheetId?: string;
  googleSpreadsheetUrl?: string;
  googleDocId?: string;
  googleDocUrl?: string;
  lastWorkspaceSyncAt?: string;
  /** New-user welcome AI flashcard shown flag (local & cloud) */
  welcomeFlashcardShown?: boolean;
  /** Tracks 52-week curriculum IDs already scheduled, completed, or drawn so topics never repeat */
  usedCurriculumIds?: string[];
  /** Session count when periodic AI feedback adaptation last ran */
  lastPeriodicAiSessionCount?: number;
  /** v3.1 Custom Coach Instructions & Tactile Preferences */
  customCoachPrompt?: string;
  coachPresets?: CoachPresetId[];
  tactileSoundEnabled?: boolean;
  vaultLatchEnabled?: boolean;
}

export interface VaultPayload {
  version: number;
  createdAt: string;
  updatedAt: string;
  sessions: WritingSession[];
  vocabulary: VocabEntry[];
  calendarSlots: CalendarSlot[];
  settings: UserSettings;
}

export interface EncryptedEnvelope {
  format: 'cadence-aes-gcm-v1';
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
  iterations: number;
  updatedAt: string;
}

export interface LiveDraftDiagnostics {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  readingTimeMinutes: number;
  fillerHits: Array<{ word: string; count: number }>;
  repeatedOpeners: Array<{ opener: string; count: number }>;
  passiveMarkers: number;
}

export interface RealtimeAssistResult {
  toneAlignment: string;
  clarityNudge: string;
  grammarAlerts: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
  modelUsed?: string;
  thinkingLevelUsed?: string;
  downgraded?: boolean;
  quotaQueued?: boolean;
}

export type ConversationPace = 'relaxed' | 'natural' | 'challenging';

export interface ConversationScenario {
  id: string;
  title: string;
  subtitle: string;
  personaName: string;
  personaRole: string;
  personaInitials: string;
  mode: WritingMode;
  tone: ToneSetting;
  openingLine: string;
  initialSparks: string[];
  settingBrief: string;
  isCustom?: boolean;
}

export interface ConversationRecast {
  original: string;
  naturalVersion: string;
  tip: string;
}

export interface ConversationTurnInTimeAnalysis {
  contextAlignment: number; // 1-10
  toneMatch: number; // 1-10
  grammarAccuracy: number; // 1-10
  naturalness: number; // 1-10
  vocabQuality: number; // 1-10
  turnNote: string;
}

export interface ConversationTurnTelemetry {
  responseTimeMs?: number; // Total time from partner message ready -> user send
  thinkTimeMs?: number; // Time from partner message ready -> user first keystroke
  composeTimeMs?: number; // Time from first keystroke -> user send
  wordCount: number;
  wordsPerMinute?: number;
  revisionCount?: number;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'partner';
  text: string;
  timestamp: string;
  createdAtMs?: number;
  recast?: ConversationRecast | null;
  inTimeAnalysis?: ConversationTurnInTimeAnalysis | null;
  telemetry?: ConversationTurnTelemetry;
  usedTargetWords?: string[];
  modelUsed?: string;
  latencyMs?: number;
  isEditedOpener?: boolean;
}

export interface ConversationBenchmarkScores {
  contextCoherence: number; // 1-10 (18%)
  naturalnessSpokenFlow: number; // 1-10 (16%)
  grammarMechanics: number; // 1-10 (16%)
  toneRegister: number; // 1-10 (14%)
  responsivenessTempo: number; // 1-10 (12%)
  conversationalInitiative: number; // 1-10 (10%)
  clarityConciseness: number; // 1-10 (8%)
  vocabularyPrecision: number; // 1-10 (6% - lowest weightage)
}

export type ConversationBenchmarkNotes = Partial<
  Record<keyof ConversationBenchmarkScores, string>
>;

export type ConversationTempoBand =
  | 'Snappy'
  | 'Natural'
  | 'Measured'
  | 'Deliberate'
  | 'Hesitant';

export type ConversationBenchmarkTier =
  | 'Mastery'
  | 'Proficient'
  | 'Operational'
  | 'Developing'
  | 'Foundational';

export interface ConversationTimingSummary {
  turnCount: number;
  totalUserWords: number;
  avgWordsPerTurn: number;
  totalDurationSec: number;
  avgResponseTimeSec: number | null;
  medianResponseTimeSec: number | null;
  fastestTurnSec: number | null;
  slowestTurnSec: number | null;
  avgThinkTimeSec: number | null;
  avgWpm: number | null;
  tempoBand: ConversationTempoBand;
  timingCalibrationScore: number; // 1-10 objective timing fairness score
}

export interface ConversationTurnArcPoint {
  turnNumber: number;
  excerpt: string;
  wordCount: number;
  responseTimeSec: number | null;
  thinkTimeSec: number | null;
  inTimeScore: number | null; // 1-10 composite of in-time analysis
  turnNote: string;
  hasRecast: boolean;
}

export interface ConversationBenchmarkReport {
  benchmarkIndex: number; // 0-100 weighted index
  benchmarkTier: ConversationBenchmarkTier;
  spokenInteractionCefr: string;
  parameters: ConversationBenchmarkScores;
  parameterNotes: ConversationBenchmarkNotes;
  timingSummary: ConversationTimingSummary;
  contextVerdict: string;
  toneVerdict: string;
  pacingVerdict: string;
  turnArc: ConversationTurnArcPoint[];
  inTimeAverages: {
    contextAlignment: number | null;
    toneMatch: number | null;
    grammarAccuracy: number | null;
    naturalness: number | null;
    vocabQuality: number | null;
  };
}

export interface SavedConversationThread {
  id: string;
  scenario: ConversationScenario;
  pace: ConversationPace;
  messages: ConversationMessage[];
  updatedAt: string;
  evaluatedSessionId?: string;
  finalScore?: number;
  benchmarkIndex?: number;
  cefrLevel?: string;
}
