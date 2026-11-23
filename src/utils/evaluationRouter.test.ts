import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_GEMINI_TEXT_MODELS,
  classifyTopicComplexity,
  formatTierLabel,
  getModelStepTimeoutMs,
  normalizeThinkingLabel,
  selectDynamicEvaluationRoute,
  selectUtilityModelCascade,
  supportsMinimalThinking,
  supportsThinkingLevel,
} from './evaluationRouter';

test('ACTIVE_GEMINI_TEXT_MODELS contains only active, non-deprecated free-tier Gemini text generations', () => {
  assert.deepEqual(ACTIVE_GEMINI_TEXT_MODELS, [
    'gemini-4-hydrogen',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ]);
  for (const model of ACTIVE_GEMINI_TEXT_MODELS) {
    assert.ok(!model.includes('1.5'), `Deprecated 1.5 model found: ${model}`);
    assert.ok(!model.includes('2.0'), `Deprecated 2.0 model found: ${model}`);
    assert.ok(!model.includes('carbon') && !model.includes('neon') && !model.includes('argon'));
  }
});

test('model capability guards prevent invalid thinking configs on Gemini 4 Hydrogen and Gemini 2.5 models', () => {
  assert.equal(supportsThinkingLevel('gemini-4-hydrogen'), true);
  assert.equal(supportsMinimalThinking('gemini-4-hydrogen'), false);
  assert.equal(normalizeThinkingLabel('gemini-4-hydrogen', 'MINIMAL'), 'LOW');

  assert.equal(supportsThinkingLevel('gemini-3-flash-preview'), true);
  assert.equal(supportsMinimalThinking('gemini-3-flash-preview'), true);

  assert.equal(supportsThinkingLevel('gemini-3.1-flash-lite'), true);
  assert.equal(supportsMinimalThinking('gemini-3.1-flash-lite'), true);

  // Gemini 2.5 models MUST NOT receive thinkingLevel
  assert.equal(supportsThinkingLevel('gemini-2.5-flash'), false);
  assert.equal(supportsThinkingLevel('gemini-2.5-flash-lite'), false);
  assert.equal(normalizeThinkingLabel('gemini-2.5-flash', 'HIGH'), 'STANDARD');
  assert.equal(normalizeThinkingLabel('gemini-2.5-flash-lite', 'LOW'), 'STANDARD');

  assert.equal(formatTierLabel('gemini-4-hydrogen', 'MEDIUM'), 'Hydrogen · Medium');
  assert.equal(formatTierLabel('gemini-3-flash-preview', 'MEDIUM'), 'Gemini 3 Flash · Medium');
  assert.equal(formatTierLabel('gemini-3.1-flash-lite', 'HIGH'), 'Flash Lite · High');
  assert.equal(formatTierLabel('gemini-2.5-flash', 'STANDARD'), 'Gemini 2.5 Flash');
  assert.equal(formatTierLabel('gemini-2.5-flash-lite', 'STANDARD'), 'Flash 2.5 Lite');

  // Step timeouts stay fast and bounded
  assert.ok(getModelStepTimeoutMs('gemini-4-hydrogen', 'HIGH', 'evaluate') <= 26_000);
  assert.ok(getModelStepTimeoutMs('gemini-2.5-flash-lite', 'STANDARD', 'evaluate') <= 10_000);
});

test('classifyTopicComplexity distinguishes EIE technical/interview & creative topics from casual journals', () => {
  assert.equal(
    classifyTopicComplexity(
      'Technical & Interview',
      'Academic / EIE Technical',
      'Explain open-loop vs closed-loop feedback control'
    ),
    'high'
  );
  assert.equal(
    classifyTopicComplexity(
      'Creative Writing',
      'Vivid & Narrative',
      'An alchemist and apprentice trapped in a cellar storm'
    ),
    'high'
  );
  assert.equal(
    classifyTopicComplexity('Personal Journal', 'Conversational & Natural', 'Morning coffee'),
    'light'
  );
});

