import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));

test('firestore.rules enforces default-deny, verified ownership, size bounds, and temporal integrity', () => {
  assert.ok(rules.includes("rules_version = '2';"));
  assert.ok(rules.includes('match /{document=**} {\n      allow read, write: if false;'));
  assert.ok(rules.includes('request.auth.token.email_verified == true'));
  assert.ok(rules.includes('isValidId(userId)'));
  assert.ok(rules.includes('incoming().createdAt == request.time'));
  assert.ok(rules.includes('incoming().updatedAt == request.time'));
  assert.ok(rules.includes('resource.data.ownerId == request.auth.uid'));
  assert.ok(rules.includes("existing().status == 'Draft'"));
  assert.ok(rules.includes("existing().evaluationPending == true"));
  assert.ok(rules.includes("'offline-rubric'"));
  assert.ok(rules.includes('data.collegeDegree is string && data.collegeDegree.size() <= 120'));
  assert.ok(rules.includes('data.age is number && data.age >= 14 && data.age <= 80'));
  assert.ok(rules.includes('data.googleSpreadsheetId is string'));
  assert.ok(rules.includes('data.googleDocId is string'));

  for (const collectionPath of Object.keys(blueprint.firestore)) {
    const cleanName = collectionPath.split('/').pop()!;
    if (cleanName === '{userId}') {
      assert.ok(rules.includes('match /users/{userId}'));
    } else {
      const segment = collectionPath.split('/').slice(-2, -1)[0];
      assert.ok(rules.includes(`match /${segment}/{`), `Missing rule block for ${collectionPath}`);
    }
  }
});

test('firestore.rules validates all v3.1 UserProfile, WritingSession, CalendarSlot, and VocabEntry fields in lockstep with blueprint', () => {
  // UserProfile v3.1 fields
  assert.ok(rules.includes("data.customCoachPrompt is string && data.customCoachPrompt.size() <= 500"));
  assert.ok(rules.includes("data.coachPresets is list && data.coachPresets.size() <= 8"));
  assert.ok(rules.includes("data.tactileSoundEnabled is bool"));
  assert.ok(rules.includes("data.vaultLatchEnabled is bool"));

  // WritingSession v3.1 fields + converse mode
  assert.ok(rules.includes("'converse'"));
  assert.ok(rules.includes("data.spokenReadinessScore >= 0 && data.spokenReadinessScore <= 100"));
  assert.ok(rules.includes("data.signalNoiseRatio >= 0 && data.signalNoiseRatio <= 100"));
  assert.ok(rules.includes("data.audienceReaction is string && data.audienceReaction.size() <= 400"));
  assert.ok(rules.includes("isValidDrillType(data.drillType)"));
  assert.ok(rules.includes("data.revisionOfSessionId is string && data.revisionOfSessionId.size() <= 128"));
  assert.ok(rules.includes("data.revisionDelta >= -60 && data.revisionDelta <= 60"));

  // VocabEntry v3.1 mastery fields
  assert.ok(rules.includes("data.category is string && data.category.size() <= 60"));
  assert.ok(rules.includes("data.usageCount >= 0 && data.usageCount <= 500"));
  assert.ok(rules.includes("isValidMasteryStage(data.masteryStage)"));

  // Verify blueprint lockstep
  assert.equal(blueprint.entities.UserProfile.properties.customCoachPrompt.maxLength, 500);
  assert.ok(blueprint.entities.WritingSessionDoc.properties.mode.enum.includes('converse'));
  assert.equal(blueprint.entities.WritingSessionDoc.properties.audienceReaction.maxLength, 400);
  assert.deepEqual(blueprint.entities.VocabEntryDoc.properties.masteryStage.enum, [
    'new',
    'emerging',
    'building',
    'mastered',
  ]);
});

test('firestore.rules validates v4.0 Draft updates and unified edits/toneCheck/nextDraftPriority in lockstep with blueprint', () => {
  assert.ok(rules.includes("'content', 'wordCount', 'topicDescription'"));
  assert.ok(rules.includes("data.edits is list && data.edits.size() <= 12"));
  assert.ok(rules.includes("data.toneCheck is map && data.toneCheck.keys().size() <= 5"));
  assert.ok(rules.includes("data.nextDraftPriority is string && data.nextDraftPriority.size() <= 240"));
  assert.ok(rules.includes("data.targetCheck is map && data.targetCheck.keys().size() <= 4"));

  assert.equal(blueprint.entities.WritingSessionDoc.properties.edits.type, 'array');
  assert.equal(blueprint.entities.WritingSessionDoc.properties.toneCheck.type, 'object');
  assert.equal(blueprint.entities.WritingSessionDoc.properties.nextDraftPriority.maxLength, 240);
  assert.equal(blueprint.entities.WritingSessionDoc.properties.targetCheck.type, 'object');
});


