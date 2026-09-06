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

const phase1Ready=new Set(['owntracks','latest','history','places','distance']);

/**
 * Location landing surface. It never requests browser geolocation. The live
 * family projection is loaded by /assets/location.js from the authenticated,
 * family-scoped latest-location API boundary.
 */
export async function locationPage(_request:Request,ctx:AppContext,env:Env):Promise<Response>{
  const memberName=esc(ctx.member?.name||'');
  const privacy=LOCATION_PRIVACY_DEFAULTS;
  const mapsKey=esc(env.GOOGLE_MAPS_BROWSER_API_KEY||'');
  const mapsMapId=esc(env.GOOGLE_MAPS_MAP_ID||'');
  const csrf=esc(ctx.session.csrfToken||'');
  const roadmap=LOCATION_ROADMAP.map(item=>{
    const status=phase1Ready.has(item.key)?'基盤実装済み':'準備中 ・ この画面では実行しません';
    return `<div class="row"><strong>${esc(item.label)}</strong><div class="meta">${status}</div></div>`;
  }).join('');
  const body=`<style>
    .location-map-card{padding:0;overflow:hidden}.location-map-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:16px 16px 10px}.location-map-head h2{margin:0}.location-map-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.location-refresh{flex:0 0 auto}.location-refresh[disabled]{opacity:.55;cursor:wait}.location-home-eta-result{font-size:12px;color:#475569;max-width:180px;text-align:right}.location-map-surface{min-height:clamp(260px,45vh,520px);position:relative;background:linear-gradient(145deg,#eef2ff,#f8fafc);border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}.location-map-canvas{width:100%;min-height:clamp(260px,45vh,520px)}.location-map-placeholder{min-height:clamp(260px,45vh,520px);display:grid;place-items:center;padding:24px;text-align:center}.location-map-placeholder-inner{max-width:420px}.location-map-icon{font-size:40px;line-height:1;margin-bottom:10px}.location-list{display:grid;gap:0}.location-member-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid #eef2f7}.location-avatar-fallback{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#e0e7ff;font-weight:700;color:#3730a3}.location-member-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.location-member-meta{margin-top:2px}.location-member-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:7px}.location-eta-result{font-size:12px;color:#475569}.location-state-badge{font-size:12px;border-radius:999px;padding:4px 8px;background:#eef2ff;color:#3730a3;white-space:nowrap}.location-member-row[data-state="AGING"] .location-state-badge{background:#fff7ed;color:#9a3412}.location-member-row[data-state="STALE"]{opacity:.68}.location-member-row[data-state="STALE"] .location-state-badge{background:#f3f4f6;color:#4b5563}.location-member-row[data-state="SHARING_OFF"] .location-state-badge,.location-member-row[data-state="NO_LOCATION"] .location-state-badge{background:#f3f4f6;color:#6b7280}.location-empty{padding:18px 16px;color:#6b7280}.location-map-note{padding:10px 16px}.location-secondary{margin-top:14px}.location-map-provider-note{font-size:12px;color:#64748b;margin-top:8px}@media(max-width:560px){.location-map-head{padding:14px;display:block}.location-map-head-actions{justify-content:flex-start;margin-top:9px}.location-home-eta-result{text-align:left;max-width:none}.location-map-canvas,.location-map-placeholder{min-height:38vh}.location-map-placeholder{padding:18px}.location-member-row{grid-template-columns:38px minmax(0,1fr);padding:11px 14px}.location-state-badge{grid-column:2;justify-self:start}.location-avatar-fallback{width:34px;height:34px}}
  </style>
  <div class="daily-head"><div><div class="eyebrow">Family TODO LINE</div><h1>📍 家族の場所</h1><div class="meta">${memberName}</div></div></div>
  <section class="card section-card location-map-card" data-location-live data-google-maps-key="${mapsKey}" data-google-maps-map-id="${mapsMapId}" data-location-csrf="${csrf}">
    <div class="location-map-head"><div><h2>家族マップ</h2><div class="meta" data-location-status>最新位置を確認しています…</div></div><div class="location-map-head-actions"><button class="btn small" type="button" data-location-home-eta>🏠 家まで何分？</button><span class="location-home-eta-result" data-location-home-eta-result aria-live="polite"></span><button class="btn gray small location-refresh" type="button" data-location-refresh aria-label="家族の最新位置を更新">更新</button></div></div>
    <div class="location-map-surface" role="region" aria-label="家族の場所 地図領域"><div class="location-map-canvas" data-location-map hidden></div><div class="location-map-placeholder" data-location-map-state><div class="location-map-placeholder-inner"><div class="location-map-icon" aria-hidden="true">🗺️</div><strong>家族の最新位置</strong><div class="meta">共有中の位置情報を読み込んでいます。</div><div class="location-map-provider-note">この画面は端末の現在地を自動取得しません。共有中の家族位置だけをGoogle Maps上に表示します。</div></div></div></div>
    <div class="location-map-note meta">位置が古い場合は「現在地」と断定せず、最終更新からの経過時間を表示します。車の所要時間は「車で何分？」または「家まで何分？」を押した時だけRoutes APIへ問い合わせます。</div>
    <div class="location-list" data-location-list aria-live="polite"><div class="location-empty">家族の位置一覧を読み込んでいます…</div></div>
  </section>
  <div class="card section-card location-secondary"><h2>🔒 共有設定</h2><div class="row"><strong>位置共有の既定値: ${privacy.sharingEnabled?'ON':'OFF'}</strong><div class="meta">登録した端末も最初は共有OFFです。共有ONにした有効な端末だけが、認証済みの位置送信と保存の対象になります。</div></div><div class="row"><strong>🏠 自宅地点</strong><div class="meta">OWNER / ADMIN が「管理 → 位置情報・OwnTracks」で、共有中の最新位置から家族共通の自宅地点を設定できます。</div></div></div>
  <div class="card section-card"><h2>🧭 位置情報機能</h2>${roadmap}</div>
  <div class="card section-card"><h2>プライバシー方針</h2><p>この画面自体はブラウザの現在地を取得しません。共有ONの登録端末から認証済みの位置情報が届いた場合にだけ、FamilyToDoのlatest/history基盤へ保存されます。</p><p class="meta">端末は個別に共有停止・失効でき、共有OFFまたは失効済みの端末は位置送信・参照の対象外になります。自宅地点も明示的な管理操作でのみ設定され、経路時間はボタン操作時だけ計算します。</p></div>`;
  return html(layout('家族の場所',body,'/app/location.php'));
}
