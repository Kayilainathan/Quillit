import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKELETON_PASSAGE_BANK,
  compareSkeletonReconstruction,
  parseSkeletonClues,
  pickOfflineSkeletonPassage,
  validateSkeletonClues,
} from './skeletonDrill';

test('SKELETON_PASSAGE_BANK ships 12 curated passages across technical, linkedin, email, creative', () => {
  assert.equal(SKELETON_PASSAGE_BANK.length, 12);
  const pickedTech = pickOfflineSkeletonPassage('technical');
  assert.equal(pickedTech.mode, 'technical');
  const nextTech = pickOfflineSkeletonPassage('technical', [pickedTech.id]);
  assert.notEqual(nextTech.id, pickedTech.id);
});

test('parseSkeletonClues & validateSkeletonClues enforce max 4 clues of max 4 words each', () => {
  const parsed = parseSkeletonClues(
    'copper steals weak voltage\ncurrent beats wire resistance\nlive zero flags breaks\nextra words get trimmed automatically here'
  );
  assert.equal(parsed.length, 4);
  assert.ok(parsed.every((c) => c.split(/\s+/).length <= 4));
  assert.equal(validateSkeletonClues(parsed).valid, true);
  assert.equal(validateSkeletonClues([]).valid, false);
  assert.equal(validateSkeletonClues(['one two three four five']).valid, false);
});

test('compareSkeletonReconstruction rewards original rephrasing over verbatim copying', () => {
  const original = SKELETON_PASSAGE_BANK[0].text;
  const copied = compareSkeletonReconstruction(original, original);
  const rephrased = compareSkeletonReconstruction(
    original,
    'Long cables drop faint sensor voltage. Sending a constant current prevents cable resistance from corrupting readings. Starting at four milliamps lets a dead line show up instantly as zero instead of looking like an empty vessel.'
  );
  assert.ok(copied.originalityPct < 10);
  assert.ok(rephrased.originalityPct > 45);
});
