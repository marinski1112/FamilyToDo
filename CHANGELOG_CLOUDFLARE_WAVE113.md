# Cloudflare Wave113 — Google Home実機Account Linking / SYNC / EXECUTE

## Readiness and OAuth

Google Home専用Client ID/SecretとProject IDの設定有無、link状態、Scene数をcredential非表示で確認できます。管理者detailsはDeveloper Consoleの3 endpointとproject由来のproduction/sandbox callbackを示します。allowlist、constant-time credential比較、一回限り5分code、CSRF、同一origin login continuation、hash保存は維持します。scope/user_locale等の追加parameterは拒否理由にしません。

Refresh tokenはrotateしません。署名付き約1時間access tokenは同じ分の並行refreshで同値になり、別の有効なrefresh accessもDB更新で失効させません。raw credentialは保存しません。通常refreshはsafe console logだけです。

## SYNC / EXECUTE / diagnostics

BABY/CHILD sleepとactive quick choreのみを、安定IDのSceneとしてSYNCします。名称はcontrol文字と余分な空白を除去し80文字に制限します。同名でもSYNCは継続し、管理画面で警告します。最大10件のcompact preview、最終SYNC時刻/件数、receipt由来の最終operation/statusだけを表示します。

ActivateSceneは既存domain helperとlinked memberを使い、provider/request ID/command key receiptで再送を冪等化します。DISCONNECTはtokenだけをrevokeします。migrationはありません。Calendar importerとFamily AIには変更を加えていません。

Scene-only integrationはGoogle certification/release対象外のため、Test integrationと個人家庭利用に限定します。Request Sync APIは未実装で、Scene変更後は再link/Google側再同期が必要な場合があります。
