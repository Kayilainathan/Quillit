const RECOVERY_LOCKBOX_KEY = 'quillit_offline_recovery_v1';
const RECOVERY_PBKDF2_ITERATIONS = 150000;
// Unambiguous uppercase alphabet (no 0, O, 1, I) for calm, mistake-free transcription
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const SECURITY_QUESTION_PRESETS: readonly string[] = [
  'What is the title of a book that changed how you think?',
  'What street, café, or place feels most like home to you?',
  'Who was a teacher or mentor who shaped your voice?',
  'What quiet daily ritual do you rarely skip?',
  'What childhood nickname or private memory only you know?',
] as const;

export interface EncryptedRecoveryPayload {
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
}

export interface SecurityQuestionSetup {
  question: string;
  answer: string;
}

export interface OfflineRecoveryLockbox {
  format: 'quillit-recovery-v1';
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
  /** Optional personal security question text (never stores the private answer) */
  securityQuestion?: string;
  /** Independent AES-256-GCM lockbox keyed by PBKDF2(normalized security answer) */
  securityAnswerLockbox?: EncryptedRecoveryPayload;
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
 * Normalizes a private security answer so minor capitalization or extra spacing
 * never causes accidental lockouts while preserving full semantic secrecy.
 */
export function normalizeSecurityAnswer(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Validates an optional Personal Security Question & Private Answer pair.
 * Never allows the private answer to match or leak the main passphrase.
 */
export function validateSecurityQuestionAndAnswer(
  question: string,
  answer: string,
  passphrase: string
): {
  ok: boolean;
  error?: string;
  setup?: SecurityQuestionSetup;
} {
  const cleanedQuestion = question.trim();
  const normalizedAnswer = normalizeSecurityAnswer(answer);

  if (!cleanedQuestion && !normalizedAnswer) {
    return { ok: true, setup: undefined };
  }

  if (cleanedQuestion && !normalizedAnswer) {
    return {
      ok: false,
      error:
        'Add a private answer for your security question, or leave both blank to rely on your Recovery Key.',
    };
  }

  if (!cleanedQuestion && normalizedAnswer) {
    return {
      ok: false,
      error: 'Choose or write a security question to pair with your private answer.',
    };
  }

  if (cleanedQuestion.length < 6) {
    return {
      ok: false,
      error: 'Write a slightly clearer security question (at least 6 characters).',
    };
  }

  if (cleanedQuestion.length > 140) {
    return {
      ok: false,
      error: 'Keep your security question under 140 characters.',
    };
  }

  if (normalizedAnswer.length < 3) {
    return {
      ok: false,
      error: 'Use at least 3 characters for your private security answer.',
    };
  }

  const normalizedPass = normalizeSecurityAnswer(passphrase);
  if (
    normalizedPass.length >= 4 &&
    (normalizedAnswer === normalizedPass ||
      normalizedAnswer.includes(normalizedPass) ||
      (normalizedAnswer.length >= 4 && normalizedPass.includes(normalizedAnswer)))
  ) {
    return {
      ok: false,
      error:
        'Keep your private answer different from your passphrase so both stay independent and secure.',
    };
  }

  return {
    ok: true,
    setup: {
      question: cleanedQuestion,
      answer: normalizedAnswer,
    },
  };
}

async function deriveRecoveryAesKey(
  secretMaterial: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secretMaterial),
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

async function sealSecretPayload(
  secretMaterial: string,
  passphrase: string
): Promise<EncryptedRecoveryPayload> {
  const subtle = getSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveRecoveryAesKey(
    secretMaterial,
    salt,
    RECOVERY_PBKDF2_ITERATIONS
  );
  const plaintext = new TextEncoder().encode(JSON.stringify({ passphrase }));
  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    plaintext
  );
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iterations: RECOVERY_PBKDF2_ITERATIONS,
  };
}

async function openSecretPayload(
  payload: EncryptedRecoveryPayload,
  secretMaterial: string
): Promise<string> {
  const subtle = getSubtle();
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const iterations = payload.iterations || RECOVERY_PBKDF2_ITERATIONS;

  const aesKey = await deriveRecoveryAesKey(secretMaterial, salt, iterations);
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
}

