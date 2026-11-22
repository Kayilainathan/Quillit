import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstantLocalEvaluation,
  formatWritingDaysSummary,
  getStudioGreeting,
  inferSuitableTitle,
  resolveRandomTopicDismiss,
} from './fastEvaluate';
import { runOfflineProofread } from './offlineProofreader';

test('inferSuitableTitle generates a crisp editorial title from email subject or opening clause', () => {
  const emailTitle = inferSuitableTitle(
    'Subject: lab report deadline extension\n\nHi Professor, could we move the submission to Friday?',
    'email'
  );
  assert.equal(emailTitle, 'Lab Report Deadline Extension');

  const journalTitle = inferSuitableTitle(
    'Building calm daily habits takes patience. Every morning I sit with a cup of tea and write three clear paragraphs before opening my inbox.',
    'journal'
  );
  assert.ok(journalTitle.length >= 10 && journalTitle.length <= 64);
  assert.ok(!journalTitle.includes('Practice'));
  assert.match(journalTitle, /Building Calm Daily Habits/i);
});

test('inferSuitableTitle strips greeting and conversational filler leads', () => {
  const title = inferSuitableTitle(
    'Hi Team,\nToday I want to write about quiet focus in open offices and why uninterrupted blocks matter.',
    'linkedin'
  );
  assert.ok(!title.toLowerCase().startsWith('hi team'));
  assert.ok(!title.toLowerCase().startsWith('today i want'));
  assert.match(title, /Quiet Focus/i);
});

test('buildInstantLocalEvaluation runs fast and returns valid 6-pillar scores + auto-title', () => {
  const draft =
    'Clear writing begins with honest observation. When you strip away filler words and focus on one idea per paragraph, readers stay engaged from start to finish. Good practice happens in small daily increments rather than rare bursts of perfectionism.';
  const start = performance.now();
  const issues = runOfflineProofread(draft);
  const result = buildInstantLocalEvaluation(draft, 'journal', 'conversational', issues, '');
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 50, `Expected instant eval under 50ms, got ${elapsed.toFixed(2)}ms`);
  assert.equal(result.isProvisionalInstant, true);
  assert.ok(result.suggestedTitle.length >= 6);
  for (const val of Object.values(result.scores)) {
    assert.ok(val >= 4 && val <= 10, `Score out of range: ${val}`);
  }
  assert.ok(['A1', 'A2', 'B1', 'B2', 'B2+', 'C1', 'C2'].includes(result.cefrLevel));
  assert.ok(result.internationalMetrics.ieltsBand >= 4 && result.internationalMetrics.ieltsBand <= 9);

  // Gibberish must NEVER receive inflated 7/10 scores
  const gibberish = 'asdfghjkl qwertzuiop zxcvbnm lkjh fghjkl qwrtyp bcdfrt';
  const gibRes = buildInstantLocalEvaluation(
    gibberish,
    'technical',
    'academic-technical',
    [],
    'Signal Conditioning'
  );
  const gibTotal = Object.values(gibRes.scores).reduce((a, b) => a + b, 0);
  assert.ok(gibTotal <= 12, `Expected gibberish <= 12/60, got ${gibTotal}/60`);
  assert.equal(gibRes.cefrLevel, 'A1');
});

test('resolveRandomTopicDismiss removes topic if body is empty or unchanged after picking random', () => {
  // Case 1: Empty body when closing
  const emptyRes = resolveRandomTopicDismiss({
    currentTopic: 'The quiet power of walking without headphones',
    currentContent: '',
    loadedRandomTopic: 'The quiet power of walking without headphones',
    contentSnapshotAtPick: '',
    previousTopicAtPick: '',
  });
  assert.equal(emptyRes.keptTopic, false);
  assert.equal(emptyRes.nextTopic, '');

  // Case 2: Body already had old text BEFORE random was clicked, and user wrote nothing new after
  const unchangedRes = resolveRandomTopicDismiss({
    currentTopic: 'A book that changed how I listen',
    currentContent: 'Existing draft text written before clicking random.',
    loadedRandomTopic: 'A book that changed how I listen',
    contentSnapshotAtPick: 'Existing draft text written before clicking random.',
    previousTopicAtPick: 'My Earlier Draft Title',
  });
  assert.equal(unchangedRes.keptTopic, false);
  assert.equal(unchangedRes.nextTopic, 'My Earlier Draft Title');
});

test('resolveRandomTopicDismiss keeps topic when new body content is written AFTER clicking random', () => {
  // Case 3: Body was empty at click, user wrote new words after
  const wroteFromScratch = resolveRandomTopicDismiss({
    currentTopic: 'The quiet power of walking without headphones',
    currentContent: 'Yesterday I left my earbuds on the desk and noticed how loud the city birds are.',
    loadedRandomTopic: 'The quiet power of walking without headphones',
    contentSnapshotAtPick: '',
    previousTopicAtPick: '',
  });
  assert.equal(wroteFromScratch.keptTopic, true);
  assert.equal(wroteFromScratch.nextTopic, 'The quiet power of walking without headphones');

  // Case 4: Body had old text, user added new text after clicking random
  const addedMore = resolveRandomTopicDismiss({
    currentTopic: 'A small habit that quietly compounds',
    currentContent: 'Old note.\nAdding thoughts on this new random spark now.',
    loadedRandomTopic: 'A small habit that quietly compounds',
    contentSnapshotAtPick: 'Old note.',
    previousTopicAtPick: '',
  });
  assert.equal(addedMore.keptTopic, true);
  assert.equal(addedMore.nextTopic, 'A small habit that quietly compounds');
});

test('getStudioGreeting returns warm time-of-day psychology-informed greeting without imperative Write', () => {
  const morning = getStudioGreeting('Aarav', 9);
  assert.equal(morning.headline, 'Good morning, Aarav');
  assert.equal(morning.sublinePrefix, 'Your page is open');

  const evening = getStudioGreeting('Maya', 19);
  assert.equal(evening.headline, 'Good evening, Maya');

  const unnamed = getStudioGreeting('', 14);
  assert.equal(unnamed.headline, 'Your page is open');
  assert.ok(!unnamed.headline.includes('Write,'));
});

test('formatWritingDaysSummary dynamically reflects any number of chosen days without Tri-Weekly', () => {
  const fiveDays = formatWritingDaysSummary([1, 2, 3, 4, 5]);
  assert.equal(fiveDays.label, 'Weekday rhythm');
  assert.equal(fiveDays.shortList, 'Mon · Tue · Wed · Thu · Fri');
  assert.equal(fiveDays.countPerWeek, 5);
  assert.equal(fiveDays.mondayFirstIndices.size, 5);

  const daily = formatWritingDaysSummary([0, 1, 2, 3, 4, 5, 6]);
  assert.equal(daily.label, 'Daily rhythm');
  assert.equal(daily.countPerWeek, 7);

  const customFour = formatWritingDaysSummary([1, 3, 5, 6]);
  assert.equal(customFour.label, '4 days/week');
  assert.equal(customFour.shortList, 'Mon · Wed · Fri · Sat');
});
