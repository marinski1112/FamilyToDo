import fs from 'node:fs';

const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const observability=fs.readFileSync(new URL('../src/observability/errors.ts',import.meta.url),'utf8');
const lineWebhook=fs.readFileSync(new URL('../src/line-webhook.ts',import.meta.url),'utf8');
const taskApi=fs.readFileSync(new URL('../src/task-api.ts',import.meta.url),'utf8');
const notificationDelivery=fs.readFileSync(new URL('../src/notification-delivery.ts',import.meta.url),'utf8');
const workerOperational=index+lineWebhook+taskApi+notificationDelivery;
const manifest=fs.readFileSync(new URL('./regression-manifest.mjs',import.meta.url),'utf8');

if(workerOperational.includes('console.error'))throw new Error('Worker operational modules must not directly forward exceptions to console.error');
for(const forbidden of [
  'task creation cleanup failed',
  'console.error(e)',
  "console.error('[Family TODO LINE] webhook'",
  "console.error('[Family TODO LINE] notification'",
  'taskId:id',
  'error:String((cleanup as any)?.message||cleanup)',
]){
  if(workerOperational.includes(forbidden))throw new Error(`legacy raw exception logging remains: ${forbidden}`);
}

for(const required of [
  'logRequestFailure(e,request,url)',
  'logTaskCreationCleanupFailure(cleanup)',
  "logLineWebhookFailure('reply',e)",
  "logLineWebhookFailure('handle',e)",
  'logNotificationFailure(e)',
]){
  const count=workerOperational.split(required).length-1;
  if(count!==1)throw new Error(`privacy logging wrapper must remain singular: ${required} (${count})`);
}

const consoleCalls=(observability.match(/console\.error/g)||[]).length;
if(consoleCalls!==1)throw new Error(`observability error boundary must have exactly one replaceable console.error sink, found ${consoleCalls}`);
if(!observability.includes("console.error('[Family TODO LINE] operational failure',details);"))throw new Error('operational failure sink must only receive typed aggregate details');
if(!observability.includes('ERROR_NAME_ALLOWLIST'))throw new Error('exception class allowlist is missing');
if(!observability.includes("?candidate as AllowedErrorName:'Error'"))throw new Error('unknown exception names must collapse to Error');

const schemaMatch=observability.match(/interface FailureLogDetails \{([\s\S]*?)\n\}/);
if(!schemaMatch)throw new Error('FailureLogDetails schema is missing');
const schema=schemaMatch[1].toLowerCase();
for(const sensitive of ['taskid','task_id','member_id','family_id','replytoken','reply_token','title','description','message','authorization','cookie','access_token','refresh_token','sql','body','url']){
  if(schema.includes(sensitive))throw new Error(`aggregate failure log schema exposes sensitive field: ${sensitive}`);
}

const payloads=[...observability.matchAll(/emitFailure\(\{([\s\S]*?)\}\);/g)].map(match=>match[1]);
if(payloads.length!==4)throw new Error(`expected four bounded failure payloads, found ${payloads.length}`);
for(const payload of payloads){
  if(/\berror\s*:/.test(payload)||/\bmessage\s*:/.test(payload))throw new Error('raw exception/message property forwarded into aggregate failure payload');
  if(!payload.includes('exception_class:sanitizeErrorName(error)'))throw new Error('failure payload must use sanitized exception class');
}

for(const marker of ["category:'REQUEST_FAILURE'","category:'TASK_CREATION_CLEANUP'","category:'LINE_WEBHOOK'","category:'NOTIFICATION'"]){
  if(!observability.includes(marker))throw new Error(`bounded failure category missing: ${marker}`);
}
if(!manifest.includes("['worker-error-log-privacy','node scripts/worker-error-log-privacy-contract.mjs']"))throw new Error('worker error log privacy contract is not active in regression manifest');

console.log('worker error log privacy contract ok');
