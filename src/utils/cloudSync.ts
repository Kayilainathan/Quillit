import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type {
  CalendarSlot,
  FeedbackImplementedStatus,
  ToneSetting,
  UserSettings,
  VaultPayload,
  VocabEntry,
  WritingMode,
  WritingSession,
} from '../types';
import { mergeVaultPayloads } from './analytics';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function sanitizeDocId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (cleaned.length >= 1) return cleaned;
  return `${fallbackPrefix}_${Date.now()}`;
}

function clip(value: unknown, maxLen: number): string {
  return String(value ?? '').slice(0, maxLen);
}

function validISODate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 10);
}

const VALID_MODES: WritingMode[] = [
  'journal',
  'linkedin',
  'email',
  'friend',
  'technical',
  'creative',
];
const VALID_TONES: ToneSetting[] = [
  'professional-warm',
  'conversational',
  'formal-executive',
  'academic-technical',
  'crisp-direct',
  'narrative-vivid',
];

function validMode(m: WritingMode): WritingMode {
  return VALID_MODES.includes(m) ? m : 'technical';
}

function validTone(t: ToneSetting): ToneSetting {
  return VALID_TONES.includes(t) ? t : 'academic-technical';
}

function validFeedbackStatus(
  status: FeedbackImplementedStatus
): FeedbackImplementedStatus {
  return ['Baseline', 'Yes', 'Partial', 'No'].includes(status)
    ? status
    : 'Baseline';
}

function sanitizeSessionPayload(
  session: WritingSession,
  uid: string
): Record<string, unknown> {
  const docId = sanitizeDocId(session.id, 'SESSION');
  const payload: Record<string, unknown> = {
    id: docId,
    ownerId: uid,
    date: validISODate(session.date),
    daySlot: clip(session.daySlot || 'Studio Session', 80),
    mode: validMode(session.mode),
    promptCategory: clip(session.promptCategory || 'General Writing', 100),
    tone: validTone(session.tone),
    topicDescription: clip(session.topicDescription || 'Untitled Session', 300),
    content: clip(session.content || '', 30000),
    wordCount: Math.max(0, Math.min(20000, Math.round(Number(session.wordCount) || 0))),
    scores: {
      naturalVoiceFlow: Number(session.scores.naturalVoiceFlow) || 7,
      claritySimplicity: Number(session.scores.claritySimplicity) || 7,
      grammarMechanics: Number(session.scores.grammarMechanics) || 7,
      toneEngagement: Number(session.scores.toneEngagement) || 7,
      sentenceVarietyCadence: Number(session.scores.sentenceVarietyCadence) || 7,
      concisenessDirectness: Number(session.scores.concisenessDirectness) || 7,
    },
    totalScore: Math.max(0, Math.min(60, Number(session.totalScore) || 0)),
    percentage: Math.max(0, Math.min(100, Number(session.percentage) || 0)),
    cefrLevel: clip(session.cefrLevel || 'B2', 12),
    toneVerdict: clip(session.toneVerdict || '', 1000),
    flowVerdict: clip(session.flowVerdict || '', 1000),
    feedbackImplemented: validFeedbackStatus(session.feedbackImplemented),
    whatImproved: clip(session.whatImproved || '', 1500),
    strictImprovements: clip(session.strictImprovements || '', 1500),
    grammarFixes: (session.grammarFixes || []).slice(0, 25).map((g) => ({
      original: clip(g.original, 240),
      corrected: clip(g.corrected, 240),
      rule: clip(g.rule, 300),
      category: clip(g.category, 80),
    })),
    vocabUpgrades: (session.vocabUpgrades || []).slice(0, 25).map((v) => ({
      used: clip(v.used, 160),
      betterAlternative: clip(v.betterAlternative, 160),
      explanation: clip(v.explanation, 400),
      contextSnippet: clip(v.contextSnippet || '', 300),
    })),
    status: session.status === 'Draft' ? 'Draft' : 'Completed',
  };

  if (session.internationalMetrics) {
    payload.internationalMetrics = { ...session.internationalMetrics };
  }
  if (typeof session.evaluationPending === 'boolean') {
    payload.evaluationPending = session.evaluationPending;
  }
  if (session.modelUsed) {
    payload.modelUsed = clip(session.modelUsed, 64);
  }
  return payload;
}

