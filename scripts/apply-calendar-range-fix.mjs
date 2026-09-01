import {readFileSync,writeFileSync} from 'node:fs';

function replaceOne(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: expected source not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: expected source is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

let app=readFileSync('src/app.ts','utf8');
app=replaceOne(app,
"import { DEFAULT_FAMILY_TIMEZONE, FAMILY_TIMEZONE_OPTIONS, addWallClockMinutes, familyNow, validateTimezone } from './timezone';",
"import { DEFAULT_FAMILY_TIMEZONE, FAMILY_TIMEZONE_OPTIONS, addWallClockMinutes, familyNow, validateTimezone } from './timezone';\nimport { buildStoredTaskRange, isValidDateOnly, safeCalendarDateRange } from './task-range-safety';",
'app range-safety import');

app=replaceOne(app,
"  const addToMap=(target:Record<string,Row[]>,t:Row)=>{\n    const s=String(t.start_at||t.due_at||'').slice(0,10);\n    const e=String(t.end_at||s).slice(0,10);\n    if(!s)return;\n    let d=new Date(`${s}T12:00:00Z`),last=new Date(`${e}T12:00:00Z`);\n    if(last<d)last=d;\n    const firstMs=new Date(`${s}T12:00:00Z`).getTime();\n    const spanDays=Math.max(1,Math.round((last.getTime()-firstMs)/86400000)+1);\n    for(;d<=last;d.setUTCDate(d.getUTCDate()+1)){\n      const k=d.toISOString().slice(0,10);\n      (target[k]??=[]).push({...t,_segment:d.getTime()===firstMs?'start':d.getTime()===last.getTime()?'end':'mid',_spanDays:spanDays});\n    }\n  };",
"  const addToMap=(target:Record<string,Row[]>,t:Row)=>{\n    const range=safeCalendarDateRange(t.start_at||t.due_at,t.end_at||t.start_at||t.due_at);\n    if(!range)return;\n    for(let cursorMs=range.startMs;cursorMs<=range.endMs;cursorMs+=86400000){\n      const k=new Date(cursorMs).toISOString().slice(0,10);\n      (target[k]??=[]).push({...t,_segment:cursorMs===range.startMs?'start':cursorMs===range.endMs?'end':'mid',_spanDays:range.spanDays});\n    }\n  };",
'finite calendar spread');

app=replaceOne(app,
"const DIAGNOSTIC_DEFINITIONS:DiagnosticDefinition[]=[\n  {key:'notification_duplicate'",
"const DIAGNOSTIC_DEFINITIONS:DiagnosticDefinition[]=[\n  {key:'task_range',label:'タスク期間の不正・逆転',description:'開始/終了日時が不正、または終了が開始より前のタスク',sql:\"SELECT COUNT(*) c FROM tasks WHERE family_id=? AND start_at IS NOT NULL AND (datetime(start_at) IS NULL OR (end_at IS NOT NULL AND (datetime(end_at) IS NULL OR datetime(end_at)<datetime(start_at))))\"},\n  {key:'notification_duplicate'",
'aggregate task range diagnostic');

app=replaceOne(app,
"  const issue=new URL(request.url).searchParams.get('issue')||'';const d=DIAGNOSTIC_DEFINITIONS.find(x=>x.key===issue);if(!d)return json({ok:false,error:'診断キーが不正です。'},400);\n  // SQL is server-side allowlisted; never accept SQL from the browser. IDs only avoid leaking content or credentials.",
"  const issue=new URL(request.url).searchParams.get('issue')||'';const d=DIAGNOSTIC_DEFINITIONS.find(x=>x.key===issue);if(!d)return json({ok:false,error:'診断キーが不正です。'},400);\n  if(issue==='task_range'){\n    if(request.method==='POST'){\n      const b=await bodyJson(request);await ensureCsrf(ctx,b.csrf);\n      if(String(b.action||'')!=='repair_unambiguous_task_ranges')return json({ok:false,error:'修復操作が不正です。'},400);\n      const now=nowJst();\n      const repaired=await ctx.env.DB.prepare(\"UPDATE tasks SET end_at=start_at,updated_at=? WHERE family_id=? AND all_day=1 AND start_at IS NOT NULL AND end_at IS NOT NULL AND datetime(start_at) IS NOT NULL AND datetime(end_at) IS NOT NULL AND datetime(end_at)<datetime(start_at) AND substr(start_at,1,10)=substr(end_at,1,10)\").bind(now,m.family_id).run();\n      return json({ok:true,issue,repaired_count:Number(repaired.meta.changes||0)});\n    }\n    if(request.method!=='GET')return json({ok:false,error:'GET/POST only'},405);\n    const counts=await ctx.env.DB.prepare(\"SELECT COUNT(*) c,SUM(CASE WHEN all_day=1 AND datetime(start_at) IS NOT NULL AND datetime(end_at) IS NOT NULL AND datetime(end_at)<datetime(start_at) AND substr(start_at,1,10)=substr(end_at,1,10) THEN 1 ELSE 0 END) repairable FROM tasks WHERE family_id=? AND start_at IS NOT NULL AND (datetime(start_at) IS NULL OR (end_at IS NOT NULL AND (datetime(end_at) IS NULL OR datetime(end_at)<datetime(start_at))))\").bind(m.family_id).first<Row>();\n    return json({ok:true,issue,count:Number(counts?.c||0),repairable_count:Number(counts?.repairable||0)});\n  }\n  if(request.method!=='GET')return json({ok:false,error:'GET only'},405);\n  // SQL is server-side allowlisted; never accept SQL from the browser. IDs only avoid leaking content or credentials.",
'privacy-safe task range inspection and repair');

const editOld=`    if(!title) throw new BadRequest('タイトルを入力してください。');
    if(isEvent&&!date) throw new BadRequest('イベントには日付を指定してください。');
    if(!noDate&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) throw new BadRequest('日付が不正です。');
    const endDate=String(b.end_date||date).trim();
    if(!noDate&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
    if(!noDate&&endDate<date) throw new BadRequest('終了日は開始日以降にしてください。');
    const st=String(b.start_time||'').trim(), et=String(b.end_time||'').trim();
    const start=noDate?null:(st?\`${'${date}'} ${'${st}'}:00\`:null), end=noDate?null:(et?\`${'${endDate}'} ${'${et}'}:00\`:(allDayDateEnd(date,endDate)?\`${'${endDate}'} 23:59:59\`:null));
    if(start&&end&&end<start) throw new BadRequest('終了時刻は開始時刻以降にしてください。');`;
const editNew=`    if(!title) throw new BadRequest('タイトルを入力してください。');
    if(isEvent&&!date) throw new BadRequest('イベントには日付を指定してください。');
    const endDate=String(b.end_date||date).trim();
    const st=String(b.start_time||'').trim(), et=String(b.end_time||'').trim();
    const range=buildStoredTaskRange({noDate,allDay,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDay});
    if(!range.ok){
      if(range.error==='START_DATE_INVALID')throw new BadRequest('日付が不正です。');
      if(range.error==='END_DATE_INVALID')throw new BadRequest('終了日が不正です。');
      if(range.error==='DATE_ORDER')throw new BadRequest('終了日は開始日以降にしてください。');
      if(range.error==='START_TIME_REQUIRED')throw new BadRequest('開始時刻を入力してください。');
      if(range.error==='START_TIME_INVALID')throw new BadRequest('開始時刻が不正です。');
      if(range.error==='END_TIME_INVALID')throw new BadRequest('終了時刻が不正です。');
      throw new BadRequest('終了時刻は開始時刻以降にしてください。');
    }
    const start=range.startAt,end=range.endAt;`;
app=replaceOne(app,editOld,editNew,'task edit authoritative range validation');

const convertOld=`      if(isEvent&&!date) throw new BadRequest('イベントには日付を指定してください。');
      if(!noDate&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new BadRequest('開始日を入力してください。');
      const endDate=String(b.end_date||date).trim();
      if(!noDate&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate)) throw new BadRequest('終了日が不正です。');
      if(!noDate&&endDate<date) throw new BadRequest('終了日は開始日以降にしてください。');
      const allDay=b.all_day!==false && String(b.all_day)!=='0';
      const st=String(b.start_time||'').trim(),et=String(b.end_time||'').trim();
      const startAt=noDate?null:(allDay?\`${'${date}'} 00:00:00\`:(st?\`${'${date}'} ${'${st}'}:00\`:null));
      const endAt=noDate?null:(allDay?(endDate!==date?\`${'${endDate}'} 23:59:59\`:null):(et?\`${'${endDate}'} ${'${et}'}:00\`:null));
      if(!noDate&&!allDay&&!startAt) throw new BadRequest('開始時刻を入力してください。');`;
const convertNew=`      if(isEvent&&!date) throw new BadRequest('イベントには日付を指定してください。');
      const endDate=String(b.end_date||date).trim();
      const allDay=b.all_day!==false && String(b.all_day)!=='0';
      const st=String(b.start_time||'').trim(),et=String(b.end_time||'').trim();
      const range=buildStoredTaskRange({noDate,allDay,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDay});
      if(!range.ok){
        if(range.error==='START_DATE_INVALID')throw new BadRequest('開始日が不正です。');
        if(range.error==='END_DATE_INVALID')throw new BadRequest('終了日が不正です。');
        if(range.error==='DATE_ORDER')throw new BadRequest('終了日は開始日以降にしてください。');
        if(range.error==='START_TIME_REQUIRED')throw new BadRequest('開始時刻を入力してください。');
        if(range.error==='START_TIME_INVALID')throw new BadRequest('開始時刻が不正です。');
        if(range.error==='END_TIME_INVALID')throw new BadRequest('終了時刻が不正です。');
        throw new BadRequest('終了時刻は開始時刻以降にしてください。');
      }
      const startAt=range.startAt,endAt=range.endAt;`;
app=replaceOne(app,convertOld,convertNew,'message-to-task authoritative range validation');
writeFileSync('src/app.ts',app);

let index=readFileSync('src/index.ts','utf8');
index=replaceOne(index,
"import { calendarImportPage, calendarImportPreview, calendarImportNormalizationPreview, calendarImportPrepare, calendarImportStatus, calendarImportApply, calendarImportRollback } from './calendar-ics-import';",
"import { calendarImportPage, calendarImportPreview, calendarImportNormalizationPreview, calendarImportPrepare, calendarImportStatus, calendarImportApply, calendarImportRollback } from './calendar-ics-import';\nimport { buildStoredTaskRange } from './task-range-safety';",
'index range-safety import');

index=replaceOne(index,
"  if(!noDate&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return json({ok:false,error:'日付が不正です。'},400);\n  const allDay=Boolean(b.allDay); const endDate=String(b.endDateOnly??date).trim(); if(!noDate&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate))return json({ok:false,error:'終了日が不正です。'},400); if(!noDate&&endDate<date)return json({ok:false,error:'終了日は開始日以降にしてください。'},400); const st=String(b.startTime??'').trim();const et=String(b.endTime??'').trim();\n  const normalizeDateTime=(v:string,baseDate:string)=>{if(!v)return null; if(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(v))return v.replace('T',' ')+':00'; if(/^\\d{2}:\\d{2}$/.test(v))return `${baseDate} ${v}:00`; return null;};\n  const start=noDate?null:(allDay?`${date} 00:00:00`:normalizeDateTime(st,date));const end=noDate?null:(allDay?(endDate!==date?`${endDate} 23:59:59`:null):normalizeDateTime(et,endDate||date));\n  if(!noDate&&!allDay&&!start)return json({ok:false,error:'開始日時を指定してください。'},400);\n  if(st&&!start)return json({ok:false,error:'開始日時が不正です。'},400); if(et&&!end)return json({ok:false,error:'終了日時が不正です。'},400);\n  if(start&&end&&end<start)return json({ok:false,error:'終了日時は開始日時以降にしてください。'},400);",
"  const allDay=Boolean(b.allDay); const endDate=String(b.endDateOnly??date).trim(); const st=String(b.startTime??'').trim();const et=String(b.endTime??'').trim();\n  const range=buildStoredTaskRange({noDate,allDay,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDay});\n  if(!range.ok){\n    const error=range.error==='START_DATE_INVALID'?'日付が不正です。':range.error==='END_DATE_INVALID'?'終了日が不正です。':range.error==='DATE_ORDER'?'終了日は開始日以降にしてください。':range.error==='START_TIME_REQUIRED'?'開始日時を指定してください。':range.error==='START_TIME_INVALID'?'開始日時が不正です。':range.error==='END_TIME_INVALID'?'終了日時が不正です。':'終了日時は開始日時以降にしてください。';\n    return json({ok:false,error},400);\n  }\n  const start=range.startAt,end=range.endAt;",
'task create API authoritative range validation');
writeFileSync('src/index.ts',index);

console.log('Applied exact Calendar/task range safety patch.');
