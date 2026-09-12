import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html, redirect } from './response';
import { commitSession } from './session';
import { APP_VERSION } from './version';

type MemberRow=Readonly<{id:unknown;name:unknown;role:unknown}>;

const esc=(value:unknown)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

/** Authenticated iPhone Location provisioning, device control and family HOME setup. */
export async function settingsLocation(_request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return redirect('/login.php?next=%2Fapp%2Fsettings_location.php');
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();

  const role=String(member.role||'').toUpperCase();
  const isAdmin=role==='OWNER'||role==='ADMIN';
  const members=isAdmin
    ?await ctx.env.DB.prepare("SELECT id,name,role FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL ORDER BY id").bind(member.family_id).all<MemberRow>()
    :{results:[{id:member.id,name:member.name,role:member.role}] as MemberRow[]};

  const memberOptions=members.results.map(row=>
    `<option value="${esc(row.id)}" ${Number(row.id)===Number(member.id)?'selected':''}>${esc(row.name)}${String(row.role||'').toUpperCase()==='OWNER'?' (OWNER)':''}</option>`
  ).join('');
  const payload=JSON.stringify({csrf:ctx.session.csrfToken,actorMemberId:Number(member.id),isAdmin})
    .replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');

  const homeCard=isAdmin?`<div class="card location-settings-grid" id="homePlaceCard">
    <div><h2>🏠 自宅地点</h2><p class="small">共有ONのメンバーの最新位置を、家族共通の「自宅」として固定保存します。ブラウザの現在地は取得せず、住所や逆ジオコーディングも使用しません。</p></div>
    <div class="location-provision-row"><label>取得元メンバー<select id="homeSourceMember">${memberOptions}</select></label><button class="btn" id="captureHomePlace" type="button">この最新位置を自宅に設定</button></div>
    <div class="home-place-status" id="homePlaceStatus">自宅地点を確認しています…</div>
    <div><button class="btn danger small" id="deleteHomePlace" type="button" hidden>自宅地点を解除</button></div>
    <p class="small">設定後は位置情報ページの「家まで何分？」から、現在の共有位置→自宅の車移動時間を必要な時だけ計算できます。</p>
  </div>`:'';

  const arrivalCard=`<div class="card location-settings-grid" id="locationArrivalCard"><h2>拠点・接近／出発通知</h2><label><input type="checkbox" id="locationArrivalEnabled"> 家族が拠点へ近づいた時・拠点を出た時にこのアカウントのPush通知で受け取る</label><p class="small">拠点へ到着して滞在しただけでは通知しません。接近と出発はGPS精度を考慮した別々の境界で判定し、1分以上離れた2回の位置記録で確認します。境界付近ではヒステリシスと20分の同種通知クールダウンで連打を抑えます。</p><div id="locationArrivalStatus" role="status"></div><a class="btn gray small" href="/app/settings_notifications.php">Push通知の設定</a><div id="locationPlaceList"></div>${isAdmin?`<details><summary>職場などの拠点を追加</summary><label>拠点名<input id="locationPlaceLabel" maxlength="40" placeholder="例：職場"></label><label>今その拠点にいるメンバー<select id="locationPlaceMember">${memberOptions}</select></label><button class="btn" type="button" id="locationPlaceCapture">共有中の位置を拠点に登録</button><p class="small">最新10分以内・精度100m以内の位置が必要です。自宅は上の自宅地点で設定します。</p></details>`:''}<details><summary>最近の通知結果</summary><div id="locationArrivalRecent"></div></details></div>`;

  const body=`<style>
    .location-settings-grid{display:grid;gap:14px}.location-provision-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}.location-provision-row label{margin:0}.owntracks-secret{border:2px solid #f59e0b;background:#fffbeb}.owntracks-secret[hidden]{display:none}.credential-row{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:8px;align-items:center;margin-top:9px}.credential-value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;border:1px solid #dbe2ea;border-radius:9px;padding:9px 10px}.device-list{display:grid;gap:10px}.device-card{border:1px solid #e2e8f0;border-radius:12px;padding:12px}.device-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.device-title{min-width:0}.device-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.device-status{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:12px;background:#f1f5f9}.device-status.on{background:#dcfce7;color:#166534}.device-status.revoked{background:#fee2e2;color:#991b1b}.setup-steps{margin:10px 0 0;padding-left:22px}.setup-steps li{margin:5px 0}.location-empty{color:#64748b;padding:8px 0}.home-place-status{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc;color:#475569}@media(max-width:560px){.location-provision-row{grid-template-columns:1fr}.credential-row{grid-template-columns:1fr auto}.credential-row>strong{grid-column:1/-1}.credential-value{min-width:0}.device-head{display:block}.device-status{margin-top:6px}}
  </style>
  <div class="page-head"><div><div class="eyebrow">管理</div><h1>📍 位置情報・iPhone連携</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div>
  ${homeCard}${arrivalCard}
  <div class="card location-settings-grid">
    <div><h2>位置連携端末を追加</h2><p class="small">OwnTracksまたはOverlandからFamilyToDoへ位置情報を送信するための接続情報を発行します。同じ接続情報をどちらか一方で使えます。端末は最初は共有OFFです。</p></div>
    <div class="location-provision-row"><label>対象メンバー<select id="locationMember">${memberOptions}</select></label><button class="btn" id="provisionOwnTracks" type="button">接続情報を発行</button></div>
  </div>
  <div class="card owntracks-secret" id="ownTracksSecret" hidden>
    <h2>⚠️ この接続情報は今だけ表示されます</h2>
    <p class="small">SecretはD1へ平文保存されないため、この画面を閉じた後は再表示できません。利用するアプリへ設定してから閉じてください。</p>
    <h3>Overland</h3>
    <div class="credential-row"><strong>Endpoint</strong><div class="credential-value" id="overlandUrl"></div><button class="btn gray small credential-copy" type="button" data-copy="overlandUrl">コピー</button></div>
    <div class="credential-row"><strong>Access Token</strong><div class="credential-value" id="overlandToken"></div><button class="btn gray small credential-copy" type="button" data-copy="overlandToken">コピー</button></div>
    <ol class="setup-steps"><li>OverlandのReceiver Endpointに上のEndpointを設定します。</li><li>Access Tokenに上の値を設定します。URLへトークンを追加しないでください。</li><li>登録済み端末で「位置共有をON」にします。</li><li>Overlandから送信し、位置情報ページの「更新」で反映を確認します。</li></ol>
    <h3>OwnTracks</h3>
    <div class="credential-row"><strong>URL</strong><div class="credential-value" id="ownTracksUrl"></div><button class="btn gray small credential-copy" type="button" data-copy="ownTracksUrl">コピー</button></div>
    <div class="credential-row"><strong>Username</strong><div class="credential-value" id="ownTracksUsername"></div><button class="btn gray small credential-copy" type="button" data-copy="ownTracksUsername">コピー</button></div>
    <div class="credential-row"><strong>Password</strong><div class="credential-value" id="ownTracksPassword"></div><button class="btn gray small credential-copy" type="button" data-copy="ownTracksPassword">コピー</button></div>
    <p class="small">OwnTracksはHTTP接続方式でURL / Username / Passwordを設定します。認証情報をURLのクエリ文字列へ追加しないでください。</p>
  </div>
  <div class="card">
    <div class="section-link"><div><h2>登録済み端末</h2><p class="small">共有をOFFにすると新しい位置保存を停止できます。失効すると同じ接続情報では再接続できませんが、すでに受信済みの位置履歴は消えません。</p></div><button class="btn gray small" id="reloadLocationDevices" type="button">更新</button></div>
    <div class="device-list" id="locationDeviceList"><div class="location-empty">端末を確認しています…</div></div>
  </div>
  <div class="card"><div class="section-link"><div><h2>家族の場所を確認</h2><p class="small">共有中または失効前に受信済みの位置を家族の場所で確認します。</p></div><a class="btn gray" href="/app/location.php">位置情報を開く</a></div></div>
  <script type="application/json" id="settingsLocationPayload">${payload}</script>
  <script src="/assets/settings-location.js?v=${APP_VERSION}-overland1"></script><script src="/assets/location-places.js?v=approach-leave1"></script>`;
  return commitSession(html(layout('位置情報・iPhone連携',body,'/app/settings.php')),ctx.session,ctx.env.APP_SECRET);
}