/**
 * Encrypts the Offline Space passphrase inside a zero-knowledge AES-256-GCM
 * recovery lockbox keyed strictly by the one-time Recovery Key, and optionally
 * seals a second independent lockbox keyed by a Personal Security Answer.
 * Zero plaintext clues or answers are ever stored.
 */
export async function encryptRecoveryLockbox(
  passphrase: string,
  recoveryKey: string,
  securitySetup?: SecurityQuestionSetup
): Promise<OfflineRecoveryLockbox> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase is required to seal your recovery lockbox.');
  }

  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  const primarySealed = await sealSecretPayload(normalizedKey, passphrase);

  let securityQuestion: string | undefined;
  let securityAnswerLockbox: EncryptedRecoveryPayload | undefined;

  if (securitySetup?.question.trim() && securitySetup?.answer.trim()) {
    const normalizedAnswer = normalizeSecurityAnswer(securitySetup.answer);
    securityQuestion = securitySetup.question.trim();
    securityAnswerLockbox = await sealSecretPayload(
      `quillit-sec-q::${normalizedAnswer}`,
      passphrase
    );
  }

  return {
    format: 'quillit-recovery-v1',
    ...primarySealed,
    ...(securityQuestion && securityAnswerLockbox
      ? { securityQuestion, securityAnswerLockbox }
      : {}),
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
    throw new Error(
      'Enter your full Recovery Key (for example, QUILL-XXXX-XXXX-XXXX-XXXX).'
    );
  }

  try {
    return await openSecretPayload(
      {
        salt: lockbox.salt,
        iv: lockbox.iv,
        ciphertext: lockbox.ciphertext,
        iterations: lockbox.iterations,
      },
      normalizedKey
    );
  } catch {
    throw new Error(
      'That Recovery Key did not match this Offline Space. Double check each character and try again.'
    );
  }
}

/**
 * Unlocks the stored security-answer lockbox using the writer's private answer.
 * Decrypts their real Offline Space with zero data loss and zero plaintext clues.
 */
export async function decryptPassphraseWithSecurityAnswer(
  lockbox: OfflineRecoveryLockbox,
  answerInput: string
): Promise<string> {
  if (
    lockbox?.format !== 'quillit-recovery-v1' ||
    !lockbox.securityQuestion ||
    !lockbox.securityAnswerLockbox
  ) {
    throw new Error(
      'No Personal Security Question is attached to this Offline Space.'
    );
  }
  const normalizedAnswer = normalizeSecurityAnswer(answerInput);
  if (normalizedAnswer.length < 3) {
    throw new Error('Enter your private answer to unlock recovery.');
  }

  try {
    return await openSecretPayload(
      lockbox.securityAnswerLockbox,
      `quillit-sec-q::${normalizedAnswer}`
    );
  } catch {
    throw new Error(
      'That answer did not match your sealed security question. Check spelling and try again, or use your Recovery Key.'
    );
  }
}

export function hasSecurityQuestionLockbox(
  lockbox: OfflineRecoveryLockbox | null
): boolean {
  return Boolean(
    lockbox?.securityQuestion &&
      lockbox.securityAnswerLockbox?.salt &&
      lockbox.securityAnswerLockbox?.iv &&
      lockbox.securityAnswerLockbox?.ciphertext
  );
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
  securityQuestion?: string
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
  if (securityQuestion && securityQuestion.trim()) {
    lines.push(
      'Personal Security Question (answer stays encrypted, never printed):',
      `  ${securityQuestion.trim()}`,
      ''
    );
  }
  lines.push(
    'How this protects your writing:',
    'Your Offline Space is encrypted directly on your browser with AES-256-GCM.',
    'Quillit never sees or stores your passphrase or security answer in plain text.',
    'If you ever forget your passphrase, open "Forgot passphrase?" in Offline Space',
    'and recover access using either your Personal Security Question or this Recovery Key.',
    '',
    'Keep this card somewhere private (a password manager, printed note, or secure folder).'
  );
  return `${lines.join('\n')}\n`;
}
