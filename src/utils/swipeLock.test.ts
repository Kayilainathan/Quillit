import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SWIPE_LOCK_THRESHOLD,
  computeSwipeRatio,
  shouldTriggerSwipeLock,
} from './swipeLock';

test('computeSwipeRatio clamps negative, zero, mid, and overflow deltas cleanly', () => {
  assert.equal(computeSwipeRatio(-40, 200), 0);
  assert.equal(computeSwipeRatio(0, 200), 0);
  assert.equal(computeSwipeRatio(100, 200), 0.5);
  assert.equal(computeSwipeRatio(260, 200), 1);
  assert.equal(computeSwipeRatio(50, 0), 0);
});

test('shouldTriggerSwipeLock only activates at or above threshold', () => {
  assert.equal(shouldTriggerSwipeLock(0), false);
  assert.equal(shouldTriggerSwipeLock(SWIPE_LOCK_THRESHOLD - 0.01), false);
  assert.equal(shouldTriggerSwipeLock(SWIPE_LOCK_THRESHOLD), true);
  assert.equal(shouldTriggerSwipeLock(1), true);
});
