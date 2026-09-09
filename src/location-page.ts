import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { LOCATION_PRIVACY_DEFAULTS } from './location-domain';
import { html } from './response';

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');



/**
 * Location landing surface. It never requests browser geolocation. The live
 * family projection is loaded by /assets/location.js from the authenticated,
 * family-scoped latest-location API boundary.
 */
export async function locationPage(_request:Request,ctx:AppContext,env:Env):Promise<Response>{
  const privacy=LOCATION_PRIVACY_DEFAULTS;
  const mapsKey=esc(env.GOOGLE_MAPS_BROWSER_API_KEY||'');
  const mapsMapId=esc(env.GOOGLE_MAPS_MAP_ID||'');
  const csrf=esc(ctx.session.csrfToken||'');
  const body=`<style>
.location-page{min-width:0}
.wrap:has(.location-page){padding-top:0!important;padding-bottom:0!important}
.location-page [hidden]{display:none!important}
.location-page .location-map-card{height:var(--location-viewport-height,calc(100svh - 130px));min-height:260px}
.location-page .location-map-surface{height:100%!important}
.location-page .location-family-sheet{position:absolute;inset:auto 0 0;margin:0;max-height:min(78%,calc(100% - 110px));overflow:hidden}
.location-sheet-body{max-height:min(calc(var(--location-viewport-height,70svh)*.78 - 62px),calc(var(--location-viewport-height,70svh) - 172px));overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.location-family-sheet>summary{touch-action:none;user-select:none;list-style:none}
.location-family-sheet>summary::-webkit-details-marker{display:none}
.location-sheet-hint{float:right;font-size:11px;font-weight:500;color:#64748b}
.location-family-sheet[open] .location-sheet-hint::after{content:'下げて閉じる'}
.location-family-sheet:not([open]) .location-sheet-hint::after{content:'引き上げて表示'}
.location-sheet-handle:focus-visible{outline:3px solid #6366f1;outline-offset:-3px}
.location-auto-note{font-size:11px;color:#64748b}
.location-refresh{width:44px;padding:0!important;font-size:22px!important}
.location-history-clear{min-height:44px}
@media(prefers-reduced-motion:no-preference){.location-family-sheet{transition:box-shadow .15s ease}}
.location-page .location-map-card{padding:0!important;margin:0;border:0;overflow:hidden;position:relative;background:#fff}
.location-map-head{position:absolute;z-index:4;top:10px;right:10px;display:flex}.location-map-head .location-refresh{box-shadow:0 2px 8px #0f172a25;border-radius:50%}
.location-map-head>div{min-width:0}.location-map-head h1{font-size:18px!important;margin:0;line-height:1.35}.location-map-head .meta{font-size:12px;line-height:1.4;margin-top:3px}
.location-page .location-refresh{min-height:44px;flex-shrink:0}.location-refresh[disabled]{opacity:.55}
.location-map-surface{height:clamp(360px,66svh,740px);position:relative;background:#eef2ff}
.location-map-canvas{width:100%;height:100%}.location-map-canvas[hidden]{display:none}
.location-map-placeholder{height:100%;box-sizing:border-box;display:grid;place-items:center;padding:110px 24px 40px;text-align:center}
.location-map-placeholder-inner{max-width:420px}.location-map-icon{font-size:32px}.location-map-provider-note{font-size:12px;color:#64748b;margin-top:8px}
.location-family-sheet{position:relative;z-index:3;margin:-26px 0 0;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -5px 20px #0f172a15}
.location-family-sheet>summary{position:relative;cursor:pointer;min-height:54px;box-sizing:border-box;padding:22px 16px 10px;font-size:15px;font-weight:700;color:#334155}
.location-family-sheet>summary::before{content:'';position:absolute;top:8px;left:calc(50% - 20px);width:40px;height:4px;background:#cbd5e1;border-radius:8px}
.location-list{display:grid;min-width:0}.location-member-row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 14px;border-top:1px solid #edf0f4}
.location-avatar-fallback{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#ede9fe;color:#6d28d9;font-weight:700}
.location-member-main{min-width:0}.location-member-name{display:block;font-size:15px;overflow-wrap:anywhere}.location-member-meta{font-size:12px;line-height:1.5;margin-top:3px;color:#475569}
.location-state-badge{font-size:11px;border-radius:20px;padding:4px 7px;background:#eef2ff;color:#3730a3;white-space:nowrap}
.location-member-row[data-state="AGING"] .location-state-badge{background:#fff7ed;color:#9a3412}
.location-member-row[data-state="STALE"] .location-state-badge,.location-member-row[data-state="SHARING_OFF"] .location-state-badge,.location-member-row[data-state="NO_LOCATION"] .location-state-badge{background:#f1f5f9;color:#475569}
.location-member-details>summary{cursor:pointer;min-height:44px;box-sizing:border-box;padding:11px 0;font-size:13px;color:#4f46e5}
.location-member-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.location-member-actions a,.location-member-actions button{display:inline-flex;align-items:center;min-height:44px}
.location-member-details p,.location-eta-result,.location-home-eta-result{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.location-eta-result{flex-basis:100%}
.location-tools,.location-info{border-top:1px solid #e2e8f0;padding:0 14px}.location-tools>summary,.location-info>summary{cursor:pointer;min-height:48px;box-sizing:border-box;padding:14px 0;font-size:14px;font-weight:600}
.location-map-head-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.location-map-head-actions button{min-height:44px}
.location-page .location-secondary,.location-info .card{padding:10px 0!important;margin:0;border:0;box-shadow:none;border-radius:0}.location-secondary h2,.location-info h2{font-size:16px!important;margin:8px 0}
.location-history-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;grid-column:1/-1}.location-history-dates label{min-width:0;margin:0;font-size:12px}.location-history-dates input{box-sizing:border-box;width:100%;min-width:0;font-size:16px;margin:4px 0}.location-history-presets{display:flex;gap:6px;grid-column:1/-1}.location-history-presets button{flex:1;padding:8px}.location-history-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.location-history-controls select{min-width:0;max-width:100%;margin:0;font-size:16px}.location-history-controls button{min-height:44px}
.location-history-links{display:flex;gap:8px;flex-wrap:wrap}.location-history-summary,.location-map-note{font-size:12px;line-height:1.6;margin:8px 0}.location-empty{padding:14px;color:#475569}
@media(max-width:560px){.location-page{margin:0 -8px}.location-map-head{top:8px;right:8px}.location-map-surface{height:clamp(320px,66svh,640px)}.location-history-controls{grid-template-columns:1fr}.location-page .location-map-card{border-radius:0}}
@media(max-width:360px){.location-member-row{grid-template-columns:34px minmax(0,1fr);gap:8px}.location-state-badge{grid-column:2;justify-self:start}.location-avatar-fallback{width:32px;height:32px}}
  </style>
  <div class="location-page">
  <section class="card section-card location-map-card" data-location-live data-google-maps-key="${mapsKey}" data-google-maps-map-id="${mapsMapId}" data-location-csrf="${csrf}">
    <div class="location-map-head"><button class="btn gray small location-refresh" type="button" data-location-refresh aria-label="家族の最新位置を更新" title="最新位置を更新">↻</button></div>
    <div class="location-map-surface" role="region" aria-label="家族の場所 地図領域"><div class="location-map-canvas" data-location-map hidden></div><div class="location-map-placeholder" data-location-map-state><div class="location-map-placeholder-inner"><div class="location-map-icon" aria-hidden="true">🗺️</div><strong>家族の最新位置</strong><div class="meta">共有中の位置情報を読み込んでいます。</div><div class="location-map-provider-note">この画面は端末の現在地を自動取得しません。共有中の家族位置だけをGoogle Maps上に表示します。</div></div></div></div>
    <details class="location-family-sheet" data-location-family-sheet><summary class="location-sheet-handle" aria-controls="locationSheetBody"><span class="location-family-sheet-label">家族の位置・メニュー</span><span class="location-sheet-hint" aria-hidden="true"></span></summary><div class="location-sheet-body" id="locationSheetBody"><div class="location-map-note" data-location-status aria-live="polite">最新位置を確認しています…</div><div class="location-list" data-location-list aria-live="polite"><div class="location-empty">家族の位置一覧を読み込んでいます…</div></div>
  <details class="location-tools"><summary>経路・移動履歴</summary><div class="location-map-head-actions"><button class="btn small" type="button" data-location-home-eta>🏠 家まで何分？</button><span class="location-home-eta-result" data-location-home-eta-result aria-live="polite"></span></div>
  <section class="card section-card location-secondary" data-location-history-panel><h2>🧭 移動履歴</h2><div class="location-history-controls"><select data-location-history-member disabled aria-label="移動履歴を確認する家族"><option value="">家族を読み込みます</option></select><div class="location-history-dates"><label>開始日<input type="date" data-location-history-from required></label><label>終了日<input type="date" data-location-history-to required></label></div><div class="location-history-presets"><button type="button" class="btn gray small" data-location-history-days="1">今日</button><button type="button" class="btn gray small" data-location-history-days="7">7日間</button><button type="button" class="btn gray small" data-location-history-days="31">31日間</button></div><button class="btn small" type="button" data-location-history-load>地図に表示</button><button class="btn gray small location-history-clear" type="button" data-location-history-clear>軌跡を消す</button></div><div class="meta location-history-summary" data-location-history-status aria-live="polite">まだ読み込んでいません。</div><div class="meta location-history-summary" data-location-history-summary></div><div class="location-history-links" data-location-history-links></div></section>
  </details><details class="location-info"><summary>共有設定・使い方</summary><div class="location-map-note meta">位置が古い場合は「現在地」と断定せず、最終更新からの経過時間を表示します。車の所要時間は「車で何分？」または「家まで何分？」を押した時だけRoutes APIへ問い合わせます。</div>
  <div class="card section-card location-secondary"><h2>🔒 共有設定</h2><div class="row"><strong>位置共有の既定値: ${privacy.sharingEnabled?'ON':'OFF'}</strong><div class="meta">登録した端末も最初は共有OFFです。共有ONにした有効な端末だけが、認証済みの位置送信と保存の対象になります。</div></div><div class="row"><strong>🏠 自宅地点</strong><div class="meta">OWNER / ADMIN が「管理 → 位置情報・OwnTracks」で、共有中の最新位置から家族共通の自宅地点を設定できます。</div></div></div>
  
  <div class="card section-card"><h2>プライバシー方針</h2><p>この画面自体はブラウザの現在地を取得しません。共有ONの登録端末から認証済みの位置情報が届いた場合にだけ、FamilyToDoのlatest/history基盤へ保存されます。</p><p class="meta">端末は個別に共有停止・失効でき、共有OFFまたは失効済みの端末は位置送信・参照の対象外になります。自宅地点も明示的な管理操作でのみ設定され、経路時間はボタン操作時だけ計算します。</p></div></details></div></details></section></div><script defer src="/assets/location-history-ui.js?v=history3"></script>`;
  return html(layout('家族の場所',body,'/app/location.php'));
}
