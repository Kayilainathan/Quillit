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
  assert.ok(rules.includes("existing().status == 'Draft' || existing().evaluationPending == true"));
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
