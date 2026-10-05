# Cooking Live（Web）

Cookingの同意チェック→「音声相談を開始」で、その日の保存済み献立snapshot（主菜/副菜の名前・材料・手順・元人数、調理人数、現在の手順）をGoogle Geminiへ送ります。最大32,000文字のcontextのみ。family/baby profile、在庫、Calendarを送りません。接続後「マイクを使う」で初めてマイク権限を取得し、停止まで音声を直接Geminiへ送ります。文字の質問も可能です。返信音声を再生し、画面に最新4,000文字までの返信を表示します。会話・音声をD1/R2/localStorage/診断logに保存しません。

通常generateContentと別のMEAL_COOKING_LIVE route（gemini-3.8-live）を使用します。モデル互換/利用枠は実アカウントでは未検証であり、開始時のprovider応答で成否が決まります。Flash-Liteへの代替、品質修復、429/5xx後の自動再接続は行いません。失敗しても手順・タイマーは使えます。既存課金設定・キー・Cronは変えません。サービスの無料利用は保証しません。

## 接続の上限と秘密情報

MEALS_DB 0012にfamily/member/request/hash/model/status/期限を原子的にclaim。1家族4回/UTC日（失敗も数える）、同時発行は10分の枠1件まで。トークンは1使用、開始可能60秒、送受信期限10分。終了を申告してもproviderトークンを取り消せないため、発行した枠の期限までは次の発行を拒否します。通常AIの共通budget/circuit/台帳にもLive用feature/modelで発行1回を記録します（token発行HTTPの成否であり実音声成功数ではありません）。429はproject circuitに反映します。

GEMINI_API_KEYはserverの固定HTTPS auth_tokens endpointへのheaderだけ。ブラウザには短命のtokenだけ返し、providerの専用BidiGenerateContentConstrained WebSocketのaccess_tokenとしてメモリ上で使用。v1betaは現行のephemeral guideに合わせ、専用メソッド名/リクエスト形状はSDKソースも照合しています。D1の再送receiptはAPP_SECRETからpurposeを分離したAES-GCMとfamily/member/idのAADでtokenを暗号化し、同一メンバー・入力・期限内だけ同じtokenを返します。終了時にcipherを消去、期限後は新規開始操作時に自家族のcipherを消去。7日より古いmetadataは新規開始時に自家族最大20件削除。secretやprovider生エラーを返しません。raw responseは16KB/10秒に制限、redirect拒否。

clientは同意取り消し、最大10分、操作/発話なし2分、画面離脱、通信障害、goAway、過剰bufferで停止。マイクtrack・Worklet・再生buffer・AudioContext・WebSocketを閉じます。自動再接続・自動resumeはありません。idle終了は正規clientの制御、絶対10分はprovider token期限でも制限します。再送のtokenは1使用であり、接続済みtokenを使って2回目に接続できる保証はありません。

## 操作案の境界

許可するfunctionはpropose_cooking_actionのみ。NEXT_STEP/PREVIOUS_STEPと1〜10,800秒のTIMERを検証し、UIに操作案を出して利用者の承認後だけ実行。既存タイマーの置換は確認を要します。不正tool/引数を拒否し、同じcall IDは再実行せず50件で停止。tool cancellation/相談終了で未承認案を破棄。inventory/shopping/recipe/cookedのtoolを定義せず、音声だけで正本を書き換えません。加熱・アレルギー・離乳食安全性はAIで判定しません。

## 音声実装と検証

AudioWorkletでmono signed16-bit little-endian PCMを2,048 sampleずつ送り、実際のAudioContext sampleRateをMIMEに明示。Geminiの24kHz PCM返信をbounded queueで再生し、interruptionではqueueを停止。echo cancellation/音声抑制をリクエストし、カメラは取得しません。

全check:meals 101件、active regression 143件、typecheck/静的参照、AI route4件/budget5件が成功。SQLite/API/DOM/音声単体テスト: 認証/CSRF/同意/家族/メンバー/献立revision/step、固定モデル、並行claim、暗号化再送、期限・終了・4回上限、budget/429/5xx、応答サイズ、PCM clipping/endianness、マイク開始/停止、再生中断、tool承認/拒否、idle/最大期限/破棄の再接続なし。Chromiumの合成マイク・stub WebSocket/tokenでWorklet PCM送信、マイクtrack停止、文字質問→90秒timer案→明示承認→終了、在庫/作った書込み0、320/390/768px overflow/page errorなしを確認。実Gemini音声の品質・アカウント互換性、LINE内ブラウザ/iPhone実機は未検証です。

## 参照

- [Google Live ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Google Live WebSocket API](https://ai.google.dev/api/live)
- [Google Live audio formats](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- [Google SDK token wire conversion](https://github.com/googleapis/js-genai/blob/main/src/tokens.ts)（bidiGenerateContentSetupのflatten/lock仕様）
- [Google SDK Live transport](https://github.com/googleapis/js-genai/blob/main/src/live.ts)（ephemeral token専用Constrained endpoint）

新しい0012は既存npm run deployで自動適用します。previewはmigration未適用のためhealthが503となり得ます。LIFF入口/Androidのネイティブ音声対応、profile/在庫の追加同意共有は後続です。

## 管理者の固定データ接続診断

ごはんのフッター「AI接続診断」はOWNER/ADMIN限定。固定の架空レシピと接続確認文のみを使い、献立・プロフィール・在庫を読まず、マイクを取得しない。Live診断は通常と同じ家族4回/UTC日・10分1枠・共通予算・暗号化レシートに含む。診断フラグはキャッシュ読出し前にも権限確認し、通常料理のリクエストとはハッシュを分離する。AI応答を受信したら終了する。自動再接続・失敗後の追加試行はない。トークン発行成功のみを会話成功とは表示しない。安全な状態表示にはモデル名・状態・固定エラー種別・日時だけを出し、トークン、ハッシュ、リクエストID、会話本文は出さない。献立・レシピ・在庫を診断用に作成する必要はない。

## 通信失敗の分類

接続診断の安全な実行状態では、タイムアウト、通信失敗、認証・権限の拒否、APIの一時障害、応答形式の不一致を固定コードで区別する。例外の文章、Googleの応答本文、トークンは記録・表示しない。失敗結果の再送は既存の実行記録を再利用し、自動再試行や別モデルへの切替は行わない。

Google APIへの単一リクエストの待ち時間は最大30秒。回数上限・失敗キャッシュは維持し、待ち時間を延ばしても再試行や別モデルへの切替を増やさない。Liveの新規接続用トークン期限は従来どおり1分で、発行後に残り時間がない場合は開始しない。

トークン発行のHTTPリダイレクトは `manual` で受け取り、3xxは `REDIRECT_BLOCKED` として失敗させる。Workersでは `error` 指定がリクエスト構築時に拒否されるため使用しない。GoogleのAPIキーをリダイレクト先へ転送しないことをworkerdの実行テストで確認する。
