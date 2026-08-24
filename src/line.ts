export interface LineIdTokenResult {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
}

export async function verifyLineIdToken(token: string, channelId: string): Promise<LineIdTokenResult> {
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: channelId }),
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data || typeof data.sub !== 'string') throw new Error('LINE IDトークンの検証に失敗しました。');
  return data as unknown as LineIdTokenResult;
}

export async function pushLineMessage(accessToken: string, to: string, text: string): Promise<void> {
  if (!accessToken || !to || !text) return;
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
  });
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
