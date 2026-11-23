import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeConversationMetrics,
  buildConversationSystemInstruction,
  buildConversationTranscript,
  createCustomConversationScenario,
  detectUsedTargetWords,
  getConversationScenarios,
  sanitizeConversationTurnResponse,
  selectConversationTurnRoute,
} from './conversationEngine';
import type { ConversationMessage } from '../types';

test('getConversationScenarios personalizes technical interview opening to student degree', () => {
  const scenarios = getConversationScenarios({
    displayName: 'Aarav',
    collegeDegree: 'B.E. Electronics & Instrumentation',
    semester: '6th Semester',
    collegeName: 'CIT',
    age: 20,
    onboardingCompleted: true,
  });
  assert.equal(scenarios.length, 6);
  const tech = scenarios.find((s) => s.id === 'technical-interview');
  assert.ok(tech);
  assert.match(tech.openingLine, /Electronics & Instrumentation/i);
  assert.equal(tech.mode, 'technical');
});

test('createCustomConversationScenario builds a clean custom roleplay scenario', () => {
  const custom = createCustomConversationScenario('Negotiating an internship stipend politely');
  assert.equal(custom.isCustom, true);
  assert.match(custom.openingLine, /Negotiating an internship stipend politely/);
  assert.ok(custom.initialSparks.length >= 2);
});

test('analyzeConversationMetrics gates evaluation until >= 2 user turns and >= 20 user words', () => {
  const tooShort: ConversationMessage[] = [
    { id: '1', role: 'partner', text: 'Hey, tell me about your project.', timestamp: '10:00' },
    { id: '2', role: 'user', text: 'I built a temperature controller.', timestamp: '10:01' },
  ];
  const m1 = analyzeConversationMetrics(tooShort, ['stabilized', 'controller']);
  assert.equal(m1.canEvaluate, false);
  assert.equal(m1.turnsNeeded, 1);
  assert.ok(m1.wordsNeeded > 0);
  assert.deepEqual(m1.usedTargetVocab, ['controller']);

  const ready: ConversationMessage[] = [
    ...tooShort,
    { id: '3', role: 'partner', text: 'How did you keep it steady?', timestamp: '10:02' },
    {
      id: '4',
      role: 'user',
      text: 'We measured the residual error continuously and tuned the derivative gain until the output stabilized smoothly without oscillating during disturbances.',
      timestamp: '10:03',
    },
  ];
  const m2 = analyzeConversationMetrics(ready, ['stabilized', 'resolved']);
  assert.equal(m2.canEvaluate, true);
  assert.equal(m2.userTurnCount, 2);
  assert.ok(m2.totalUserWords >= 24);
  assert.deepEqual(m2.usedTargetVocab, ['stabilized']);
});

test('buildConversationTranscript separates user-only text from full dialogue transcript', () => {
  const scenario = getConversationScenarios()[0];
  const msgs: ConversationMessage[] = [
    { id: '1', role: 'partner', text: 'Welcome! What are you working on?', timestamp: '10:00' },
    { id: '2', role: 'user', text: 'I am tuning a closed-loop thermal chamber.', timestamp: '10:01' },
    { id: '3', role: 'partner', text: 'Nice—what broke first?', timestamp: '10:02' },
    { id: '4', role: 'user', text: 'The sensor lag caused overshoot until we added derivative damping.', timestamp: '10:03' },
  ];
  const { userTurnsText, dialogueTranscript } = buildConversationTranscript(msgs, scenario);
  assert.ok(!userTurnsText.includes('Welcome!'));
  assert.ok(userTurnsText.includes('closed-loop thermal chamber'));
  assert.ok(userTurnsText.includes('derivative damping'));
  assert.match(dialogueTranscript, /Maya Chen: Welcome!/);
  assert.match(dialogueTranscript, /You: I am tuning/);
});

