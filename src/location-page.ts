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

/**
 * First Location surface: navigation + privacy/domain boundary only.
 * No DB reads/writes, geolocation request, OwnTracks ingress, or Location API.
 */
export async function locationPage(_request:Request,ctx:AppContext):Promise<Response>{
  const memberName=esc(ctx.member?.name||'');
  const privacy=LOCATION_PRIVACY_DEFAULTS;
  const roadmap=LOCATION_ROADMAP.map(item=>`<div class="row"><strong>${esc(item.label)}</strong><div class="meta">未接続 ・ この段階では実行しません</div></div>`).join('');
  const body=`<div class="daily-head"><div><div class="eyebrow">Family TODO LINE</div><h1>📍 位置情報</h1><div class="meta">${memberName}</div></div></div>
    <div class="card section-card"><h2>🔒 共有設定</h2><div class="row"><strong>位置共有: ${privacy.sharingEnabled?'ON':'OFF'}</strong><div class="meta">初期状態は共有OFFです。明示的に有効化する仕組みを追加するまで位置情報は送信・保存しません。</div></div></div>
    <div class="card section-card"><h2>🧭 準備中の機能</h2>${roadmap}</div>
    <div class="card section-card"><h2>プライバシー方針</h2><p>この初期画面では端末位置を取得せず、FamilyToDo側にも最新位置・履歴を保存しません。</p><p class="meta">次段階で OwnTracks ingress、端末ごとのsecret、latest/history/place/distance を個別に設計し、共有同意とfamily/member境界を先に検証してから有効化します。</p></div>`;
  return html(layout('位置情報',body,'/app/location.php'));
}
