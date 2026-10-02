# FamilyToDo Android ネイティブ化・次窓引継ぎ

## 目的と現在地

- 対象は `marinski1112/FamilyToDo` のドラフト PR #1143、ブランチ `feat/android-location-starter`。Google Home の読み上げ・音楽は後回し。iPhone の位置情報は既存の外部アプリのまま、Android はネイティブの位置共有を追加する。
- カレンダー、チェックリスト、伝言、育児記録、スタンプ、設定、位置共有の主な導線は Java のネイティブ UI。ログイン、位置情報地図、家族日誌の詳細、一部管理ツールは既存 WebView。共通の D1 に既存・新規の認証済み API でアクセスする。具体的な実装範囲は `android/README.md`。
- `android/REMAINING.md` が残件の優先順位。この文書は次の作業窓で最初に確認する実行手順と注意点を記す。

## 次窓で最初にすること

1. PR #1143 の最新 head、`main`、Android CI と通常 CI の結果、実際のデプロイ先を fresh-read する。変更があれば差分を確認してから作業する。
2. `MainActivity.java` の位置共有登録・停止・再開・ログアウトをレビューする。特にログアウト時は、端末送信を即停止し、認証 Cookie を消す前に `/api/location/devices` の `sharing=false` を試みる。通信不能時は端末内 Secret を消してログインへ進み、Web 側の共有状態確認を通知する。実機で共有 ON/OFF・権限・再起動を確認する。
3. Web と Android の機能差分を画面・操作・権限ごとに埋める。優先は育児記録の詳細グラフ、残る設定（メンバー権限・外部連携・インポート等）、オフライン編集と競合復旧。変更ごとに必要な API 契約と UI のエラー復旧を確認する。
4. 実機配布の前に、APK が接続する `ApiClient.ORIGIN` に PR の Android 用 API が実際に公開されていることを確認する。本番 URL 固定。Android 用 API の別 PR #1145 は反映済み。今回のホーム・背景装飾は既存エンドポイントを使い、追加のサーバーデプロイは不要。CI の APK artifact が存在しても、全機能の実機テスト可能とは判定しない。プレビューを使うなら認証、D1、位置情報送信を含めて分離した接続先・専用 APK を用意する。
5. API と APK が一致したら Galaxy A21 等の端末でログイン、各画面、写真・スタンプ、共有停止、ログアウト、再起動、権限変更、通信断と復帰を E2E 確認する。同一署名鍵で更新できる安全な配布経路とインストール手順を整えてからユーザーへテストを案内する。鍵と位置端末 Secret はリポジトリに保存しない。

## 注意点

- ユーザーは作業続行を希望しており、定期タスクや通知の作成を求めていない。完成・実機テスト可能になるまで、単なる CI 成功で案内しない。
- Android PR #1143 はドラフトのまま。API #1147はユーザーの続行依頼により2026-10-02にマージ・本番ビルド成功。main への直接コミット、無断の本番 deploy、D1 本番操作はしない。Cloudflare Observability は使わない。サブエージェントも使わない。
- Web 側の機能更新後は Android 側への影響を必ず確認する。家族アイコンは標準 PWA アイコンをアプリに組み込み、家族固有のものはホーム画面ショートカットへ反映する設計。
- Android 位置共有は `src/location-device-api.ts` の `provision` / `sharing` / `revoke` と `src/location-device-provisioning.ts` の契約に依存する。端末 Secret は Android Keystore へ保存する。手入力の旧導線も残るため、Web 側の共有状態と差異が出た時の復旧を実機で確認する。

## Batched home and calendar decoration parity

