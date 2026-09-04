import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { LOCATION_PRIVACY_DEFAULTS, LOCATION_ROADMAP } from './location-domain';
import { html } from './response';

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const phase1Ready=new Set(['owntracks','latest','history']);

/**
 * Location landing surface. It does not request browser geolocation or perform
 * Location DB/API work itself; device sharing and ingestion remain explicit,
 * authenticated server-side flows.
 */
export async function locationPage(_request:Request,ctx:AppContext):Promise<Response>{
  const memberName=esc(ctx.member?.name||'');
  const privacy=LOCATION_PRIVACY_DEFAULTS;
  const roadmap=LOCATION_ROADMAP.map(item=>{
    const status=phase1Ready.has(item.key)?'基盤実装済み ・ 画面連携は準備中':'準備中 ・ この画面では実行しません';
    return `<div class="row"><strong>${esc(item.label)}</strong><div class="meta">${status}</div></div>`;
  }).join('');
  const body=`<div class="daily-head"><div><div class="eyebrow">Family TODO LINE</div><h1>📍 位置情報</h1><div class="meta">${memberName}</div></div></div>
    <div class="card section-card"><h2>🔒 共有設定</h2><div class="row"><strong>位置共有の既定値: ${privacy.sharingEnabled?'ON':'OFF'}</strong><div class="meta">登録した端末も最初は共有OFFです。共有ONにした有効な端末だけが、認証済みの位置送信と保存の対象になります。</div></div></div>
    <div class="card section-card"><h2>🧭 位置情報機能</h2>${roadmap}</div>
    <div class="card section-card"><h2>プライバシー方針</h2><p>この画面自体はブラウザの現在地を取得しません。共有ONの登録端末から認証済みの位置情報が届いた場合にだけ、FamilyToDoのlatest/history基盤へ保存されます。</p><p class="meta">端末は個別に共有停止・失効でき、共有OFFまたは失効済みの端末は位置送信・参照の対象外になります。地図、場所・滞在、距離・ETAなどの画面機能は段階的に接続します。</p></div>`;
  return html(layout('位置情報',body,'/app/location.php'));
}
