import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPhraseRangeInDraft,
  splitParagraphFocusSegments,
} from './sentenceFocus';

test('splitParagraphFocusSegments marks active paragraph containing caret while preserving exact text', () => {
  const draft = 'First paragraph here.\n\nSecond paragraph active.\n\nThird paragraph below.';
  const caret = draft.indexOf('active');
  const segments = splitParagraphFocusSegments(draft, caret);
  assert.equal(segments.map((s) => s.text).join(''), draft);

  const active = segments.filter((s) => s.active);
  assert.equal(active.length, 1);
  assert.equal(active[0].text, 'Second paragraph active.');
});

test('splitParagraphFocusSegments handles empty text and trailing newline gracefully', () => {
  assert.deepEqual(splitParagraphFocusSegments('', 0), []);
  const draft = 'Single line.\n\n';
  const segments = splitParagraphFocusSegments(draft, draft.length);
  assert.equal(segments.filter((s) => s.active).length, 1);
  assert.equal(segments.find((s) => s.active)?.text, 'Single line.');
});

test('findPhraseRangeInDraft locates exact and case-insensitive substrings', () => {
  const draft = 'We calibrated the sensor and we will Revert Back tomorrow.';
  const exact = findPhraseRangeInDraft(draft, 'the sensor');
  assert.deepEqual(exact, { start: 14, end: 24 });

  const ci = findPhraseRangeInDraft(draft, 'revert back');
  assert.deepEqual(ci, { start: 37, end: 48 });

  assert.equal(findPhraseRangeInDraft(draft, 'missing phrase'), null);
});
