export class RequestBodyParseError extends Error {}

/** Parse request bodies with the same JSON/form/text semantics historically used by app.ts. */
export async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const value = await request.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestBodyParseError('JSONが不正です。');
    return value as Record<string, unknown>;
  }
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const fd = await request.formData().catch(() => null);
    if (!fd) throw new RequestBodyParseError('フォームデータが不正です。');
    const out: Record<string, unknown> = {};
    fd.forEach((value, key) => {
      const v = typeof value === 'string' ? value : value.name;
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        const prev = out[key];
        out[key] = Array.isArray(prev) ? [...prev, v] : [prev, v];
      } else out[key] = v;
    });
    return out;
  }
  const value = await request.text().catch(() => '');
  if (!value) return {};
  const params = new URLSearchParams(value);
  const out: Record<string, unknown> = {};
  params.forEach((v, key) => {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      const prev=out[key];
      out[key]=Array.isArray(prev)?[...prev,v]:[prev,v];
    } else out[key]=v;
  });
  return out;
}
