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
 * Location landing surface. It never requests browser geolocation. The live
 * family projection is loaded by /assets/location.js from the authenticated,
 * family-scoped latest-location API boundary.
 */
export async function locationPage(_request:Request,ctx:AppContext,env:Env):Promise<Response>{
  const memberName=esc(ctx.member?.name||'');
  const privacy=LOCATION_PRIVACY_DEFAULTS;
  const mapsKey=esc(env.GOOGLE_MAPS_BROWSER_KEY||'');
  const mapsMapId=esc(env.GOOGLE_MAPS_MAP_ID||'');
  const roadmap=LOCATION_ROADMAP.map(item=>{
    const status=phase1Ready.has(item.key)?'基盤実装済み':'準備中 ・ この画面では実行しません';
    return `<div class="row"><strong>${esc(item.label)}</strong><div class="meta">${status}</div></div>`;
  }).join('');
  const body=`<style>
    .location-map-card{padding:0;overflow:hidden}.location-map-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:16px 16px 10px}.location-map-head h2{margin:0}.location-refresh{flex:0 0 auto}.location-refresh[disabled]{opacity:.55;cursor:wait}.location-map-surface{min-height:clamp(260px,45vh,520px);position:relative;background:linear-gradient(145deg,#eef2ff,#f8fafc);border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}.location-map-canvas{width:100%;min-height:clamp(260px,45vh,520px)}.location-map-placeholder{min-height:clamp(260px,45vh,520px);display:grid;place-items:center;padding:24px;text-align:center}.location-map-placeholder-inner{max-width:420px}.location-map-icon{font-size:40px;line-height:1;margin-bottom:10px}.location-list{display:grid;gap:0}.location-member-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid #eef2f7}.location-avatar-fallback{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#e0e7ff;font-weight:700;color:#3730a3}.location-member-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.location-member-meta{margin-top:2px}.location-state-badge{font-size:12px;border-radius:999px;padding:4px 8px;background:#eef2ff;color:#3730a3;white-space:nowrap}.location-member-row[data-state="AGING"] .location-state-badge{background:#fff7ed;color:#9a3412}.location-member-row[data-state="STALE"]{opacity:.68}.location-member-row[data-state="STALE"] .location-state-badge{background:#f3f4f6;color:#4b5563}.location-member-row[data-state="SHARING_OFF"] .location-state-badge,.location-member-row[data-state="NO_LOCATION"] .location-state-badge{background:#f3f4f6;color:#6b7280}.location-empty{padding:18px 16px;color:#6b7280}.location-map-note{padding:10px 16px}.location-secondary{margin-top:14px}.location-map-provider-note{font-size:12px;color:#64748b;margin-top:8px}@media(max-width:560px){.location-map-head{padding:14px}.location-map-canvas,.location-map-placeholder{min-height:38vh}.location-map-placeholder{padding:18px}.location-member-row{grid-template-columns:38px minmax(0,1fr);padding:11px 14px}.location-state-badge{grid-column:2;justify-self:start}.location-avatar-fallback{width:34px;height:34px}}
  </style>
  <div class="daily-head"><div><div class="eyebrow">Family TODO LINE</div><h1>📍 家族の場所</h1><div class="meta">${memberName}</div></div></div>
  <section class="card section-card location-map-card" data-location-live data-google-maps-key="${mapsKey}" data-google-maps-map-id="${mapsMapId}">
    <div class="location-map-head"><div><h2>家族マップ</h2><div class="meta" data-location-status>最新位置を確認しています…</div></div><button class="btn gray small location-refresh" type="button" data-location-refresh aria-label="家族の最新位置を更新">更新</button></div>
    <div class="location-map-surface" role="region" aria-label="家族の場所 地図領域"><div class="location-map-canvas" data-location-map hidden></div><div class="location-map-placeholder" data-location-map-state><div class="location-map-placeholder-inner"><div class="location-map-icon" aria-hidden="true">🗺️</div><strong>家族の最新位置</strong><div class="meta">共有中の位置情報を読み込んでいます。</div><div class="location-map-provider-note">この画面は端末の現在地を自動取得しません。共有中の家族位置だけをGoogle Maps上に表示します。</div></div></div></div>
    <div class="location-map-note meta">位置が古い場合は「現在地」と断定せず、最終更新からの経過時間を表示します。</div>
    <div class="location-list" data-location-list aria-live="polite"><div class="location-empty">家族の位置一覧を読み込んでいます…</div></div>
  </section>
  <div class="card section-card location-secondary"><h2>🔒 共有設定</h2><div class="row"><strong>位置共有の既定値: ${privacy.sharingEnabled?'ON':'OFF'}</strong><div class="meta">登録した端末も最初は共有OFFです。共有ONにした有効な端末だけが、認証済みの位置送信と保存の対象になります。</div></div></div>
  <div class="card section-card"><h2>🧭 位置情報機能</h2>${roadmap}</div>
  <div class="card section-card"><h2>プライバシー方針</h2><p>この画面自体はブラウザの現在地を取得しません。共有ONの登録端末から認証済みの位置情報が届いた場合にだけ、FamilyToDoのlatest/history基盤へ保存されます。</p><p class="meta">端末は個別に共有停止・失効でき、共有OFFまたは失効済みの端末は位置送信・参照の対象外になります。場所・滞在、距離・ETAなどは段階的に接続します。</p></div>`;
  return html(layout('家族の場所',body,'/app/location.php'));
}
