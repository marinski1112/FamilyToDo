import {readFileSync,writeFileSync} from 'node:fs';

let app=readFileSync('src/app.ts','utf8');
const needle="    const range=buildStoredTaskRange({noDate,allDay,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDay});";
const pos=app.lastIndexOf(needle);
if(pos<0)throw new Error('task-edit range helper call not found after primary patch');
if(app.indexOf(needle)===pos)throw new Error('expected separate message-conversion and task-edit range helper calls');
const replacement="    const allDayRequested=b.all_day===true||String(b.all_day)==='1'||String(b.all_day)==='on';\n    const range=buildStoredTaskRange({noDate,allDay:allDayRequested,startDate:date,endDate,startTime:st,endTime:et,requireTimedStart:!allDayRequested});";
app=app.slice(0,pos)+replacement+app.slice(pos+needle.length);
const allDayNeedle="    const allDay=b.all_day?1:0;";
const allDayPos=app.indexOf(allDayNeedle,pos);
if(allDayPos<0)throw new Error('task-edit all-day persistence assignment not found');
app=app.slice(0,allDayPos)+"    const allDay=allDayRequested?1:0;"+app.slice(allDayPos+allDayNeedle.length);
writeFileSync('src/app.ts',app);
console.log('Applied task-edit all-day patch correction.');
