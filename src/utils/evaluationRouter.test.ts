import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyTopicComplexity,
  selectDynamicEvaluationRoute,
} from './evaluationRouter';

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

test('selectDynamicEvaluationRoute chooses Hydrogen Medium for substantive technical answers', () => {
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

test('selectDynamicEvaluationRoute fails over immediately to Flash Lite High/Medium when Hydrogen is on cooldown', () => {
  const now = 1_700_000_000_000;
  const plan = selectDynamicEvaluationRoute({
    wordCount: 165,
    mode: 'Technical & Interview',
    tone: 'Academic / EIE Technical',
    topic: 'Closed-loop feedback control',
    cooldownUntil: {
      'gemini-4-hydrogen': now + 30_000,
    },
    nowMs: now,
  });

  assert.equal(plan.primary.model, 'gemini-3.1-flash-lite');
  assert.equal(plan.primary.thinkingLabel, 'HIGH');
  assert.equal(plan.primary.tierLabel, 'Flash Lite · High');
});
