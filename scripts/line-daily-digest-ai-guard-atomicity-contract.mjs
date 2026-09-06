import fs from 'node:fs';

const guard=fs.readFileSync('src/line-daily-digest-ai-guard.ts','utf8');

for(const sentinel of [
  "const infrastructureDate=(now:string)=>now.slice(0,10)",
  "const infrastructureBudgetKey=(now:string)=>`utc-v1:${infrastructureDate(now)}`",
  "globalDate=infrastructureBudgetKey(now)",
  "request_count<? AND (?=1 OR COALESCE(blocked_until,'')<=?)",
  "UPDATE line_daily_digest_ai_global_daily SET request_count=request_count-1",
  "WHERE line_daily_digest_ai_family_daily.finalized=0",
]){
  if(!guard.includes(sentinel))throw new Error(`morning digest AI guard atomicity sentinel missing: ${sentinel}`);
}
if(guard.includes("globalDate=infrastructureDate(now)"))throw new Error('global budget must use a versioned UTC infrastructure key, not a legacy bare date');
if(guard.includes("bind(localDate,now,now),\n  ]);"))throw new Error('global budget must not be keyed by family-local digest date');
if(/generativelanguage|geminiFetch|fetch\(/.test(guard))throw new Error('AI guard contract must not make live external API calls');
console.log('LINE daily digest AI guard atomicity contract: ok');