test('selectDynamicEvaluationRoute chooses Hydrogen Medium with full 5-generation cascade for substantive technical answers', () => {
  const plan = selectDynamicEvaluationRoute({
    wordCount: 155,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    topic: 'Open-loop vs closed-loop feedback control',
    longestSentenceWords: 48,
    hasPreviousSessionSummary: true,
    practicingVocabCount: 3,
  });

  assert.equal(plan.primary.model, 'gemini-4-hydrogen');
  assert.equal(plan.primary.thinkingLabel, 'MEDIUM');
  assert.equal(plan.primary.tierLabel, 'Hydrogen · Medium');

  const modelsInCascade = new Set(plan.cascade.map((s) => s.model));
  for (const model of ACTIVE_GEMINI_TEXT_MODELS) {
    assert.ok(modelsInCascade.has(model), `Expected ${model} in evaluation cascade`);
  }
});

test('selectDynamicEvaluationRoute escalates to Hydrogen High for long complex essays', () => {
  const plan = selectDynamicEvaluationRoute({
    wordCount: 275,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    topic: 'Defending 4-20 mA loops and PID anti-windup',
    longestSentenceWords: 42,
    hasPreviousSessionSummary: true,
  });

  assert.equal(plan.primary.model, 'gemini-4-hydrogen');
  assert.equal(plan.primary.thinkingLabel, 'HIGH');
  assert.equal(plan.primary.tierLabel, 'Hydrogen · High');
  assert.equal(plan.cascade[plan.cascade.length - 1].model, 'gemini-2.5-flash-lite');
});

test('selectDynamicEvaluationRoute chooses Hydrogen Low for concise technical or mid-short drafts', () => {
  const plan = selectDynamicEvaluationRoute({
    wordCount: 52,
    mode: 'LinkedIn Post',
    tone: 'Professional-Warm',
    topic: 'Quick bench lesson on ground loops',
  });

  assert.equal(plan.primary.model, 'gemini-4-hydrogen');
  assert.equal(plan.primary.thinkingLabel, 'LOW');
  assert.equal(plan.primary.tierLabel, 'Hydrogen · Low');
});

test('selectDynamicEvaluationRoute chooses Flash Lite Medium/Low for very brief entries or gibberish', () => {
  const brief = selectDynamicEvaluationRoute({
    wordCount: 30,
    mode: 'Personal Journal',
    tone: 'Conversational & Natural',
    topic: 'Quick note',
  });
  assert.equal(brief.primary.model, 'gemini-3.1-flash-lite');
  assert.equal(brief.primary.thinkingLabel, 'MEDIUM');

  const ultraBrief = selectDynamicEvaluationRoute({
    wordCount: 18,
    mode: 'Personal Journal',
    tone: 'Conversational & Natural',
    topic: 'Hi',
  });
  assert.equal(ultraBrief.primary.model, 'gemini-3.1-flash-lite');
  assert.equal(ultraBrief.primary.thinkingLabel, 'LOW');

  const gibberish = selectDynamicEvaluationRoute({
    wordCount: 80,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    isGibberishOrLowEffort: true,
  });
  assert.equal(gibberish.primary.model, 'gemini-3.1-flash-lite');
  assert.equal(gibberish.primary.thinkingLabel, 'LOW');
});

