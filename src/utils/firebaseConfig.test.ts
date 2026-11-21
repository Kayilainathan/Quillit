import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFirebaseConfig } from './firebaseConfig';

test('resolveFirebaseConfig uses file config when valid and allows VITE env overrides', () => {
  const fromFile = resolveFirebaseConfig({
    apiKey: 'AIzaRealKey123',
    projectId: 'quillit-prod',
    appId: '1:123:web:abc',
    authDomain: 'quillit-prod.firebaseapp.com',
    firestoreDatabaseId: 'custom-db-id',
  });
  assert.ok(fromFile);
  assert.equal(fromFile.projectId, 'quillit-prod');
  assert.equal(fromFile.firestoreDatabaseId, 'custom-db-id');

  const overridden = resolveFirebaseConfig(fromFile, {
    VITE_FIREBASE_PROJECT_ID: 'pages-override-proj',
    VITE_FIREBASE_DATABASE_ID: 'pages-db',
  });
  assert.ok(overridden);
  assert.equal(overridden.projectId, 'pages-override-proj');
  assert.equal(overridden.firestoreDatabaseId, 'pages-db');
  assert.equal(overridden.apiKey, 'AIzaRealKey123');
});

test('resolveFirebaseConfig returns null cleanly when unconfigured or placeholder', () => {
  assert.equal(resolveFirebaseConfig(null, {}), null);
  assert.equal(resolveFirebaseConfig(undefined, {}), null);
  assert.equal(
    resolveFirebaseConfig({
      apiKey: 'AIzaRealKey123',
      projectId: 'remixed-project-id',
      appId: '1:123:web:abc',
    }),
    null
  );
  assert.equal(
    resolveFirebaseConfig({
      apiKey: 'MY_FIREBASE_KEY',
      projectId: 'quillit-prod',
      appId: '1:123:web:abc',
    }),
    null
  );
});

test('resolveFirebaseConfig derives authDomain automatically when omitted in env vars', () => {
  const fromEnvOnly = resolveFirebaseConfig(null, {
    VITE_FIREBASE_API_KEY: 'AIzaEnvKey999',
    VITE_FIREBASE_PROJECT_ID: 'my-gh-pages-app',
    VITE_FIREBASE_APP_ID: '1:999:web:xyz',
  });
  assert.ok(fromEnvOnly);
  assert.equal(fromEnvOnly.authDomain, 'my-gh-pages-app.firebaseapp.com');
});
