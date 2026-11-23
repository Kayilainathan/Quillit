import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONVERSATION_BENCHMARK_PARAMETERS,
  aggregateConversationTelemetry,
  buildOfflineConversationBenchmark,
  calibrateConversationBenchmark,
  classifyTempoBand,
  computeBenchmarkIndex,
  computeInTimeComposite,
  computeTurnTimingScore,
  deriveBenchmarkTier,
  formatConversationBenchmarkMarkdown,
  mapBenchmarkToRubricScores,
} from './conversationBenchmark';
import type { ConversationMessage } from '../types';

test('CONVERSATION_BENCHMARK_PARAMETERS weights sum to 100 and vocabulary carries lowest weightage', () => {
  const totalWeight = CONVERSATION_BENCHMARK_PARAMETERS.reduce(
    (sum, p) => sum + p.weight,
    0
  );
  assert.equal(totalWeight, 100);

  const vocabParam = CONVERSATION_BENCHMARK_PARAMETERS.find(
    (p) => p.key === 'vocabularyPrecision'
  );
  assert.ok(vocabParam);
  const minWeight = Math.min(
    ...CONVERSATION_BENCHMARK_PARAMETERS.map((p) => p.weight)
  );
  assert.equal(vocabParam.weight, minWeight);
  assert.equal(vocabParam.weight, 6);
});

test('computeTurnTimingScore fairly rewards brisk substantive turns and flags slow tiny stubs', () => {
  // 42 words in 20s at natural pace is brisk & fluent
  const briskSubstantive = computeTurnTimingScore({
    responseTimeMs: 20_000,
    thinkTimeMs: 3_000,
    wordCount: 42,
    pace: 'natural',
  });
  assert.ok(briskSubstantive >= 9, `Expected >=9, got ${briskSubstantive}`);

  // 4 words in 55s with 30s idle think pause is genuinely hesitant
  const slowStub = computeTurnTimingScore({
    responseTimeMs: 55_000,
    thinkTimeMs: 30_000,
    wordCount: 4,
    pace: 'natural',
  });
  assert.ok(slowStub <= 4, `Expected <=4, got ${slowStub}`);

  // Missing timing defaults gracefully to neutral 7
  assert.equal(
    computeTurnTimingScore({ wordCount: 20, pace: 'natural' }),
    7
  );
});

test('aggregateConversationTelemetry computes real response times, think latency, WPM, and in-time turn arc', () => {
  const messages: ConversationMessage[] = [
    { id: 'p0', role: 'partner', text: 'Tell me about your recent lab project.', timestamp: '10:00' },
    {
      id: 'u1',
      role: 'user',
      text: 'I built a closed-loop thermal chamber using a PID controller so the setpoint stayed steady under disturbances.',
      timestamp: '10:01',
      telemetry: {
        responseTimeMs: 14_000,
        thinkTimeMs: 2_500,
        composeTimeMs: 11_500,
        wordCount: 17,
        wordsPerMinute: 89,
      },
      inTimeAnalysis: {
        contextAlignment: 9,
        toneMatch: 8,
        grammarAccuracy: 9,
        naturalness: 8,
        vocabQuality: 8,
        turnNote: 'Direct answer with clear closed-loop reasoning.',
      },
    },
    { id: 'p1', role: 'partner', text: 'What broke first when you tested it?', timestamp: '10:01' },
    {
      id: 'u2',
      role: 'user',
      text: 'Sensor lag caused big overshoot at first, so we added derivative damping and tuned the loop until it stabilized.',
      timestamp: '10:02',
      telemetry: {
        responseTimeMs: 18_000,
        thinkTimeMs: 3_500,
        composeTimeMs: 14_500,
        wordCount: 19,
        wordsPerMinute: 79,
      },
      inTimeAnalysis: {
        contextAlignment: 9,
        toneMatch: 9,
        grammarAccuracy: 8,
        naturalness: 9,
        vocabQuality: 8,
        turnNote: 'Strong cause-and-effect explanation under follow-up pressure.',
      },
    },
  ];

  const { timingSummary, turnArc, inTimeAverages } = aggregateConversationTelemetry({
    messages,
    pace: 'natural',
    elapsedSeconds: 45,
  });

  assert.equal(timingSummary.turnCount, 2);
  assert.equal(timingSummary.totalUserWords, 36);
  assert.equal(timingSummary.avgResponseTimeSec, 16);
  assert.equal(timingSummary.fastestTurnSec, 14);
  assert.equal(timingSummary.slowestTurnSec, 18);
  assert.equal(timingSummary.avgThinkTimeSec, 3);
  assert.equal(timingSummary.avgWpm, 84);
  assert.equal(timingSummary.tempoBand, classifyTempoBand(timingSummary.timingCalibrationScore, 16));

  assert.equal(turnArc.length, 2);
  assert.equal(turnArc[0].turnNumber, 1);
  assert.equal(turnArc[0].responseTimeSec, 14);
  assert.ok((turnArc[0].inTimeScore ?? 0) >= 8);
  assert.equal(inTimeAverages.contextAlignment, 9);
  assert.equal(inTimeAverages.naturalness, 8.5);
});