function sanitizeSlotPayload(
  slot: CalendarSlot,
  uid: string
): Record<string, unknown> {
  const docId = sanitizeDocId(slot.id, 'slot');
  const payload: Record<string, unknown> = {
    id: docId,
    ownerId: uid,
    dayOfWeek: clip(slot.dayOfWeek || 'Wednesday', 20),
    slotLabel: clip(slot.slotLabel || 'Practice Slot', 60),
    scheduledDate: validISODate(slot.scheduledDate),
    mode: validMode(slot.mode),
    tone: validTone(slot.tone),
    promptCategory: clip(slot.promptCategory || 'Writing Practice', 100),
    topic: clip(slot.topic || 'Focused Practice', 300),
    targetWords: Math.max(20, Math.min(5000, Math.round(Number(slot.targetWords) || 200))),
    completed: Boolean(slot.completed),
  };

  if (slot.slotTime) {
    payload.slotTime = clip(slot.slotTime, 20);
  }
  if (slot.topicPrimer) {
    payload.topicPrimer = clip(slot.topicPrimer, 600);
  }
  if (slot.pivotRule) {
    payload.pivotRule = clip(slot.pivotRule, 400);
  }
  if (slot.feedbackReminder) {
    payload.feedbackReminder = clip(slot.feedbackReminder, 400);
  }
  if (slot.linkedSessionId) {
    payload.linkedSessionId = sanitizeDocId(slot.linkedSessionId, 'SESSION');
  }
  if (Array.isArray(slot.suggestions)) {
    payload.suggestions = slot.suggestions
      .slice(0, 6)
      .map((s) => clip(s, 240));
  }
  if (typeof slot.isTriWeekly === 'boolean') {
    payload.isTriWeekly = slot.isTriWeekly;
  }
  if (
    slot.pillar === 'technical-concept' ||
    slot.pillar === 'linkedin-email' ||
    slot.pillar === 'creative-story'
  ) {
    payload.pillar = slot.pillar;
  }

  return payload;
}

function sanitizeVocabPayload(
  entry: VocabEntry,
  uid: string
): Record<string, unknown> {
  const docId = sanitizeDocId(entry.id, 'vocab');
  const payload: Record<string, unknown> = {
    id: docId,
    ownerId: uid,
    used: clip(entry.used || 'word', 160),
    betterAlternative: clip(entry.betterAlternative || 'alternative', 160),
    explanation: clip(entry.explanation || '', 500),
    contextSnippet: clip(entry.contextSnippet || '', 300),
    mode: validMode(entry.mode),
    dateAdded: validISODate(entry.dateAdded),
    mastered: Boolean(entry.mastered),
  };
  if (entry.sessionId) {
    payload.sessionId = sanitizeDocId(entry.sessionId, 'SESSION');
  }
  return payload;
}

