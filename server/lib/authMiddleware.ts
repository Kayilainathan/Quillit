import type { NextFunction, Request, Response } from 'express';
import { buildErrorEnvelope, createRequestId } from './validation';

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const PRUNE_INTERVAL_MS = 30_000;
const MAX_TRACKED_BUCKETS = 5_000;
let lastPruneAt = 0;

function isHealthCheckPath(reqPath: string): boolean {
  return reqPath === '/health' || reqPath === '/api/health';
}

function extractClientKey(req: Request): string {
  // Rely on Express req.ip (backed by `app.set('trust proxy', 1)` in server.ts)
  // rather than parsing spoofable raw X-Forwarded-For headers directly.
  const ip = req.ip || req.socket?.remoteAddress || 'local';
  return String(ip).trim() || 'local';
}

/**
 * Removes expired rate-limit buckets so memory stays bounded under long uptime or IP churn.
 */
export function pruneExpiredRateBuckets(now: number = Date.now()): number {
  let removed = 0;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt) {
      rateBuckets.delete(key);
      removed += 1;
    }
  }
  // Hard cap protection in case of extreme burst from unique IPs within a single window
  if (rateBuckets.size > MAX_TRACKED_BUCKETS) {
    const excess = rateBuckets.size - MAX_TRACKED_BUCKETS;
    let dropped = 0;
    for (const key of rateBuckets.keys()) {
      rateBuckets.delete(key);
      dropped += 1;
      removed += 1;
      if (dropped >= excess) break;
    }
  }
  lastPruneAt = now;
  return removed;
}

export function getRateBucketCountForTest(): number {
  return rateBuckets.size;
}

export function _resetRateBucketsForTest(): void {
  rateBuckets.clear();
  lastPruneAt = 0;
}

export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (isHealthCheckPath(req.path)) {
    next();
    return;
  }

  const now = Date.now();
  if (now - lastPruneAt >= PRUNE_INTERVAL_MS || rateBuckets.size > MAX_TRACKED_BUCKETS) {
    pruneExpiredRateBuckets(now);
  }

  const key = extractClientKey(req);
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
 * When active, requires cryptographic Firebase ID token verification via `FIREBASE_WEB_API_KEY`
 * and fails closed with HTTP 500 if the verification key is missing (zero unverified JWT parsing).
 * When `ALLOWED_OWNER_EMAILS` is unset (local/preview deployments), requests pass through freely.
 */
export async function optionalAuthGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (isHealthCheckPath(req.path)) {
    next();
    return;
  }

  const allowlistRaw = (process.env.ALLOWED_OWNER_EMAILS || '').trim();
  if (!allowlistRaw) {
    next();
    return;
  }

  const webApiKey = (process.env.FIREBASE_WEB_API_KEY || '').trim();
  if (!webApiKey) {
    res.status(500).json(
      buildErrorEnvelope({
        code: 'AUTH_MISCONFIGURED',
        message:
          'Server authentication is misconfigured: FIREBASE_WEB_API_KEY is required when ALLOWED_OWNER_EMAILS is set.',
        retryable: false,
        requestId: createRequestId(),
        startedAtMs: Date.now(),
      })
    );
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
        users?: Array<{ email?: string; disabled?: boolean }>;
      };
      const user = body.users?.[0];
      if (user && !user.disabled && typeof user.email === 'string') {
        verifiedEmail = user.email.toLowerCase();
      }
    }
  } catch {
    verifiedEmail = '';
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
