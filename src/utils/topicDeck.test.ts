import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_RANDOM_TOPICS,
  drawNextCurriculumRandomTopic,
  drawNextRandomTopic,
  shouldRefreshPeriodicTopics,
  type TopicDeckState,
} from './topicDeck';

test('drawNextRandomTopic never repeats any topic within a full cycle and starts cleanly after cycle completion', () => {
  const total = CURATED_RANDOM_TOPICS.length;
  assert.ok(total >= 60);

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

test('drawNextCurriculumRandomTopic omits Week N prefixes and blends periodic refined topics', () => {
  const drawn = drawNextCurriculumRandomTopic({
    usedCurriculumIds: [],
    usedTopicTitles: [],
    rng: () => 0.5,
  });
  assert.equal(drawn.category.includes('Week '), false);
  assert.equal(drawn.week, undefined);

  const refined = drawNextCurriculumRandomTopic({
    usedCurriculumIds: [],
    usedTopicTitles: [],
    refinedTopics: [
      {
        id: 'refined-1',
        title: 'A quiet habit that rescued your week',
        hint: 'Focus on one concrete turning point.',
        category: 'Fresh Prompt',
        mode: 'journal',
        tone: 'conversational',
        targetWords: 190,
      },
    ],
    rng: () => 0.1,
  });
  assert.equal(refined.id, 'refined-1');
  assert.equal(refined.category, 'Fresh Prompt');
});

test('shouldRefreshPeriodicTopics triggers after 5 draws or 7 elapsed days', () => {
  assert.equal(
    shouldRefreshPeriodicTopics(
      { updatedAtISO: '2026-11-20', drawsSinceRefresh: 2, topics: [] },
      '2026-11-22'
    ),
    false
  );
  assert.equal(
    shouldRefreshPeriodicTopics(
      { updatedAtISO: '2026-11-20', drawsSinceRefresh: 5, topics: [] },
      '2026-11-22'
    ),
    true
  );
  assert.equal(
    shouldRefreshPeriodicTopics(
      { updatedAtISO: '2026-11-10', drawsSinceRefresh: 0, topics: [] },
      '2026-11-20'
    ),
    true
  );
});
