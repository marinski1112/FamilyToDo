# Android UI parity and verification

## Source basis

Read the canonical Web home/dashboard, checklist controller and reminder interaction assets, goods-category-controller, message-chat page/sync/client/composer, family-log compact/simple/page, location client and recurrence projection. Native code calls the existing authenticated Web APIs and keeps the signed session; it does not create a second D1/R2 store.

## Page coverage in this update

| Page | Native changes | Web-backed parts / remaining differences |
| --- | --- | --- |
| Home | Today list, Web-style two-column count cards and three-column shortcuts, quick task/goods creation, links to all tabs and family journal | Full dashboard alerts, yesterday journal and fortune remain on Web home |
| Checklist | Task/event section, separate title editing and completion, status tabs, goods categories, continuous entry, details, child-task viewer | Undated/all-history tasks via explicit Web link; Full child creation still differs; inline category rename, category/content drag and JST fresh/archived empty-category cluster are implemented. Missing catalog metadata keeps legacy categories visible until metadata arrives |
| Calendar | Cross-day event bands and four sorted single-day event chips matching the current Web cap, remaining-event count, long-press full-day preview, Web holiday labels, adjacent-month days, task/goods counts, day tap opens checklist | Arbitrary stamp layout still differs; cross-day events now use up to four separate lanes, clipped per week with overflow counts |
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

The home stat grid uses the overview snapshot. Its fourth card shows belongings remaining instead of the Web dashboard's family-log count, which is not in this API. Yesterday's journal opens the authenticated Web journal; its summary, full alert totals and fortune are still Web-backed. These values are not inferred from partial monthly data.

Empty category state uses the active kind's `categoryMeta`, total content count across both status views and persisted `activated_at`. Disabled categories stay hidden. Before 23:00 JST, archive is eligible at the next midnight; at/after 23:00 it is eligible at the next 01:00. Archived categories remain directly renameable in the cluster and can reopen for entry. Successful rename opens the target; subsequent catalog loads use the server's persisted activation time. Catalog fetch now rerenders the actual `goods` tab.

This update's build and API 30/35 instrumentation are pending until the exact-head Android CI succeeds. Device-only checks above remain outstanding.

Calendar holiday calculations are a direct port of the existing Web recurrence projection, including Monday holidays, citizen holidays and substitute holidays. This preserves the Web rules rather than introducing another holiday data source. Week height grows with event/overflow/accessory rows instead of clipping them.

Multi-day event ranges now retain one lane across the displayed month, use separate lanes for overlaps, span the native week width and show continuation arrows at week boundaries. Bands route to the event checklist. The fixture includes overlapping ranges and checks that the bands measure and occupy separate lanes.

Message styling now uses the Web theme raised surface and exact own-message green, centered date pills and header, 128dp stamp previews, own-message sender/avatar suppression and the green send control. Family-log record cards open the existing editor on tap and retain long-press actions; custom quick controls use compact icon/label tiles.
