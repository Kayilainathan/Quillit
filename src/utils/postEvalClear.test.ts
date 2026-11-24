import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POST_EVAL_CLEAR_MS,
  DEFAULT_POST_EVAL_UNDO_MS,
  computeCountdownProgress,
  createIdlePostEvalClearState,
  dismissPostEvalClear,
  formatRemainingSeconds,
  setPostEvalClearPaused,
  startPostEvalClearPrompt,
  tickPostEvalClear,
  togglePostEvalAutoClear,
  transitionToClearedUndo,
} from './postEvalClear';

test('post-eval clear starts 3s countdown and triggers clear at 0ms', () => {
  let state = createIdlePostEvalClearState('editor', true);
  assert.equal(state.phase, 'idle');

  state = startPostEvalClearPrompt(state);
  assert.equal(state.phase, 'countdown');
  assert.equal(state.remainingMs, DEFAULT_POST_EVAL_CLEAR_MS);
  assert.equal(formatRemainingSeconds(state.remainingMs), 3);

  const step1 = tickPostEvalClear(state, 1000);
  assert.equal(step1.shouldExecuteClear, false);
  assert.equal(step1.nextState.remainingMs, 2000);
  assert.equal(formatRemainingSeconds(step1.nextState.remainingMs), 2);

  const step2 = tickPostEvalClear(step1.nextState, 2100);
  assert.equal(step2.shouldExecuteClear, true);
  assert.equal(step2.nextState.phase, 'cleared-undo');
  assert.equal(step2.nextState.undoRemainingMs, DEFAULT_POST_EVAL_UNDO_MS);
});

test('pause-on-hover freezes both countdown and undo timers cleanly', () => {
  let state = startPostEvalClearPrompt(createIdlePostEvalClearState('chat', true));
  state = setPostEvalClearPaused(state, true);

  const frozen = tickPostEvalClear(state, 5000);
  assert.equal(frozen.shouldExecuteClear, false);
  assert.equal(frozen.nextState.remainingMs, DEFAULT_POST_EVAL_CLEAR_MS);

  state = setPostEvalClearPaused(frozen.nextState, false);
  const resumed = tickPostEvalClear(state, 1500);
  assert.equal(resumed.nextState.remainingMs, 1500);
  assert.equal(computeCountdownProgress(resumed.nextState), 0.5);
});

test('manual ask-only mode (autoClearEnabled=false) waits without auto-clearing', () => {
  let state = startPostEvalClearPrompt(createIdlePostEvalClearState('editor', false));
  const afterWait = tickPostEvalClear(state, 10000);
  assert.equal(afterWait.shouldExecuteClear, false);
  assert.equal(afterWait.nextState.phase, 'countdown');

  // Turning auto-clear back on resets timer to full 3s
  state = togglePostEvalAutoClear(afterWait.nextState, true);
  assert.equal(state.autoClearEnabled, true);
  assert.equal(state.remainingMs, DEFAULT_POST_EVAL_CLEAR_MS);
});

test('manual Clear Now transitions to undo window and expires back to idle', () => {
  let state = startPostEvalClearPrompt(createIdlePostEvalClearState('editor', true));
  state = transitionToClearedUndo(state);
  assert.equal(state.phase, 'cleared-undo');

  const midUndo = tickPostEvalClear(state, 3500);
  assert.equal(midUndo.shouldExpireUndo, false);
  assert.equal(midUndo.nextState.phase, 'cleared-undo');

  const endUndo = tickPostEvalClear(midUndo.nextState, 4000);
  assert.equal(endUndo.shouldExpireUndo, true);
  assert.equal(endUndo.nextState.phase, 'idle');

  const cancelled = dismissPostEvalClear(state);
  assert.equal(cancelled.phase, 'idle');
});
