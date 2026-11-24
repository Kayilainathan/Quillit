import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTRAINT_CHALLENGES,
  getConstraintById,
  pickRandomConstraint,
} from './constraintChallenges';

test('CONSTRAINT_CHALLENGES provides 18 curated rules across 4 categories', () => {
  assert.equal(CONSTRAINT_CHALLENGES.length, 18);
  const categories = new Set(CONSTRAINT_CHALLENGES.map((c) => c.category));
  assert.deepEqual(
    Array.from(categories).sort(),
    ['Anti-Filler', 'Clarity', 'Precision', 'Rhythm']
  );
});

test('Anti-Filler, Rhythm, Precision, and Clarity checkers detect violations accurately', () => {
  const fillerRule = getConstraintById('ban-very-really-actually')!;
  assert.equal(fillerRule.check('The signal is clean and steady.').passed, true);
  assert.equal(fillerRule.check('It is very really actually noisy.').violationCount, 3);

  const max18 = getConstraintById('max-18-words-per-sentence')!;
  assert.equal(max18.check('Short crisp sentences win interviews. They land cleanly.').passed, true);
  assert.equal(
    max18.check(
      'This single sentence keeps running on and on for far too many words without stopping for a breath at all in the middle.'
    ).passed,
    false
  );

  const calqueRule = getConstraintById('zero-calques')!;
  assert.equal(calqueRule.check('Please revert back after we discuss about it.').violationCount, 2);

  const next = pickRandomConstraint('ban-very-really-actually');
  assert.notEqual(next.id, 'ban-very-really-actually');
});
