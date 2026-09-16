/** Server-only transport. No credentials or upstream errors enter app responses. */
export function verifiedStampDeletionState(value: Record<string, unknown>, sharedId: string) {
  const p=value.participants as Record<string, unknown>|undefined;
  if(value.sharedId!==sharedId || !p || ['registry','mitenya','familytodo'].some(k=>typeof p[k]!=='boolean')) {
    throw new Error('incomplete deletion protocol');
  }
  const deleted=p.registry===true&&p.mitenya===true&&p.familytodo===true;
  if(value.deleted!==deleted || value.cleanupPending!==!deleted || value.state!==(deleted?'completed':'pending')) {
    throw new Error('inconsistent deletion protocol');
  }
  return {sharedId,deleted,cleanupPending:!deleted,state:deleted?'completed':'pending',
    participants:{registry:p.registry,mitenya:p.mitenya,familytodo:p.familytodo}};
}

export function stampDeletionTransport(config: {baseUrl: string; token: string; fetcher?: typeof fetch}) {
  const base = new URL(config.baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('invalid registry configuration');
  return async (path: string, method = 'GET', approval?: string): Promise<Record<string, unknown>> => {
    if (!/^\/v1\/stamps(?:\/|$)/u.test(path)) throw new Error('invalid registry path');
    const headers = new Headers({authorization:`Bearer ${config.token}`,accept:'application/json'});
    if (approval) headers.set('x-stamp-deletion-approval',approval);
    const init:RequestInit={method,headers,redirect:'error'};
    // Custom fetchers are used for Cloudflare Service Bindings. Passing a timed
    // AbortSignal across that Worker boundary requires experimental signal RPC
    // serialization, so keep the timeout only on ordinary outbound fetch().
    if (!config.fetcher) init.signal=AbortSignal.timeout(45000);
    const response = await (config.fetcher ?? fetch)(`${base.toString().replace(/\/$/u,'')}${path}`,init);
    if (!response.ok) throw new Error('stamp deletion retry required');
    return await response.json() as Record<string, unknown>;
  };
}

export async function authenticStampParticipant(request: Request, expected?: string): Promise<boolean> {
  const token=expected?.trim();
  if (!token) return false;
  const supplied=request.headers.get('authorization') ?? '';
  if (supplied.length > 4096) return false;
  const hash=async (s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b]=await Promise.all([hash(supplied),hash(`Bearer ${token}`)]);
  let mismatch=0; for(let i=0;i<a.length;i++) mismatch|=a[i]!^b[i]!;
  return mismatch===0;
}
