import type { AppContext } from './app-context';
import { AuthRequired, Forbidden } from './errors';
import { html, redirect } from './response';
import { layout } from './app-shell';
import { familyDate, familyNow, DEFAULT_FAMILY_TIMEZONE } from './timezone';

type Row=Record<string,unknown>;
const PATH='/app/child_foods.php';
const CATEGORIES:Record<string,string>={GRAIN:'🍚 炭水化物',VEGETABLE:'🥕 野菜',FRUIT:'🍎 くだもの',MEAT:'🍖 肉',FISH:'🐟 魚',OTHER:'🥣 その他'};
const STAGES=['初期','中期','後期','完了期'];
const esc=(value:unknown)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function parseChildFood(form:FormData,today:string){
  const name=String(form.get('name')||'').normalize('NFKC').trim().replace(/\s+/g,' ');
  const category=String(form.get('category')||'OTHER'),date=String(form.get('first_tried_on')||'');
  const stages=form.getAll('stage').map(String);
  if(!name||name.length>80||!Object.hasOwn(CATEGORIES,category)||date&&(!validDate(date)||date>today)||stages.some(x=>!['1','2','4','8'].includes(x)))return null;
  return {name,key:name.toLocaleLowerCase('ja'),category,date:date||null,mask:[...new Set(stages)].reduce((a,b)=>a|Number(b),0)};
}
export async function childFoodListPage(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;if(!member)throw new AuthRequired();
  if(!['GET','POST'].includes(request.method))return new Response('Method Not Allowed',{status:405});
  const ready=await ctx.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='child_food_entries'").first();
  if(!ready)return html(layout('食材リスト','<div class="card"><h1>🥕 食材リスト</h1><p>データベース更新の反映待ちです。</p><a href="/app/family_log.php">家族ログへ</a></div>','/app/family_log.php'),503);
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  const csrf=ctx.session.csrfToken,url=new URL(request.url),tz=String(member.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE),today=familyDate(tz);
  const form=request.method==='POST'?await request.formData():null;
  if(form&&form.get('csrf')!==csrf)throw new Forbidden('CSRF検証に失敗しました。');
  const subjects=await ctx.env.DB.prepare("SELECT id,name FROM family_log_subjects WHERE family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') ORDER BY id").bind(member.family_id).all<Row>();
  const requested=Number(form?.get('subject_id')||url.searchParams.get('subject_id')||0);
  const subject=subjects.results.find(x=>Number(x.id)===requested)||(!form&&!requested?subjects.results[0]:null);
  if(!subject){if(form||requested)return new Response('対象が見つかりません。',{status:404});return html(layout('食材リスト','<div class="card"><h1>🥕 食材リスト</h1><p>先に子供の記録対象を登録してください。</p><a href="/app/settings_family_log.php">家族ログ管理へ</a></div>','/app/family_log.php'));}
  const subjectId=Number(subject.id),base=`${PATH}?subject_id=${subjectId}`;
  let error='',editing:Row|null=null;
  if(form){
    const id=Number(form.get('id')||0),action=String(form.get('action')||'save'),now=familyNow(tz);
    if(!Number.isSafeInteger(id)||id<0)return new Response('入力内容が不正です。',{status:400});
    if(action==='stage'){
      const bit=Number(form.get('bit')),value=String(form.get('value'));
      if(!id||![1,2,4,8].includes(bit)||!['0','1'].includes(value))return new Response('入力内容が不正です。',{status:400});
      const result=await ctx.env.DB.prepare('UPDATE child_food_entries SET stage_mask=CASE WHEN ?=1 THEN stage_mask | ? ELSE stage_mask & ~? END,updated_at=? WHERE id=? AND family_id=? AND subject_id=?').bind(Number(value),bit,bit,now,id,member.family_id,subjectId).run();
      if(!result.meta.changes)return new Response('食材が見つかりません。',{status:404});
      return redirect(base+`#food-${id}`,303);
    }
    if(action!=='save')return new Response('入力内容が不正です。',{status:400});
    const input=parseChildFood(form,today);
    if(!input)error='食材名は80文字以内、初回日は今日以前の正しい日付を入力してください。';
    else {
      const duplicate=await ctx.env.DB.prepare('SELECT id FROM child_food_entries WHERE family_id=? AND subject_id=? AND name_key=? AND id<>?').bind(member.family_id,subjectId,input.key,id).first();
      if(duplicate)error='この食材は登録済みです。一覧から編集してください。';
      else if(id){
        const result=await ctx.env.DB.prepare('UPDATE OR IGNORE child_food_entries SET name=?,name_key=?,category=?,first_tried_on=?,stage_mask=?,updated_at=? WHERE id=? AND family_id=? AND subject_id=?').bind(input.name,input.key,input.category,input.date,input.mask,now,id,member.family_id,subjectId).run();
        if(!result.meta.changes)return new Response('更新できませんでした。対象の食材を確認してください。',{status:409});
        return redirect(base+`#food-${id}`,303);
      }else{
        const result=await ctx.env.DB.prepare('INSERT OR IGNORE INTO child_food_entries(family_id,subject_id,name,name_key,category,first_tried_on,stage_mask,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(member.family_id,subjectId,input.name,input.key,input.category,input.date,input.mask,now,now).run();
        return redirect(base+(result.meta.changes?`#food-${Number(result.meta.last_row_id)}`:''),303);
      }
    }
    editing={id,name:String(form.get('name')||''),category:String(form.get('category')||'OTHER'),first_tried_on:String(form.get('first_tried_on')||''),stage_mask:input?.mask||0};
  }
  const editId=Number(url.searchParams.get('edit')||0);
  if(!form&&Number.isSafeInteger(editId)&&editId>0)editing=await ctx.env.DB.prepare('SELECT id,name,category,first_tried_on,stage_mask FROM child_food_entries WHERE id=? AND family_id=? AND subject_id=?').bind(editId,member.family_id,subjectId).first<Row>();
  const category=Object.hasOwn(CATEGORIES,url.searchParams.get('category')||'')?url.searchParams.get('category')!:'',q=String(url.searchParams.get('q')||'').trim().slice(0,80);
  const rows=await ctx.env.DB.prepare("SELECT id,name,category,first_tried_on,stage_mask FROM child_food_entries WHERE family_id=? AND subject_id=? AND (?='' OR category=?) AND (?='' OR instr(name,?)>0) ORDER BY name_key,id LIMIT 501").bind(member.family_id,subjectId,category,category,q,q).all<Row>();
  const hidden=`<input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="subject_id" value="${subjectId}">`;
  const filters=`<form method="get" class="food-filters"><input type="hidden" name="subject_id" value="${subjectId}"><input name="q" aria-label="食材を検索" placeholder="食材を検索" value="${esc(q)}" maxlength="80"><select name="category" aria-label="分類"><option value="">すべて</option>${Object.entries(CATEGORIES).map(([key,label])=>`<option value="${key}" ${category===key?'selected':''}>${label}</option>`).join('')}</select><button>検索</button></form>`;
  const list=rows.results.slice(0,500).map(row=>`<tr id="food-${Number(row.id)}"><th scope="row"><a href="${base}&edit=${Number(row.id)}#food-form">${esc(row.name)}</a><small>${row.first_tried_on?'✓ '+esc(row.first_tried_on):'初回日 未登録'}</small></th>${STAGES.map((label,i)=>{const bit=1<<i,checked=(Number(row.stage_mask)&bit)!==0;return `<td><form method="post">${hidden}<input type="hidden" name="action" value="stage"><input type="hidden" name="id" value="${Number(row.id)}"><input type="hidden" name="bit" value="${bit}"><input type="hidden" name="value" value="${checked?'0':'1'}"><button class="food-stage ${checked?'checked':''}" aria-pressed="${checked}" aria-label="${esc(row.name)}・${label}">${checked?'●':'○'}</button></form></td>`;}).join('')}</tr>`).join('');
  const editor=`<details class="card" id="food-form" ${editing||error?'open':''}><summary>${editing?'食材を編集':'＋ 食材を登録'}</summary>${error?`<p role="alert">${esc(error)}</p>`:''}<form method="post">${hidden}<input type="hidden" name="id" value="${Number(editing?.id||0)}"><label>食材名<input name="name" maxlength="80" required value="${esc(editing?.name)}"></label><label>分類<select name="category">${Object.entries(CATEGORIES).map(([key,label])=>`<option value="${key}" ${(editing?.category||'OTHER')===key?'selected':''}>${label}</option>`).join('')}</select></label><label>初めて食べた日（任意）<input type="date" name="first_tried_on" max="${today}" value="${esc(editing?.first_tried_on)}"></label><fieldset><legend>食べた段階</legend>${STAGES.map((label,i)=>`<label class="food-choice"><input type="checkbox" name="stage" value="${1<<i}" ${Number(editing?.stage_mask||0)&(1<<i)?'checked':''}>${label}</label>`).join('')}</fieldset><button>保存する</button>${editing?` <a href="${base}">キャンセル</a>`:''}</form></details>`;
  return html(layout('食材リスト',`<style>.food-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.food-head h1{font-size:22px}.food-subjects{display:flex;gap:8px;overflow-x:auto;margin-bottom:12px}.food-subjects a{white-space:nowrap;padding:8px;border-radius:12px}.food-subjects [aria-current]{background:#ede9fe}.food-filters{display:flex;gap:6px;margin-bottom:12px}.food-filters input{min-width:0;flex:1}.food-filters select{max-width:120px}.food-filters button{padding:8px}.food-table-wrap{overflow-x:auto;background:white;border-radius:12px}.food-table{width:100%;border-collapse:collapse;min-width:310px;table-layout:fixed}.food-table th:first-child{width:40%}.food-table th,.food-table td{padding:7px 2px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px}.food-table tbody th{text-align:left;padding:10px 6px;overflow-wrap:anywhere}.food-table th a{font-size:15px;color:#334155;text-decoration:none}.food-table small{display:block;font-size:10px;color:#64748b;margin-top:4px}.food-stage{width:44px!important;min-width:0!important;height:44px;padding:0!important;background:transparent!important;color:#94a3b8!important;font-size:26px;border:0}.food-stage.checked{color:#e8798e!important}.food-choice{display:inline-flex;align-items:center;gap:4px;margin:8px}.food-choice input{width:auto}#food-form{margin-top:16px}#food-form summary{cursor:pointer;font-weight:700}</style><div class="food-head"><h1>🥕 食材リスト</h1><a href="/app/family_log.php">家族ログへ</a></div><nav class="food-subjects" aria-label="子供">${subjects.results.map(s=>`<a href="${PATH}?subject_id=${Number(s.id)}" ${Number(s.id)===subjectId?'aria-current="page"':''}>${esc(s.name)}</a>`).join('')}</nav>${filters}<div class="food-table-wrap"><table class="food-table"><thead><tr><th>食材・初回日</th>${STAGES.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${list}</tbody></table>${!list?'<p>食材はまだありません。下の「食材を登録」から追加してください。</p>':''}</div>${rows.results.length>500?'<p>500件まで表示しています。検索・分類で絞り込んでください。</p>':''}${editor}`,'/app/family_log.php'));
}
