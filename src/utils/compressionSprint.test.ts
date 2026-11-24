import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceCompressionRound,
  computeCompressionMetrics,
  createInitialCompressionState,
  formatCountdownMMSS,
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

test('formatCountdownMMSS formats seconds cleanly', () => {
  assert.equal(formatCountdownMMSS(180), '3:00');
  assert.equal(formatCountdownMMSS(65), '1:05');
  assert.equal(formatCountdownMMSS(-4), '0:00');
});
