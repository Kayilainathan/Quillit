import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHostingEnvironment,
  isAiStudioPreviewUrl,
  isGitHubPagesHost,
  isStaticHostingEnvironment,
  normalizeApiBaseUrl,
  resolveApiTarget,
} from './apiUrl';

test('normalizeApiBaseUrl cleans slashes, duplicate /api paths, missing scheme, placeholders, and static hosts', () => {
  assert.equal(
    normalizeApiBaseUrl('https://my-quillit.run.app/'),
    'https://my-quillit.run.app'
  );
  assert.equal(
    normalizeApiBaseUrl('https://my-quillit.run.app/api/'),
    'https://my-quillit.run.app'
  );
  assert.equal(
    normalizeApiBaseUrl('https://my-quillit.onrender.com/api/health/'),
    'https://my-quillit.onrender.com'
  );
  assert.equal(
    normalizeApiBaseUrl('my-quillit.run.app/api'),
    'https://my-quillit.run.app'
  );
  assert.equal(
    normalizeApiBaseUrl('localhost:3000/'),
    'http://localhost:3000'
  );
  // Security & misconfiguration rejections
  assert.equal(normalizeApiBaseUrl('javascript:alert(1)'), '');
  assert.equal(normalizeApiBaseUrl('   '), '');
  assert.equal(normalizeApiBaseUrl('MY_APP_URL'), '');
  assert.equal(normalizeApiBaseUrl('https://your-api.example.com'), '');
  assert.equal(normalizeApiBaseUrl('https://thedarkskyforme.github.io/quillit'), '');
});

test('detectHostingEnvironment distinguishes development, full-stack production, and static hosting cleanly', () => {
  assert.equal(detectHostingEnvironment('localhost', 'http:'), 'development');
  assert.equal(detectHostingEnvironment('127.0.0.1', 'http:'), 'development');
  assert.equal(
    detectHostingEnvironment('thedarkskyforme.github.io', 'https:'),
    'static-github-pages'
  );
  assert.equal(
    detectHostingEnvironment('quillit.pages.dev', 'https:'),
    'static-other'
  );
  assert.equal(detectHostingEnvironment('', 'file:'), 'static-other');
  assert.equal(
    detectHostingEnvironment('quillit-prod.a.run.app', 'https:'),
    'production-fullstack'
  );
  assert.equal(
    detectHostingEnvironment('quillit-api.onrender.com', 'https:'),
    'production-fullstack'
  );
  assert.equal(
    detectHostingEnvironment('writing.mydomain.com', 'https:'),
    'production-fullstack'
  );
  assert.equal(isGitHubPagesHost('thedarkskyforme.github.io'), true);
  assert.equal(isGitHubPagesHost('quillit-prod.a.run.app'), false);
  assert.equal(isStaticHostingEnvironment('thedarkskyforme.github.io', 'https:'), true);
  assert.equal(isStaticHostingEnvironment('quillit-prod.a.run.app', 'https:'), false);
});

test('isAiStudioPreviewUrl flags private AI Studio preview proxies while allowing public Cloud Run/Render backends', () => {
  assert.equal(
    isAiStudioPreviewUrl(
      'https://ais-pre-cphtbbg6knbgq4gq4n3v3p-695328377339.asia-southeast1.run.app'
    ),
    true
  );
  assert.equal(
    isAiStudioPreviewUrl(
      'https://ais-dev-abc123.us-central1.run.app'
    ),
    true
  );
  assert.equal(
    isAiStudioPreviewUrl('https://quillit-backend-xyz.a.run.app'),
    false
  );
  assert.equal(
    isAiStudioPreviewUrl('https://quillit-api.onrender.com'),
    false
  );
});

test('resolveApiTarget routes production full-stack to same-origin, GitHub Pages without env to offline-static, and GitHub Pages with backend to remote', () => {
  // 1. Production full-stack host (Cloud Run / Render / custom server) with no VITE_API_BASE_URL -> same-origin
  const prodSameOrigin = resolveApiTarget('/api/evaluate', {
    hostname: 'quillit-backend.onrender.com',
    protocol: 'https:',
  });
  assert.equal(prodSameOrigin.mode, 'same-origin');
  assert.equal(prodSameOrigin.url, '/api/evaluate');
  assert.equal(prodSameOrigin.hostingEnv, 'production-fullstack');

  // 2. Local development with no leading slash -> normalized same-origin
  const devNoSlash = resolveApiTarget('api/health', {
    hostname: 'localhost',
    protocol: 'http:',
  });
  assert.equal(devNoSlash.mode, 'same-origin');
  assert.equal(devNoSlash.url, '/api/health');

  // 3. Static GitHub Pages WITHOUT VITE_API_BASE_URL -> fail-fast offline-static
  const ghNoBackend = resolveApiTarget('/api/evaluate', {
    hostname: 'thedarkskyforme.github.io',
    protocol: 'https:',
  });
  assert.equal(ghNoBackend.mode, 'offline-static');
  assert.equal(ghNoBackend.hostingEnv, 'static-github-pages');
  assert.ok(ghNoBackend.reason && ghNoBackend.reason.includes('VITE_API_BASE_URL'));

  // 4. Static GitHub Pages WITH VITE_API_BASE_URL -> remote Express backend
  const ghWithEnv = resolveApiTarget('/api/evaluate', {
    hostname: 'thedarkskyforme.github.io',
    protocol: 'https:',
    envBaseUrl: 'https://quillit-api.onrender.com/api/',
  });
  assert.equal(ghWithEnv.mode, 'remote');
  assert.equal(ghWithEnv.url, 'https://quillit-api.onrender.com/api/evaluate');

  // 5. Runtime override in Settings takes precedence over build-time env
  const ghWithOverride = resolveApiTarget('/api/health', {
    hostname: 'thedarkskyforme.github.io',
    protocol: 'https:',
    envBaseUrl: 'https://old-server.onrender.com',
    runtimeBaseUrl: 'https://new-server.a.run.app/',
  });
  assert.equal(ghWithOverride.mode, 'remote');
  assert.equal(ghWithOverride.url, 'https://new-server.a.run.app/api/health');

  // 6. Custom domain static GitHub Pages after HTML-fallback detection -> offline-static
  const customDomainStatic = resolveApiTarget('/api/evaluate', {
    hostname: 'quillit.mydomain.com',
    protocol: 'https:',
    sameOriginHtmlFallbackDetected: true,
  });
  assert.equal(customDomainStatic.mode, 'offline-static');

  // 7. Non-API static asset paths on GitHub Pages are never blocked
  const staticAsset = resolveApiTarget('/quillit-mark.svg', {
    hostname: 'thedarkskyforme.github.io',
    protocol: 'https:',
  });
  assert.equal(staticAsset.mode, 'same-origin');
  assert.equal(staticAsset.isApiRoute, false);
});
