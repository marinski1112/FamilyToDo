export interface LineIdTokenResult {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
}

export async function verifyLineIdToken(token: string, channelId: string, nonce?: string): Promise<LineIdTokenResult> {
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: channelId, ...(nonce ? { nonce } : {}) }),
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data || data.iss !== 'https://access.line.me' || String(data.aud) !== channelId || typeof data.sub !== 'string' || (nonce && data.nonce !== nonce) || Number(data.exp||0)*1000<=Date.now()) throw new Error('LINE IDトークンの検証に失敗しました。');
  return data as unknown as LineIdTokenResult;
}

type LinePushOptions={retryKey?:string};
const LINE_RETRY_KEY=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pushLineMessage(accessToken: string, to: string, text: string, options:LinePushOptions={}): Promise<void> {
  if (!accessToken || !to || !text) return;
  const retryKey=String(options.retryKey||'').trim();
  if(retryKey&&!LINE_RETRY_KEY.test(retryKey))throw new Error('LINE retry key must be a hexadecimal UUID');
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${accessToken}`, ...(retryKey?{'X-Line-Retry-Key':retryKey}:{}) },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
  });
  if(r.status===409&&retryKey&&r.headers.get('x-line-accepted-request-id'))return;
  if (!r.ok) throw new Error(`LINE push failed: HTTP ${r.status}`);
}

export async function replyLineMessage(accessToken: string, replyToken: string, text: string): Promise<void> {
  if (!accessToken || !replyToken || !text) return;
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
  });
  if (!r.ok) throw new Error(`LINE reply failed: HTTP ${r.status}`);
}