import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecoveryCardText,
  decryptPassphraseWithRecoveryKey,
  encryptRecoveryLockbox,
  generateRecoveryKey,
  normalizeRecoveryKey,
  validatePassphraseHint,
} from './offlineRecovery';
import { decryptVault, encryptVault } from './crypto';
import { createEmptyVaultPayload } from './analytics';

test('generateRecoveryKey creates formatted 80-bit key and normalizeRecoveryKey handles sloppy formatting', () => {
  const key = generateRecoveryKey();
  assert.match(key, /^QUILL-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const rawBody = key.replace(/^QUILL-/, '').replace(/-/g, '').toLowerCase();
  assert.equal(normalizeRecoveryKey(`  ${rawBody}  `), key);
  assert.equal(normalizeRecoveryKey(`quill ${rawBody}`), key);
});

test('validatePassphraseHint blocks accidental passphrase disclosure and trims safely', () => {
  const ok = validatePassphraseHint('  Favorite street + debut album year  ', 'mySecretPass42');
  assert.equal(ok.ok, true);
  assert.equal(ok.cleaned, 'Favorite street + debut album year');

  const leaked = validatePassphraseHint('It starts with mySecretPass42!', 'mySecretPass42');
  assert.equal(leaked.ok, false);

  const empty = validatePassphraseHint('   ', 'mySecretPass42');
  assert.equal(empty.ok, true);
  assert.equal(empty.cleaned, '');
});

test('encryptRecoveryLockbox round-trips passphrase and unlocks a real encrypted vault when passphrase is forgotten', async () => {
  const originalPassphrase = 'autumn-notebook-42';
  const recoveryKey = generateRecoveryKey();

  // Encrypt an actual vault with the original passphrase
  const payload = createEmptyVaultPayload();
  payload.settings.studentProfile = {
    displayName: 'Kavya',
    age: 20,
    collegeName: 'Anna University',
    collegeDegree: '',
    semester: '',
    onboardingCompleted: true,
  };
  const encryptedVault = await encryptVault(payload, originalPassphrase);

  // Seal the recovery lockbox with the recovery key + memory hint
  const lockbox = await encryptRecoveryLockbox(
    originalPassphrase,
    recoveryKey,
    'Season + desk item + answer'
  );
  assert.equal(lockbox.hint, 'Season + desk item + answer');
  assert.equal(JSON.stringify(lockbox).includes(originalPassphrase), false);

  // Wrong recovery key must fail cleanly
  await assert.rejects(
    () => decryptPassphraseWithRecoveryKey(lockbox, generateRecoveryKey()),
    /did not match/i
  );

  // Correct recovery key (even pasted lowercase without dashes) recovers original passphrase and decrypts the real vault
  const sloppyKey = recoveryKey.toLowerCase().replace(/-/g, ' ');
  const recoveredPass = await decryptPassphraseWithRecoveryKey(lockbox, sloppyKey);
  assert.equal(recoveredPass, originalPassphrase);

  const decryptedVault = await decryptVault(encryptedVault, recoveredPass);
  assert.equal(decryptedVault.settings.studentProfile?.displayName, 'Kavya');

  const cardText = buildRecoveryCardText(recoveryKey, lockbox.hint);
  assert.equal(cardText.includes(recoveryKey), true);
  assert.equal(cardText.includes('Season + desk item + answer'), true);
});
