import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';

export const CONTENT_KINDS={tasks:'タスク',items:'持ち物',shopping:'買い物',messages:'伝言',logs:'家族ログ'} as const;
export type ContentKind=keyof typeof CONTENT_KINDS;
export function contentListing(url:URL,familyId:number,memberId:number,now:string){
  const value=url.searchParams.get('kind')||'tasks';
  const kind:ContentKind=Object.hasOwn(CONTENT_KINDS,value)?value as ContentKind:'tasks';
  const q=(url.searchParams.get('q')||'').trim().slice(0,100);
  const raw=Number(url.searchParams.get('before')||0),before=Number.isSafeInteger(raw)&&raw>0?raw:0;
  const tables={tasks:'tasks t',items:'items i',shopping:'shopping_items s',messages:'messages msg',logs:'family_logs l LEFT JOIN family_log_subjects subject ON subject.id=l.subject_id AND subject.family_id=l.family_id'};
  const aliases={tasks:'t',items:'i',shopping:'s',messages:'msg',logs:'l'},alias=aliases[kind];
  const columns={tasks:'t.id,t.title,t.status,t.created_at,t.created_by',items:'i.id,i.name,i.status,i.created_at,i.created_by',shopping:'s.id,s.name,s.status,s.created_at,s.created_by',messages:'msg.id,msg.text,msg.created_at,msg.sender_id',logs:'l.id,l.log_type,l.occurred_at,l.created_at,l.created_by,subject.name subject_name'};
  const searchable={tasks:"COALESCE(t.title,'')",items:"COALESCE(i.name,'')",shopping:"COALESCE(s.name,'')",messages:"COALESCE(msg.text,'')",logs:"COALESCE(subject.name,'')||' '||COALESCE(l.log_type,'')||' '||COALESCE(l.note,'')"};
  const values:(string|number)[]=[familyId];
  let visibility='';
  if(kind==='tasks'){visibility=` AND ${taskVisibilitySql('t')}`;values.push(memberId);}
  else if(kind==='items'||kind==='shopping'){visibility=` AND ${taskChildVisibilitySql(alias)}`;values.push(memberId);}
  else if(kind==='messages'){visibility=' AND (msg.target_member_id IS NULL OR msg.target_member_id IN (?,msg.sender_id)) AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?)';values.push(memberId,now,memberId);}
  else visibility=' AND l.deleted_at IS NULL';
  if(before){visibility+=` AND ${alias}.id<?`;values.push(before);}
  if(q){visibility+=` AND instr(${searchable[kind]},?)>0`;values.push(q);}
  return {kind,q,before,values,sql:`SELECT ${columns[kind]} FROM ${tables[kind]} WHERE ${alias}.family_id=?${visibility} ORDER BY ${alias}.id DESC LIMIT 31`};
}