test('selectDynamicEvaluationRoute cascades smoothly across Gemini 3 Flash -> Flash Lite 3.1 -> Gemini 2.5 Flash -> Flash 2.5 Lite as tiers cool down', () => {
  const now = 1_700_000_000_000;

  // 1) Hydrogen cooled down -> drops immediately to Gemini 3 Flash Medium
  const step1 = selectDynamicEvaluationRoute({
    wordCount: 165,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    topic: 'Closed-loop feedback control',
    cooldownUntil: {
      'gemini-4-hydrogen': now + 30_000,
    },
    nowMs: now,
  });
  assert.equal(step1.primary.model, 'gemini-3-flash-preview');
  assert.equal(step1.primary.thinkingLabel, 'MEDIUM');

  // 2) Hydrogen + Gemini 3 Flash cooled down -> Flash Lite 3.1 High
  const step2 = selectDynamicEvaluationRoute({
    wordCount: 165,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    topic: 'Closed-loop feedback control',
    cooldownUntil: {
      'gemini-4-hydrogen': now + 30_000,
      'gemini-3-flash-preview': now + 30_000,
    },
    nowMs: now,
  });
  assert.equal(step2.primary.model, 'gemini-3.1-flash-lite');
  assert.equal(step2.primary.thinkingLabel, 'HIGH');
  assert.equal(step2.primary.tierLabel, 'Flash Lite · High');

  // 3) Hydrogen + 3 Flash + Flash Lite 3.1 cooled -> Gemini 2.5 Flash (STANDARD)
  const step3 = selectDynamicEvaluationRoute({
    wordCount: 165,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    topic: 'Closed-loop feedback control',
    cooldownUntil: {
      'gemini-4-hydrogen': now + 30_000,
      'gemini-3-flash-preview': now + 30_000,
      'gemini-3.1-flash-lite': now + 30_000,
    },
    nowMs: now,
  });
  assert.equal(step3.primary.model, 'gemini-2.5-flash');
  assert.equal(step3.primary.thinkingLabel, 'STANDARD');

  // 4) All upper 4 models cooled -> Flash 2.5 Lite (STANDARD) zero-stall floor
  const step4 = selectDynamicEvaluationRoute({
    wordCount: 165,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    topic: 'Closed-loop feedback control',
    cooldownUntil: {
      'gemini-4-hydrogen': now + 30_000,
      'gemini-3-flash-preview': now + 30_000,
      'gemini-3.1-flash-lite': now + 30_000,
      'gemini-2.5-flash': now + 30_000,
    },
    nowMs: now,
  });
  assert.equal(step4.primary.model, 'gemini-2.5-flash-lite');
  assert.equal(step4.primary.thinkingLabel, 'STANDARD');
  assert.equal(step4.primary.tierLabel, 'Flash 2.5 Lite');
});

test('selectDynamicEvaluationRoute skips models marked unsupported/404 completely', () => {
  const now = 1_700_000_000_000;
  const plan = selectDynamicEvaluationRoute({
    wordCount: 140,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    unsupportedUntil: {
      'gemini-3-flash-preview': now + 1_800_000,
    },
    nowMs: now,
  });
  assert.ok(!plan.cascade.some((s) => s.model === 'gemini-3-flash-preview'));
  assert.equal(plan.primary.model, 'gemini-4-hydrogen');
});

test('selectUtilityModelCascade preserves Hydrogen quota for Evaluation on fast tasks and spans all 5 models', () => {
  const realtimeCascade = selectUtilityModelCascade({
    task: 'realtime',
    complexityMetric: 120,
  });
  assert.equal(realtimeCascade.length, 5);
  assert.equal(realtimeCascade[0].model, 'gemini-3.1-flash-lite');
  assert.equal(realtimeCascade[1].model, 'gemini-3-flash-preview');
  assert.equal(realtimeCascade[2].model, 'gemini-4-hydrogen');
  assert.equal(realtimeCascade[3].model, 'gemini-2.5-flash-lite');
  assert.equal(realtimeCascade[4].model, 'gemini-2.5-flash');

  const scheduleCascade = selectUtilityModelCascade({
    task: 'schedule',
    complexityMetric: 6,
  });
  assert.equal(scheduleCascade.length, 5);
  assert.equal(scheduleCascade[0].model, 'gemini-4-hydrogen');
  assert.equal(scheduleCascade[1].model, 'gemini-3-flash-preview');
});
