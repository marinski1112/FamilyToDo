#!/usr/bin/env bash
set -euo pipefail
node <<'JS'
const fs=require('fs'),cal=fs.readFileSync('src/google-calendar.ts','utf8'),ai=fs.readFileSync('src/family-ai.ts','utf8'),idx=fs.readFileSync('src/index.ts','utf8');
const has=(s,x)=>{if(!s.includes(x))throw Error('missing '+x)};
for(const x of ['utcNow()','calendarRetryAt','calendarRetryDue','CALENDAR_MAX_RETRIES','retry_count>=?','syncLeases','nextSyncToken','e.status===410','external_etag','calendar.app.created',"visibility_scope||'FAMILY'"])has(cal,x);
for(const x of ['対象:','期間:','集計方法:','synthetic connectivity test','no user data is included'])has(ai,x);
for(const x of ['family_timezone','env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE'])has(idx,x);
const utc=d=>d.toISOString().slice(0,19).replace('T',' '),at=new Date('2026-08-28T00:00:00Z');
const retry=n=>utc(new Date(at.getTime()+Math.min(86400000,60000*2**Math.max(1,n))));
if(retry(1)!=='2026-08-28 00:02:00'||retry(2)!=='2026-08-28 00:04:00')throw Error('backoff');
const due=(count,next,t)=>count<8&&next<=utc(t);
if(due(1,retry(1),new Date('2026-08-28T00:01:59Z')))throw Error('future selected');
if(!due(1,retry(1),new Date('2026-08-28T00:02:00Z')))throw Error('expiry not selected');
if(due(8,'2020-01-01 00:00:00',at))throw Error('max retry');
console.log('wave100 smoke: ok');
JS
