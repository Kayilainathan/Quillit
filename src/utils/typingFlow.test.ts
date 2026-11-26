import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPING_ACTIVE_TIMEOUT_MS,
  TYPING_ROLLING_WINDOW_MS,
  computeTypingFlowMetrics,
  createInitialTypingFlowState,
  recordTypingProgress,
} from './typingFlow';

test('typingFlow computes smooth rolling WPM, cadenceRatio, and activates flow state while typing', () => {
  let state = createInitialTypingFlowState();
  let text = '';
  const phrase = 'Clear writing cuts noise and respects the reader every single time.';
  const start = 10_000;

  // Simulate typing ~1 char every 150ms (~80 WPM gross)
  for (let i = 0; i < phrase.length; i++) {
    const nextText = phrase.slice(0, i + 1);
    const now = start + i * 150;
    state = recordTypingProgress(state, text, nextText, now);
    text = nextText;
  }

  const end = start + (phrase.length - 1) * 150;
  const activeMetrics = computeTypingFlowMetrics(state, end + 100);
  assert.equal(activeMetrics.isTypingActive, true);
  assert.ok(
    activeMetrics.wpm >= 48 && activeMetrics.wpm <= 115,
    `Expected realistic smoothed WPM, got ${activeMetrics.wpm}`
  );
  assert.ok(
    activeMetrics.flowState === 'flow' || activeMetrics.flowState === 'brisk'
  );
  assert.ok(activeMetrics.peakWpm >= activeMetrics.wpm);
  assert.ok(activeMetrics.cadenceRatio > 0.5 && activeMetrics.cadenceRatio <= 1);
  assert.ok(activeMetrics.burstSeconds >= 8);

  // After idle timeout, typing becomes inactive and settles calmly
  const idleMetrics = computeTypingFlowMetrics(
    state,
    end + TYPING_ACTIVE_TIMEOUT_MS + 300
  );
  assert.equal(idleMetrics.isTypingActive, false);
  assert.equal(idleMetrics.flowState, 'idle');
  assert.equal(idleMetrics.burstSeconds, 0);

  // After rolling window expires, WPM decays cleanly to 0
  const expiredMetrics = computeTypingFlowMetrics(
    state,
    end + TYPING_ROLLING_WINDOW_MS + 1000
  );
  assert.equal(expiredMetrics.wpm, 0);
  assert.equal(expiredMetrics.cadenceRatio, 0);
});

test('typingFlow ignores bulk clipboard pastes and resets cleanly when draft is cleared', () => {
  let state = createInitialTypingFlowState();
  const pasted =
    'This is a long pasted paragraph containing dozens of words that should never produce an artificial spike.';

  state = recordTypingProgress(state, '', pasted, 5_000);
  const afterPaste = computeTypingFlowMetrics(state, 5_100);
  assert.equal(afterPaste.wpm, 0);

  // Clearing text resets tracker completely
  state = recordTypingProgress(state, pasted, '', 6_000);
  assert.equal(state.samples.length, 0);
  assert.equal(state.lastKeystrokeAt, null);
  assert.equal(state.burstStartedAt, null);
  assert.equal(state.peakWpm, 0);
  assert.equal(state.smoothedWpm, 0);
});
