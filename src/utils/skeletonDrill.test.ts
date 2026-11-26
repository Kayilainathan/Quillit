import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKELETON_PASSAGE_BANK,
  compareSkeletonReconstruction,
  extractSentenceSkeletonClues,
  findBestTopicSkeletonPassage,
  getInitialSkeletonClues,
  isCustomUserTopic,
  parseSkeletonClues,
  pickOfflineSkeletonPassage,
  scorePassageTopicRelevance,
  shuffleSkeletonClueOrder,
  splitPassageSentences,
  validateSkeletonClues,
} from './skeletonDrill';

test('SKELETON_PASSAGE_BANK ships 12 curated passages with accurate per-sentence clues', () => {
  assert.equal(SKELETON_PASSAGE_BANK.length, 12);
  for (const p of SKELETON_PASSAGE_BANK) {
    const sentences = splitPassageSentences(p.text);
    const clues = getInitialSkeletonClues(p);
    assert.ok(clues.length >= 3 && clues.length <= 4, `${p.id} should have 3-4 clues`);
    assert.equal(clues.length, sentences.length, `${p.id} clue count should match sentence count`);
    assert.equal(validateSkeletonClues(clues).valid, true, `${p.id} clues must validate <= 4 words`);
  }

  const pickedTech = pickOfflineSkeletonPassage('technical');
  assert.equal(pickedTech.mode, 'technical');
  const nextTech = pickOfflineSkeletonPassage('technical', [pickedTech.id]);
  assert.notEqual(nextTech.id, pickedTech.id);
});

test('splitPassageSentences preserves decimals and abbreviations cleanly', () => {
  const sentences = splitPassageSentences(
    'Dr. Rao calibrated the 4.5 V reference rail before noon. Then the ADC noise dropped below 0.2 mV across every channel.'
  );
  assert.equal(sentences.length, 2);
  assert.ok(sentences[0].startsWith('Dr. Rao'));
  assert.ok(sentences[1].includes('0.2 mV'));
});

test('extractSentenceSkeletonClues distills crisp <= 4 word structural beats per sentence', () => {
  const sample =
    'Feedback loops stabilize unstable motors by measuring speed continuously. Without damping, sudden load spikes force the shaft into wild oscillation. A tuned derivative term anticipates momentum and steadies torque immediately.';
  const clues = extractSentenceSkeletonClues(sample);
  assert.equal(clues.length, 3);
  assert.equal(validateSkeletonClues(clues).valid, true);
  // Should not collapse into empty strings or stopwords
  assert.ok(clues.every((c) => c.split(/\s+/).length >= 2 && c.split(/\s+/).length <= 4));
  assert.ok(clues[0].toLowerCase().includes('feedback') || clues[0].toLowerCase().includes('motors'));
  assert.ok(clues[2].toLowerCase().includes('derivative') || clues[2].toLowerCase().includes('momentum'));
});

test('isCustomUserTopic distinguishes real user topics from auto-prefixed Skeleton titles', () => {
  assert.equal(isCustomUserTopic(''), false);
  assert.equal(isCustomUserTopic('Skeleton: How PID Control Stops Overshoot'), false);
  assert.equal(isCustomUserTopic('How PID control eliminates motor overshoot'), true);
});

test('findBestTopicSkeletonPassage adapts offline passage selection to active user topic', () => {
  const pidPick = findBestTopicSkeletonPassage({
    topic: 'How PID control prevents overshoot in servo loops',
    mode: 'technical',
  });
  assert.equal(pidPick.topicMatched, true);
  assert.equal(pidPick.passage.id, 'skel-tech-02');
  assert.equal(pidPick.passage.adaptedToTopic, 'How PID control prevents overshoot in servo loops');

  const emailPick = findBestTopicSkeletonPassage({
    topic: 'Explaining a PCB demo delay caused by thermal shutdown',
    mode: 'email',
  });
  assert.equal(emailPick.topicMatched, true);
  assert.equal(emailPick.passage.id, 'skel-email-02');

  assert.ok(
    scorePassageTopicRelevance(SKELETON_PASSAGE_BANK[0], '4-20 mA current loop wire resistance') >= 40
  );
});

test('shuffleSkeletonClueOrder creates deterministic non-identical Franklin jumbled order', () => {
  const order3 = shuffleSkeletonClueOrder(3, 1);
  assert.equal(order3.length, 3);
  assert.deepEqual([...order3].sort((a, b) => a - b), [0, 1, 2]);
  assert.notDeepEqual(order3, [0, 1, 2]);

  const order4 = shuffleSkeletonClueOrder(4, 2);
  assert.equal(order4.length, 4);
  assert.deepEqual([...order4].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.notDeepEqual(order4, [0, 1, 2, 3]);
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
