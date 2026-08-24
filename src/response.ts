export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

export function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/**
 * Cloudflare Workersでは Response.redirect() に相対URLを渡すと
 * TypeErrorになるため、相対Locationをそのまま返す302レスポンスにする。
 */
export function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}
