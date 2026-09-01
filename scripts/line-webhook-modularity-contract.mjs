import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const webhook=fs.readFileSync('src/line-webhook.ts','utf8');

if(!index.includes("import { webhook } from './line-webhook';")) throw new Error('index.ts must import LINE webhook module');
if(index.includes('async function verifyLineWebhook(')||index.includes('async function webhook(')) throw new Error('LINE webhook implementation must not remain in index.ts');
if(!index.includes("if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);")) throw new Error('LINE webhook route wiring changed');
if(!webhook.includes('export async function webhook(request: Request, env: Env): Promise<Response> {')) throw new Error('LINE webhook module must export webhook handler');
if(!webhook.includes('async function verifyLineWebhook(body: string, signature: string, secret: string): Promise<boolean> {')) throw new Error('LINE signature verifier must remain private to webhook module');
for(const sentinel of [
  "crypto.subtle.importKey('raw'",
  "{name:'HMAC',hash:'SHA-256'}",
  "request.headers.get('x-line-signature') || ''",
  "if(!(await verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET))) return new Response('OK',{status:200});",
  "SELECT id,family_id,name FROM members WHERE line_user_id=? AND active=1 LIMIT 1",
  "JSON.stringify({event_type:event.type,message_type:event.message?.type||null})",
  "const { replyLineMessage } = await import('./line')",
  "logLineWebhookFailure('reply',e)",
  "logLineWebhookFailure('handle',e)",
  "return new Response('OK',{status:200});",
]){
  if(!webhook.includes(sentinel)) throw new Error(`LINE webhook behavior sentinel missing: ${sentinel}`);
}
if(webhook.includes('console.error')||webhook.includes('console.log')) throw new Error('LINE webhook must not directly log request/event/exception detail');
console.log('LINE webhook modularity contract: ok');
