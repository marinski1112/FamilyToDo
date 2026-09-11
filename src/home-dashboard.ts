import type { AppContext } from './app-context';
import { recurringForDate } from './recurrence-projection';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';

type Row=Record<string,unknown>;
type JournalLocationMember={memberId?:number;stays?:unknown[]};

export type HomeJournalSnapshot=Readonly<{
  date:string;
  text:string;
  isAi:boolean;
  taskCount:number;
  houseworkCount:number;
  locationMemberCount:number;
  stayCount:number;
}>;

export type HomeDashboardData=Readonly<{
  familyName:string;
  today:string;
  yesterday:string;
  todayTasks:number;
  todayEvents:number;
  shoppingRemaining:number;
  familyLogToday:number;
  overdueTasks:number;
  overdueShopping:number;
  unorganizedTasks:number;
  yesterdayJournal:HomeJournalSnapshot|null;
}>;

const parseArray=<T>(raw:unknown):T[]=>{
  try{const value=JSON.parse(String(raw??'[]'));return Array.isArray(value)?value as T[]:[];}catch{return [];}
};
const count=(row:Row|null|undefined)=>Math.max(0,Number(row?.c||0)||0);
const shiftDate=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const safeMemberIds=(raw:unknown):number[]=>{
  try{
    const value=JSON.parse(String(raw??'[]'));
    if(!Array.isArray(value))return [];
    return [...new Set(value.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,100);
  }catch{return [];}
};

async function sharedLocationMemberIds(db:D1Database,familyId:number):Promise<Set<number>>{
  const rows=await db.prepare(`SELECT DISTINCT d.member_id
    FROM location_devices d
    JOIN members m ON m.id=d.member_id AND m.family_id=d.family_id AND m.active=1
    WHERE d.family_id=? AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL
    ORDER BY d.member_id LIMIT 200`).bind(familyId).all<Row>();
  return new Set(rows.results.map(row=>Number(row.member_id)).filter(id=>Number.isSafeInteger(id)&&id>0));
}

function deterministicJournalSnapshot(row:Row,date:string,shared:Set<number>):HomeJournalSnapshot{
  const allLocation=parseArray<JournalLocationMember>(row.location_json);
  const location=allLocation.filter(member=>Number.isSafeInteger(Number(member.memberId))&&shared.has(Number(member.memberId)));
  const tasks=parseArray<unknown>(row.tasks_json);
  const housework=parseArray<unknown>(row.housework_json);
  const stayCount=location.reduce((total,member)=>total+(Array.isArray(member.stays)?member.stays.length:0),0);
  const parts:string[]=[];
  if(location.length)parts.push(`位置記録${location.length}人分・滞在${stayCount}件。`);
  if(tasks.length)parts.push(`完了タスク${tasks.length}件。`);
  if(housework.length)parts.push(`家事${housework.length}件。`);
  return {
    date,
    text:parts.join('')||'昨日は、日次総括に残す記録がありませんでした。',
    isAi:false,
    taskCount:tasks.length,
    houseworkCount:housework.length,
    locationMemberCount:location.length,
    stayCount,
  };
}

async function yesterdayJournal(db:D1Database,familyId:number,date:string):Promise<HomeJournalSnapshot|null>{
  let row:Row|null=null;
  try{
    row=await db.prepare(`SELECT journal_date,location_json,tasks_json,housework_json
      FROM family_daily_journals
      WHERE family_id=? AND journal_date=? AND storage_tier='HOT'
      LIMIT 1`).bind(familyId,date).first<Row>();
  }catch{return null;}
  if(!row)return null;

  const shared=await sharedLocationMemberIds(db,familyId);
  const fallback=deterministicJournalSnapshot(row,date,shared);

  // Migration 0080 may not yet exist in every runtime. AI is additive only:
  // any schema/read problem falls back to the privacy-filtered deterministic view.
  try{
    const ai=await db.prepare(`SELECT ai_summary_text,ai_status,ai_location_member_ids_json
      FROM family_daily_journals
      WHERE family_id=? AND journal_date=? AND storage_tier='HOT'
      LIMIT 1`).bind(familyId,date).first<Row>();
    const narrative=String(ai?.ai_summary_text||'').trim();
    const required=safeMemberIds(ai?.ai_location_member_ids_json);
    const sharingStillValid=required.every(id=>shared.has(id));
    if(String(ai?.ai_status||'')==='AI_OK'&&narrative&&sharingStillValid){
      return {...fallback,text:narrative,isAi:true};
    }
  }catch{}
  return fallback;
}

export async function loadHomeDashboard(ctx:AppContext,today:string):Promise<HomeDashboardData>{
  const member=ctx.member;
  if(!member)throw new Error('home dashboard requires authenticated member');
  const familyId=Number(member.family_id),memberId=Number(member.id),yesterday=shiftDate(today,-1);

  const taskRowsForToday=ctx.env.DB.prepare(`SELECT id,status,task_kind
    FROM tasks t
    WHERE t.family_id=? AND ${taskVisibilitySql('t')}
      AND t.status IN ('pending','completed')
      AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template'))
      AND ((t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
        OR (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)=date(?)))`)
    .bind(familyId,memberId,today,today,today).all<Row>();

  const [family,todayPhysical,todayRecurring,overdueTaskCount,shoppingCount,overdueShoppingCount,familyLogCount,unorganizedTaskCount,journal]=await Promise.all([
    ctx.env.DB.prepare('SELECT name FROM families WHERE id=? LIMIT 1').bind(familyId).first<Row>(),
    taskRowsForToday,
    recurringForDate(ctx,today),
    ctx.env.DB.prepare(`SELECT count(*) c FROM tasks t
      WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending'
        AND (t.task_kind IS NULL OR lower(t.task_kind)='task')
        AND COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL
        AND date(COALESCE(t.end_at,t.due_at,t.start_at))<date(?)`)
      .bind(familyId,memberId,today).first<Row>(),
    ctx.env.DB.prepare(`SELECT count(*) c FROM shopping_items s
      WHERE s.family_id=? AND s.status<>'completed' AND ${taskChildVisibilitySql('s')}`)
      .bind(familyId,memberId).first<Row>(),
    ctx.env.DB.prepare(`SELECT count(*) c
      FROM shopping_items s
      LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
      WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')})
        AND s.status<>'completed'
        AND COALESCE(s.due_date,t.end_at,t.due_at,t.start_at) IS NOT NULL
        AND date(COALESCE(s.due_date,t.end_at,t.due_at,t.start_at))<date(?)`)
      .bind(familyId,memberId,today).first<Row>(),
    ctx.env.DB.prepare("SELECT count(*) c FROM family_logs WHERE family_id=? AND deleted_at IS NULL AND date(occurred_at)=date(?)")
      .bind(familyId,today).first<Row>(),
    ctx.env.DB.prepare(`SELECT count(*) c FROM tasks t
      WHERE t.family_id=? AND ${taskVisibilitySql('t')} AND t.status='pending'
        AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('event','recurring','recurrence_template'))
        AND t.start_at IS NULL AND t.end_at IS NULL AND t.due_at IS NULL`)
      .bind(familyId,memberId).first<Row>(),
    yesterdayJournal(ctx.env.DB,familyId,yesterday),
  ]);

  const physical= todayPhysical.results;
  const todayTasks=physical.filter(row=>String(row.task_kind||'').toLowerCase()!=='event'&&String(row.status||'pending')==='pending').length
    +todayRecurring.filter(row=>String(row.status||'pending')==='pending').length;
  const todayEvents=physical.filter(row=>String(row.task_kind||'').toLowerCase()==='event').length;

  return {
    familyName:String(family?.name||'家族'),
    today,
    yesterday,
    todayTasks,
    todayEvents,
    shoppingRemaining:count(shoppingCount),
    familyLogToday:count(familyLogCount),
    overdueTasks:count(overdueTaskCount),
    overdueShopping:count(overdueShoppingCount),
    unorganizedTasks:count(unorganizedTaskCount),
    yesterdayJournal:journal,
  };
}
