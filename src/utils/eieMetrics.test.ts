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
  assert.ok(res.ieeeDocPolishScore >= 82);
  assert.ok(res.focusLever.length > 10);
});

test('deriveEieEvaluationMetrics targets weakest lever accurately on weak grammar draft', () => {
  const weakGrammarScores: RubricScores = {
    naturalVoiceFlow: 7,
    claritySimplicity: 7,
    grammarMechanics: 4,
    toneEngagement: 6,
    sentenceVarietyCadence: 7,
    concisenessDirectness: 7,
  };

  const res = deriveEieEvaluationMetrics({
    scores: weakGrammarScores,
    content: 'The sensor are giving reading of 5v and basically we tested it.',
    spokenReadinessScore: 72,
    signalNoiseRatio: 74,
  });

  assert.equal(res.readinessBand, 'Calibrating');
  assert.ok(res.ieeeDocPolishScore < res.technicalClarityScore);
  assert.ok(res.focusLever.includes('SI unit'));
});
