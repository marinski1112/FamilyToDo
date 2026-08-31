import fs from 'node:fs';

const source=fs.readFileSync('src/app.ts','utf8');
const calendarStart=source.indexOf('export async function calendar(');
const calendarEnd=source.indexOf('\nexport function calendarDisplayLabel',calendarStart);
if(calendarStart<0||calendarEnd<0)throw new Error('calendar() source not found');
const calendar=source.slice(calendarStart,calendarEnd);
const rangeStart=source.indexOf('async function recurringForRange(');
const rangeEnd=source.indexOf('\nasync function recurringForDate',rangeStart);
if(rangeStart<0||rangeEnd<0)throw new Error('recurringForRange() source not found');
const range=source.slice(rangeStart,rangeEnd);

const required=[
  'async function recurringForRange(ctx:AppContext,from:string,to:string):Promise<Row[]>',
  'const recurRows=await recurringForRange(ctx,from,to);',
  'recurringForRange(ctx,date,date)',
  'FROM recurrence_occurrences WHERE family_id=? AND occurrence_date BETWEEN ? AND ?',
  'await ctx.env.DB.batch(chunk);',
  'GROUP BY ta.task_id',
  'GROUP BY c.occurrence_id',
];
for(const needle of required){
  if(!source.includes(needle))throw new Error(`missing batched recurrence contract: ${needle}`);
}
if(/for\s*\([^)]*from[^)]*to[^)]*\)[\s\S]{0,400}recurringForDate\s*\(/.test(calendar)){
  throw new Error('calendar() must not call recurringForDate once per rendered date');
}
if((calendar.match(/recurringForDate\s*\(/g)||[]).length>0){
  throw new Error('calendar() must project recurrence through recurringForRange only');
}
if((range.match(/SELECT r\.\*,t\.title/g)||[]).length!==1){
  throw new Error('recurringForRange() must load recurrence rules exactly once');
}
if(range.includes('recurrence_rule_id=? AND occurrence_date=? LIMIT 1')){
  throw new Error('recurringForRange() must not restore per-occurrence lookup queries');
}
console.log('calendar recurrence range performance contract ok');