Home now reads the existing authenticated `/app/index.php` display values without executing HTML/scripts or adding a server endpoint. Alerts, four live counters (including today's family-log count), yesterday's journal and expandable fortune render as native controls. The bounded parser rejects missing/changed count contracts and same-origin action links are restricted. Values stay in memory and are cleared across account/session changes. A changed Web HTML contract shows a retry error rather than invented values.

Calendar cells display up to three overlapping 24dp stamp thumbnails and an overflow badge; tapping previews and long-press opens existing placement actions. Date long-press opens decoration and event-preview choices. Background stickers use existing `/api/calendar-stickers` GET/POST/DELETE, 22% image opacity, and family/private scope; private rows overlay shared rows. Failed saves keep the chooser and selection for retry. Administration/upload remains available through existing Web tools. Decoration lists include the overview's full visible grid dates. Fixture checks cover dashboard parsing, unsafe links, changed markup, private-over-shared precedence, thumbnail and overflow rendering.

Distribution is batched to avoid repeated device installs. CI debug signing keys change between runners; preserving installed login through future updates requires the existing private signing workflow and its GitHub Secrets (see INTERNAL_RELEASE.md). No signing key is stored in source or artifacts.

## 2026-10-01 daily UI batch

User requested calendar/checklist month swipes, messages opening at latest bottom, and shopping + belongings displayed together. Native renderers now implement all four. Fixture tests cover navigation and scroll behavior; record the final Android CI/artifact number in distribution after tests pass. Web event editing exists through task detail; the missing obvious entry is handled separately by draft PR #1146 (not merged/deployed). Do not ask for another intermediate device login.

## Calendar/lifecycle batch (2026-10-02)

Native next batch fixes duplicate time-prefixed titles, Web sort_order/id ordering, child-based checklist counts and 2000–2100 navigation guards. Completed goods use JST midnight/01:00 grace, including foreground boundary refresh and resume refresh. Keep the original snapshot array backing goodsComposer: filtering by copying to a new JSONArray lost newly added rows after category rename; the existing consecutive-add/rename UI test caught this and visibility is now checked only while rendering.

API draft #1147 (`fix/android-overview-completion-parity`) adds recent undated completed goods and timestamps, task sort_order/parent_task_id and bounded authorised undated-child id/parent metadata for returned roots. No production deployment. Tests use migrated in-memory SQLite, including privacy, boundaries, undo, dated calendar history and limits. Native retains compatibility with old servers. Update PR #1143 CI results and distribution README only after final CI succeeds.

## API rollout and branch integration (2026-10-02)

PR #1147 is merged to main bae2e185c6949cff298fd083d19c32cccd1cff66 and exact-main Workers Builds succeeded at production version b3e634be-5728-48dc-826b-a32e7b930483. Native v0.1.187 already supports these additive columns and response collections; no replacement APK is required for this server change. Merge that main into #1143, resolving the overview add/add conflict by using the deployed main API. Native Java/Gradle/assets are unchanged. Distribution README and PR description must mark the API as deployed rather than pending. Signed-in production data verification remains the real-device pass. #1146 stays separate.

## 管理画面の整理と集計の期間移動（2026-10-02）

設定入口を自分・端末／家族／日常の機能／外部連携に集約。管理者専用の招待・タイムゾーン・表示名・メンバー詳細・活動ログはsettings APIのroleで表示を分ける。家族ログ管理はネイティブ画面へ、通知方法・接続・インポート等は既存Webへ明示した入口を用意。プロフィール名・表示名の保存では入力エラーと通信失敗後もフォームを保持し、連打・読み取り専用で送信しない。Google状態の改行も修正。集計グラフは取得済み期間を30日ずつ前後に移動できる。今回API変更なし。最新体温・体重・身長の折れ線、水分・運動・散歩、最大3年、固定署名・実機確認は残る。

### 家族ログ詳細集計の追加

最新体温・体重・身長（実際の日時・ID順）と日別最大値の折れ線、水分ml・運動分・散歩分、最大1096日の期間指定を追加。30日ごとに必要時だけ取得し、進捗表示と中止を用意。欠測は0で描かず、値0は測定値として保持。API追加は別PR #1148（検証・反映状態は配布時に更新）。前記のこれらの残件記述を更新する。記録者別集計・予防接種一覧などの詳細比較、他管理設定のネイティブ化、オフライン保存・署名・実機確認は継続。
