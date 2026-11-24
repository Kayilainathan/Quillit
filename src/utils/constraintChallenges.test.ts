import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTRAINT_CHALLENGES,
  evaluateAllConstraintsPreview,
  getConstraintById,
  getRecommendedConstraintsForMode,
  getSentenceSpans,
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

test('getSentenceSpans handles abbreviations and decimals without false splits', () => {
  const text = 'Dr. Patel measured 3.14 ms latency, e.g. on v3.1 hardware. The fix held steady.';
  const spans = getSentenceSpans(text);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].text, 'Dr. Patel measured 3.14 ms latency, e.g. on v3.1 hardware.');
  assert.equal(spans[1].text, 'The fix held steady.');
  assert.equal(text.slice(spans[1].start, spans[1].end), 'The fix held steady.');
});

test('Anti-Filler, Rhythm, Precision, and Clarity checkers return accurate spans & adherence scores', () => {
  const fillerRule = getConstraintById('ban-very-really-actually')!;
  const cleanRes = fillerRule.check('The signal is clean and steady.');
  assert.equal(cleanRes.passed, true);
  assert.equal(cleanRes.adherenceScore, 100);
  assert.equal(cleanRes.matches.length, 0);

  const dirtyText = 'It is very really actually noisy.';
  const dirtyRes = fillerRule.check(dirtyText);
  assert.equal(dirtyRes.violationCount, 3);
  assert.equal(dirtyRes.passed, false);
  assert.ok(dirtyRes.adherenceScore < 100);
  assert.equal(dirtyText.slice(dirtyRes.matches[0].start, dirtyRes.matches[0].end), 'very');
  assert.equal(dirtyText.slice(dirtyRes.matches[1].start, dirtyRes.matches[1].end), 'really');
  assert.equal(dirtyText.slice(dirtyRes.matches[2].start, dirtyRes.matches[2].end), 'actually');

  const max18 = getConstraintById('max-18-words-per-sentence')!;
  assert.equal(max18.check('Short crisp sentences win interviews. They land cleanly.').passed, true);
  const longRes = max18.check(
    'This single sentence keeps running on and on for far too many words without stopping for a breath at all in the middle.'
  );
  assert.equal(longRes.passed, false);
  assert.equal(longRes.matches.length, 1);

  const calqueRule = getConstraintById('zero-calques')!;
  assert.equal(calqueRule.check('Please revert back after we discuss about it.').violationCount, 2);

  const next = pickRandomConstraint('ban-very-really-actually', 'technical');
  assert.notEqual(next.id, 'ban-very-really-actually');
});

test('Passive voice analyzer catches irregular participles and ignores predicate adjectives', () => {
  const passiveRule = getConstraintById('ban-was-were-passive')!;
  assert.equal(
    passiveRule.check('The team was excited and I was worried, yet everyone stayed focused.').passed,
    true
  );
  const irregularRes = passiveRule.check('The sensor was built in May and the specs were written later.');
  assert.equal(irregularRes.passed, false);
  assert.equal(irregularRes.violationCount, 2);
  assert.equal(irregularRes.matches[0].excerpt.toLowerCase(), 'was built');
  assert.equal(irregularRes.matches[1].excerpt.toLowerCase(), 'were written');
});

test('-ly adverb analyzer ignores non-adverb words and contraction checker supports curly apostrophes', () => {
  const lyRule = getConstraintById('ban-ly-adverbs')!;
  assert.equal(
    lyRule.check('Our friendly monthly report is likely to land early and cleanly.').passed,
    true
  );
  assert.equal(
    lyRule.check('She spoke quickly and moved quietly while thinking carefully.').passed,
    false
  );

  const contractionRule = getConstraintById('use-natural-contractions')!;
  const spoken =
    'Let’s keep the design simple because it’s easier to debug when sensors drift under load and teams need clear answers during live reviews today.';
  assert.equal(contractionRule.check(spoken).passed, true);

  const formal =
    'We do not want to ship a broken circuit because it is difficult to debug under heavy thermal load when engineers are testing new board prototypes in production.';
  const formalRes = contractionRule.check(formal);
  assert.equal(formalRes.passed, false);
  assert.ok(formalRes.matches.length >= 2);
});

test('mode recommendations and batch preview work deterministically', () => {
  const techRecs = getRecommendedConstraintsForMode('technical');
  assert.ok(techRecs.length >= 5);
  const preview = evaluateAllConstraintsPreview('It is very really noisy.');
  assert.equal(preview['ban-very-really-actually'].violationCount, 2);
  assert.equal(preview['zero-calques'].passed, true);
});
