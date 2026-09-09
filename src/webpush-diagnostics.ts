export type WebPushVapidDiagnostic = {
  configured: boolean;
  publicKeyFormat: boolean;
  privateKeyFormat: boolean;
  subjectFormat: boolean;
  keyImport: boolean;
  keyPairMatch: boolean;
  signatureFormat: boolean;
  subscriptionAvailable: boolean;
  endpointHttps: boolean | null;
  provider: 'APPLE' | 'GOOGLE' | 'MOZILLA' | 'OTHER' | 'NONE';
  audienceOrigin: string | null;
  expirationHours: number;
  expirationPolicyValid: boolean;
  code: 'READY' | 'NOT_CONFIGURED' | 'PUBLIC_KEY_INVALID' | 'PRIVATE_KEY_INVALID' | 'SUBJECT_INVALID' | 'KEY_IMPORT_FAILED' | 'KEY_PAIR_MISMATCH' | 'SUBSCRIPTION_MISSING' | 'ENDPOINT_INVALID';
};

const encoder = new TextEncoder();
const bufferSource = (value: Uint8Array): ArrayBuffer => Uint8Array.from(value).buffer;

function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64url(value: Uint8Array): string {
  let binary = '';
  for (const b of value) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function validSubject(value: string): boolean {
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function providerFor(hostname: string): WebPushVapidDiagnostic['provider'] {
  const host = hostname.toLowerCase();
  if (host === 'web.push.apple.com' || host.endsWith('.push.apple.com')) return 'APPLE';
  if (host === 'fcm.googleapis.com' || host === 'android.googleapis.com' || host.endsWith('.googleapis.com')) return 'GOOGLE';
  if (host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com')) return 'MOZILLA';
  return 'OTHER';
}

export async function diagnoseWebPushVapid(env: Env, subscriptionEndpoint?: string | null): Promise<WebPushVapidDiagnostic> {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(env.VAPID_SUBJECT || '').trim();
  const configured = Boolean(publicKey && privateKey && subject);

  let publicBytes = new Uint8Array(0);
  let privateBytes = new Uint8Array(0);
  try { publicBytes = b64urlToBytes(publicKey); } catch {}
  try { privateBytes = b64urlToBytes(privateKey); } catch {}
  const publicKeyFormat = publicBytes.length === 65 && publicBytes[0] === 4;
  const privateKeyFormat = privateBytes.length === 32;
  const subjectFormat = validSubject(subject);

  let keyImport = false;
  let keyPairMatch = false;
  let signatureFormat = false;
  if (publicKeyFormat && privateKeyFormat) {
    try {
      const privateJwk: JsonWebKey = {
        kty: 'EC', crv: 'P-256',
        x: bytesToB64url(publicBytes.slice(1, 33)),
        y: bytesToB64url(publicBytes.slice(33, 65)),
        d: bytesToB64url(privateBytes),
        ext: true,
        key_ops: ['sign'],
      };
      const signingKey = await crypto.subtle.importKey('jwk', privateJwk, {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
      const verifyKey = await crypto.subtle.importKey('raw', bufferSource(publicBytes), {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
      keyImport = true;
      const probe = encoder.encode('FamilyToDo VAPID diagnostic probe v1');
      const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, signingKey, probe));
      signatureFormat = signature.length === 64;
      keyPairMatch = signatureFormat && await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, verifyKey, bufferSource(signature), probe);
    } catch {
      keyImport = false;
      keyPairMatch = false;
      signatureFormat = false;
    }
  }

  const endpointText = String(subscriptionEndpoint || '').trim();
  const subscriptionAvailable = Boolean(endpointText);
  let endpointHttps: boolean | null = subscriptionAvailable ? false : null;
  let provider: WebPushVapidDiagnostic['provider'] = subscriptionAvailable ? 'OTHER' : 'NONE';
  let audienceOrigin: string | null = null;
  if (subscriptionAvailable) {
    try {
      const endpoint = new URL(endpointText);
      endpointHttps = endpoint.protocol === 'https:';
      provider = providerFor(endpoint.hostname);
      audienceOrigin = endpointHttps ? endpoint.origin : null;
    } catch {
      endpointHttps = false;
      provider = 'OTHER';
    }
  }

  const expirationHours = 12;
  const expirationPolicyValid = expirationHours > 0 && expirationHours <= 24;
  const code: WebPushVapidDiagnostic['code'] = !configured ? 'NOT_CONFIGURED'
    : !publicKeyFormat ? 'PUBLIC_KEY_INVALID'
    : !privateKeyFormat ? 'PRIVATE_KEY_INVALID'
    : !subjectFormat ? 'SUBJECT_INVALID'
    : !keyImport ? 'KEY_IMPORT_FAILED'
    : !keyPairMatch ? 'KEY_PAIR_MISMATCH'
    : !subscriptionAvailable ? 'SUBSCRIPTION_MISSING'
    : !endpointHttps ? 'ENDPOINT_INVALID'
    : 'READY';

  return {
    configured, publicKeyFormat, privateKeyFormat, subjectFormat, keyImport, keyPairMatch, signatureFormat,
    subscriptionAvailable, endpointHttps, provider, audienceOrigin, expirationHours, expirationPolicyValid, code,
  };
}
