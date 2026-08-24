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
  return data as LineIdTokenResult;
}
