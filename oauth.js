// Supabase OAuth uses PKCE: only the browser that started sign-in can redeem the code.
export const OAUTH_KEY = 'pali-google-pkce-v1';
const MAX_AGE = 15 * 60 * 1000;
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

export async function startGoogleOAuth({ supabaseUrl, redirectTo, storage, now = Date.now() }) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  storage.setItem(OAUTH_KEY, JSON.stringify({ verifier, createdAt: now }));
  const url = new URL('/auth/v1/authorize', supabaseUrl);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', redirectTo);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 's256');
  return url.href;
}

export function consumeGoogleVerifier(storage, now = Date.now()) {
  const stored = storage.getItem(OAUTH_KEY);
  storage.removeItem(OAUTH_KEY);
  let pending;
  try { pending = JSON.parse(stored); } catch { /* show the same safe retry message */ }
  if (!pending || !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier) || !Number.isFinite(pending.createdAt) ||
      pending.createdAt > now || now - pending.createdAt > MAX_AGE) {
    throw new Error('การเข้าสู่ระบบ Google หมดอายุหรือไม่ได้เริ่มจากแท็บนี้ กรุณากดเข้าสู่ระบบด้วย Google ใหม่');
  }
  return pending.verifier;
}

export function oauthErrorMessage(code) {
  return code === 'access_denied'
    ? 'ยกเลิกการเข้าสู่ระบบ Google แล้ว คุณสามารถลองใหม่ได้'
    : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้ให้ติดต่อผู้ดูแลเว็บ';
}
