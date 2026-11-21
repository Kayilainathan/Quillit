const RECOVERY_LOCKBOX_KEY = 'quillit_offline_recovery_v1';
const RECOVERY_PBKDF2_ITERATIONS = 150000;
// Unambiguous uppercase alphabet (no 0, O, 1, I) for calm, mistake-free transcription
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface OfflineRecoveryLockbox {
  format: 'quillit-recovery-v1';
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
  hint?: string;
  createdAt: string;
}

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

/**
 * Generates an 80-bit cryptographic Offline Recovery Key formatted cleanly
 * in 4-character ink-friendly groups: QUILL-XXXX-XXXX-XXXX-XXXX.
 */
export function generateRecoveryKey(): string {
  const randomBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  let chars = '';
  for (let i = 0; i < 16; i += 1) {
    chars += KEY_ALPHABET[randomBytes[i] % KEY_ALPHABET.length];
  }
  return `QUILL-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

/**
 * Normalizes user-entered recovery keys so spaces, lowercase letters,
 * or missing hyphens never cause false rejections.
 */
export function normalizeRecoveryKey(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = cleaned.startsWith('QUILL') ? cleaned.slice(5) : cleaned;
  if (body.length !== 16) {
    return input.trim().toUpperCase();
  }
  return `QUILL-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

/**
 * Validates an optional memory hint so users never accidentally store
 * their actual passphrase inside a plaintext hint.
 */
export function validatePassphraseHint(
  hint: string,
  passphrase: string
): { ok: boolean; error?: string; cleaned: string } {
  const cleaned = hint.trim();
  if (!cleaned) {
    return { ok: true, cleaned: '' };
  }
  if (cleaned.length > 120) {
    return {
      ok: false,
      error: 'Keep your memory hint under 120 characters.',
      cleaned,
    };
  }
  const normalizedPass = passphrase.trim().toLowerCase();
  if (
    normalizedPass.length >= 4 &&
    cleaned.toLowerCase().includes(normalizedPass)
  ) {
    return {
      ok: false,
      error:
        'Your hint should only jog your memory, never include the passphrase itself.',
      cleaned,
    };
  }
  return { ok: true, cleaned };
}

async function deriveRecoveryAesKey(
  normalizedRecoveryKey: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizedRecoveryKey),
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

/**
 * Encrypts the Offline Space passphrase inside a zero-knowledge AES-256-GCM
 * recovery lockbox keyed strictly by the one-time Recovery Key.
 */
export async function encryptRecoveryLockbox(
  passphrase: string,
  recoveryKey: string,
  hint?: string
): Promise<OfflineRecoveryLockbox> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase is required to seal your recovery lockbox.');
  }
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  const subtle = getSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveRecoveryAesKey(
    normalizedKey,
    salt,
    RECOVERY_PBKDF2_ITERATIONS
  );
  const plaintext = new TextEncoder().encode(JSON.stringify({ passphrase }));
  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    plaintext
  );

  const cleanedHint = hint?.trim() || undefined;
  return {
    format: 'quillit-recovery-v1',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iterations: RECOVERY_PBKDF2_ITERATIONS,
    ...(cleanedHint ? { hint: cleanedHint } : {}),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Unlocks the stored recovery lockbox with the writer's saved Recovery Key
 * to recover access to their encrypted Offline Space without data loss.
 */
export async function decryptPassphraseWithRecoveryKey(
  lockbox: OfflineRecoveryLockbox,
  recoveryKeyInput: string
): Promise<string> {
  if (lockbox?.format !== 'quillit-recovery-v1') {
    throw new Error('Saved recovery lockbox format is not recognized.');
  }
  const normalizedKey = normalizeRecoveryKey(recoveryKeyInput);
  if (!normalizedKey || normalizedKey.length < 16) {
    throw new Error('Enter your full Recovery Key (for example, QUILL-XXXX-XXXX-XXXX-XXXX).');
  }

  const subtle = getSubtle();
  const salt = base64ToBytes(lockbox.salt);
  const iv = base64ToBytes(lockbox.iv);
  const ciphertext = base64ToBytes(lockbox.ciphertext);
  const iterations = lockbox.iterations || RECOVERY_PBKDF2_ITERATIONS;

  const aesKey = await deriveRecoveryAesKey(normalizedKey, salt, iterations);

  try {
    const decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource
    );
    const parsed = JSON.parse(
      new TextDecoder().decode(decryptedBuffer)
    ) as { passphrase?: string };
    if (!parsed?.passphrase || typeof parsed.passphrase !== 'string') {
      throw new Error('Recovered payload is invalid.');
    }
    return parsed.passphrase;
  } catch {
    throw new Error(
      'That Recovery Key did not match this Offline Space. Double check each character and try again.'
    );
  }
}

export function isOfflineRecoveryLockbox(
  value: unknown
): value is OfflineRecoveryLockbox {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<OfflineRecoveryLockbox>;
  return (
    c.format === 'quillit-recovery-v1' &&
    typeof c.salt === 'string' &&
    typeof c.iv === 'string' &&
    typeof c.ciphertext === 'string'
  );
}

export function loadOfflineRecoveryLockbox(): OfflineRecoveryLockbox | null {
  try {
    const raw = localStorage.getItem(RECOVERY_LOCKBOX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isOfflineRecoveryLockbox(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveOfflineRecoveryLockbox(
  lockbox: OfflineRecoveryLockbox
): void {
  try {
    localStorage.setItem(RECOVERY_LOCKBOX_KEY, JSON.stringify(lockbox));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearOfflineRecoveryLockbox(): void {
  try {
    localStorage.removeItem(RECOVERY_LOCKBOX_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function buildRecoveryCardText(
  recoveryKey: string,
  hint?: string
): string {
  const dateLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const lines = [
    'QUILLIT OFFLINE SPACE · EMERGENCY RECOVERY CARD',
    '================================================',
    `Created: ${dateLabel}`,
    '',
    'Recovery Key:',
    `  ${recoveryKey}`,
    '',
  ];
  if (hint && hint.trim()) {
    lines.push('Saved Memory Hint:', `  ${hint.trim()}`, '');
  }
  lines.push(
    'How this protects your writing:',
    'Your Offline Space is encrypted directly on your browser with AES-256-GCM.',
    'Quillit never sees or stores your passphrase on any server.',
    'If you ever forget your passphrase, open "Forgot passphrase?" in Offline Space',
    'and enter this Recovery Key to unlock your pages and set a new passphrase.',
    '',
    'Keep this card somewhere private (a password manager, printed note, or secure folder).'
  );
  return `${lines.join('\n')}\n`;
}
