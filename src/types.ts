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

export type AppView = 'write' | 'dashboard' | 'calendar' | 'vocabulary' | 'vault';

export type FeedbackImplementedStatus = 'Baseline' | 'Yes' | 'Partial' | 'No';

export type TriWeeklyPillar =
  | 'technical-concept'
  | 'linkedin-email'
  | 'creative-story';

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

export interface GrammarFix {
  original: string;
  corrected: string;
  rule: string;
  category: string;
}

export interface VocabSuggestion {
  used: string;
  betterAlternative: string;
  explanation: string;
  contextSnippet?: string;
  contextTag?: string;
}

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
}

export interface EvaluationRoutingMeta {
  model: string;
  thinkingLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' | 'LOCAL';
  tierLabel: string;
  reason: string;
  latencyMs?: number;
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
