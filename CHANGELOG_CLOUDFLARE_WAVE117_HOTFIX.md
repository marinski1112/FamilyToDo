# 12.136.1-wave117-hotfix — LIFF / Google Home OAuth regression repair

This P0 routing/session hotfix adds no database migration and does not change the existing in-app bottom navigation.

## LIFF contracts and Rich Menu

The Worker endpoint remains `https://familytodo.marinski1112.workers.dev/liff`. Normal app entry uses a validated relative `next`; Google Home uses the explicit `flow=google_home` marker plus an encrypted, expiring `resume` token. A continuation cookie alone never selects Google Home flow.

Configure these URLs, substituting the channel's LIFF ID (the real ID must not be committed):

* `https://liff.line.me/{LIFF_ID}?next=%2Fapp%2Ftasks.php`
* `https://liff.line.me/{LIFF_ID}?next=%2Fapp%2Fcalendar.php`
* `https://liff.line.me/{LIFF_ID}?next=%2Fapp%2Fshopping.php`
* `https://liff.line.me/{LIFF_ID}?next=%2Fapp%2Ffamily_log.php`
* `https://liff.line.me/{LIFF_ID}?next=%2Fapp%2Fmessages.php`
* `https://liff.line.me/{LIFF_ID}?next=%2Fapp%2Fsettings.php`

The server constructs the LIFF login redirect, validates the final destination again at `liff_login`, and rejects external, protocol-relative, CR/LF, backslash, and arbitrary OAuth targets. The browser follows only the server response.

## Google Home E2E verification

1. In Google Home, start Family TODO Account Linking.
2. Confirm LINE login returns to the marked LIFF URL and then to the Family TODO consent page.
3. Confirm the page says **GoogleとFamily TODOを連携します**, then choose **連携する**.
4. Confirm the Google sandbox callback exchanges the one-time code at `/oauth/google/token` and sends SYNC.
5. Confirm Account link is **連携済み** and the 16 scenes are available.

Missing, invalid, expired, or repeatedly opened continuations stop at a dedicated recovery page rather than falling through to the app home or looping. Continuation cookies are cleared on callback/cancel, invalid or expired input, and loop-guard failure.
