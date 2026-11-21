import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_QUESTION_PRESETS,
  buildRecoveryCardText,
  decryptPassphraseWithRecoveryKey,
  decryptPassphraseWithSecurityAnswer,
  encryptRecoveryLockbox,
  generateRecoveryKey,
  hasSecurityQuestionLockbox,
  normalizeRecoveryKey,
  normalizeSecurityAnswer,
  validateSecurityQuestionAndAnswer,
} from './offlineRecovery';

test('generateRecoveryKey creates formatted 4-group QUILL keys', () => {
  const key = generateRecoveryKey();
  assert.match(key, /^QUILL-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test('normalizeRecoveryKey tolerates lowercase, spaces, and missing hyphens', () => {
  const raw = 'quill abcd efgh jklm npqr';
  assert.equal(normalizeRecoveryKey(raw), 'QUILL-ABCD-EFGH-JKLM-NPQR');

  const compact = 'abcdefghjklmnpqr';
  assert.equal(normalizeRecoveryKey(compact), 'QUILL-ABCD-EFGH-JKLM-NPQR');
});

test('normalizeSecurityAnswer trims, lowercases, and collapses spacing', () => {
  assert.equal(
    normalizeSecurityAnswer('  The   Little  Prince  '),
    'the little prince'
  );
});

test('validateSecurityQuestionAndAnswer blocks matching passphrase or half-filled setup', () => {
  const bothBlank = validateSecurityQuestionAndAnswer('', '', 'mySecretInk42');
  assert.equal(bothBlank.ok, true);
  assert.equal(bothBlank.setup, undefined);

  const missingAnswer = validateSecurityQuestionAndAnswer(
    SECURITY_QUESTION_PRESETS[0],
    '',
    'mySecretInk42'
  );
  assert.equal(missingAnswer.ok, false);

  const leaksPass = validateSecurityQuestionAndAnswer(
    SECURITY_QUESTION_PRESETS[0],
    'mySecretInk42',
    'mySecretInk42'
  );
  assert.equal(leaksPass.ok, false);

  const tooShort = validateSecurityQuestionAndAnswer(
    SECURITY_QUESTION_PRESETS[0],
    'ab',
    'mySecretInk42'
  );
  assert.equal(tooShort.ok, false);

  const valid = validateSecurityQuestionAndAnswer(
    SECURITY_QUESTION_PRESETS[0],
    'The Little Prince',
    'mySecretInk42'
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.setup?.answer, 'the little prince');
});

test('encryptRecoveryLockbox seals dual zero-knowledge paths without storing plaintext answer', async () => {
  const passphrase = 'FountainPen#2026!';
  const recoveryKey = generateRecoveryKey();
  const question = SECURITY_QUESTION_PRESETS[0];
  const answer = 'The Little Prince';

  const lockbox = await encryptRecoveryLockbox(passphrase, recoveryKey, {
    question,
    answer,
  });

  assert.equal(hasSecurityQuestionLockbox(lockbox), true);

  // Zero plaintext secret leakage check
  const serialized = JSON.stringify(lockbox).toLowerCase();
  assert.equal(serialized.includes('little prince'), false);
  assert.equal(serialized.includes('fountainpen'), false);

  // Path 1: Unlock via Recovery Key (with flexible casing/spacing)
  const fromKey = await decryptPassphraseWithRecoveryKey(
    lockbox,
    recoveryKey.toLowerCase().replace(/-/g, ' ')
  );
  assert.equal(fromKey, passphrase);

  // Path 2: Unlock via Personal Security Answer (tolerates extra spaces & case)
  const fromAnswer = await decryptPassphraseWithSecurityAnswer(
    lockbox,
    '  the   LITTLE prince '
  );
  assert.equal(fromAnswer, passphrase);

  // Wrong answer is cryptographically rejected
  await assert.rejects(
    () => decryptPassphraseWithSecurityAnswer(lockbox, 'Moby Dick'),
    /did not match/i
  );

  // Wrong key is cryptographically rejected
  await assert.rejects(
    () => decryptPassphraseWithRecoveryKey(lockbox, generateRecoveryKey()),
    /did not match/i
  );

  // Recovery card lists question only, never the private answer
  const card = buildRecoveryCardText(recoveryKey, question);
  assert.equal(card.includes(recoveryKey), true);
  assert.equal(card.includes(question), true);
  assert.equal(card.toLowerCase().includes('little prince'), false);
});
