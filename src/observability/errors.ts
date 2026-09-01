export interface RequestFailureDetails {
  message: string;
  requestId: string;
}

export function logRequestFailure(error: unknown, request: Request, url: URL): RequestFailureDetails {
  const e=error as any;
  const message=String(e?.message||e||'内部エラーです。');
  const requestId=crypto.randomUUID();
  console.error('[Family TODO LINE] request failure', { path:url.pathname, method:request.method, name:e?.name||'Error', message, requestId });
  return {message,requestId};
}