test('calibrateConversationBenchmark anchors responsivenessTempo with objective timing and caps gibberish', () => {
  const goodMessages: ConversationMessage[] = [
    { id: 'p0', role: 'partner', text: 'How do you handle project blockers?', timestamp: '10:00' },
    {
      id: 'u1',
      role: 'user',
      text: 'I flag blockers early with a short summary of what is stuck, what I already tried, and two options so we can decide fast.',
      timestamp: '10:01',
      telemetry: { responseTimeMs: 12_000, thinkTimeMs: 2_000, wordCount: 25, wordsPerMinute: 120 },
    },
    { id: 'p1', role: 'partner', text: 'Give me a real example from this month.', timestamp: '10:01' },
    {
      id: 'u2',
      role: 'user',
      text: 'Last week our sensor calibration drifted before demo day, so I isolated the noisy ground line and suggested shipping the verified core first.',
      timestamp: '10:02',
      telemetry: { responseTimeMs: 14_000, thinkTimeMs: 2_200, wordCount: 24, wordsPerMinute: 105 },
    },
  ];

  const calibrated = calibrateConversationBenchmark({
    userTurnsText: goodMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.text)
      .join('\n\n'),
    messages: goodMessages,
    pace: 'natural',
    elapsedSeconds: 32,
    grammarFixesCount: 0,
    rawParameters: {
      contextCoherence: 9,
      naturalnessSpokenFlow: 8,
      grammarMechanics: 9,
      toneRegister: 8,
      responsivenessTempo: 8,
      conversationalInitiative: 8,
      clarityConciseness: 9,
      vocabularyPrecision: 8,
    },
  });

  assert.ok(calibrated.benchmark.benchmarkIndex >= 80);
  assert.equal(
    calibrated.benchmark.benchmarkTier,
    deriveBenchmarkTier(calibrated.benchmark.benchmarkIndex)
  );
  assert.equal(
    calibrated.totalScore,
    Object.values(calibrated.rubricScores).reduce((a, b) => a + b, 0)
  );

  // Gibberish/low-effort conversation MUST be capped strictly
  const spamMessages: ConversationMessage[] = [
    { id: 'p0', role: 'partner', text: 'Hey!', timestamp: '10:00' },
    { id: 'u1', role: 'user', text: 'asdfghjkl qwerty zxcvbnm', timestamp: '10:01', telemetry: { wordCount: 3, responseTimeMs: 4000 } },
    { id: 'u2', role: 'user', text: 'jjjjjj kkkkkk llllll', timestamp: '10:02', telemetry: { wordCount: 3, responseTimeMs: 4000 } },
  ];
  const capped = calibrateConversationBenchmark({
    userTurnsText: 'asdfghjkl qwerty zxcvbnm\n\njjjjjj kkkkkk llllll',
    messages: spamMessages,
    pace: 'natural',
    grammarFixesCount: 2,
    rawParameters: {
      contextCoherence: 9,
      naturalnessSpokenFlow: 9,
      grammarMechanics: 9,
      toneRegister: 9,
      responsivenessTempo: 9,
      conversationalInitiative: 9,
      clarityConciseness: 9,
      vocabularyPrecision: 9,
    },
  });
  assert.ok(capped.benchmark.benchmarkIndex <= 35, `Expected gibberish benchmark <=35, got ${capped.benchmark.benchmarkIndex}`);
  assert.equal(capped.benchmark.benchmarkTier, 'Foundational');
});

test('computeBenchmarkIndex, mapBenchmarkToRubricScores, offline fallback, and Markdown export stay consistent', () => {
  const scores = {
    contextCoherence: 8,
    naturalnessSpokenFlow: 8,
    grammarMechanics: 7,
    toneRegister: 8,
    responsivenessTempo: 9,
    conversationalInitiative: 8,
    clarityConciseness: 8,
    vocabularyPrecision: 7,
  };
  const idx = computeBenchmarkIndex(scores);
  assert.equal(idx, 79);
  assert.equal(deriveBenchmarkTier(idx), 'Proficient');

  const rubric = mapBenchmarkToRubricScores(scores);
  assert.equal(rubric.grammarMechanics, 7);
  assert.ok(rubric.naturalVoiceFlow >= 7 && rubric.naturalVoiceFlow <= 9);

  assert.equal(computeInTimeComposite(null), null);

  const msgs: ConversationMessage[] = [
    { id: 'p0', role: 'partner', text: 'How did the presentation go?', timestamp: '10:00' },
    {
      id: 'u1',
      role: 'user',
      text: 'It went well overall, though I rushed through the architecture slide because I worried about time.',
      timestamp: '10:01',
      telemetry: { wordCount: 17, responseTimeMs: 11_000, thinkTimeMs: 2_500, wordsPerMinute: 72 },
    },
    {
      id: 'u2',
      role: 'user',
      text: 'Next time I will pause for questions right after the demo so people can follow the trade-offs clearly.',
      timestamp: '10:02',
      telemetry: { wordCount: 18, responseTimeMs: 12_500, thinkTimeMs: 2_000, wordsPerMinute: 76 },
    },
  ];
  const offline = buildOfflineConversationBenchmark({
    messages: msgs,
    userTurnsText: `${msgs[1].text}\n\n${msgs[2].text}`,
    pace: 'natural',
    elapsedSeconds: 28,
    grammarFixes: [],
  });
  const md = formatConversationBenchmarkMarkdown({
    scenarioTitle: 'Manager 1-on-1 Sync',
    partnerName: 'Jordan',
    pace: 'natural',
    benchmark: offline.benchmark,
    totalScore: offline.totalScore,
    ieltsBand: offline.ieltsBand,
    toeflEquivalent: offline.toeflEquivalent,
    feedbackImplemented: 'Baseline',
    whatImproved: 'Clear reflection and concrete next step.',
    pinpointedRewrites: [],
    vocabUpgrades: [],
  });
  assert.match(md, /Conversational Fluency Benchmark/);
  assert.match(md, /Live Response & Pacing Telemetry/);
  assert.match(md, /8-Parameter Conversation Benchmark Scorecard/);
  assert.match(md, /Turn-by-Turn In-Time Arc/);
});
