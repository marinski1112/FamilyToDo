import type { SessionData } from './types';

const COOKIE_NAME = 'family_line_cf';
const MAX_AGE = 60 * 60 * 24 * 14;

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64ToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function keyFromSecret(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealSession(data: SessionData, secret: string): Promise<string> {
  const key = await keyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return `${bytesToB64(iv)}.${bytesToB64(ciphertext)}`;
}

export async function openSession(value: string | null, secret: string): Promise<SessionData> {
  if (!value) return { iat: Date.now() };
  try {
    const [ivPart, dataPart] = value.split('.', 2);
    if (!ivPart || !dataPart) return { iat: Date.now() };
    const key = await keyFromSecret(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(b64ToBytes(ivPart)).buffer },
      key,
      Uint8Array.from(b64ToBytes(dataPart)).buffer,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as SessionData;
    if (!parsed || typeof parsed !== 'object') return { iat: Date.now() };
    if (Date.now() - parsed.iat > MAX_AGE * 1000) return { iat: Date.now() };
    return parsed;
  } catch {
    return { iat: Date.now() };
  }
}

export async function commitSession(response: Response, data: SessionData, secret: string): Promise<Response> {
  const token = await sealSession({ ...data, iat: Date.now() }, secret);
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === COOKIE_NAME) return rest.join('=') || null;
  }
  return null;
}
