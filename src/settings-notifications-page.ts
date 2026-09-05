import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html, json, redirect } from './response';
import { APP_VERSION } from './version';
import { webPushConfigured, webPushPublicKey } from './webpush';

type Row = Record<string, unknown>;

type NotificationSettingsBody = {
  csrf?: unknown;
  enabled?: unknown;
  enabled_members?: unknown;
  notification_channel?: unknown;
  digest_enabled?: unknown;
  digest_time?: unknown;
  digest_members?: unknown;
};

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const boolValue=(value:unknown)=>value===true||value===1||value==='1'||value==='true'||value==='on';
const numberIds=(value:unknown)=>Array.isArray(value)?[...new Set(value.map(Number).filter(Number.isInteger).filter(x=>x>0))]:[];
const validTime=(value:string)=>{const m=/^(\d{2}):(\d{2})$/.exec(value);return Boolean(m&&Number(m[1])<24&&Number(m[2])<60);};

async function saveNotificationSettings(request:Request,ctx:AppContext,isAdmin:boolean):Promise<Response>{
  let body:NotificationSettingsBody;
  try{body=await request.json() as NotificationSettingsBody;}catch{return json({ok:false,error:'リクエスト形式が正しくありません。'},400);}
  const expectedCsrf=String(ctx.session.csrfToken||''),receivedCsrf=String(body.csrf||'');
  if(!expectedCsrf||receivedCsrf!==expectedCsrf)return json({ok:false,error:'セッションの有効期限が切れました。画面を再読み込みしてください。'},403);

  const m=ctx.member!;
  const channel=String(body.notification_channel||'WEB_PUSH').toUpperCase();
  if(channel!=='WEB_PUSH'&&channel!=='LINE')return json({ok:false,error:'通知方法が正しくありません。'},400);

  const now=new Date().toISOString();
  const statements=[];
  if(isAdmin){
    const requested=numberIds(body.enabled_members);
    const familyMembers=await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND deleted_at IS NULL').bind(m.family_id).all<Row>();
    const allowed=new Set(familyMembers.results.map(x=>Number(x.id)));
    const enabledIds=requested.filter(id=>allowed.has(id));
    statements.push(ctx.env.DB.prepare('UPDATE members SET notification_enabled=0 WHERE family_id=? AND deleted_at IS NULL').bind(m.family_id));
    for(const id of enabledIds)statements.push(ctx.env.DB.prepare('UPDATE members SET notification_enabled=1 WHERE family_id=? AND id=? AND deleted_at IS NULL').bind(m.family_id,id));
  }else{
    statements.push(ctx.env.DB.prepare('UPDATE members SET notification_enabled=? WHERE family_id=? AND id=? AND deleted_at IS NULL').bind(boolValue(body.enabled)?1:0,m.family_id,m.id));
  }
  statements.push(ctx.env.DB.prepare('UPDATE members SET notification_channel=? WHERE family_id=? AND id=? AND deleted_at IS NULL').bind(channel,m.family_id,m.id));

  if(isAdmin){
    const digestTime=String(body.digest_time||'07:00');
    if(!validTime(digestTime))return json({ok:false,error:'LINE朝まとめの送信時刻が正しくありません。'},400);
    const requestedRecipients=numberIds(body.digest_members);
    const activeMembers=await ctx.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL').bind(m.family_id).all<Row>();
    const allowedRecipients=new Set(activeMembers.results.map(x=>Number(x.id)));
    const recipientIds=requestedRecipients.filter(id=>allowedRecipients.has(id));
    statements.push(ctx.env.DB.prepare(`INSERT INTO line_daily_digest_settings(family_id,enabled,send_time,updated_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(family_id) DO UPDATE SET enabled=excluded.enabled,send_time=excluded.send_time,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(m.family_id,boolValue(body.digest_enabled)?1:0,digestTime,m.id,now,now));
    statements.push(ctx.env.DB.prepare('UPDATE line_daily_digest_recipients SET enabled=0,updated_at=? WHERE family_id=?').bind(now,m.family_id));
    for(const id of recipientIds){
      statements.push(ctx.env.DB.prepare(`INSERT INTO line_daily_digest_recipients(family_id,member_id,enabled,created_at,updated_at)
        VALUES(?,?,1,?,?)
        ON CONFLICT(family_id,member_id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at`).bind(m.family_id,id,now,now));
    }
  }

  await ctx.env.DB.batch(statements);
  return json({ok:true});
}

/** Canonical notification settings page and its same-origin settings mutation. */
export async function settingsNotifications(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return request.method==='POST'?json({ok:false,error:'ログインが必要です。'},401):redirect('/login.php?next=%2Fapp%2Fsettings_notifications.php');
  const role=String(m.role||'').toUpperCase(),isAdmin=role==='OWNER'||role==='ADMIN';
  if(request.method==='POST')return saveNotificationSettings(request,ctx,isAdmin);
  if(request.method!=='GET'&&request.method!=='HEAD')return json({ok:false,error:'Method Not Allowed'},405,{Allow:'GET, HEAD, POST'});

  const members=await ctx.env.DB.prepare("SELECT id,name,role,active,notification_enabled,COALESCE(notification_channel,'LINE') notification_channel FROM members WHERE family_id=? AND deleted_at IS NULL ORDER BY id").bind(m.family_id).all<Row>();
  const digestSetting=await ctx.env.DB.prepare("SELECT enabled,send_time FROM line_daily_digest_settings WHERE family_id=?").bind(m.family_id).first<Row>();
  const digestRecipients=await ctx.env.DB.prepare("SELECT member_id FROM line_daily_digest_recipients WHERE family_id=? AND enabled=1").bind(m.family_id).all<Row>();
  const digestRecipientIds=digestRecipients.results.map(x=>Number(x.member_id));
  const selfRow=members.results.find(x=>Number(x.id)===m.id)||{};
  const pushCount=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1').bind(m.id,m.family_id).first<Row>();
  const devices=await ctx.env.DB.prepare('SELECT id,user_agent,enabled,last_success_at,failure_count,last_error,updated_at FROM web_push_subscriptions WHERE member_id=? AND family_id=? ORDER BY id DESC').bind(m.id,m.family_id).all<Row>();
  const deviceName=(ua:unknown)=>{const x=String(ua||'');if(/iPhone/i.test(x))return 'iPhone / Safari PWA';if(/iPad/i.test(x))return 'iPad / Safari PWA';if(/Android/i.test(x)&&/Chrome/i.test(x))return 'Android / Chrome';if(/Chrome/i.test(x))return 'Desktop / Chrome';return 'Unknown device';};
  const deviceRows=devices.results.map((d,i)=>`<div class="row push-device" data-push-device="${d.id}"><strong>端末 ${i+1}：${esc(deviceName(d.user_agent))}</strong><div class="meta">${Number(d.enabled)?'有効':'無効'} ・ 最終成功 ${esc(d.last_success_at||'なし')} ・ 失敗 ${esc(d.failure_count||0)}回</div><div class="meta">最終エラー ${esc(d.last_error||'なし')} ・ 更新 ${esc(d.updated_at||'')}</div><button type="button" class="btn danger small push-remove" data-id="${d.id}">この登録を解除</button></div>`).join('')||'<p class="empty">登録済み端末はありません。</p>';
  const pushConfigured=webPushConfigured(ctx.env),pushPublicKey=webPushPublicKey(ctx.env),channel=String(selfRow.notification_channel||'LINE');
  const payload=JSON.stringify({csrf:ctx.session.csrfToken||'',pushConfigured,pushPublicKey,pushCount:Number(pushCount?.c||0),channel}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>🔔 通知設定</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card form-card"><form id="notificationForm"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}">${isAdmin?`<label>通知を有効にするメンバー</label><div class="choice-list">${members.results.map(x=>`<label class="checkrow"><input type="checkbox" name="enabled_members" value="${x.id}" ${Number(x.notification_enabled??1)?'checked':''}><span>${esc(x.name)}</span></label>`).join('')}</div>`:`<label class="checkrow"><input type="checkbox" name="enabled" ${Number(m.notification_enabled??1)?'checked':''}><span>通知を有効にする</span></label>`}<label>随時通知</label><input type="hidden" name="notification_channel" value="WEB_PUSH"><p class="small">タスク・伝言・AI結果などの随時通知はWeb Pushだけを使用します。LINEへのfallbackは行いません。</p>${isAdmin?`<fieldset><legend>LINE朝まとめ</legend><label class="checkrow"><input type="checkbox" name="digest_enabled" ${Number(digestSetting?.enabled||0)?'checked':''}> ON</label><label>送信時刻（家族タイムゾーン）</label><input type="time" name="digest_time" value="${esc(digestSetting?.send_time||'07:00')}"><label>対象メンバー</label>${members.results.filter(x=>Number(x.active)===1).map(x=>`<label class="checkrow"><input type="checkbox" name="digest_members" value="${x.id}" ${digestRecipientIds.includes(Number(x.id))?'checked':''}>${esc(x.name)}</label>`).join('')}<p class="small">初期値はOFFです。内容は受信者ごとに生成し、本人のPRIVATEだけを含めます。</p></fieldset>`:''}<button>保存する</button></form></div><div class="card push-settings-card"><h2>📲 Web Push</h2><p class="small">iPhone/iPadではSafariから「ホーム画面に追加」したFamily TODOを開き、この画面のボタンを押して通知を許可してください。LINE内ブラウザのままではWeb Pushを有効化できない場合があります。</p><div id="pushStatus" class="notice" aria-live="polite">Web Pushの状態を確認しています…</div><div class="actions"><button type="button" class="btn" id="pushEnable" ${pushConfigured?'':'disabled'}>この端末で有効化</button><button type="button" class="btn gray" id="pushTest" ${pushConfigured?'':'disabled'}>テスト通知</button><button type="button" class="btn danger" id="pushDisable">この端末を解除</button></div>${pushConfigured?'':`<div class="error">VAPID鍵が未設定です。管理者がサーバー設定を完了すると利用できます。</div>`}<h3>自分の登録端末</h3><div id="pushDevices">${deviceRows}</div></div><script type="application/json" id="notificationSettingsPayload">${payload}</script><script src="/assets/settings-notifications.js?v=${APP_VERSION}"></script>`;
  return html(layout('通知設定',body,'/app/settings.php'));
}
