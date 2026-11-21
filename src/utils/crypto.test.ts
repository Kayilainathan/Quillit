import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedVaultPayload } from './analytics';
import { decryptVault, encryptVault, isEncryptedEnvelope } from './crypto';

test('AES-256-GCM vault encryption round-trips cleanly and rejects wrong passphrases', async () => {
  const payload = createSeedVaultPayload('2026-11-18');
  const envelope = await encryptVault(payload, 'eie-6th-sem-secret');

  assert.equal(isEncryptedEnvelope(envelope), true);
  assert.ok(!envelope.ciphertext.includes('Wheatstone'));

  const decrypted = await decryptVault(envelope, 'eie-6th-sem-secret');
  assert.equal(decrypted.sessions.length, 4);
  assert.equal(decrypted.vocabulary.length, 9);

  await assert.rejects(
    () => decryptVault(envelope, 'wrong-password'),
    /Incorrect passphrase/
  );
});
