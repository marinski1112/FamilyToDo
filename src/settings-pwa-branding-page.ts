import type {AppContext} from './app-context';
import {layout} from './app-shell';
import {html,redirect} from './response';

type BrandingRow={pwa_display_name:string|null;pwa_icon_updated_at:string|null};

const esc=(value:unknown)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export async function settingsPwaBranding(request:Request,context:AppContext):Promise<Response>{
  const member=context.member;
  if(!member){
    const next=new URL(request.url).pathname;
    return redirect(`/login.php?next=${encodeURIComponent(next)}`);
  }
  const role=String(member.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN'){
    return html(layout('ホーム画面設定','<div class="card"><h1>📱 ホーム画面</h1><p>管理者権限が必要です。</p><p><a class="btn gray" href="/app/settings.php">管理へ戻る</a></p></div>','/app/settings.php'),403);
  }
  if(request.method!=='GET')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET'}});

  const row=await context.env.DB.prepare('SELECT pwa_display_name,pwa_icon_updated_at FROM families WHERE id=? LIMIT 1').bind(member.family_id).first<BrandingRow>();
  const customName=String(row?.pwa_display_name||'');
  const iconConfigured=Boolean(row?.pwa_icon_updated_at);
  const revision=encodeURIComponent(String(row?.pwa_icon_updated_at||'default'));
  const payload=JSON.stringify({csrf:String(context.session.csrfToken||''),iconConfigured}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body=`<div class="card"><h1>📱 ホーム画面</h1><p class="small">この家族でホーム画面に追加するときの表示名とアイコンを設定します。変更後、すでに追加済みのアイコンや名前は端末側のキャッシュにより自動更新されない場合があります。その場合はホーム画面から一度削除して再追加してください。</p><form id="familyBrandingNameForm"><label for="familyBrandingName">表示名</label><input id="familyBrandingName" name="display_name" maxlength="24" value="${esc(customName)}" placeholder="Family TODO LINE"><p class="small">24文字以内。空欄で標準名「Family TODO LINE」に戻します。</p><button type="submit">表示名を保存</button></form><hr><h2>アイコン</h2><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><img id="familyBrandingIconPreview" src="/app-icon-180.png?v=${revision}" width="90" height="90" alt="現在のホーム画面アイコン" style="border-radius:20px;object-fit:cover"><div style="flex:1;min-width:220px"><input id="familyBrandingIconFile" type="file" accept="image/*"><p class="small">選んだ画像を中央で正方形に切り抜き、180×180・192×192・512×512のPNGを端末内で生成します。180×180を含む各サイズはサーバー側でも検証します。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="familyBrandingIconSave" type="button">アイコンを保存</button><button id="familyBrandingIconReset" type="button" class="gray"${iconConfigured?'':' hidden'}>標準アイコンに戻す</button></div></div></div><p id="familyBrandingStatus" class="small" role="status" aria-live="polite"></p><p><a class="btn gray" href="/app/settings.php">管理へ戻る</a></p></div><script type="application/json" id="familyBrandingPayload">${payload}</script><script src="/assets/settings-pwa-branding.js?v=1"></script>`;
  return html(layout('ホーム画面設定',body,'/app/settings.php'));
}