export async function ensureUserProfileDoc(
  user: User,
  settings: UserSettings
): Promise<Partial<UserSettings>> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const safeGoal = Math.max(50, Math.min(5000, Math.round(settings.dailyWordGoal || 200)));

  const baseFields: Record<string, unknown> = {
    semesterLabel: clip(settings.semesterLabel || '3rd Year · 6th Semester EIE', 120),
    dailyWordGoal: safeGoal,
    autoSaveVocab: Boolean(settings.autoSaveVocab),
    focusModeDefault: Boolean(settings.focusModeDefault),
    autoReloadSchedule: settings.autoReloadSchedule !== false,
    updatedAt: serverTimestamp(),
  };
  if (user.email) {
    baseFields.email = clip(user.email, 254);
  }
  if (user.displayName) {
    baseFields.displayName = clip(user.displayName, 120);
  }
  if (settings.studentProfile) {
    const sp = settings.studentProfile;
    if (sp.collegeDegree) baseFields.collegeDegree = clip(sp.collegeDegree, 120);
    if (sp.semester) baseFields.semester = clip(sp.semester, 40);
    if (sp.collegeName) baseFields.collegeName = clip(sp.collegeName, 140);
    if (Number.isInteger(sp.age) && sp.age >= 14 && sp.age <= 80) {
      baseFields.age = sp.age;
    }
    baseFields.onboardingCompleted = Boolean(sp.onboardingCompleted);
  }
  if (settings.googleSpreadsheetId) {
    baseFields.googleSpreadsheetId = clip(settings.googleSpreadsheetId, 128);
  }
  if (settings.googleDocId) {
    baseFields.googleDocId = clip(settings.googleDocId, 128);
  }

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        ...baseFields,
        createdAt: serverTimestamp(),
      });
      return {};
    }

    const existing = snap.data() as Record<string, unknown>;
    const hydrated: Partial<UserSettings> = {};

    // Hydrate remote student profile onto a newly signed-in device if local onboarding isn't set yet
    if (
      !settings.studentProfile?.onboardingCompleted &&
      existing.onboardingCompleted === true &&
      typeof existing.collegeDegree === 'string' &&
      typeof existing.semester === 'string' &&
      typeof existing.collegeName === 'string'
    ) {
      hydrated.studentProfile = {
        collegeDegree: existing.collegeDegree,
        semester: existing.semester,
        collegeName: existing.collegeName,
        age:
          typeof existing.age === 'number' && existing.age >= 14 && existing.age <= 80
            ? existing.age
            : 20,
        onboardingCompleted: true,
      };
      if (typeof existing.semesterLabel === 'string' && existing.semesterLabel) {
        hydrated.semesterLabel = existing.semesterLabel;
      }
    }

    if (
      !settings.googleSpreadsheetId &&
      typeof existing.googleSpreadsheetId === 'string' &&
      existing.googleSpreadsheetId
    ) {
      hydrated.googleSpreadsheetId = existing.googleSpreadsheetId;
      hydrated.googleSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${existing.googleSpreadsheetId}/edit`;
    }
    if (
      !settings.googleDocId &&
      typeof existing.googleDocId === 'string' &&
      existing.googleDocId
    ) {
      hydrated.googleDocId = existing.googleDocId;
      hydrated.googleDocUrl = `https://docs.google.com/document/d/${existing.googleDocId}/edit`;
    }

    // Preserve existing cloud profile fields when updating from a fresh device
    const updatePayload: Record<string, unknown> = { ...baseFields };
    if (hydrated.studentProfile) {
      updatePayload.collegeDegree = clip(hydrated.studentProfile.collegeDegree, 120);
      updatePayload.semester = clip(hydrated.studentProfile.semester, 40);
      updatePayload.collegeName = clip(hydrated.studentProfile.collegeName, 140);
      updatePayload.age = hydrated.studentProfile.age;
      updatePayload.onboardingCompleted = true;
      if (hydrated.semesterLabel) {
        updatePayload.semesterLabel = clip(hydrated.semesterLabel, 120);
      }
    }

    await updateDoc(ref, updatePayload);
    return hydrated;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncSessionToCloud(
  uid: string,
  session: WritingSession
): Promise<void> {
  const docId = sanitizeDocId(session.id, 'SESSION');
  const path = `users/${uid}/sessions/${docId}`;
  const ref = doc(db, 'users', uid, 'sessions', docId);
  const sanitized = sanitizeSessionPayload(session, uid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data();
      if (existing.status === 'Draft' || existing.evaluationPending === true) {
        await updateDoc(ref, {
          scores: sanitized.scores,
          totalScore: sanitized.totalScore,
          percentage: sanitized.percentage,
          cefrLevel: sanitized.cefrLevel,
          ...(sanitized.internationalMetrics
            ? { internationalMetrics: sanitized.internationalMetrics }
            : {}),
          toneVerdict: sanitized.toneVerdict,
          flowVerdict: sanitized.flowVerdict,
          feedbackImplemented: sanitized.feedbackImplemented,
          whatImproved: sanitized.whatImproved,
          strictImprovements: sanitized.strictImprovements,
          grammarFixes: sanitized.grammarFixes,
          vocabUpgrades: sanitized.vocabUpgrades,
          evaluationPending: Boolean(sanitized.evaluationPending),
          ...(sanitized.modelUsed ? { modelUsed: sanitized.modelUsed } : {}),
          status: sanitized.status,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncSlotToCloud(
  uid: string,
  slot: CalendarSlot
): Promise<void> {
  const docId = sanitizeDocId(slot.id, 'slot');
  const path = `users/${uid}/calendarSlots/${docId}`;
  const ref = doc(db, 'users', uid, 'calendarSlots', docId);
  const sanitized = sanitizeSlotPayload(slot, uid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const updates: Record<string, unknown> = {
        slotLabel: sanitized.slotLabel,
        mode: sanitized.mode,
        tone: sanitized.tone,
        promptCategory: sanitized.promptCategory,
        topic: sanitized.topic,
        targetWords: sanitized.targetWords,
        completed: sanitized.completed,
        updatedAt: serverTimestamp(),
      };
      if (sanitized.slotTime) updates.slotTime = sanitized.slotTime;
      if (sanitized.topicPrimer) updates.topicPrimer = sanitized.topicPrimer;
      if (sanitized.pivotRule) updates.pivotRule = sanitized.pivotRule;
      if (sanitized.feedbackReminder) {
        updates.feedbackReminder = sanitized.feedbackReminder;
      }
      if (sanitized.linkedSessionId) {
        updates.linkedSessionId = sanitized.linkedSessionId;
      }
      if (sanitized.suggestions) {
        updates.suggestions = sanitized.suggestions;
      }
      await updateDoc(ref, updates);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSlotFromCloud(
  uid: string,
  slotId: string
): Promise<void> {
  const docId = sanitizeDocId(slotId, 'slot');
  const path = `users/${uid}/calendarSlots/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'calendarSlots', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncVocabToCloud(
  uid: string,
  entry: VocabEntry
): Promise<void> {
  const docId = sanitizeDocId(entry.id, 'vocab');
  const path = `users/${uid}/vocabulary/${docId}`;
  const ref = doc(db, 'users', uid, 'vocabulary', docId);
  const sanitized = sanitizeVocabPayload(entry, uid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        mastered: sanitized.mastered,
        explanation: sanitized.explanation,
        contextSnippet: sanitized.contextSnippet,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteVocabFromCloud(
  uid: string,
  vocabId: string
): Promise<void> {
  const docId = sanitizeDocId(vocabId, 'vocab');
  const path = `users/${uid}/vocabulary/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'vocabulary', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function docToSession(raw: Record<string, unknown>): WritingSession {
  return {
    id: String(raw.id),
    date: String(raw.date),
    daySlot: String(raw.daySlot),
    mode: raw.mode as WritingMode,
    promptCategory: String(raw.promptCategory),
    tone: raw.tone as ToneSetting,
    topicDescription: String(raw.topicDescription),
    content: String(raw.content || ''),
    wordCount: Number(raw.wordCount || 0),
    scores: raw.scores as WritingSession['scores'],
    totalScore: Number(raw.totalScore || 0),
    percentage: Number(raw.percentage || 0),
    cefrLevel: String(raw.cefrLevel || 'B2'),
    internationalMetrics:
      raw.internationalMetrics as WritingSession['internationalMetrics'],
    toneVerdict: String(raw.toneVerdict || ''),
    flowVerdict: String(raw.flowVerdict || ''),
    feedbackImplemented: raw.feedbackImplemented as FeedbackImplementedStatus,
    whatImproved: String(raw.whatImproved || ''),
    strictImprovements: String(raw.strictImprovements || ''),
    grammarFixes: Array.isArray(raw.grammarFixes)
      ? (raw.grammarFixes as WritingSession['grammarFixes'])
      : [],
    vocabUpgrades: Array.isArray(raw.vocabUpgrades)
      ? (raw.vocabUpgrades as WritingSession['vocabUpgrades'])
      : [],
    status: raw.status === 'Draft' ? 'Draft' : 'Completed',
    evaluationPending:
      typeof raw.evaluationPending === 'boolean'
        ? raw.evaluationPending
        : undefined,
    modelUsed: typeof raw.modelUsed === 'string' ? raw.modelUsed : undefined,
    createdAt:
      typeof raw.createdAt === 'string'
        ? raw.createdAt
        : new Date().toISOString(),
  };
}

function docToSlot(raw: Record<string, unknown>): CalendarSlot {
  return {
    id: String(raw.id),
    dayOfWeek: String(raw.dayOfWeek),
    slotLabel: String(raw.slotLabel),
    slotTime: typeof raw.slotTime === 'string' ? raw.slotTime : undefined,
    scheduledDate: String(raw.scheduledDate),
    mode: raw.mode as WritingMode,
    tone: raw.tone as ToneSetting,
    promptCategory: String(raw.promptCategory),
    topic: String(raw.topic),
    topicPrimer:
      typeof raw.topicPrimer === 'string' ? raw.topicPrimer : undefined,
    pivotRule: typeof raw.pivotRule === 'string' ? raw.pivotRule : undefined,
    feedbackReminder:
      typeof raw.feedbackReminder === 'string'
        ? raw.feedbackReminder
        : undefined,
    targetWords: Number(raw.targetWords || 200),
    completed: Boolean(raw.completed),
    linkedSessionId:
      typeof raw.linkedSessionId === 'string' ? raw.linkedSessionId : undefined,
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.map(String)
      : undefined,
    isTriWeekly:
      typeof raw.isTriWeekly === 'boolean' ? raw.isTriWeekly : undefined,
    pillar: raw.pillar as CalendarSlot['pillar'],
  };
}

function docToVocab(raw: Record<string, unknown>): VocabEntry {
  return {
    id: String(raw.id),
    used: String(raw.used),
    betterAlternative: String(raw.betterAlternative),
    explanation: String(raw.explanation || ''),
    contextSnippet: String(raw.contextSnippet || ''),
    mode: raw.mode as WritingMode,
    dateAdded: String(raw.dateAdded),
    mastered: Boolean(raw.mastered),
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
  };
}

export async function syncLocalVaultWithCloud(
  user: User,
  localVault: VaultPayload
): Promise<VaultPayload> {
  const hydratedSettings = await ensureUserProfileDoc(user, localVault.settings);

  const sessionsPath = `users/${user.uid}/sessions`;
  const slotsPath = `users/${user.uid}/calendarSlots`;
  const vocabPath = `users/${user.uid}/vocabulary`;

  let cloudSessions: WritingSession[] = [];
  let cloudSlots: CalendarSlot[] = [];
  let cloudVocab: VocabEntry[] = [];

  try {
    const [sessSnap, slotSnap, vocabSnap] = await Promise.all([
      getDocs(query(collection(db, 'users', user.uid, 'sessions'), where('ownerId', '==', user.uid))),
      getDocs(query(collection(db, 'users', user.uid, 'calendarSlots'), where('ownerId', '==', user.uid))),
      getDocs(query(collection(db, 'users', user.uid, 'vocabulary'), where('ownerId', '==', user.uid))),
    ]);

    cloudSessions = sessSnap.docs.map((d) =>
      docToSession(d.data() as Record<string, unknown>)
    );
    cloudSlots = slotSnap.docs.map((d) =>
      docToSlot(d.data() as Record<string, unknown>)
    );
    cloudVocab = vocabSnap.docs.map((d) =>
      docToVocab(d.data() as Record<string, unknown>)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, sessionsPath);
  }

  const baseMerged = mergeVaultPayloads(localVault, {
    sessions: cloudSessions,
    calendarSlots: cloudSlots,
    vocabulary: cloudVocab,
  });

  const merged: VaultPayload = {
    ...baseMerged,
    settings: {
      ...baseMerged.settings,
      ...hydratedSettings,
    },
  };

  // Push any local-only records or updates up to Firestore cleanly
  const cloudSessionIds = new Set(cloudSessions.map((s) => s.id));
  const cloudSlotMap = new Map(cloudSlots.map((s) => [s.id, s]));
  const cloudVocabMap = new Map(cloudVocab.map((v) => [v.id, v]));

  const pushPromises: Promise<void>[] = [];

  for (const s of merged.sessions) {
    if (!cloudSessionIds.has(s.id)) {
      pushPromises.push(syncSessionToCloud(user.uid, s));
    }
  }
  for (const slot of merged.calendarSlots) {
    const existing = cloudSlotMap.get(slot.id);
    if (
      !existing ||
      existing.topic !== slot.topic ||
      existing.completed !== slot.completed
    ) {
      pushPromises.push(syncSlotToCloud(user.uid, slot));
    }
  }
  for (const v of merged.vocabulary) {
    const existing = cloudVocabMap.get(v.id);
    if (!existing || existing.mastered !== v.mastered) {
      pushPromises.push(syncVocabToCloud(user.uid, v));
    }
  }

  if (pushPromises.length > 0) {
    await Promise.all(pushPromises);
  }

  void slotsPath;
  void vocabPath;
  return merged;
}

export function subscribeToCloudVault(
  uid: string,
  callbacks: {
    onSessions: (sessions: WritingSession[]) => void;
    onSlots: (slots: CalendarSlot[]) => void;
    onVocab: (vocab: VocabEntry[]) => void;
    onError?: (error: Error) => void;
  }
): () => void {
  const sessionsPath = `users/${uid}/sessions`;
  const slotsPath = `users/${uid}/calendarSlots`;
  const vocabPath = `users/${uid}/vocabulary`;

  const unsubs: Unsubscribe[] = [];

  const handleSubError = (error: unknown, path: string) => {
    if (callbacks.onError) {
      callbacks.onError(
        error instanceof Error ? error : new Error(`Firestore sync error on ${path}`)
      );
      return;
    }
    handleFirestoreError(error, OperationType.GET, path);
  };

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'sessions'), where('ownerId', '==', uid)),
      (snap) => {
        callbacks.onSessions(
          snap.docs.map((d) => docToSession(d.data() as Record<string, unknown>))
        );
      },
      (error) => {
        handleSubError(error, sessionsPath);
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'calendarSlots'), where('ownerId', '==', uid)),
      (snap) => {
        callbacks.onSlots(
          snap.docs.map((d) => docToSlot(d.data() as Record<string, unknown>))
        );
      },
      (error) => {
        handleSubError(error, slotsPath);
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'vocabulary'), where('ownerId', '==', uid)),
      (snap) => {
        callbacks.onVocab(
          snap.docs.map((d) => docToVocab(d.data() as Record<string, unknown>))
        );
      },
      (error) => {
        handleSubError(error, vocabPath);
      }
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

export async function purgePredefinedCloudRecords(
  uid: string,
  ids: { sessionIds: string[]; slotIds: string[]; vocabIds: string[] }
): Promise<void> {
  const deletions: Promise<void>[] = [];

  for (const sid of ids.sessionIds) {
    const docId = sanitizeDocId(sid, 'SESSION');
    const path = `users/${uid}/sessions/${docId}`;
    deletions.push(
      deleteDoc(doc(db, 'users', uid, 'sessions', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      )
    );
  }

  for (const slotId of ids.slotIds) {
    const docId = sanitizeDocId(slotId, 'slot');
    const path = `users/${uid}/calendarSlots/${docId}`;
    deletions.push(
      deleteDoc(doc(db, 'users', uid, 'calendarSlots', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      )
    );
  }

  for (const vocabId of ids.vocabIds) {
    const docId = sanitizeDocId(vocabId, 'vocab');
    const path = `users/${uid}/vocabulary/${docId}`;
    deletions.push(
      deleteDoc(doc(db, 'users', uid, 'vocabulary', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      )
    );
  }

  if (deletions.length > 0) {
    await Promise.all(deletions);
  }
}

export async function clearAllSlotsFromCloud(
  uid: string,
  slotIds: string[]
): Promise<void> {
  if (slotIds.length === 0) return;
  await Promise.all(
    slotIds.map((slotId) => deleteSlotFromCloud(uid, slotId))
  );
}

