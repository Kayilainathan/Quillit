import assert from 'node:assert/strict';
import test from 'node:test';
import type { VocabEntry } from '../types';
import {
  applyAiCategoriesToVocabulary,
  classifyVocabEntryLocally,
  groupVocabularyAlphabetically,
} from './vocabCatalog';

function makeVocab(
  id: string,
  betterAlternative: string,
  used: string,
  mode: VocabEntry['mode'],
  explanation: string
): VocabEntry {
  return {
    id,
    used,
    betterAlternative,
    explanation,
    contextSnippet: 'Test context',
    mode,
    dateAdded: '2026-11-21',
    mastered: false,
  };
}

test('groupVocabularyAlphabetically sorts strictly A-Z and counts letters accurately', () => {
  const entries: VocabEntry[] = [
    makeVocab('v1', 'Resilient', 'strong', 'linkedin', 'Recovers cleanly under pressure'),
    makeVocab('v2', 'Alacrity', 'fast eagerness', 'creative', 'Brisk and cheerful readiness'),
    makeVocab('v3', 'Calibrate', 'adjust', 'technical', 'Tune a sensor against a known reference'),
    makeVocab('v4', 'Attenuate', 'reduce', 'technical', 'Lower signal amplitude cleanly'),
  ];

  const { groups, letterCounts } = groupVocabularyAlphabetically(entries);

  assert.deepEqual(
    groups.map((g) => g.letter),
    ['A', 'C', 'R']
  );
  assert.deepEqual(
    groups[0].entries.map((e) => e.betterAlternative),
    ['Alacrity', 'Attenuate']
  );
  assert.equal(letterCounts.A, 2);
  assert.equal(letterCounts.C, 1);
  assert.equal(letterCounts.R, 1);
});

test('classifyVocabEntryLocally assigns meaningful categories and applyAiCategoriesToVocabulary merges AI overrides', () => {
  const tech = makeVocab(
    'v-tech',
    'Attenuate',
    'reduce',
    'technical',
    'Reduce electrical noise amplitude on an op-amp filter'
  );
  const email = makeVocab(
    'v-mail',
    'Concise follow-up',
    'quick ping',
    'email',
    'Polite outreach message to a hiring manager'
  );
  const story = makeVocab(
    'v-story',
    'Luminous',
    'bright',
    'creative',
    'Soft glowing atmosphere in a fantasy scene'
  );

  assert.equal(classifyVocabEntryLocally(tech), 'Technical & Engineering');
  assert.equal(classifyVocabEntryLocally(email), 'Professional & Outreach');
  assert.equal(classifyVocabEntryLocally(story), 'Storytelling & Vivid');

  const updated = applyAiCategoriesToVocabulary([tech, email, story], {
    'v-tech': 'Precision & Clarity',
  });
  assert.equal(updated[0].aiCategory, 'Precision & Clarity');
  assert.equal(updated[1].aiCategory, 'Professional & Outreach');
  assert.equal(updated[2].aiCategory, 'Storytelling & Vivid');
});
