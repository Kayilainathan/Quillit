import type { EncryptedEnvelope, VaultPayload } from '../types';

const PBKDF2_ITERATIONS = 150000;

function getSubtle(): SubtleCrypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  return cryptoApi.subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVault(
  payload: VaultPayload,
  passphrase: string
): Promise<EncryptedEnvelope> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters long.');
  }
  const subtle = getSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  );

  return {
    format: 'cadence-aes-gcm-v1',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iterations: PBKDF2_ITERATIONS,
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptVault(
  envelope: EncryptedEnvelope,
  passphrase: string
): Promise<VaultPayload> {
  if (envelope?.format !== 'cadence-aes-gcm-v1') {
    throw new Error('Unsupported encrypted vault format.');
  }
  if (!passphrase) {
    throw new Error('Passphrase is required to unlock your vault.');
  }

  const subtle = getSubtle();
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const iterations = envelope.iterations || PBKDF2_ITERATIONS;

  const key = await deriveAesKey(passphrase, salt, iterations);

  try {
    const decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    const decoded = new TextDecoder().decode(decryptedBuffer);
    const parsed = JSON.parse(decoded) as VaultPayload;
    if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.vocabulary)) {
      throw new Error('Decrypted payload has invalid structure.');
    }
    return parsed;
  } catch {
    throw new Error('Incorrect passphrase or corrupted encrypted vault.');
  }
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EncryptedEnvelope>;
  return (
    candidate.format === 'cadence-aes-gcm-v1' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ciphertext === 'string'
  );
}
