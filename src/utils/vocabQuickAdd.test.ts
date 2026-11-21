import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_QUICK_DEFINITION_LENGTH,
  MAX_QUICK_WORD_LENGTH,
  buildQuickAddVocabEntry,
} from './vocabQuickAdd';

test('buildQuickAddVocabEntry rejects blank word or blank definition', () => {
  const missingWord = buildQuickAddVocabEntry({
    word: '   ',
    definition: 'To weaken a signal.',
    mode: 'technical',
    todayISO: '2026-11-21',
  });
  assert.equal(missingWord.ok, false);
  assert.match(missingWord.error ?? '', /word/i);

  const missingDef = buildQuickAddVocabEntry({
    word: 'attenuate',
    definition: '   ',
    mode: 'technical',
    todayISO: '2026-11-21',
  });
  assert.equal(missingDef.ok, false);
  assert.match(missingDef.error ?? '', /definition/i);
});

test('buildQuickAddVocabEntry enforces Firestore length constraints and duplicate checks', () => {
  const tooLongWord = buildQuickAddVocabEntry({
    word: 'a'.repeat(MAX_QUICK_WORD_LENGTH + 1),
    definition: 'Valid definition',
    mode: 'journal',
    todayISO: '2026-11-21',
  });
  assert.equal(tooLongWord.ok, false);

  const tooLongDef = buildQuickAddVocabEntry({
    word: 'incisive',
    definition: 'd'.repeat(MAX_QUICK_DEFINITION_LENGTH + 1),
    mode: 'journal',
    todayISO: '2026-11-21',
  });
  assert.equal(tooLongDef.ok, false);

  const valid = buildQuickAddVocabEntry({
    word: '  Attenuate  ',
    definition: '  Reduce the amplitude or strength of a signal.  ',
    mode: 'technical',
    todayISO: '2026-11-21',
  });
  assert.equal(valid.ok, true);
  assert.ok(valid.entry);
  assert.equal(valid.entry.used, 'Attenuate');
  assert.equal(valid.entry.betterAlternative, 'Attenuate');
  assert.equal(
    valid.entry.explanation,
    'Reduce the amplitude or strength of a signal.'
  );
  assert.equal(valid.entry.contextSnippet, '');
  assert.equal(valid.entry.mastered, false);
  assert.equal(valid.entry.dateAdded, '2026-11-21');

  const duplicate = buildQuickAddVocabEntry({
    word: 'attenuate',
    definition: 'Another meaning',
    mode: 'technical',
    todayISO: '2026-11-21',
    existingVocabulary: [valid.entry],
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error ?? '', /already in your vocabulary/i);
});
