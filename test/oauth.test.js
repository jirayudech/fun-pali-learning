import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OAUTH_KEY, startGoogleOAuth, consumeGoogleVerifier, oauthErrorMessage } from '../oauth.js';
function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
test('Google authorize URL carries the SHA-256 PKCE challenge and correct Pages callback', async () => {
  const store = storage();
  const url = new URL(await startGoogleOAuth({ supabaseUrl: 'https://example.supabase.co', redirectTo: 'https://jirayudech.github.io/fun-pali-learning/', storage: store, now: 1000 }));
  const pending = JSON.parse(store.getItem(OAUTH_KEY));
  assert.equal(url.origin, 'https://example.supabase.co');
  assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('redirect_to'), 'https://jirayudech.github.io/fun-pali-learning/');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.ok(!url.href.includes(pending.verifier));
  assert.equal(consumeGoogleVerifier(store, 1100), pending.verifier);
  assert.equal(store.getItem(OAUTH_KEY), null);
  assert.throws(() => consumeGoogleVerifier(store, 1100));
});
test('each sign-in uses a fresh verifier', async () => {
  const store = storage();
  const options = { supabaseUrl: 'https://example.supabase.co', redirectTo: 'https://example.com/', storage: store };
  const first = await startGoogleOAuth(options);
  const second = await startGoogleOAuth(options);
  assert.notEqual(first, second);
});
test('missing, expired, corrupted and future PKCE attempts fail and are cleared', () => {
  for (const pending of [null, '{', JSON.stringify({ verifier: 'a'.repeat(43), createdAt: 0 }), JSON.stringify({ verifier: 'bad', createdAt: 1000000 }), JSON.stringify({ verifier: 'a'.repeat(43), createdAt: 2000000 })]) {
    const store = storage();
    if (pending !== null) store.setItem(OAUTH_KEY, pending);
    assert.throws(() => consumeGoogleVerifier(store, 1000000));
    assert.equal(store.getItem(OAUTH_KEY), null);
  }
});
test('cancelled OAuth gets an actionable message without reflecting callback text', () => {
  assert.match(oauthErrorMessage('access_denied'), /ยกเลิก/);
  assert.ok(!oauthErrorMessage('<script>').includes('<script>'));
});
