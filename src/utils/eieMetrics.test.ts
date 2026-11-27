import test from 'node:test';
import assert from 'node:assert/strict';
import type { RubricScores } from '../types';
import { deriveEieEvaluationMetrics } from './eieMetrics';

test('deriveEieEvaluationMetrics returns Panel Ready band and 0-100 scores for strong EIE prose', () => {
  const strongScores: RubricScores = {
    naturalVoiceFlow: 9,
    claritySimplicity: 9,
    grammarMechanics: 9,
    toneEngagement: 9,
    sentenceVarietyCadence: 8,
    concisenessDirectness: 8,
  };

  const res = deriveEieEvaluationMetrics({
    scores: strongScores,
    content:
      'Because a 4-20 mA transmitter separates zero scale from an open loop, a broken wire registers 0 mA immediately. Shielded twisted-pair wiring feeds a 250 ohm precision resistor cleanly.',
    spokenReadinessScore: 88,
    signalNoiseRatio: 90,
  });

  assert.equal(res.readinessBand, 'Panel Ready');
  assert.ok(res.placementPanelScore >= 82);
  assert.ok(res.technicalClarityScore >= 82);
  assert.ok(res.focusLever.length > 10);
});

test('deriveEieEvaluationMetrics targets weakest lever accurately on weak clarity & mechanics draft', () => {
  const weakClarityScores: RubricScores = {
    naturalVoiceFlow: 7,
    claritySimplicity: 5,
    grammarMechanics: 4,
    toneEngagement: 7,
    sentenceVarietyCadence: 7,
    concisenessDirectness: 5,
  };

  const res = deriveEieEvaluationMetrics({
    scores: weakClarityScores,
    content: 'The sensor are giving reading of 5v and basically we tested it.',
    spokenReadinessScore: 76,
    signalNoiseRatio: 62,
  });

  assert.equal(res.readinessBand, 'Calibrating');
  assert.ok(res.technicalClarityScore < res.placementPanelScore);
  assert.ok(res.focusLever.includes('cause, constraint'));
});
