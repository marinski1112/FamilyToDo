# 献立導入前のAI呼出し棚卸し

対象 main e30b0543ef345c23db45cfa99f4c5ebc187d6f19。2026-10-04 fresh read。秘密値・家族の実データ・prompt/responseは記録しない。

| Feature | Trigger / call site | 実効model source | 最大attempt / daily bound | dedupe / 429 | 判断 |
|---|---|---|---|---|---|
| ROUGH_INPUT | user / task-rough-input-api.ts analyzeTaskRoughInput | route OWNER/MEMBER → 3.5 Lite / 3.5 Flash | 2 / family・globalの日次guardあり | request reservation、429で停止・15分circuit | 維持 |
| MESSAGE_DRAFT | user / message-ai-draft.ts → rough input | MESSAGE_DRAFT route | 2 / rough inputと同じguard | 上記と共有 | 維持 |
| FAMILY_DAILY_JOURNAL | hourly cron / family-daily-journal-ai.ts | OWNER route → 3.6 Flash（1個目のみ） | 3/run、最大72/day全家族（並行重複は未防止） | content_versionで成功/失敗を消費、provider前のclaimなし | 原子的claimと日次budget優先 |
| MORNING_DIGEST | 5分cron / line-daily-digest.ts | family route優先、未設定ならMORNING_DIGEST env → 3.8 Flash | 1/destination fingerprint、family 2/local day、global120/UTC day | finalized frame、予約、429 circuit、代替なし | 維持、source表示にenv差あり |
| PERIODIC_DIGEST | 5分cron / line-periodic-digest.ts | family route → env/default 3.8 Flash / 3.5 Flash | 2/report、global120/day（morningと共有） | finalized report、429後にignoreCircuit=trueで代替を呼ぶ | 429停止を優先 |
| GOOGLE_VOICE_INQUIRY | event / google-voice-inquiry-gemini.ts | family route、未設定ならgeneric resolver（default3.1 Lite） | 最大2/request、daily boundなし | 429でも別modelを試す | 429停止を優先 |
| CALENDAR_ICS_IMPORT | user / calendar-ics-import.ts aiSuggestions | family route、未設定ならgeneric resolver | 30項目/chunk × 最大2、日次boundなし | 429でも別modelを試す | 429停止を優先 |
| FAMILY_AI | user / family-ai.ts GeminiPlanner | family setting → GEMINI_MODEL → 3.1 Lite | 1/request、daily boundなし | 確認token/tenant境界あり、provider予約なし | 今回model維持、共通budget適用 |
| AI connectivity/compatibility | owner manual / family-ai.ts compatibility | 選択model | 1/test、daily boundなし | synthetic input、429分類 | 診断にも共通guard |
| Workers AI | user / family-ai.ts WorkersAiPlanner、connectionTest、calendar-ics-import.ts | FAMILY_AI_PROVIDER明示、WORKERS_AI_MODEL → llama3.1 8b | calendar chunk数、会話1/request | Geminiへ自動切替なし | Gemini制限と分離、今回挙動維持 |
| model catalog | owner manual / family-ai.ts listGeminiModels | GET models最大2page、generationなし | 2 GET / action | family catalog保存 | generation budget外 |

生成のHTTP通信はgeminiFetchに集約。各consumerはbody/schema/確認/privacyを所有。現行route表示はgeneric resolverやdigest env overrideを完全には表現しない。モデル変更は今回行わず、schemaと品質をfeatureごとに検証後に別PRにする。

3.7 Flashはmainの直書きdefaultにはない。family設定/環境override/別クライアントでの使用はUNVERIFIED。AI StudioのRPD超過画像だけからこのWorkerの特定cronを原因と断定しない。日誌の過去日バックログ（3/run×24回）と並行実行、periodicの429 fallbackはコード上で確認できる増幅要因。

## Mealsと入口

下部navはindex/tasks/calendar/location/family_log/messagesの6個。homeは期限アラート、今日の件数、昨日の日誌、クイック追加、占いを持つ。献立置換時は旧dashboardをサブ画面に保持し、管理や期限確認へのアクセスを残す。Androidは現行overview APIを維持しWeb追加から始める。

LINE rich menuはtasks/calendar/shopping/family-log/messages/settingsの6入口であり、6個の独立LIFF設定はコードから確認できない。runtimeのLINE_LIFF_IDは1つ。既存/liff?next=内部pathへ追加する。LINEコンソールの実設定はUNVERIFIED。

買い物の正本はshopping_items（既存DB）。family + client_request_id uniqueが存在する。Mealsの第二買い物表は作らず、内部serviceからこの制約を使う。MEALS_DBにはfamily/memberの論理IDだけを持たせる。新規cronなし。画像/レシート/Live/離乳食判定は初期の手動MVPに混ぜない。

## PR分割と外部作業

1. 本棚卸し（挙動変更なし）。
2. 共通Gemini予約/呼出し集計・429停止・日誌原子的dedupe。
3. Meals専用migration・tenant API・手動Web MVP・買い物投影。
4. featureごとのmodel再配分・LINE Inbox・在庫・AI提案・Cooking Live・離乳食・Android。

MEALS_DBの新規D1作成とbinding登録は所有者のCloudflare権限で必要。DB IDを捏造してwrangler本番configへ入れない。未設定時は旧homeと既存6tabを維持する。Google Calendarへの書込みはこのMVPに含めず、既存認可や同期は維持する。
