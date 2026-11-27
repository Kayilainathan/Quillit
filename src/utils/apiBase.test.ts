import test from 'node:test';
import assert from 'node:assert/strict';
import { isGitHubPagesHost, normalizeApiBaseUrl } from './apiUrl';

test('normalizeApiBaseUrl cleans trailing slashes, duplicate /api suffixes, and missing https scheme', () => {
  assert.equal(
    normalizeApiBaseUrl('https://my-quillit.run.app/'),
    'https://my-quillit.run.app'
  );
  assert.equal(
    normalizeApiBaseUrl('https://my-quillit.run.app/api/'),
    'https://my-quillit.run.app'
  );
  assert.equal(
    normalizeApiBaseUrl('my-quillit.run.app/api'),
    'https://my-quillit.run.app'
  );
  assert.equal(
    normalizeApiBaseUrl('localhost:3000/'),
    'http://localhost:3000'
  );
  assert.equal(normalizeApiBaseUrl('javascript:alert(1)'), '');
  assert.equal(normalizeApiBaseUrl('   '), '');
});

test('isGitHubPagesHost detects github.io origins accurately', () => {
  assert.equal(isGitHubPagesHost('thedarkskyforme.github.io'), true);
  assert.equal(isGitHubPagesHost('localhost'), false);
  assert.equal(isGitHubPagesHost('ais-pre-example.asia-southeast1.run.app'), false);
});
