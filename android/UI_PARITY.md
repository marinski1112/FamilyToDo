# Android UI parity and verification

## Source basis

Read the canonical Web home/dashboard, checklist controller and reminder interaction assets, goods-category-controller, message-chat page/sync/client/composer, family-log compact/simple/page, location client and recurrence projection. Native code calls the existing authenticated Web APIs and keeps the signed session; it does not create a second D1/R2 store.

## Page coverage in this update

| Page | Native changes | Web-backed parts / remaining differences |
| --- | --- | --- |
| Home | Native alerts, four live counters, yesterday journal preview, expandable fortune, today list, two-column cards and three-column shortcuts, quick creation | Journal details remain on the original Web page; canonical HTML contract changes show a retry error |
| Checklist | Task/event section, separate title editing and completion, status tabs, goods categories, continuous entry, details, child-task viewer | Undated/all-history tasks via explicit Web link; Native child creation inherits parent scope, prohibits deeper nesting/events, supports undated tasks and retains failed drafts with stable retry keys; inline category rename, category/content drag and JST fresh/archived empty-category cluster are implemented. Missing catalog metadata keeps legacy categories visible until metadata arrives |
| Calendar | Cross-day event bands and four sorted single-day event chips matching the current Web cap, remaining-event count, long-press full-day preview, Web holiday labels, adjacent-month days, task/goods counts, day tap opens checklist | Up to three overlapping stamp thumbnails, overflow badges, static/animated preview and scoped background stickers are native; upload/asset administration remains Web-backed |
| Location | Location tab opens the authenticated in-app Web map/history; native device location settings remain accessible | Map is Web-backed; native sharing service remains native |
| Family Log | Subject filter, compact date controls, record cards, management menu, quick-record dock and journal/food/summary links | Growth journal, family journal, food list and full administration are Web-backed |
| Messages | Inline photos/stamp thumbnails, LINE avatar with neutral fallback, day/time/read labels, bottom composer, long-press actions | Animated stamp playback opens the existing viewer; advanced recipient/scheduling uses existing composer |
| Settings | Native existing settings plus link to complete Web administration | Web administration remains Web-backed |

## Automated native UI verification

The Android CI UI matrix runs API 30 (Android 11) and API 35 at 360 dp width in light/dark modes. The instrumentation launches the real MainActivity and native renderers with synthetic family data. It checks navigation, independent title/checkbox taps, successful inline title saving, failed-save rollback, continuous goods entry, category rename success and failed-name draft retention, successful/failed goods category move, JST 22:59/23:00/23:59 and exact archive boundary, fresh/archived cluster display and reopening, home grid, date/weekday alignment, navigation text width, event overflow and page content. It captures page screenshots.

Fixture mode is only available when both the dedicated isolated E2E origin and isolatedE2E build property are selected. The normal production APK and release have UI_TEST_MODE=false. Fixture API calls use an in-memory transport. Real API requests and media network connections are blocked in fixture mode. No credentials or production data are used by these UI checks.

Screenshots and test results are uploaded as native-ui-api-30 / native-ui-api-35. The CI run result is the authoritative verification status.

## Device-only checks remaining

LINE login/browser handoff, real photo/document picker, OS location/notification permissions, foreground/background location behavior, real server synchronization, unstable mobile connectivity and real finger drag gestures and Galaxy-specific IME/keyboard behavior still require device testing. Emulator UI checks do not establish those results.

## Latest source parity changes

Home alerts, counters, journal preview and fortune use the authenticated canonical dashboard values; the fourth card shows the real family-log count. Journal details remain Web-backed.

Empty category state uses the active kind's `categoryMeta`, total content count across both status views and persisted `activated_at`. Disabled categories stay hidden. Before 23:00 JST, archive is eligible at the next midnight; at/after 23:00 it is eligible at the next 01:00. Archived categories remain directly renameable in the cluster and can reopen for entry. Successful rename opens the target; subsequent catalog loads use the server's persisted activation time. Catalog fetch now rerenders the actual `goods` tab.

The preceding v0.1.171 build and API 30/35 instrumentation succeeded. The child composer addition requires its own exact-head CI before distribution. Device-only checks above remain outstanding.

Calendar holiday calculations are a direct port of the existing Web recurrence projection, including Monday holidays, citizen holidays and substitute holidays. This preserves the Web rules rather than introducing another holiday data source. Week height grows with event/overflow/accessory rows instead of clipping them.

