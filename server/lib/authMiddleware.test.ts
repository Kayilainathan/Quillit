import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  _resetRateBucketsForTest,
  apiRateLimiter,
  getRateBucketCountForTest,
  optionalAuthGuard,
  pruneExpiredRateBuckets,
} from './authMiddleware';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader: (key: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/evaluate',
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

test('health check path bypasses both apiRateLimiter and optionalAuthGuard', async () => {
  const prevAllow = process.env.ALLOWED_OWNER_EMAILS;
  const prevKey = process.env.FIREBASE_WEB_API_KEY;
  process.env.ALLOWED_OWNER_EMAILS = 'owner@example.com';
  delete process.env.FIREBASE_WEB_API_KEY;

  try {
    for (const reqPath of ['/health', '/api/health']) {
      let limiterNext = false;
      apiRateLimiter(
        createMockReq({ path: reqPath }),
        createMockRes() as unknown as Response,
        () => {
          limiterNext = true;
        }
      );
      assert.equal(limiterNext, true, `apiRateLimiter should bypass ${reqPath}`);

      let authNext = false;
      await optionalAuthGuard(
        createMockReq({ path: reqPath }),
        createMockRes() as unknown as Response,
        () => {
          authNext = true;
        }
      );
      assert.equal(authNext, true, `optionalAuthGuard should bypass ${reqPath}`);
    }
  } finally {
    if (prevAllow === undefined) delete process.env.ALLOWED_OWNER_EMAILS;
    else process.env.ALLOWED_OWNER_EMAILS = prevAllow;
    if (prevKey === undefined) delete process.env.FIREBASE_WEB_API_KEY;
    else process.env.FIREBASE_WEB_API_KEY = prevKey;
  }
});

test('optionalAuthGuard fails closed with HTTP 500 when ALLOWED_OWNER_EMAILS is set without FIREBASE_WEB_API_KEY', async () => {
  const prevAllow = process.env.ALLOWED_OWNER_EMAILS;
  const prevKey = process.env.FIREBASE_WEB_API_KEY;
  process.env.ALLOWED_OWNER_EMAILS = 'owner@example.com';
  delete process.env.FIREBASE_WEB_API_KEY;

  try {
    // Even if someone crafts an unsigned JWT containing owner@example.com, it MUST fail closed with 500
    const forgedPayload = Buffer.from(
      JSON.stringify({ email: 'owner@example.com', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const forgedToken = `eyJhbGciOiJub25lIn0.${forgedPayload}.fake`;

    const res = createMockRes();
    let nextCalled = false;
    await optionalAuthGuard(
      createMockReq({
        path: '/evaluate',
        headers: { authorization: `Bearer ${forgedToken}` },
      }),
      res as unknown as Response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error?: { code?: string } })?.error?.code, 'AUTH_MISCONFIGURED');
  } finally {
    if (prevAllow === undefined) delete process.env.ALLOWED_OWNER_EMAILS;
    else process.env.ALLOWED_OWNER_EMAILS = prevAllow;
    if (prevKey === undefined) delete process.env.FIREBASE_WEB_API_KEY;
    else process.env.FIREBASE_WEB_API_KEY = prevKey;
  }
});

test('optionalAuthGuard returns 401 on missing Bearer token and 403 on unverified token', async () => {
  const prevAllow = process.env.ALLOWED_OWNER_EMAILS;
  const prevKey = process.env.FIREBASE_WEB_API_KEY;
  const origFetch = globalThis.fetch;
  process.env.ALLOWED_OWNER_EMAILS = 'owner@example.com';
  process.env.FIREBASE_WEB_API_KEY = 'test-firebase-key';

  try {
    // Missing Bearer -> 401
    const res401 = createMockRes();
    await optionalAuthGuard(
      createMockReq({ path: '/evaluate', headers: {} }),
      res401 as unknown as Response,
      () => assert.fail('next should not run on 401')
    );
    assert.equal(res401.statusCode, 401);

    // Rejected token from Firebase Identity Toolkit -> 403
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const res403 = createMockRes();
    await optionalAuthGuard(
      createMockReq({
        path: '/evaluate',
        headers: { authorization: 'Bearer bad.token.value' },
      }),
      res403 as unknown as Response,
      () => assert.fail('next should not run on 403')
    );
    assert.equal(res403.statusCode, 403);

    // Verified allowed email -> next() called
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ users: [{ email: 'owner@example.com' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const res200 = createMockRes();
    let passed = false;
    await optionalAuthGuard(
      createMockReq({
        path: '/evaluate',
        headers: { authorization: 'Bearer verified.firebase.token' },
      }),
      res200 as unknown as Response,
      () => {
        passed = true;
      }
    );
    assert.equal(passed, true);
  } finally {
    globalThis.fetch = origFetch;
    if (prevAllow === undefined) delete process.env.ALLOWED_OWNER_EMAILS;
    else process.env.ALLOWED_OWNER_EMAILS = prevAllow;
    if (prevKey === undefined) delete process.env.FIREBASE_WEB_API_KEY;
    else process.env.FIREBASE_WEB_API_KEY = prevKey;
  }
});

test('apiRateLimiter prunes expired IP buckets cleanly to prevent unbounded growth', () => {
  _resetRateBucketsForTest();
  for (let i = 0; i < 5; i += 1) {
    apiRateLimiter(
      createMockReq({ path: '/topics', ip: `10.0.0.${i}` }),
      createMockRes() as unknown as Response,
      () => {}
    );
  }
  assert.equal(getRateBucketCountForTest(), 5);

  const removed = pruneExpiredRateBuckets(Date.now() + 65_000);
  assert.equal(removed, 5);
  assert.equal(getRateBucketCountForTest(), 0);
});
