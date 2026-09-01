export interface RequestFailureDetails {
  message: string;
  requestId: string;
}

type FailureCategory='REQUEST_FAILURE'|'TASK_CREATION_CLEANUP'|'LINE_WEBHOOK'|'NOTIFICATION';
type FailureStage='request'|'rollback'|'reply'|'handle'|'dispatch';
type RouteClass='health'|'api'|'oauth'|'app'|'webhook'|'page';
type RequestMethodClass='GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS'|'HEAD'|'OTHER';
type AllowedErrorName='Error'|'TypeError'|'RangeError'|'ReferenceError'|'SyntaxError'|'URIError'|'EvalError'|'AggregateError'|'DOMException';

interface FailureLogDetails {
  category: FailureCategory;
  stage: FailureStage;
  result: 'error';
  exception_class: AllowedErrorName;
  route_class?: RouteClass;
  method?: RequestMethodClass;
  request_id?: string;
}

const ERROR_NAME_ALLOWLIST=new Set<AllowedErrorName>(['Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','EvalError','AggregateError','DOMException']);
const REQUEST_METHOD_ALLOWLIST=new Set<RequestMethodClass>(['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD']);

function sanitizeErrorName(error: unknown): AllowedErrorName {
  let candidate='';
  try {
    const value=(error as {name?:unknown}|null)?.name;
    candidate=typeof value==='string'?value:'';
  } catch {}
  return ERROR_NAME_ALLOWLIST.has(candidate as AllowedErrorName)?candidate as AllowedErrorName:'Error';
}

function normalizeRequestMethod(method: string): RequestMethodClass {
  const candidate=String(method||'').toUpperCase() as RequestMethodClass;
  return REQUEST_METHOD_ALLOWLIST.has(candidate)?candidate:'OTHER';
}

function classifyRoute(pathname: string): RouteClass {
  if(pathname==='/webhook'||pathname==='/app/api/webhook'||pathname==='/app/api/webhook.php')return 'webhook';
  if(pathname.startsWith('/__cf/'))return 'health';
  if(pathname.startsWith('/api/')||pathname.startsWith('/app/api/'))return 'api';
  if(pathname.startsWith('/oauth/'))return 'oauth';
  if(pathname.startsWith('/app/'))return 'app';
  return 'page';
}

function emitFailure(details: FailureLogDetails): void {
  console.error('[Family TODO LINE] operational failure',details);
}

export function logRequestFailure(error: unknown, request: Request, url: URL): RequestFailureDetails {
  const e=error as any;
  const message=String(e?.message||e||'内部エラーです。');
  const requestId=crypto.randomUUID();
  emitFailure({category:'REQUEST_FAILURE',stage:'request',result:'error',exception_class:sanitizeErrorName(error),route_class:classifyRoute(url.pathname),method:normalizeRequestMethod(request.method),request_id:requestId});
  return {message,requestId};
}

export function logTaskCreationCleanupFailure(error: unknown): void {
  emitFailure({category:'TASK_CREATION_CLEANUP',stage:'rollback',result:'error',exception_class:sanitizeErrorName(error)});
}

export function logLineWebhookFailure(stage: 'reply'|'handle', error: unknown): void {
  emitFailure({category:'LINE_WEBHOOK',stage,result:'error',exception_class:sanitizeErrorName(error)});
}

export function logNotificationFailure(error: unknown): void {
  emitFailure({category:'NOTIFICATION',stage:'dispatch',result:'error',exception_class:sanitizeErrorName(error)});
}
