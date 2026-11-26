import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceCompressionRound,
  canAdvanceCompressionRound,
  computeCompressionMetrics,
  createInitialCompressionState,
  formatCountdownMMSS,
  isFinalRoundReadyToEvaluate,
} from './compressionSprint';

test('4/3/2 Compression Sprint advances cleanly through 3 rounds and snapshots word counts', () => {
  const s0 = createInitialCompressionState();
  assert.equal(s0.currentRound, 1);
  assert.equal(s0.remainingSec, 180);

  const r1Text = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
  const s1 = advanceCompressionRound(s0, r1Text);
  assert.equal(s1.currentRound, 2);
  assert.equal(s1.remainingSec, 120);
  assert.equal(s1.roundWordCounts[0], 150);
  assert.equal(s1.completed, false);

  const r2Text = Array.from({ length: 100 }, (_, i) => `tight${i}`).join(' ');
  const s2 = advanceCompressionRound(s1, r2Text);
  assert.equal(s2.currentRound, 3);
  assert.equal(s2.remainingSec, 60);
  assert.equal(s2.roundWordCounts[1], 100);

  const r3Text = Array.from({ length: 54 }, (_, i) => `sharp${i}`).join(' ');
  const s3 = advanceCompressionRound(s2, r3Text);
  assert.equal(s3.completed, true);
  assert.deepEqual(s3.roundWordCounts, [150, 100, 54]);

  const metrics = computeCompressionMetrics(s3.roundWordCounts);
  assert.equal(metrics.compressionRatioPct, 64);
  assert.equal(metrics.hitTargetCurve, true);
  assert.ok(metrics.summaryLabel.includes('150w → 100w → 54w'));
});

test('canAdvanceCompressionRound blocks advancing Pass 1 or 2 when word count is zero', () => {
  const s0 = createInitialCompressionState();
  const emptyCheck = canAdvanceCompressionRound('   \n  ', 1);
  assert.equal(emptyCheck.allowed, false);
  assert.ok(emptyCheck.reason?.includes('Pass 1'));

  const blocked = advanceCompressionRound(s0, '');
  assert.equal(blocked.currentRound, 1);

  const validCheck = canAdvanceCompressionRound('Clear instrumentation insight.', 2);
  assert.equal(validCheck.allowed, true);
  assert.equal(validCheck.wordCount, 3);
});

test('isFinalRoundReadyToEvaluate unlocks only in Pass 3 once 45+ words are written', () => {
  const words44 = Array.from({ length: 44 }, (_, i) => `w${i}`).join(' ');
  const words45 = Array.from({ length: 45 }, (_, i) => `w${i}`).join(' ');
  assert.equal(isFinalRoundReadyToEvaluate(words45, 2), false);
  assert.equal(isFinalRoundReadyToEvaluate(words44, 3), false);
  assert.equal(isFinalRoundReadyToEvaluate(words45, 3), true);
});

test('formatCountdownMMSS formats seconds cleanly', () => {
  assert.equal(formatCountdownMMSS(180), '3:00');
  assert.equal(formatCountdownMMSS(65), '1:05');
  assert.equal(formatCountdownMMSS(-4), '0:00');
});
