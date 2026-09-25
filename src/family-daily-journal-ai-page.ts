import type { AppContext } from './app-context';
import { familyDailyJournalPage } from './family-daily-journal';

type Row=Record<string,unknown>;
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`));

export async function familyDailyJournalPageWithAi(request:Request,ctx:AppContext):Promise<Response>{
  const base=await familyDailyJournalPage(request,ctx);
  if(!base.ok||!ctx.member)return base;
  const selected=String(new URL(request.url).searchParams.get('date')||'');
  if(!validDate(selected))return base;
  const familyId=Number(ctx.member.family_id);if(!Number.isSafeInteger(familyId)||familyId<=0)return base;
  try{
    const row=await ctx.env.DB.prepare(`SELECT ai_summary_text,ai_model,ai_status FROM family_daily_journals WHERE family_id=? AND journal_date=? AND storage_tier='HOT' LIMIT 1`).bind(familyId,selected).first<Row>();
    if(String(row?.ai_status||'')!=='AI_OK')return base;
    const narrative=String(row?.ai_summary_text||'').trim();if(!narrative)return base;
    const text=await base.text();
    const marker=`<section class="card"><h2>${esc(selected)} の総括</h2>`;
    if(!text.includes(marker))return new Response(text,{status:base.status,headers:base.headers});
    const model=String(row?.ai_model||'').trim();
    const card=`<section class="card"><h2>✨ AI日誌</h2><p>${esc(narrative)}</p><p class="small">${esc(model||'Gemini')}で、確定保存された過去の日誌から生成。</p></section>`;
    return new Response(text.replace(marker,card+marker),{status:base.status,headers:base.headers});
  }catch{return base;}
}
