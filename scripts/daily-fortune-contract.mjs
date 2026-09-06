import fs from 'node:fs';

const fortune=fs.readFileSync('src/daily-fortune.ts','utf8');
const home=fs.readFileSync('src/home-page.ts','utf8');

for(const marker of [
  "familytodo-fortune-v1:${familyId}:${memberId}:${localDate}",
  'export function dailyFortune(familyId:number,memberId:number,localDate:string):DailyFortune',
  'Profile attributes,',
  'logs, schedules, location and AI are not inputs.',
])if(!fortune.includes(marker))throw new Error(`daily fortune boundary marker missing: ${marker}`);

for(const forbidden of ['birth_date','blood_type','sex_gender','birthplace','personality_note','GEMINI_API_KEY','geminiFetch','family_logs','location_']){
  if(fortune.includes(forbidden))throw new Error(`daily fortune must not depend on sensitive/profile/runtime input: ${forbidden}`);
}

for(const marker of [
  "dailyFortune(Number(m.family_id),Number(m.id),today)",
  '🔮 今日の占い',
  '※ 娯楽用の占いです。健康・お金・仕事など大事な判断には使わないでください。',
  'プロフィール情報や予定・位置情報は占いの計算に使っていません。',
])if(!home.includes(marker))throw new Error(`home fortune marker missing: ${marker}`);

if(/dailyFortune\([^)]*(birth|blood|gender|place|personality)/i.test(home))throw new Error('home must seed fortune only with stable IDs and local date');

console.log('daily-fortune-contract: deterministic ID/date seed only; entertainment disclaimer and profile/data isolation present');
