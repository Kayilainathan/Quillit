import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAllOfflineIssues,
  applyOfflineIssue,
  runOfflineProofread,
} from './offlineProofreader';

test('runOfflineProofread detects spelling, grammar, and punctuation issues offline', () => {
  const sample =
    'i recieve teh email ,and i should of sent a apple to the the team.next morning was quiet.';
  const issues = runOfflineProofread(sample);

  assert.ok(issues.some((i) => i.original === 'recieve' && i.replacement === 'receive'));
  assert.ok(issues.some((i) => i.original === 'teh' && i.replacement === 'the'));
  assert.ok(issues.some((i) => i.original === 'should of' && i.replacement === 'should have'));
  assert.ok(issues.some((i) => i.original === 'a apple' && i.replacement === 'an apple'));
  assert.ok(issues.some((i) => i.original === 'the the' && i.replacement === 'the'));
  assert.ok(issues.some((i) => i.category === 'punctuation'));
});

test('applyOfflineIssue and applyAllOfflineIssues cleanly patch text without corrupting offsets', () => {
  const sample = 'teh cat  sat on a apple ,and i smiled.';
  const issues = runOfflineProofread(sample);
  assert.ok(issues.length >= 4);

  const singleFixed = applyOfflineIssue(sample, issues[0]);
  assert.notEqual(singleFixed, sample);

  const allFixed = applyAllOfflineIssues(sample, issues);
  assert.equal(allFixed.includes('teh'), false);
  assert.equal(allFixed.includes('  '), false);
  assert.equal(allFixed.includes('a apple'), false);
  assert.equal(allFixed.includes(' ,'), false);
  assert.equal(allFixed.includes(' i '), false);
});

test('runOfflineProofread handles article exceptions like hour and university properly', () => {
  const clean = 'She spent an hour at a university before writing a clean draft.';
  const issues = runOfflineProofread(clean);
  assert.equal(issues.length, 0);
});

test('applyAllOfflineIssues resolves cascading punctuation & preserves domains', () => {
  const sample =
    'i recieve teh draft ,and a apple was on the the desk.next day visit quillit.com.';
  const issues = runOfflineProofread(sample);
  const fixed = applyAllOfflineIssues(sample, issues);
  assert.equal(
    fixed,
    'I receive the draft, and an apple was on the desk. Next day visit quillit.com.'
  );
  assert.equal(runOfflineProofread(fixed).length, 0);
});
