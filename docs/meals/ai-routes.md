# 料理AIルートの先行整備

本PRは既存の呼出し予算PRの上に積みます。料理AIの実行、APIキー変更、追加課金、Liveセッション発行は含みません。モデル名は引継ぎ設計の候補であり、提供元の現時点の対応や当該プロジェクトの利用可否を保証しません。

| 機能 | 初期モデル | 代替 |
|---|---|---|
| MEAL_INBOX | gemini-3.5-flash-lite | gemini-3.5-flash |
| MEAL_RECIPE_EXTRACT | gemini-3.5-flash-lite | gemini-3.5-flash |
| MEAL_RECEIPT_PARSE | gemini-3.5-flash-lite | gemini-3.5-flash |
| MEAL_WEEKLY_PLAN | gemini-3.5-flash | gemini-3.5-flash-lite |
| MEAL_BABY_GUIDANCE | gemini-3.5-flash | なし |

既存のAIモデル設定画面で家族・OWNER/その他メンバーごとに保存できます。保存時はプロジェクトのモデル一覧も検証します。設定画面では「準備中」と表示し、設定だけで料理AIは起動しません。離乳食は文章説明のみの設定で、安全判定は将来のルール実装が正本です。

料理generateContent設定ではLive、TTS、native-audio系IDを拒否します。不正な保存値を読み込んだ場合は機能の初期候補に戻します。既存機能のルート初期値は変更しません。

`meal-live-model-routing.ts` は別の型・別の設定キー `ai_live_route_v1_MEAL_COOKING_LIVE_*` を使います。設計候補は `gemini-3.8-live` のみ。常用しないextended-thinkingは暗黙の代替にしません。戻り値は常に `availability: UNVERIFIED` です。接続対応、ephemeral token、セッション上限、開始/終了台帳の実装・検証が済むまでLiveは開始できません。このPRはその入口を公開しません。

確認: `npm run check:meal-ai-routes`（4件）、既存model routing contract、typecheck。設定読み出しはHTTP通信も生成もしません。
