import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html } from './response';
import { listGeminiModels, familyAiModelCatalog } from './family-ai';
import { ROUTED_AI_FEATURES, routeSettingKey, resolveFeatureModels, parseRouteModels, type RoutedAiFeature, type AiAudience } from './ai-model-routing';

const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const labels:Record<RoutedAiFeature,string>={ROUGH_INPUT:'タスク・買い物・持ち物のざっくり入力',MESSAGE_DRAFT:'伝言からのタスク下書き',FAMILY_DAILY_JOURNAL:'家族日誌のAI文章',MORNING_DIGEST:'朝のLINE報告',PERIODIC_DIGEST:'週次・月次のLINE報告',GOOGLE_VOICE_INQUIRY:'Google音声問い合わせの分類',CALENDAR_ICS_IMPORT:'カレンダー取込時の時刻整理'};
const pageUrl='/app/settings_ai_models.php';
const noStore=(response:Response)=>{response.headers.set('Cache-Control','private, no-store');return response;};

export async function settingsAiModelRouting(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return new Response('ログインしてください。',{status:401});
  if(!['OWNER','ADMIN'].includes(String(member.role||'').toUpperCase()))return new Response('管理者のみ利用できます。',{status:403});
  if(!['GET','POST'].includes(request.method))return new Response('Method Not Allowed',{status:405});
  const familyId=Number(member.family_id);
  let notice='',status=200;
  if(request.method==='POST'){
    const form=await request.formData();
    const csrf=String(form.get('csrf')||''),expected=String(ctx.session.csrfToken||'');
    if(!csrf||!expected||csrf!==expected)return new Response('CSRF_FAILED',{status:403});
    const action=String(form.get('action')||'');
    try{
      if(action==='catalog'){
        const response=await familyAiModelCatalog(new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf})}),ctx);
        notice=response.ok?'このプロジェクトのモデル一覧を更新しました。':'モデル一覧を取得できませんでした。外部連携の接続診断を確認してください。';
        status=response.ok?200:503;
      }else{
        const feature=String(form.get('feature')) as RoutedAiFeature,audience=String(form.get('audience')) as AiAudience;
        if(!ROUTED_AI_FEATURES.includes(feature)||!['OWNER','MEMBER'].includes(audience)||!['save','reset'].includes(action))return new Response('設定対象が不正です。',{status:400});
        const key=routeSettingKey(feature,audience);
        if(action==='reset'){
          await ctx.env.DB.prepare('DELETE FROM family_settings WHERE family_id=? AND setting_key=?').bind(familyId,key).run();
        }else{
          const primary=String(form.get('primary')||''),fallback=String(form.get('fallback')||'');
          const models=parseRouteModels([primary,...(fallback?[fallback]:[])]);
          if(!models)return new Response('モデルを選択してください。',{status:400});
          // Validate against this project's live catalog. No synthetic generation
          // or extra fallback attempt is performed while saving settings.
          const catalog=await listGeminiModels(ctx.env),available=new Set(catalog.map(x=>x.model));
          if(models.some(model=>!available.has(model)))return new Response('このプロジェクトの一覧にないモデルは保存できません。一覧を更新してください。',{status:400});
          await ctx.env.DB.prepare('INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?) ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at').bind(familyId,key,JSON.stringify(models),new Date().toISOString()).run();
        }
        return noStore(new Response(null,{status:303,headers:{Location:pageUrl}}));
      }
    }catch{notice='設定処理を完了できませんでした。現在の設定を確認してから再操作してください。';status=503;}
  }
  const row=await ctx.env.DB.prepare("SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key='family_ai_model_catalog_json'").bind(familyId).first<{setting_value:string}>();
  let available:string[]=[];
  try{const value=JSON.parse(row?.setting_value||'[]');if(Array.isArray(value))available=[...new Set(value.map(x=>x?.model).filter(x=>parseRouteModels([x])!==null))] as string[];}catch{}
  const csrf=esc(ctx.session.csrfToken),rows:string[]=[];
  for(const feature of ROUTED_AI_FEATURES){
    const cells:string[]=[];
    for(const audience of ['OWNER','MEMBER'] as const){
      const route=await resolveFeatureModels(ctx.env.DB,familyId,feature,audience),models=[...new Set([...route.models,...available])];
      const options=(selected:string)=>models.map(model=>`<option value="${esc(model)}"${model===selected?' selected':''}>${esc(model)}${available.includes(model)?'':'（一覧未確認）'}</option>`).join('');
      cells.push(`<td><form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="feature" value="${feature}"><input type="hidden" name="audience" value="${audience}"><label>使用モデル<select name="primary">${options(route.models[0])}</select></label><label>失敗時の代替<select name="fallback"><option value=""${route.models.length===1?' selected':''}>代替モデルなし</option>${options(route.models[1]||'')}</select></label><p class="small">${route.source==='FAMILY_SETTING'?'管理設定':'既存の初期設定'}・最大${route.models.length}回</p><button class="btn small" name="action" value="save">保存</button> <button class="btn gray small" name="action" value="reset">初期設定へ</button></form></td>`);
    }
    rows.push(`<tr><th>${labels[feature]}</th>${cells.join('')}</tr>`);
  }
  const body=`<div class="page-head"><h1>AIモデル設定</h1><a href="/app/settings_diagnostics.php">診断へ</a></div><p>機能と操作するメンバー別の設定です。ADMINは「その他」に含まれます。家族日誌とLINE報告は共有生成のため「OWNER用モデル」を使います。Family AIの会話モデルは<a href="/app/settings_integrations.php">Family AI設定</a>で選択します。</p>${notice?`<p role="status">${esc(notice)}</p>`:''}<form method="post"><input type="hidden" name="csrf" value="${csrf}"><button class="btn" name="action" value="catalog">利用可能なモデルを取得</button></form><p class="small">一覧取得・設定保存・この画面の表示では文章を生成しません。一覧にあっても利用枠や機能別の生成成功は保証されません。</p><div style="overflow-x:auto"><table><thead><tr><th>機能</th><th>OWNER用モデル</th><th>その他メンバー用モデル</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><style>td,th{vertical-align:top;padding:12px;border-bottom:1px solid #ddd}select{max-width:320px;width:100%}label{display:block;margin-bottom:10px}</style>`;
  const response=html(layout('AIモデル設定',body,'/app/settings.php'));
  return noStore(new Response(response.body,{status,headers:response.headers}));
}
