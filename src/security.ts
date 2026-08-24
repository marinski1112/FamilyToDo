import type { SessionData } from './types';

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function verifyLineSignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!body || !signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let binary = '';
  for (const byte of mac) binary += String.fromCharCode(byte);
  return constantTimeEqual(btoa(binary), signature);
}

export function requireCsrf(session: SessionData, token: string | null): void {
  if (!session.csrfToken || !token || !constantTimeEqual(session.csrfToken, token)) {
    throw new Error('CSRF検証に失敗しました。');
  }
}
