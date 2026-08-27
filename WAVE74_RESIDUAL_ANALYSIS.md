# Wave74 residual analysis

## Production checks
1. Apply D1 migration 0016 before/with Worker deployment.
2. Generate and configure VAPID keys.
3. Open Family TODO in Safari and add it to the iPhone/iPad Home Screen.
4. Open the installed Home Screen app -> 管理 -> 通知設定.
5. Tap `この端末で有効化` and allow notifications.
6. Tap `テスト通知`.
7. Confirm lock-screen / Notification Center delivery.
8. Select Web Push as the notification method and create a near-future task reminder.
9. Confirm scheduled notification is delivered by Web Push without a LINE push.
10. Switch back to LINE and confirm legacy delivery remains intact.

## Important platform note
- iOS/iPadOS Web Push is intended for Home Screen web apps.
- LIFF/LINE WebView remains useful for the LINE entry flow, but Web Push device registration should be tested from the Home Screen PWA.
- No LIFF change is required for Wave74.

## Next planned work
- Family-log schema and MVP page.
- Add the sixth primary navigation slot only when the family-log page can save/read real data.
- At that point explicitly ask the user to change LIFF/rich-menu navigation for device validation.
- Add notification-channel diagnostics and optional subscription device labels.
- Consider delivery-attempt rows if future `LINE + Web Push both` mode is required; the current model intentionally selects one channel to avoid duplicate retries.