test('selectConversationTurnRoute favors Flash Lite fast path and cascades across all 5 Gemini generations on cooldown', () => {
  const fastRoute = selectConversationTurnRoute({ pace: 'natural', turnCount: 2 });
  assert.equal(fastRoute.primary.model, 'gemini-3.1-flash-lite');
  assert.equal(fastRoute.primary.thinkingLabel, 'MINIMAL');
  assert.ok(fastRoute.cascade.length >= 5);

  const challengingRoute = selectConversationTurnRoute({ pace: 'challenging', turnCount: 2 });
  assert.equal(challengingRoute.primary.model, 'gemini-3.1-flash-lite');
  assert.equal(challengingRoute.primary.thinkingLabel, 'LOW');

  const now = 100_000;
  // When Flash Lite 3.1 cools down, natural pace cascades immediately to Gemini 3 Flash Low
  const failover1 = selectConversationTurnRoute({
    pace: 'natural',
    turnCount: 3,
    cooldownUntil: { 'gemini-3.1-flash-lite': now + 20_000 },
    now,
  });
  assert.equal(failover1.primary.model, 'gemini-3-flash-preview');
  assert.equal(failover1.primary.thinkingLabel, 'LOW');

  // When Flash Lite 3.1, Gemini 3 Flash, and Hydrogen all cool down -> Flash 2.5 Lite safety floor
  const failoverDeep = selectConversationTurnRoute({
    pace: 'natural',
    turnCount: 3,
    cooldownUntil: {
      'gemini-3.1-flash-lite': now + 20_000,
      'gemini-3-flash-preview': now + 20_000,
      'gemini-4-hydrogen': now + 20_000,
    },
    now,
  });
  assert.equal(failoverDeep.primary.model, 'gemini-2.5-flash-lite');
  assert.equal(failoverDeep.primary.thinkingLabel, 'STANDARD');
});

test('sanitizeConversationTurnResponse grounds recasts strictly to user draft and strips robotic AI prefixes', () => {
  const userMsg = 'I am agree that feedback control is one of the most important part.';
  const cleaned = sanitizeConversationTurnResponse(
    {
      reply: 'As an AI language model, I think that makes sense. Can you share an example from lab?',
      hasRecast: true,
      gentleRecast: {
        original: 'I am agree',
        naturalVersion: 'I agree',
        tip: '"Agree" is already a verb, so drop "am".',
      },
      replySparks: ['Give a quick thermostat analogy', 'Describe a lab PID experiment'],
    },
    userMsg
  );
  assert.ok(!cleaned.reply.toLowerCase().includes('as an ai'));
  assert.ok(cleaned.recast);
  assert.equal(cleaned.recast?.naturalVersion, 'I agree');
  assert.equal(cleaned.replySparks.length, 2);

  // Hallucinated recast not found in user message MUST be dropped
  const ungrounded = sanitizeConversationTurnResponse(
    {
      reply: 'Sounds solid! What happened next?',
      hasRecast: true,
      gentleRecast: {
        original: 'phrase that user never wrote',
        naturalVersion: 'better phrase',
        tip: 'Made up tip.',
      },
      replySparks: [],
    },
    userMsg
  );
  assert.equal(ungrounded.recast, null);
});

test('buildConversationSystemInstruction enforces strict conversation-only persona guardrails', () => {
  const scenario = getConversationScenarios()[1];
  const sys = buildConversationSystemInstruction({
    scenario,
    pace: 'natural',
    practicingVocab: ['stabilized'],
  });
  assert.match(sys, /STRICT CONVERSATION-ONLY RULES/);
  assert.match(sys, /NEVER break character/);
  assert.match(sys, /1–3 concise, natural sentences/);
  assert.match(sys, /stabilized/);
});

test('detectUsedTargetWords handles simple inflections without substring false positives', () => {
  const hits = detectUsedTargetWords(
    'The loop stabilized quickly after we resolved the noise spike.',
    ['stabilize', 'resolve', 'art']
  );
  assert.deepEqual(hits, ['stabilize', 'resolve']);
});
