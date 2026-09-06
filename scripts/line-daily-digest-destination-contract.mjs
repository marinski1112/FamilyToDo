import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  'const destinations=new Map<string,Row[]>()',
  "for(const [lineUserId,members] of destinations)",
  "receipts.some(receipt=>String(receipt.status)==='SENT')",
  'receipts.filter(receipt=>Number(receipt.attempt_count)<3)',
  'if(members.length===1)',
  'facts=sharedAiFacts',
  'familytodo:morning-digest:v2:',
  'pushLineMessage(env.LINE_ACCESS_TOKEN,lineUserId,message,{retryKey})',
])if(!digest.includes(marker))throw new Error(`morning destination dedupe marker missing: ${marker}`);

const processStart=digest.indexOf('export async function processLineDailyDigests('),processBody=processStart>=0?digest.slice(processStart):'';
if((processBody.match(/pushLineMessage\(/g)||[]).length!==1)throw new Error('morning digest must have one push call site after destination grouping');
if(!processBody.includes('buildLocationDigestDayFacts({db:env.DB,familyId:Number(setting.family_id),requesterMemberId'))throw new Error('unique destinations must keep requester-scoped location facts');
if(!processBody.includes('facts=sharedAiFacts'))throw new Error('duplicate member rows sharing one LINE destination must fall back to FAMILY-only shared facts');

console.log('line-daily-digest-destination-contract: one push per LINE destination; unique recipients retain requester facts while duplicate mappings use FAMILY-only shared facts');
