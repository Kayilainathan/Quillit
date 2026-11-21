import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAllOfflineIssues,
  applyOfflineIssue,
  runOfflineProofread,
} from './offlineProofreader';

test('runOfflineProofread flags common typos, missing apostrophes, and preserves case', () => {
  const text =
    'Teh student definately cant wait to recieve thier freind at teh libary.';
  const issues = runOfflineProofread(text);

  const map = new Map(issues.map((i) => [i.original, i.replacement]));
  assert.equal(map.get('Teh'), 'The');
  assert.equal(map.get('definately'), 'definitely');
  assert.equal(map.get('cant'), "can't");
  assert.equal(map.get('recieve'), 'receive');
  assert.equal(map.get('thier'), 'their');
  assert.equal(map.get('freind'), 'friend');
  assert.equal(map.get('libary'), 'library');

  const fixed = applyAllOfflineIssues(text, issues);
  assert.equal(
    fixed,
    "The student definitely can't wait to receive their friend at the library."
  );
});

test('runOfflineProofread catches basic subject-verb agreement and irregular past after did', () => {
  const text =
    "I is ready. He are late and they was tired. She don't know, and he didn't went home. There is many reasons.";
  const issues = runOfflineProofread(text);
  const fixed = applyAllOfflineIssues(text, issues);

  assert.equal(
    fixed,
    "I am ready. He is late and they were tired. She doesn't know, and he didn't go home. There are many reasons."
  );
});

test('runOfflineProofread catches should of, double comparisons, and your welcome', () => {
  const text =
    'You should of tried harder because this is more better, and your welcome anytime.';
  const issues = runOfflineProofread(text);
  const fixed = applyAllOfflineIssues(text, issues);

  assert.equal(
    fixed,
    "You should have tried harder because this is better, and you're welcome anytime."
  );
});

test('runOfflineProofread catches standalone i, repeated words, a/an, capitalization, and spacing', () => {
  const text = 'i saw a apple  in the the garden ,and it was an university day.';
  const issues = runOfflineProofread(text);
  const fixed = applyAllOfflineIssues(text, issues);

  assert.equal(
    fixed,
    'I saw an apple in the garden, and it was a university day.'
  );
});

test('runOfflineProofread avoids false positives on clean prose and uppercase ID', () => {
  const clean =
    'An honest engineer checked the ID before it lets us run the final test.';
  const issues = runOfflineProofread(clean);
  assert.equal(issues.length, 0);
});

test('applyOfflineIssue applies a single fix accurately', () => {
  const text = 'We wrote teh note.';
  const issues = runOfflineProofread(text);
  assert.equal(issues.length, 1);
  assert.equal(applyOfflineIssue(text, issues[0]), 'We wrote the note.');
});
