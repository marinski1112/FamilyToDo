import fs from 'node:fs';

const path='src/app.ts';
let source=fs.readFileSync(path,'utf8');

function replaceOnce(oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: expected source was not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: expected source was not unique`);
  source=source.slice(0,first)+newText+source.slice(first+oldText.length);
}

replaceOnce(
`        AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
          OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?)))`,
`        AND (
          (lower(COALESCE(t.task_kind,''))='event' AND (
            (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND date(COALESCE(t.end_at,t.start_at))>=date(?))
            OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?))
          ))
          OR (lower(COALESCE(t.task_kind,''))<>'event' AND (
            (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
            OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?))
          ))
        )`,
'daily occurrence predicate');

replaceOnce(
`      ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id\`).bind(ctx.member!.family_id,ctx.member!.id,date,date,date).all<Row>(),`,
`      ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id\`).bind(ctx.member!.family_id,ctx.member!.id,date,date,date,date,date,date).all<Row>(),`,
'daily occurrence binds');

fs.writeFileSync(path,source);
console.log('Patched exact retained src/app.ts Task/Event daily occurrence predicate.');
