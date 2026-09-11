import type { AppContext } from './app-context';
import { familyDailyJournalPage } from './family-daily-journal';

type Row=Record<string,unknown>;
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`));
const safeIds=(raw:unknown):number[]=>{try{const parsed=JSON.parse(String(raw??'[]'));return Array.isArray(parsed)?[...new Set(parsed.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,100):[];}catch{return [];}};

async function sharedMemberIds(db:D1Database,familyId:number):Promise<Set<number>>{
  const rows=await db.prepare(`SELECT DISTINCT d.member_id FROM location_devices d JOIN members m ON m.id=d.member_id AND m.family_id=d.family_id AND m.active=1 WHERE d.family_id=? AND d.enabled=1 AND d.sharing_enabled=1 AND d.revoked_at IS NULL ORDER BY d.member_id LIMIT 200`).bind(familyId).all<Row>();
  return new Set(rows.results.map(row=>Number(row.member_id)).filter(id=>Number.isSafeInteger(id)&&id>0));
}

export async function familyDailyJournalPageWithAi(request:Request,ctx:AppContext):Promise<Response>{
  const base=await familyDailyJournalPage(request,ctx);
  if(!base.ok||!ctx.member)return base;
  const selected=String(new URL(request.url).searchParams.get('date')||'');
  if(!validDate(selected))return base;
  const familyId=Number(ctx.member.family_id);if(!Number.isSafeInteger(familyId)||familyId<=0)return base;
  try{
    const row=await ctx.env.DB.prepare(`SELECT ai_summary_text,ai_model,ai_status,ai_location_member_ids_json FROM family_daily_journals WHERE family_id=? AND journal_date=? AND storage_tier='HOT' LIMIT 1`).bind(familyId,selected).first<Row>();
    if(String(row?.ai_status||'')!=='AI_OK')return base;
    const narrative=String(row?.ai_summary_text||'').trim();if(!narrative)return base;
    const required=safeIds(row?.ai_location_member_ids_json),shared=required.length?await sharedMemberIds(ctx.env.DB,familyId):new Set<number>();
    if(required.some(id=>!shared.has(id)))return base;
    const text=await base.text();
    const marker=`<section class="card"><h2>${esc(selected)} の総括</h2>`;
    if(!text.includes(marker))return new Response(text,{status:base.status,headers:base.headers});
    const model=String(row?.ai_model||'').trim();
    const card=`<section class="card"><h2>✨ AI日誌</h2><p>${esc(narrative)}</p><p class="small">${esc(model||'Gemini')}で、確定済みの家族記録から生成。位置共有を停止した家族の情報を含む場合は表示しません。</p></section>`;
    return new Response(text.replace(marker,card+marker),{status:base.status,headers:base.headers});
  }catch{return base;}
}
