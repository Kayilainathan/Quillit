import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildErrorEnvelope,
  ConverseTurnRequestSchema,
  EvaluateRequestSchema,
  extractSafeJsonObject,
  SkeletonPassageRequestSchema,
} from './validation';
import {
  ACTIVE_GEMINI_TEXT_MODELS,
  MODEL_CAPABILITIES,
} from '../../src/utils/evaluationRouter';

test('EvaluateRequestSchema validates v3.1 fields including drillContext and customCoachPrompt', () => {
  const valid = EvaluateRequestSchema.safeParse({
    content: 'In a closed-loop PID controller, integral windup happens when the actuator saturates.',
    mode: 'Technical Concept',
    tone: 'Academic / Technical',
    audience: 'Interviewer',
    customCoachPrompt: 'Be direct and point out passive voice.',
    coachPresets: ['brutally-honest', 'technical-interview-clarity'],
    drillContext: {
      drillType: 'compression-432',
      rounds: ['Round 1 text', 'Round 2 text', 'Round 3 text'],
      constraintLabel: 'Zero filler words',
      constraintPassed: true,
    },
  });
  assert.equal(valid.success, true);

  const tooLongCustom = EvaluateRequestSchema.safeParse({
    content: 'Valid enough content for testing schema limits cleanly.',
    customCoachPrompt: 'x'.repeat(550),
  });
  assert.equal(tooLongCustom.success, false);
});

test('extractSafeJsonObject safely parses fenced, raw, and prefixed JSON payloads', () => {
  assert.deepEqual(extractSafeJsonObject('{"score": 48, "ok": true}'), {
    score: 48,
    ok: true,
  });
  assert.deepEqual(
    extractSafeJsonObject('Here is your result:\n```json\n{"headline":"Sharp"}\n```'),
    { headline: 'Sharp' }
  );
  assert.throws(() => extractSafeJsonObject('not valid json at all'));
});

test('buildErrorEnvelope returns structured error metadata without leaking secrets', () => {
  const env = buildErrorEnvelope({
    code: 'VALIDATION_ERROR',
    message: 'Content is too short.',
    retryable: false,
    requestId: 'req_123',
    startedAtMs: Date.now() - 25,
  });
  assert.equal(env.ok, false);
  assert.equal(env.data, null);
  assert.equal(env.error.code, 'VALIDATION_ERROR');
  assert.equal(env.meta.requestId, 'req_123');
  assert.ok(env.meta.latencyMs >= 0);
});

test('ConverseTurnRequestSchema and SkeletonPassageRequestSchema validate bounds', () => {
  const conv = ConverseTurnRequestSchema.safeParse({
    scenario: {
      id: 'interview-1',
      title: 'PID Interview',
      personaName: 'Priya',
    },
    latestUserMessage: 'We used anti-windup clamping on the integrator term.',
    customCoachPrompt: 'Keep replies concise.',
    coachPresets: ['short-punchy-sentences'],
  });
  assert.equal(conv.success, true);

  const skel = SkeletonPassageRequestSchema.safeParse({
    mode: 'technical',
    topic: 'Why PID control prevents thermal overshoot',
    domain: 'technical',
    focusTheme: 'PID control tuning',
  });
  assert.equal(skel.success, true);

  const skelInvalidDomain = SkeletonPassageRequestSchema.safeParse({
    mode: 'technical',
    domain: 'invalid-domain',
  });
  assert.equal(skelInvalidDomain.success, false);
});

test('5-generation Gemini cascade preserves exact PSR-10 order and capability guards', () => {
  assert.deepEqual(ACTIVE_GEMINI_TEXT_MODELS, [
    'gemini-4-hydrogen',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ]);
  assert.equal(MODEL_CAPABILITIES['gemini-4-hydrogen'].supportsThinkingLevel, true);
  assert.equal(MODEL_CAPABILITIES['gemini-4-hydrogen'].supportsMinimalThinking, false);
  assert.equal(MODEL_CAPABILITIES['gemini-3.1-flash-lite'].supportsThinkingLevel, true);
  assert.equal(MODEL_CAPABILITIES['gemini-2.5-flash'].supportsThinkingLevel, false);
  assert.equal(MODEL_CAPABILITIES['gemini-2.5-flash-lite'].supportsThinkingLevel, false);
});
