import test from 'node:test';
import assert from 'node:assert/strict';
import type { WritingSession } from '../types';
import {
  computeNextRetryDelayMs,
  isOfflineEvaluatedSession,
  isSessionLoggedInLedger,
  needsAiEvaluation,
  parseHealthAvailability,
} from './offlineAiQueue';

function makeSession(overrides: Partial<WritingSession> = {}): WritingSession {
  return {
    id: 'SESSION_20261127_TEST',
    date: '2026-11-27',
    daySlot: 'Friday · Lab Report',
    mode: 'technical',
    promptCategory: 'Technical & Interview',
    tone: 'academic-technical',
    topicDescription: 'Voltage regulator drift diagnosis',
    content:
      'During our lab test, the regulator drifted under load. We traced a loose ground jumper and added a decoupling capacitor.',
    wordCount: 21,
    scores: {
      naturalVoiceFlow: 7,
      claritySimplicity: 7,
      grammarMechanics: 8,
      toneEngagement: 7,
      sentenceVarietyCadence: 7,
      concisenessDirectness: 8,
    },
    totalScore: 44,
    percentage: 73,
    cefrLevel: 'B2',
    toneVerdict: 'Clear technical voice.',
    flowVerdict: 'Steady cadence.',
    feedbackImplemented: 'Baseline',
    whatImproved: 'Clear structure.',
    strictImprovements: 'Add measured voltage values.',
    grammarFixes: [],
    vocabUpgrades: [],
    status: 'Completed',
    evaluationPending: false,
    modelUsed: 'gemini-4-hydrogen',
    createdAt: '2026-11-27T10:00:00.000Z',
    ...overrides,
  };
}

test('isOfflineEvaluatedSession detects offline-rubric, queued-pending-reset, and routingMeta offline markers', () => {
  assert.equal(isOfflineEvaluatedSession({ modelUsed: 'offline-rubric' }), true);
  assert.equal(isOfflineEvaluatedSession({ modelUsed: 'queued-pending-reset' }), true);
  assert.equal(
    isOfflineEvaluatedSession({
      modelUsed: 'custom',
      routingMeta: { model: 'offline-rubric' },
    }),
    true
  );
  assert.equal(isOfflineEvaluatedSession({ modelUsed: 'gemini-4-hydrogen' }), false);
  assert.equal(isOfflineEvaluatedSession({ modelUsed: 'gemini-3.1-flash-lite' }), false);
});

test('needsAiEvaluation queues offline-evaluated sessions (new & legacy) and pending drafts, but skips regular drafts and AI-completed sessions', () => {
  const aiDone = makeSession({
    status: 'Completed',
    evaluationPending: false,
    modelUsed: 'gemini-4-hydrogen',
  });
  assert.equal(needsAiEvaluation(aiDone), false);

  const newlyOffline = makeSession({
    status: 'Completed',
    evaluationPending: true,
    modelUsed: 'offline-rubric',
  });
  assert.equal(needsAiEvaluation(newlyOffline), true);

  // Legacy offline session logged earlier without evaluationPending=true
  const legacyOffline = makeSession({
    status: 'Completed',
    evaluationPending: false,
    modelUsed: 'offline-rubric',
  });
  assert.equal(needsAiEvaluation(legacyOffline), true);

  const slowApiPendingDraft = makeSession({
    status: 'Draft',
    evaluationPending: true,
    totalScore: 0,
    modelUsed: undefined,
  });
  assert.equal(needsAiEvaluation(slowApiPendingDraft), true);

  const ordinaryDraft = makeSession({
    status: 'Draft',
    evaluationPending: false,
    totalScore: 0,
    modelUsed: undefined,
  });
  assert.equal(needsAiEvaluation(ordinaryDraft), false);

  const tooShortOffline = makeSession({
    content: 'Too short.',
    evaluationPending: true,
    modelUsed: 'offline-rubric',
  });
  assert.equal(needsAiEvaluation(tooShortOffline), false);
});

test('isSessionLoggedInLedger logs offline-evaluated sessions with scores while excluding empty slow-API draft placeholders', () => {
  const offlineLogged = makeSession({
    status: 'Completed',
    evaluationPending: true,
    totalScore: 44,
    modelUsed: 'offline-rubric',
  });
  assert.equal(isSessionLoggedInLedger(offlineLogged), true);

  const slowDraftPlaceholder = makeSession({
    status: 'Draft',
    evaluationPending: true,
    totalScore: 0,
    modelUsed: undefined,
  });
  assert.equal(isSessionLoggedInLedger(slowDraftPlaceholder), false);

  const aiDone = makeSession({
    status: 'Completed',
    evaluationPending: false,
    totalScore: 51,
    modelUsed: 'gemini-4-hydrogen',
  });
  assert.equal(isSessionLoggedInLedger(aiDone), true);
});

test('computeNextRetryDelayMs respects server cooldown and clamps exponential backoff cleanly', () => {
  assert.equal(computeNextRetryDelayMs(0), 8_000);
  assert.equal(computeNextRetryDelayMs(1), 15_000);
  assert.equal(computeNextRetryDelayMs(2), 30_000);
  assert.equal(computeNextRetryDelayMs(10), 90_000);
  assert.equal(computeNextRetryDelayMs(0, 18), 18_000);
  assert.equal(computeNextRetryDelayMs(0, 2), 5_000);
  assert.equal(computeNextRetryDelayMs(0, 500), 90_000);
});

test('parseHealthAvailability interprets reachable, busy, and offline /api/health snapshots', () => {
  assert.deepEqual(parseHealthAvailability(null), {
    reachable: false,
    aiAvailable: false,
    hasKey: false,
    nextAvailableInSeconds: 15,
  });

  const healthy = parseHealthAvailability({
    ok: true,
    hasKey: true,
    activeModel: 'gemini-4-hydrogen',
    aiAvailable: true,
    nextAvailableInSeconds: 0,
    tiers: [
      { model: 'gemini-4-hydrogen', available: true, cooldownSeconds: 0, unsupportedSeconds: 0 },
    ],
  });
  assert.equal(healthy.reachable, true);
  assert.equal(healthy.aiAvailable, true);
  assert.equal(healthy.nextAvailableInSeconds, 0);

  const cooling = parseHealthAvailability({
    ok: true,
    hasKey: true,
    tiers: [
      { model: 'gemini-4-hydrogen', available: false, cooldownSeconds: 14, unsupportedSeconds: 0 },
      { model: 'gemini-2.5-flash-lite', available: false, cooldownSeconds: 0, unsupportedSeconds: 1700 },
    ],
  });
  assert.equal(cooling.reachable, true);
  assert.equal(cooling.aiAvailable, false);
  assert.equal(cooling.nextAvailableInSeconds, 14);
});