Multi-day event ranges now retain one lane across the displayed month, use separate lanes for overlaps, span the native week width and show continuation arrows at week boundaries. Bands route to the event checklist. The fixture includes overlapping ranges and checks that the bands measure and occupy separate lanes.

Message styling now uses the Web theme raised surface and exact own-message green, centered date pills and header, 128dp stamp previews, own-message sender/avatar suppression and the green send control. Family-log record cards open the existing editor on tap and retain long-press actions; custom quick controls use compact icon/label tiles.

## Batched home and calendar decoration parity

Home now reads the existing authenticated `/app/index.php` display values without executing HTML/scripts or adding a server endpoint. Alerts, four live counters (including today's family-log count), yesterday's journal and expandable fortune render as native controls. The bounded parser rejects missing/changed count contracts and same-origin action links are restricted. Values stay in memory and are cleared across account/session changes. A changed Web HTML contract shows a retry error rather than invented values.

Calendar cells display up to three overlapping 24dp stamp thumbnails and an overflow badge; tapping previews and long-press opens existing placement actions. Date long-press opens decoration and event-preview choices. Background stickers use existing `/api/calendar-stickers` GET/POST/DELETE, 22% image opacity, and family/private scope; private rows overlay shared rows. Failed saves keep the chooser and selection for retry. Administration/upload remains available through existing Web tools. Decoration lists include the overview's full visible grid dates. Fixture checks cover dashboard parsing, unsafe links, changed markup, private-over-shared precedence, thumbnail and overflow rendering.

Distribution is batched to avoid repeated device installs. CI debug signing keys change between runners; preserving installed login through future updates requires the existing private signing workflow and its GitHub Secrets (see INTERNAL_RELEASE.md). No signing key is stored in source or artifacts.

Child creation now opens a native form from the selected parent. Parent id and visibility are sent to the existing task API. Failed validation/save keeps the form and input, repeated unchanged saves reuse a request key, and changed payloads receive a new key. Native task/event creation also keeps failed input instead of dismissing it. Child rows respect API editing permissions and do not offer deeper nesting. Fixture tests cover empty titles, double submit, transient failure/retry, scope, undated creation, event/nesting and read-only guards.

Native checklist search now opens an inline field for task/event and active goods sections. It trims and lowercases queries as the Web controller does, filters rendered rows/categories without a network request, and restores rows when closed.

## Daily interaction parity (2026-10-01)

Calendar and checklist accept horizontal month swipes (left: next, right: previous). Short movement, vertical scrolling, multi-touch and gestures inside text/spinner/horizontal-scroll controls do not navigate months. Calendar selects day 1; checklist retains the day, clamped to the destination month length. Both shopping and belongings render together; the kind selector controls creation/catalog/set actions only. Catalogs, drag targets, expansion keys and mutations stay kind-specific.

Messages initially scroll to the latest bottom with the composer pinned below. A refresh near the bottom follows latest; history readers keep the visible message anchor. Older-page prepends preserve the same anchor. Refresh merges the latest page with already loaded older history, updates matching IDs, deduplicates older pages and removes stale rows when the server returns a complete page. Explicit text sending requests latest again. Fixed-size photo/stamp slots keep delayed image loads from shifting layout. Fixture tests cover these gestures, month-end clamping, combined lists, initial bottom position, refresh/history anchors and message page merging on API 30/35 in both themes.

Web event detail/edit entry is a separate draft PR #1146. Android event editing already exists. The Web change adds a visible detail/edit link using the existing detail page and server edit permissions; it does not deploy or change APIs.

## Date, unified goods and chat reaction parity (2026-10-02)

Read Web checklist date navigation, calendar jump/year-month/today controls, unified goods category controller and message reaction API/client. Checklist now has previous/next day and a native date picker; same-month date changes reuse the overview. Calendar has a 2000–2100 year/month picker, current-month return and today's checklist shortcut.

Shopping and belongings share one search and one archived-empty cluster, with icons preserving kinds. Search includes names in collapsed categories and survives creation-kind changes/category expansion. Completed goods show the combined count. Explicitly disabled categories no longer hide surviving rows: the renderer exposes those rows in the same kind's unclassified category without mutating stored data. Unavailable metadata retains the previous fallback rather than inventing deletion.

Reaction counts and own-selection highlighting render below chat bubbles. Each newly fetched page reads at most 40 reaction IDs through the canonical API. Failure to fetch reactions leaves text and earlier counts available. Chip taps use the existing POST and refresh that message; concurrent taps for that message are blocked. Failed updates preserve previous counts and enable retry. Read-only views cannot mutate, and session changes clear reaction/search memory. Choosing a new reaction stays in the existing long-press menu.

Fixture checks exercise day/year/month/leap-day navigation, today return, search across collapsed kinds, preserved query, single archive cluster, disabled-category fallback, reaction visibility/selection/double-submit/failure/read-only behavior. No backend/schema changes or production writes are required. Calendar all/common/private filtering is also implemented locally, including recurring events, and preserves the canonical Web behavior of leaving goods counts unchanged. Remaining native graph/settings coverage is still incomplete.

## Calendar labels and completion lifecycle (2026-10-02, next batch)

Single-day calendar events now use Web sort_order then id rather than all-day/time ordering. Matching time prefixes in titles (including fullwidth input) are removed from display labels using the Web NFKC rule; all-day and multi-day band titles retain their original text. Accessibility and day preview use the same labels. Older overview APIs without sort_order fall back to id order.

The checklist filters completed goods using canonical JST midnight/01:00 grace rules, with timestamp fallback and UTC/offset handling. Calendar retains the supplied dated history. A foreground boundary timer and resume check refresh completion visibility; old servers omitting timestamps keep their supplied rows for compatibility. API parity uses overview API PR #1147 (merged and deployed 2026-10-02): it returns recent undated completions, timestamps, and sort_order without losing dated calendar history. The production API is deployed separately and v0.1.187 can read these fields.

Month swipes and direct day movement are guarded at the 2000–2100 overview range. Fixture checks cover ordering despite conflicting time/all-day values, title normalization, lifecycle boundaries, legacy compatibility, unchanged snapshot, completed counts and date limits.

Calendar checklist counts now follow countCalendarChecklistTasks: dated and authorised undated children replace an additional parent count. The deployed API #1147 adds parent_task_id and a bounded list of id/parent_task_id for authorised undated children of returned roots. Hidden roots and other members' private children contribute nothing; no child titles/details are fetched. Old overview responses without metadata retain their legacy counts. Family-log Web graphs still exceed native coverage: latest temperature/weight/height and their daily maximum line graphs, water/exercise/walk metrics and Web's maximum three-year custom range remain to compare/port (native range is 366 days, bar chart shows final 30).

Screenshot inspection exposed a stamp/count overlap on days with four single events plus multi-day bands. Reserve 30dp for the 24dp stamp stack and margins (previously 18dp); fixture geometry checks that stamp thumbnails start below the task count in both themes and OS versions.

## API rollout (2026-10-02)

User requested the API fix as well. PR #1147 was squash-merged at bae2e185c6949cff298fd083d19c32cccd1cff66. Exact main Workers Builds succeeded (version b3e634be-5728-48dc-826b-a32e7b930483). Production health and unsigned overview authentication guard were read-only checked. No migration, manual D1 operation or APK change. Android branch merges that main API and its regression so future merges cannot restore the older overview. UI tests for v0.1.187 remain the code-level validation; real authenticated device data and OS behavior require the existing device pass.

## 管理画面の整理と集計の期間移動（2026-10-02）

設定入口を自分・端末／家族／日常の機能／外部連携に集約。管理者専用の招待・タイムゾーン・表示名・メンバー詳細・活動ログはsettings APIのroleで表示を分ける。家族ログ管理はネイティブ画面へ、通知方法・接続・インポート等は既存Webへ明示した入口を用意。プロフィール名・表示名の保存では入力エラーと通信失敗後もフォームを保持し、連打・読み取り専用で送信しない。Google状態の改行も修正。集計グラフは取得済み期間を30日ずつ前後に移動できる。今回API変更なし。最新体温・体重・身長の折れ線、水分・運動・散歩、最大3年、固定署名・実機確認は残る。

### 家族ログ詳細集計の追加

最新体温・体重・身長（実際の日時・ID順）と日別最大値の折れ線、水分ml・運動分・散歩分、最大1096日の期間指定を追加。30日ごとに必要時だけ取得し、進捗表示と中止を用意。欠測は0で描かず、値0は測定値として保持。API追加は別PR #1148（検証・反映状態は配布時に更新）。前記のこれらの残件記述を更新する。記録者別集計・予防接種一覧などの詳細比較、他管理設定のネイティブ化、オフライン保存・署名・実機確認は継続。
