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
import {
  VALID_CLOUD_MODES,
  mergeHydratedProfileSettings,
  normalizeCloudMode,
  parseFirestoreTimestamp,
} from './cloudSyncHelpers';

export {
  VALID_CLOUD_MODES,
  mergeHydratedProfileSettings,
  normalizeCloudMode,
  parseFirestoreTimestamp,
};

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
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
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

const VALID_TONES: ToneSetting[] = [
  'professional-warm',
  'conversational',
  'formal-executive',
  'academic-technical',
  'crisp-direct',
  'narrative-vivid',
];

function validMode(m: WritingMode | 'converse'): WritingMode | 'converse' {
  return normalizeCloudMode(m);
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
  if (typeof session.spokenReadinessScore === 'number' && Number.isFinite(session.spokenReadinessScore)) {
    payload.spokenReadinessScore = Math.max(0, Math.min(100, Math.round(session.spokenReadinessScore)));
  }
  if (typeof session.signalNoiseRatio === 'number' && Number.isFinite(session.signalNoiseRatio)) {
    payload.signalNoiseRatio = Math.max(0, Math.min(100, Math.round(session.signalNoiseRatio)));
  }
  if (session.audienceReaction) {
    payload.audienceReaction = clip(session.audienceReaction, 400);
  }
  if (session.audience) {
    payload.audience = clip(session.audience, 40);
  }
  if (Array.isArray(session.calqueFixes) && session.calqueFixes.length > 0) {
    payload.calqueFixes = session.calqueFixes.slice(0, 15).map((c) => ({
      phrase: clip(c.phrase, 120),
      naturalAlternative: clip(c.naturalAlternative, 160),
      reason: clip(c.reason, 220),
    }));
  }
  if (
    session.drillType === 'standard' ||
    session.drillType === 'compression-432' ||
    session.drillType === 'skeleton' ||
    session.drillType === 'three-rooms' ||
    session.drillType === 'time-capsule'
  ) {
    payload.drillType = session.drillType;
  }
  if (session.drillMeta && typeof session.drillMeta === 'object') {
    const dm: Record<string, unknown> = {
      drillType: session.drillMeta.drillType || 'standard',
    };
    if (session.drillMeta.audience) dm.audience = clip(session.drillMeta.audience, 40);
    if (session.drillMeta.constraintLabel) dm.constraintLabel = clip(session.drillMeta.constraintLabel, 140);
    if (typeof session.drillMeta.constraintViolations === 'number') {
      dm.constraintViolations = Math.max(0, Math.min(100, Math.round(session.drillMeta.constraintViolations)));
    }
    if (typeof session.drillMeta.flowSprintUsed === 'boolean') dm.flowSprintUsed = session.drillMeta.flowSprintUsed;
    if (typeof session.drillMeta.compressionRatio === 'number') dm.compressionRatio = session.drillMeta.compressionRatio;
    if (session.drillMeta.skeletonTitle) dm.skeletonTitle = clip(session.drillMeta.skeletonTitle, 160);
    if (session.drillMeta.timeCapsuleOriginSessionId) {
      dm.timeCapsuleOriginSessionId = clip(session.drillMeta.timeCapsuleOriginSessionId, 128);
    }
    if (typeof session.drillMeta.timeCapsuleOriginScore === 'number') {
      dm.timeCapsuleOriginScore = session.drillMeta.timeCapsuleOriginScore;
    }
    payload.drillMeta = dm;
  }
  if (session.drillVerdict && typeof session.drillVerdict === 'object') {
    const dv: Record<string, unknown> = {
      headline: clip(session.drillVerdict.headline, 180),
      summary: clip(session.drillVerdict.summary, 600),
    };
    if (session.drillVerdict.badge) dv.badge = clip(session.drillVerdict.badge, 80);
    if (typeof session.drillVerdict.compressionRatio === 'number') dv.compressionRatio = session.drillVerdict.compressionRatio;
    if (typeof session.drillVerdict.registerShiftScore === 'number') dv.registerShiftScore = session.drillVerdict.registerShiftScore;
    if (typeof session.drillVerdict.timeCapsuleDelta === 'number') dv.timeCapsuleDelta = session.drillVerdict.timeCapsuleDelta;
    payload.drillVerdict = dv;
  }
  if (session.revisionOfSessionId) {
    payload.revisionOfSessionId = clip(session.revisionOfSessionId, 128);
  }
  if (typeof session.revisionDelta === 'number' && Number.isFinite(session.revisionDelta)) {
    payload.revisionDelta = Math.max(-60, Math.min(60, Number(session.revisionDelta.toFixed(1))));
  }
  if (Array.isArray(session.edits) && session.edits.length > 0) {
    payload.edits = session.edits.slice(0, 12).map((e) => ({
      original: clip(e.original, 220),
      improved: clip(e.improved, 220),
      dimension: clip(e.dimension, 24),
      errorTag: clip(e.errorTag, 40),
      rule: clip(e.rule, 200),
    }));
  }
  if (session.toneCheck && typeof session.toneCheck === 'object') {
    payload.toneCheck = {
      match: clip(session.toneCheck.match, 24),
      audienceReaction: clip(session.toneCheck.audienceReaction, 260),
      toneFix: clip(session.toneCheck.toneFix, 200),
    };
  }
  if (session.nextDraftPriority) {
    payload.nextDraftPriority = clip(session.nextDraftPriority, 240);
  }
  if (session.targetCheck && typeof session.targetCheck === 'object') {
    payload.targetCheck = {
      mechanicsStatus: clip(session.targetCheck.mechanicsStatus || 'Baseline', 24),
      mechanicsNote: clip(session.targetCheck.mechanicsNote || '', 260),
      vocabUsed: (session.targetCheck.vocabUsed || []).slice(0, 12).map((v) => clip(v, 120)),
      vocabMissed: (session.targetCheck.vocabMissed || []).slice(0, 12).map((v) => clip(v, 120)),
    };
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
  if (
    slot.recommendedDrill === 'standard' ||
    slot.recommendedDrill === 'compression-432' ||
    slot.recommendedDrill === 'skeleton' ||
    slot.recommendedDrill === 'three-rooms' ||
    slot.recommendedDrill === 'time-capsule'
  ) {
    payload.recommendedDrill = slot.recommendedDrill;
  }
  if (typeof slot.isConverseSlot === 'boolean') {
    payload.isConverseSlot = slot.isConverseSlot;
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
  const cat = entry.category || entry.aiCategory;
  if (cat) {
    payload.category = clip(cat, 60);
  }
  const uCount = typeof entry.usageCount === 'number' ? entry.usageCount : entry.correctUseCount;
  if (typeof uCount === 'number' && Number.isFinite(uCount)) {
    payload.usageCount = Math.max(0, Math.min(500, Math.round(uCount)));
  }
  if (
    entry.masteryStage === 'new' ||
    entry.masteryStage === 'emerging' ||
    entry.masteryStage === 'building' ||
    entry.masteryStage === 'mastered'
  ) {
    payload.masteryStage = entry.masteryStage;
  }
  return payload;
}

export async function ensureUserProfileDoc(
  user: User,
  settings: UserSettings
): Promise<Partial<UserSettings>> {
  if (!db) return {};
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
  if (typeof settings.customCoachPrompt === 'string') {
    baseFields.customCoachPrompt = clip(settings.customCoachPrompt, 500);
  }
  if (Array.isArray(settings.coachPresets)) {
    baseFields.coachPresets = settings.coachPresets
      .slice(0, 8)
      .map((p) => clip(p, 60));
  }
  if (typeof settings.tactileSoundEnabled === 'boolean') {
    baseFields.tactileSoundEnabled = settings.tactileSoundEnabled;
  }
  if (typeof settings.vaultLatchEnabled === 'boolean') {
    baseFields.vaultLatchEnabled = settings.vaultLatchEnabled;
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
    const hydrated = mergeHydratedProfileSettings(settings, existing);

    // Preserve hydrated cloud settings when updating from a fresh device instead of clobbering with local defaults
    const updatePayload: Record<string, unknown> = { ...baseFields };
    if (hydrated.semesterLabel) {
      updatePayload.semesterLabel = clip(hydrated.semesterLabel, 120);
    }
    if (typeof hydrated.dailyWordGoal === 'number') {
      updatePayload.dailyWordGoal = hydrated.dailyWordGoal;
    }
    if (typeof hydrated.autoSaveVocab === 'boolean') {
      updatePayload.autoSaveVocab = hydrated.autoSaveVocab;
    }
    if (typeof hydrated.focusModeDefault === 'boolean') {
      updatePayload.focusModeDefault = hydrated.focusModeDefault;
    }
    if (typeof hydrated.autoReloadSchedule === 'boolean') {
      updatePayload.autoReloadSchedule = hydrated.autoReloadSchedule;
    }
    if (hydrated.studentProfile) {
      updatePayload.collegeDegree = clip(hydrated.studentProfile.collegeDegree, 120);
      updatePayload.semester = clip(hydrated.studentProfile.semester, 40);
      updatePayload.collegeName = clip(hydrated.studentProfile.collegeName, 140);
      updatePayload.age = hydrated.studentProfile.age;
      updatePayload.onboardingCompleted = true;
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
  if (!db) return;
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
      const existingModel =
        typeof existing.modelUsed === 'string' ? existing.modelUsed.trim().toLowerCase() : '';
      const existingWasOffline =
        existingModel === 'offline-rubric' ||
        existingModel === 'offline-local' ||
        existingModel === 'local-offline' ||
        existingModel === 'offline-conversation' ||
        existingModel === 'queued-pending-reset';
      if (
        existing.status === 'Draft' ||
        existing.evaluationPending === true ||
        existingWasOffline
      ) {
        await updateDoc(ref, {
          content: sanitized.content,
          wordCount: sanitized.wordCount,
          topicDescription: sanitized.topicDescription,
          scores: sanitized.scores,
          totalScore: sanitized.totalScore,
          percentage: sanitized.percentage,
          cefrLevel: sanitized.cefrLevel,
          ...(sanitized.internationalMetrics
            ? { internationalMetrics: sanitized.internationalMetrics }
            : {}),
          ...(typeof sanitized.spokenReadinessScore === 'number'
            ? { spokenReadinessScore: sanitized.spokenReadinessScore }
            : {}),
          ...(typeof sanitized.signalNoiseRatio === 'number'
            ? { signalNoiseRatio: sanitized.signalNoiseRatio }
            : {}),
          ...(sanitized.audienceReaction
            ? { audienceReaction: sanitized.audienceReaction }
            : {}),
          ...(sanitized.audience ? { audience: sanitized.audience } : {}),
          ...(sanitized.calqueFixes ? { calqueFixes: sanitized.calqueFixes } : {}),
          ...(sanitized.drillType ? { drillType: sanitized.drillType } : {}),
          ...(sanitized.drillMeta ? { drillMeta: sanitized.drillMeta } : {}),
          ...(sanitized.drillVerdict ? { drillVerdict: sanitized.drillVerdict } : {}),
          ...(sanitized.revisionOfSessionId
            ? { revisionOfSessionId: sanitized.revisionOfSessionId }
            : {}),
          ...(typeof sanitized.revisionDelta === 'number'
            ? { revisionDelta: sanitized.revisionDelta }
            : {}),
          ...(sanitized.edits ? { edits: sanitized.edits } : {}),
          ...(sanitized.toneCheck ? { toneCheck: sanitized.toneCheck } : {}),
          ...(sanitized.nextDraftPriority
            ? { nextDraftPriority: sanitized.nextDraftPriority }
            : {}),
          ...(sanitized.targetCheck
            ? { targetCheck: sanitized.targetCheck }
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
  if (!db) return;
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
      if (sanitized.recommendedDrill) {
        updates.recommendedDrill = sanitized.recommendedDrill;
      }
      if (typeof sanitized.isConverseSlot === 'boolean') {
        updates.isConverseSlot = sanitized.isConverseSlot;
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
  if (!db) return;
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
  if (!db) return;
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
        ...(sanitized.category ? { category: sanitized.category } : {}),
        ...(typeof sanitized.usageCount === 'number'
          ? { usageCount: sanitized.usageCount }
          : {}),
        ...(sanitized.masteryStage ? { masteryStage: sanitized.masteryStage } : {}),
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
  if (!db) return;
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
    spokenReadinessScore:
      typeof raw.spokenReadinessScore === 'number'
        ? raw.spokenReadinessScore
        : undefined,
    signalNoiseRatio:
      typeof raw.signalNoiseRatio === 'number'
        ? raw.signalNoiseRatio
        : undefined,
    audienceReaction:
      typeof raw.audienceReaction === 'string'
        ? raw.audienceReaction
        : undefined,
    audience:
      typeof raw.audience === 'string'
        ? (raw.audience as WritingSession['audience'])
        : undefined,
    calqueFixes: Array.isArray(raw.calqueFixes)
      ? (raw.calqueFixes as WritingSession['calqueFixes'])
      : undefined,
    drillType:
      typeof raw.drillType === 'string'
        ? (raw.drillType as WritingSession['drillType'])
        : undefined,
    drillMeta:
      raw.drillMeta && typeof raw.drillMeta === 'object'
        ? (raw.drillMeta as WritingSession['drillMeta'])
        : undefined,
    drillVerdict:
      raw.drillVerdict && typeof raw.drillVerdict === 'object'
        ? (raw.drillVerdict as WritingSession['drillVerdict'])
        : undefined,
    revisionOfSessionId:
      typeof raw.revisionOfSessionId === 'string'
        ? raw.revisionOfSessionId
        : undefined,
    revisionDelta:
      typeof raw.revisionDelta === 'number' ? raw.revisionDelta : undefined,
    edits: Array.isArray(raw.edits)
      ? (raw.edits as WritingSession['edits'])
      : undefined,
    toneCheck:
      raw.toneCheck && typeof raw.toneCheck === 'object'
        ? (raw.toneCheck as WritingSession['toneCheck'])
        : undefined,
    nextDraftPriority:
      typeof raw.nextDraftPriority === 'string'
        ? raw.nextDraftPriority
        : undefined,
    targetCheck:
      raw.targetCheck && typeof raw.targetCheck === 'object'
        ? (raw.targetCheck as WritingSession['targetCheck'])
        : undefined,
    status: raw.status === 'Draft' ? 'Draft' : 'Completed',
    evaluationPending:
      typeof raw.evaluationPending === 'boolean'
        ? raw.evaluationPending
        : undefined,
    modelUsed: typeof raw.modelUsed === 'string' ? raw.modelUsed : undefined,
    createdAt: parseFirestoreTimestamp(raw.createdAt),
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
    recommendedDrill:
      typeof raw.recommendedDrill === 'string'
        ? (raw.recommendedDrill as CalendarSlot['recommendedDrill'])
        : undefined,
    isConverseSlot:
      typeof raw.isConverseSlot === 'boolean' ? raw.isConverseSlot : undefined,
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
    category: typeof raw.category === 'string' ? raw.category : undefined,
    aiCategory: typeof raw.category === 'string' ? raw.category : undefined,
    usageCount: typeof raw.usageCount === 'number' ? raw.usageCount : undefined,
    correctUseCount: typeof raw.usageCount === 'number' ? raw.usageCount : undefined,
    masteryStage:
      typeof raw.masteryStage === 'string'
        ? (raw.masteryStage as VocabEntry['masteryStage'])
        : undefined,
  };
}

export async function syncLocalVaultWithCloud(
  user: User,
  localVault: VaultPayload
): Promise<VaultPayload> {
  if (!db) return localVault;
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
  if (!db) return () => {};
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
  if (!db) return;
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

