import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html,redirect } from './response';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;
const PAGE_SIZE=40;
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
const dayLabel=(value:unknown)=>{const s=String(value||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';};
const timeLabel=(value:unknown)=>String(value||'').slice(11,16);

export async function messagesChatPage(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;if(!m)return redirect('/login.php?next=%2Fapp%2Fmessages.php');
  const url=new URL(request.url),before=Math.max(0,Number(url.searchParams.get('before')||0)||0),now=nowJst();
  const query=`SELECT msg.id,msg.sender_id,msg.image_upload_id,msg.text,msg.reminder_at,msg.created_at,msg.updated_at,msg.converted_to_shopping_id,msg.converted_to_task_id,s.name sender_name
    FROM messages msg JOIN members s ON s.id=msg.sender_id AND s.family_id=msg.family_id
    WHERE msg.family_id=? ${before?'AND msg.id<?':''} AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?)
    ORDER BY msg.id DESC LIMIT ${PAGE_SIZE+1}`;
  const rows=before
    ?await ctx.env.DB.prepare(query).bind(m.family_id,before,now,m.id).all<Row>()
    :await ctx.env.DB.prepare(query).bind(m.family_id,now,m.id).all<Row>();
  const hasOlder=rows.results.length>PAGE_SIZE,visible=rows.results.slice(0,PAGE_SIZE).reverse(),oldest=visible.length?Number(visible[0].id):0;
  let previousDay='';
  const messages=visible.map(r=>{
    const day=dayLabel(r.created_at),separator=day&&day!==previousDay?`<div class="chat-day"><span>${esc(day)}</span></div>`:'';previousDay=day;
    const mine=Number(r.sender_id)===Number(m.id),scheduled=String(r.reminder_at||'')>now;
    return `${separator}<article class="chat-message ${mine?'mine':'theirs'}" data-message-id="${Number(r.id)}" data-message-type="${r.image_upload_id?'image':'text'}" data-text="${esc(r.text)}" data-updated-at="${esc(r.updated_at)}" data-mine="${mine?'1':'0'}">${mine?'':`<div class="chat-avatar" aria-hidden="true">${esc(String(r.sender_name||'?').slice(0,1))}</div>`}<div class="chat-stack">${mine?'':`<div class="chat-sender">${esc(r.sender_name)}</div>`}<div class="chat-bubble">${r.image_upload_id?`<img src="/api/messages?photo=${Number(r.id)}" alt="伝言の写真" loading="lazy" style="display:block;max-width:100%;max-height:360px;object-fit:contain">`: ''}${esc(r.text)}</div><div class="chat-meta">${scheduled?`<span class="chat-scheduled">予約 ${esc(String(r.reminder_at).slice(5,16))}</span> ・ `:''}${esc(timeLabel(r.created_at))}</div></div></article>`;
  }).join('');
  const role=String(m.role||'').toUpperCase(),canModerate=role==='OWNER'||role==='ADMIN';
  const payload=JSON.stringify({csrf:ctx.session.csrfToken||'',memberId:m.id,canModerate,now}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const archive=before?'<div class="chat-archive-label">過去のメッセージ</div>':'';
  const older=hasOlder&&oldest?`<a class="chat-archive-link" href="/app/messages.php?before=${oldest}">さらに以前のメッセージ</a>`:'';
  const back=before?'<a class="chat-latest-link" href="/app/messages.php">最新のメッセージに戻る</a>':'';
  const initialClass=before?'':' chat-messages-initializing';
  const body=`<script src="/assets/message-photo-upload.js?v=2" defer></script><script src="/assets/mitenya-photo-share.js?v=1" defer></script><link rel="stylesheet" href="/assets/messages-chat.css?v=${APP_VERSION}-chat7"><main class="messages-chat-page"><header class="messages-chat-head"><h1>家族</h1><div class="sub">家族グループ</div></header>${archive}${older}<section id="chatMessages" class="${initialClass.trim()}">${messages||'<div class="chat-empty">まだメッセージはありません</div>'}</section>${back}</main>
  <form class="chat-composer" id="chatComposer"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><button class="chat-icon-btn" type="button" id="chatPlus" aria-label="メニュー">＋</button><textarea name="text" rows="1" maxlength="5000" placeholder="メッセージ" aria-label="メッセージ"></textarea><button class="chat-media-btn" type="button" id="chatImage" aria-label="写真を選択">▧</button><button class="chat-send-btn" type="submit" aria-label="送信">➤</button></form>
  <div class="chat-tools" id="chatTools"><div class="chat-tools-grid"><button type="button" id="chatStamp" aria-label="スタンプ"><span class="chat-tool-icon">☺</span><span>スタンプ</span></button><button type="button" id="chatSchedule" aria-label="送信予約"><span class="chat-tool-icon">◷</span><span>送信予約</span></button><button type="button" id="chatToolImage" aria-label="写真を選択"><span class="chat-tool-icon">▧</span><span>写真</span></button></div><div class="chat-schedule-row" id="chatScheduleRow"><input type="datetime-local" id="chatScheduleAt"><div class="chat-image-note">予約時刻までは他の家族には表示されません</div></div></div>
  <div class="chat-stamp-picker" id="chatStampPicker" aria-label="スタンプ"></div>
  <div class="chat-menu-backdrop" id="chatMenuBackdrop" aria-hidden="true"><div class="chat-menu" id="chatMenu"></div></div>
  <script type="application/json" id="messagesChatPayload">${payload}</script><script src="/assets/messages-chat-diagnostics.js?v=${APP_VERSION}-chatdiag1" data-family="${Number(m.family_id)}"></script><script src="/assets/messages-chat.js?v=${APP_VERSION}-chat7"></script><script src="/assets/messages-admin-delete.js?v=${APP_VERSION}-admin-delete1"></script><script>(()=>{const box=document.getElementById('chatMessages');if(!box?.classList.contains('chat-messages-initializing'))return;let done=false;const reveal=()=>{if(done)return;done=true;requestAnimationFrame(()=>{window.scrollTo(0,document.documentElement.scrollHeight);requestAnimationFrame(()=>box.classList.remove('chat-messages-initializing'));});};if(!box.querySelector('.chat-message')){reveal();return;}const started=performance.now(),poll=()=>{const hydrated=performance.getEntriesByType('resource').some(entry=>String(entry.name||'').includes('/api/message-stamps?ids='));if(hydrated||performance.now()-started>4000)setTimeout(reveal,0);else setTimeout(poll,16);};poll();})();</script>`;
  return html(layout('伝言',body,'/app/messages.php'));
}