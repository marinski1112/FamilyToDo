import type { AppContext } from './app-context';
import { html, redirect } from './response';

export type HomeScene={id:string;name:{name:string;nicknames:string[]}};
export type HomeAlias={scene_id:string;phrase:string;phrase_key:string};
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const aliasKey=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g,'');
export async function readHomeAliases(env:Env,familyId:unknown){
  return (await env.DB.prepare('SELECT scene_id,phrase,phrase_key FROM google_home_aliases WHERE family_id=? ORDER BY scene_id,phrase_key').bind(familyId).all<HomeAlias>()).results;
}
export function validateHomeAliases(scenes:HomeScene[],sceneId:string,input:string){
  const target=scenes.find(s=>s.id===sceneId);if(!target)throw Error('操作が無効です。選び直してください。');
  if(input.length>500)throw Error('入力が長すぎます。');
  const phrases=input.split(/\r?\n/).map(v=>v.normalize('NFKC').replace(/\s+/g,' ').trim()).filter(Boolean);
  if(phrases.some(v=>Array.from(v).length>60||/[\u0000-\u001f\u007f<>]/.test(v)||/(?:google|グーグル)/i.test(v)))throw Error('1行60文字以内で、呼びかけや記号を含めずに入力してください。');
  const unique=[...new Map(phrases.map(v=>[aliasKey(v),v])).values()];
  if(unique.length>4-target.name.nicknames.length)throw Error(`追加できる言い方は最大${4-target.name.nicknames.length}件です。`);
  const reserved=new Set(scenes.flatMap(s=>[s.name.name,...s.name.nicknames]).map(aliasKey));
  if(unique.some(v=>reserved.has(aliasKey(v))))throw Error('その言い方は自動生成された操作名に使われています。');
  return unique;
}
/** Preserve all built-in aliases; suppress stale aliases if the automatic catalog changes. */
export function mergeHomeAliases<T extends HomeScene>(scenes:T[],rows:HomeAlias[]):T[]{
  const reserved=new Set(scenes.flatMap(s=>[s.name.name,...s.name.nicknames]).map(aliasKey));
  return scenes.map(s=>{
    const extra:string[]=[];
    for(const r of rows.filter(r=>r.scene_id===s.id)){
      if(reserved.has(aliasKey(r.phrase)))continue;
      if(extra.length+s.name.nicknames.length>=4)break;
      reserved.add(aliasKey(r.phrase));extra.push(r.phrase);
    }
    return {...s,name:{...s.name,nicknames:[...s.name.nicknames,...extra]}};
  });
}
export async function saveHomeAliases(ctx:AppContext,input:Record<string,string>,scenes:HomeScene[]):Promise<Response>{
  // Called only after the existing settings handler's authenticated CSRF check.
  if(!ctx.member||!['OWNER','ADMIN'].includes(String(ctx.member.role||'').toUpperCase()))return html('管理者権限が必要です。',403);
  let phrases:string[];
  try{phrases=validateHomeAliases(scenes,String(input.scene_id||''),String(input.aliases||''));}
  catch(e){return html(`<p>${esc(e instanceof Error?e.message:'入力を確認してください。')}</p><a href="/app/settings_google_home.php">設定へ戻る</a>`,400);}
  try{
    // A single batch rolls back the deletion if another scene already owns the phrase key.
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('DELETE FROM google_home_aliases WHERE family_id=? AND scene_id=?').bind(ctx.member.family_id,input.scene_id),
      ...phrases.map(phrase=>ctx.env.DB.prepare('INSERT INTO google_home_aliases(family_id,scene_id,phrase,phrase_key,updated_by,updated_at) VALUES(?,?,?,?,?,?)').bind(ctx.member!.family_id,input.scene_id,phrase,aliasKey(phrase),ctx.member!.id,new Date().toISOString().slice(0,19).replace('T',' '))),
    ]);
  }catch{return html('<p>保存できませんでした。同じ言い方が別の操作に登録されていないか確認してください。DB migration 0071が未適用の場合も保存できません。</p><a href="/app/settings_google_home.php">設定へ戻る</a>',409);}
  return redirect('/app/settings_google_home.php?aliases=saved&edit_scene='+encodeURIComponent(input.scene_id));
}
export async function homeAliasEditor(ctx:AppContext,scenes:HomeScene[]):Promise<string>{
  if(!ctx.member||!['OWNER','ADMIN'].includes(String(ctx.member.role||'').toUpperCase()))return '';
  const rows=await readHomeAliases(ctx.env,ctx.member.family_id).catch(()=>null);
  if(!rows)return '<section class="card"><h2>音声の言い方</h2><p>DB migration 0071の適用後に編集できます。</p></section>';
  const url=new URL(ctx.request.url),target=scenes.find(s=>s.id===url.searchParams.get('edit_scene'))||scenes[0];
  if(!target)return '<section class="card"><h2>音声の言い方</h2><p>先に家事または子供のクイック操作を登録してください。</p></section>';
  const custom=rows.filter(r=>r.scene_id===target.id),merged=mergeHomeAliases(scenes,rows).find(s=>s.id===target.id)!;
  const inactive=custom.some(r=>!merged.name.nicknames.includes(r.phrase));
  return `<section class="card"><h2>音声の言い方</h2>${url.searchParams.get('aliases')==='saved'?'<p role="status">保存しました。次に「Google Homeへ操作一覧を再同期」を押してください。</p>':''}<p>家事・子供クイックは自動で操作一覧に入ります。ここでは同じ操作に別の言い方を追加できます。</p><details${url.searchParams.has('edit_scene')?' open':''}><summary>言い方を追加・編集</summary><form method="get"><label for="alias-scene">操作を選ぶ</label><select id="alias-scene" name="edit_scene">${scenes.map(s=>`<option value="${esc(s.id)}"${s.id===target.id?' selected':''}>${esc(s.name.name)}</option>`).join('')}</select><button class="btn gray">この操作を編集</button></form><p><strong>${esc(target.name.name)}</strong><br>標準の言い方：${target.name.nicknames.map(esc).join(' ／ ')||'なし'}</p>${inactive?'<p role="status">自動生成名との重複・上限により公開されない言い方があります。別の表現に変更してください。</p>':''}<form method="post"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><input type="hidden" name="action" value="save_aliases"><input type="hidden" name="scene_id" value="${esc(target.id)}"><label for="home-alias-lines">追加の言い方（1行1件・最大${Math.max(0,4-target.name.nicknames.length)}件）</label><textarea id="home-alias-lines" name="aliases" rows="3" maxlength="500" aria-describedby="alias-help" placeholder="例：ワイパーかけたよ">${esc(custom.map(r=>r.phrase).join('\n'))}</textarea><p id="alias-help">空欄で保存すると追加分を削除します。標準の言い方は残ります。「OK Google」は入れません。</p><button class="btn">言い方を保存</button></form></details><p class="small">保存後は操作一覧を再同期してください。認識できる言い方はGoogle Home側にも依存します。自由文の聞き返しや話者の識別を追加する機能ではありません。</p></section>`;
}
