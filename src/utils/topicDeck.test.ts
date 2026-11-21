import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_RANDOM_TOPICS,
  drawNextRandomTopic,
  type TopicDeckState,
} from './topicDeck';

test('drawNextRandomTopic never repeats any topic within a full cycle and starts cleanly after cycle completion', () => {
  const total = CURATED_RANDOM_TOPICS.length;
  assert.ok(total >= 15 && total <= 20);

  let state: TopicDeckState | null = null;
  const seenCycle1 = new Set<string>();
  let lastOfCycle1 = '';

  // Deterministic pseudo-RNG
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < total; i += 1) {
    const res = drawNextRandomTopic(state, rng);
    assert.equal(seenCycle1.has(res.topic.id), false, `Repeated ${res.topic.id} in cycle 1`);
    seenCycle1.add(res.topic.id);
    assert.equal(res.positionInCycle, i + 1);
    assert.equal(res.totalInCycle, total);
    assert.equal(res.startedNewCycle, false);
    state = res.nextState;
    lastOfCycle1 = res.topic.id;
  }

  assert.equal(seenCycle1.size, total);
  assert.equal(state?.remainingIds.length, 0);

  // Next draw begins cycle 2 and does not immediately repeat the last topic of cycle 1
  const firstOfCycle2 = drawNextRandomTopic(state, rng);
  assert.equal(firstOfCycle2.startedNewCycle, true);
  assert.equal(firstOfCycle2.positionInCycle, 1);
  assert.equal(firstOfCycle2.nextState.cycleCount, 2);
  assert.notEqual(firstOfCycle2.topic.id, lastOfCycle1);
});
