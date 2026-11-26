import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSkeletonClue,
  computeTimerRemainingRatio,
  computeWordWindowStatus,
  countActiveDeskAddons,
  matchSkeletonCluesInDraft,
  normalizeSkeletonKeyword,
  pickNextFreshSkeletonPassage,
  removeSkeletonClueAt,
  shouldCollapseWriteHeader,
  updateSkeletonClueAt,
} from './writeStudioAddons';

test('computeWordWindowStatus classifies empty, below, in-zone, and over states accurately', () => {
  const empty = computeWordWindowStatus(0, 120, 160);
  assert.equal(empty.state, 'empty');
  assert.equal(empty.ratio, 0);

  const below = computeWordWindowStatus(80, 120, 160);
  assert.equal(below.state, 'below');
  assert.equal(below.ratio, 0.5);
  assert.match(below.label, /40w to zone/);

  const inZone = computeWordWindowStatus(135, 120, 160);
  assert.equal(inZone.state, 'in-zone');
  assert.match(inZone.label, /In zone/);

  const over = computeWordWindowStatus(185, 120, 160);
  assert.equal(over.state, 'over');
  assert.equal(over.ratio, 1);
  assert.match(over.label, /Trim 25w/);
});

test('computeTimerRemainingRatio clamps safely between 0 and 1', () => {
  assert.equal(computeTimerRemainingRatio(120, 240), 0.5);
  assert.equal(computeTimerRemainingRatio(0, 240), 0);
  assert.equal(computeTimerRemainingRatio(300, 240), 1);
  assert.equal(computeTimerRemainingRatio(-10, 240), 0);
  assert.equal(computeTimerRemainingRatio(50, 0), 0);
});

test('matchSkeletonCluesInDraft detects exact phrases and natural inflected stems', () => {
  const clues = [
    'sensor drift',
    'moving average',
    'real fault',
    'noise filter',
  ];
  const draft =
    'When a sensor drifts slowly over hours, a moving average hides the shift while filtering electrical noise cleanly.';
  const result = matchSkeletonCluesInDraft(clues, draft);

  assert.equal(result.length, 4);
  assert.equal(result[0].woven, true); // sensor drifts
  assert.equal(result[1].woven, true); // moving average
  assert.equal(result[2].woven, false); // real fault missing
  assert.equal(result[3].woven, true); // filtering + noise
});

test('editable Skeleton keyword helpers normalize, update, add (max 4, deduped), and remove cleanly', () => {
  assert.equal(normalizeSkeletonKeyword('  steady, rhythm; one two three four  '), 'steady rhythm one two');

  const initial = ['signal drift', 'clean baseline'];
  const added = addSkeletonClue(initial, 'root cause');
  assert.deepEqual(added, ['signal drift', 'clean baseline', 'root cause']);

  // Duplicate case-insensitive ignored
  assert.deepEqual(addSkeletonClue(added, 'ROOT CAUSE'), added);

  // Max 4 cap enforced
  const four = addSkeletonClue(added, 'calm cadence');
  assert.equal(four.length, 4);
  assert.equal(addSkeletonClue(four, 'fifth clue').length, 4);

  // Inline update & empty-string deletion
  const updated = updateSkeletonClueAt(four, 1, 'clear anchor');
  assert.equal(updated[1], 'clear anchor');
  const trimmed = updateSkeletonClueAt(updated, 1, '   ');
  assert.equal(trimmed.length, 3);
  assert.deepEqual(removeSkeletonClueAt(trimmed, 0), ['root cause', 'calm cadence']);
});

test('pickNextFreshSkeletonPassage rotates past completed and current passages', () => {
  const first = pickNextFreshSkeletonPassage({
    mode: 'technical',
    completedIds: [],
    currentId: null,
  });
  const second = pickNextFreshSkeletonPassage({
    mode: 'technical',
    completedIds: [first.id],
    currentId: first.id,
  });
  assert.notEqual(second.id, first.id);

  // Domain filter respected
  const emailPassage = pickNextFreshSkeletonPassage({
    mode: 'technical',
    completedIds: [],
    currentId: null,
    domainFilter: 'email',
  });
  assert.equal(emailPassage.domain, 'email');
});

test('shouldCollapseWriteHeader collapses once actively writing, sprinting, or in flow/focus', () => {
  assert.equal(
    shouldCollapseWriteHeader({
      wordCount: 0,
      sprintRunning: false,
      flowLockActive: false,
      focusMode: false,
    }),
    false
  );
  assert.equal(
    shouldCollapseWriteHeader({
      wordCount: 2,
      sprintRunning: false,
      flowLockActive: false,
      focusMode: false,
    }),
    false
  );
  assert.equal(
    shouldCollapseWriteHeader({
      wordCount: 3,
      sprintRunning: false,
      flowLockActive: false,
      focusMode: false,
    }),
    true
  );
  assert.equal(
    shouldCollapseWriteHeader({
      wordCount: 0,
      sprintRunning: true,
      flowLockActive: false,
      focusMode: false,
    }),
    true
  );
});

test('countActiveDeskAddons accurately tallies active practice mechanics and craft guards', () => {
  assert.equal(
    countActiveDeskAddons({
      activeDrill: 'standard',
      hasConstraint: false,
      flowLockActive: false,
    }),
    0
  );
  assert.equal(
    countActiveDeskAddons({
      activeDrill: 'compression-432',
      hasConstraint: true,
      flowLockActive: false,
    }),
    2
  );
  assert.equal(
    countActiveDeskAddons({
      activeDrill: 'skeleton',
      hasConstraint: true,
      flowLockActive: true,
    }),
    3
  );
});
