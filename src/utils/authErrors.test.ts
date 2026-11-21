import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatFirebaseAuthError } from './authErrors';

describe('formatFirebaseAuthError', () => {
  it('maps auth/operation-not-allowed to Firebase Console instructions', () => {
    const msg = formatFirebaseAuthError({
      code: 'auth/operation-not-allowed',
      message: 'Firebase: Error (auth/operation-not-allowed).',
    });
    assert.match(msg, /Email\/Password/i);
    assert.match(msg, /Firebase Console/i);
  });

  it('maps popup-closed and popup-blocked clearly', () => {
    assert.match(
      formatFirebaseAuthError({ code: 'auth/popup-closed-by-user' }),
      /popup was closed/i
    );
    assert.match(
      formatFirebaseAuthError({ code: 'auth/popup-blocked' }),
      /blocked the Google sign-in popup/i
    );
  });

  it('maps unauthorized domain with Authorized domains hint', () => {
    assert.match(
      formatFirebaseAuthError({ code: 'auth/unauthorized-domain' }),
      /Authorized domains/i
    );
  });

  it('maps invalid-credential, email-already-in-use, and weak-password', () => {
    assert.match(
      formatFirebaseAuthError({ code: 'auth/invalid-credential' }),
      /Incorrect email or password/i
    );
    assert.match(
      formatFirebaseAuthError({ code: 'auth/email-already-in-use' }),
      /already exists/i
    );
    assert.match(
      formatFirebaseAuthError({ code: 'auth/weak-password' }),
      /at least 6 characters/i
    );
  });

  it('handles embedded error code inside Error message fallback', () => {
    const msg = formatFirebaseAuthError(
      new Error('Firebase: Error (auth/operation-not-allowed).')
    );
    assert.match(msg, /Sign-in method/i);
  });

  it('falls back gracefully on unknown errors', () => {
    assert.equal(
      formatFirebaseAuthError(new Error('Custom network hiccup')),
      'Custom network hiccup'
    );
    assert.match(formatFirebaseAuthError(null), /could not be completed/i);
  });
});
