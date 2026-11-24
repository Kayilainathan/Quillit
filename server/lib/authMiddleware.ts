import type { NextFunction, Request, Response } from 'express';
import { buildErrorEnvelope, createRequestId } from './validation';

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

function extractClientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : req.socket.remoteAddress || 'local';
  return ip || 'local';
}

/**
 * Decodes JWT payload claims safely (used strictly when ALLOWED_OWNER_EMAILS is explicitly set).
 * Full cryptographic verification runs against Firebase REST lookup when FIREBASE_WEB_API_KEY is configured.
 */
function parseJwtPayloadUnverified(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const raw = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health') {
    next();
    return;
  }

  const key = extractClientKey(req);
  const now = Date.now();
  const existing = rateBuckets.get(key);

  if (!existing || now > existing.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json(
      buildErrorEnvelope({
        code: 'RATE_LIMITED',
        message: `Too many requests. Please pause ${retryAfterSec}s before trying again.`,
        retryable: true,
        requestId: createRequestId(),
        startedAtMs: now,
      })
    );
    return;
  }

  existing.count += 1;
  next();
}

/**
 * Optional owner-email guard activated ONLY when `ALLOWED_OWNER_EMAILS` is configured in env.
 * In default local/preview deployments where ALLOWED_OWNER_EMAILS is unset, Local Vault & Cloud users
 * pass through freely with zero friction.
 */
export async function optionalAuthGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.path === '/api/health') {
    next();
    return;
  }

  const allowlistRaw = (process.env.ALLOWED_OWNER_EMAILS || '').trim();
  if (!allowlistRaw) {
    next();
    return;
  }

  const allowedEmails = new Set(
    allowlistRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!bearer) {
    res.status(401).json(
      buildErrorEnvelope({
        code: 'UNAUTHORIZED',
        message: 'Sign in required to access this protected Quillit API.',
        retryable: false,
        requestId: createRequestId(),
        startedAtMs: Date.now(),
      })
    );
    return;
  }

  let verifiedEmail = '';
  const webApiKey = process.env.FIREBASE_WEB_API_KEY;
  if (webApiKey) {
    try {
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: bearer }),
        }
      );
      if (resp.ok) {
        const body = (await resp.json()) as {
          users?: Array<{ email?: string }>;
        };
        verifiedEmail = String(body.users?.[0]?.email || '').toLowerCase();
      }
    } catch {
      verifiedEmail = '';
    }
  } else {
    const claims = parseJwtPayloadUnverified(bearer);
    const exp = Number(claims?.exp || 0);
    if (claims && typeof claims.email === 'string' && (!exp || exp * 1000 > Date.now())) {
      verifiedEmail = claims.email.toLowerCase();
    }
  }

  if (!verifiedEmail || !allowedEmails.has(verifiedEmail)) {
    res.status(403).json(
      buildErrorEnvelope({
        code: 'FORBIDDEN',
        message: 'Your account is not authorized on this private Quillit instance.',
        retryable: false,
        requestId: createRequestId(),
        startedAtMs: Date.now(),
      })
    );
    return;
  }

  next();
}
