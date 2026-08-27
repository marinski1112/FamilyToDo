export type StoredPushSubscription = {
  id?: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushMessagePayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

const te = new TextEncoder();

function b64urlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  let previous = new Uint8Array(0);
  const blocks: Uint8Array[] = [];
  let generated = 0;
  for (let counter = 1; generated < length; counter++) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
    generated += previous.length;
  }
  return concat(...blocks).slice(0, length);
}

function vapidConfig(env: Env): {publicKey:string; privateKey:string; subject:string} | null {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(env.VAPID_SUBJECT || '').trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function webPushConfigured(env: Env): boolean {
  return Boolean(vapidConfig(env));
}

export function webPushPublicKey(env: Env): string {
  return String(env.VAPID_PUBLIC_KEY || '').trim();
}

async function importVapidPrivateKey(publicKeyB64: string, privateKeyB64: string): Promise<CryptoKey> {
  const pub = b64urlToBytes(publicKeyB64);
  const priv = b64urlToBytes(privateKeyB64);
  if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) throw new Error('VAPID key format is invalid.');
  const jwk: JsonWebKey = {
    kty:'EC', crv:'P-256',
    x:bytesToB64url(pub.slice(1,33)),
    y:bytesToB64url(pub.slice(33,65)),
    d:bytesToB64url(priv),
    ext:true,
    key_ops:['sign']
  };
  return crypto.subtle.importKey('jwk', jwk, {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
}

async function buildVapidJwt(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = bytesToB64url(te.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const claims = bytesToB64url(te.encode(JSON.stringify({aud:audience, exp:Math.floor(Date.now()/1000)+12*60*60, sub:subject})));
  const signingInput = `${header}.${claims}`;
  const key = await importVapidPrivateKey(publicKey, privateKey);
  const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, key, te.encode(signingInput)));
  if (signature.length !== 64) throw new Error('Unexpected VAPID signature format.');
  return `${signingInput}.${bytesToB64url(signature)}`;
}

async function encryptPayload(subscription: StoredPushSubscription, payload: string): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('Push subscription p256dh is invalid.');
  if (authSecret.length < 16) throw new Error('Push subscription auth secret is invalid.');

  const serverPair = await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, true, ['deriveBits']);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverPair.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, {name:'ECDH', namedCurve:'P-256'}, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH', public:uaKey}, serverPair.privateKey, 256));

  const prkKey = await hmac(authSecret, sharedSecret);
  const authInfo = concat(te.encode('WebPush: info\0'), uaPublic, serverPublic);
  const ikm = await hkdfExpand(prkKey, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await hkdfExpand(prk, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk, te.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, {name:'AES-GCM'}, false, ['encrypt']);
  const plaintext = concat(te.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv:nonce, tagLength:128}, aesKey, plaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

export async function sendWebPush(env: Env, subscription: StoredPushSubscription, message: PushMessagePayload): Promise<{ok:boolean;status:number;gone:boolean;error?:string}> {
  const cfg = vapidConfig(env);
  if (!cfg) return {ok:false,status:0,gone:false,error:'VAPID is not configured.'};
  let endpoint: URL;
  try { endpoint = new URL(subscription.endpoint); }
  catch { return {ok:false,status:0,gone:true,error:'Push endpoint is invalid.'}; }
  if (endpoint.protocol !== 'https:') return {ok:false,status:0,gone:true,error:'Push endpoint must use HTTPS.'};

  const payload = JSON.stringify({
    title: String(message.title || 'Family TODO LINE'),
    body: String(message.body || ''),
    url: String(message.url || '/app/tasks.php'),
    tag: String(message.tag || 'familytodo')
  });
  try {
    const body = await encryptPayload(subscription, payload);
    const jwt = await buildVapidJwt(subscription.endpoint, cfg.publicKey, cfg.privateKey, cfg.subject);
    const response = await fetch(subscription.endpoint, {
      method:'POST',
      headers:{
        'Content-Encoding':'aes128gcm',
        'Content-Type':'application/octet-stream',
        'TTL':'86400',
        'Urgency':'normal',
        'Authorization':`vapid t=${jwt}, k=${cfg.publicKey}`
      },
      body
    });
    if (response.ok) return {ok:true,status:response.status,gone:false};
    const gone = response.status === 404 || response.status === 410;
    const text = await response.text().catch(()=> '');
    return {ok:false,status:response.status,gone,error:(text || `Push endpoint returned ${response.status}`).slice(0,500)};
  } catch (e) {
    return {ok:false,status:0,gone:false,error:String(e instanceof Error ? e.message : e).slice(0,500)};
  }
}
