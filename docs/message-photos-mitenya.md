# Message photos and Mitenya handoff

## Behavior

Messages can attach one JPEG/PNG/WebP photo (browser input up to 20 MiB,
normalized to JPEG up to 2048 px and 4 MiB before upload). Images remain in
FamilyToDo's existing private MEDIA bucket, behind same-family authentication.
Scheduled messages retain their existing visibility rule.

Long-press an image message or a photo-bearing growth/family journal entry to
open sharing actions. The ordinary “みてにゃへ” button is the keyboard alternative.
Only the selected photo and an explicitly entered caption are shared. No daily
location summaries or full diary text are exported automatically. Journal entries
without a photo must have one attached before sharing.

The user opens Mitenya, authenticates as an administrator, chooses a child and
checks access restrictions and caption before submitting its existing photo form.
LINE notification is unchecked initially. Receiving a draft creates neither a
Mitenya media row nor a LINE notification. Confirming a post copies the photo
into Mitenya's private PHOTOS bucket. Deleting the FamilyToDo source does not
delete an independently published Mitenya copy, and vice versa.

## Security and retries

- Existing message upload ID + content identity makes concurrent/response-loss
  retries create one message. A durable operation record precedes R2 writes.
- Message deletion marks a cleanup journal. An in-flight identical writer delays
  cleanup; failed deletes remain available for a bounded subsequent drain.
  Crashed staging writers are deliberately retained for reconciliation rather
  than reclaimed with a guessed timeout.
- Message notification intents are committed in the same D1 batch. Existing
  notification delivery processes them (normally the next scheduled batch, or
  the selected reminder time); the client never blindly resends LINE messages.
- Sharing creates a 256-bit random capability, SHA-256 stored only, expiring in
  five minutes with at most three redemption attempts including failed reads.
- The capability is scoped to one source photo and its initiating active member
  and family, plus the selected image SHA-256. A photo replaced after mint is rejected. Canonical source authorization is checked at mint and redemption.
  Deleted photos or revoked family membership cannot be read on redemption.
- The link uses a URL fragment, immediately cleared by Mitenya; no token in query,
  localStorage/sessionStorage, application logging, or R2 key in a public DTO.
  A login redirect can discard this in-memory draft; reopen sharing after login.
- Redemption body is bounded to 128 bytes. Image transfer is bounded to 4 MiB
  (6 MiB encoded JSON), caption to 2000 characters. No video path is added.
- Expired capability records are removed in batches of at most 100 on mint.
  No new Cron or speculative cache is introduced.

## Cloudflare transport and deployment

Mitenya MUST use a Service Binding named FAMILYTODO_SERVICE targeting the
`familytodo` Worker. No same-account public-fetch fallback. Binding calls pass
only method, headers and body; no redirect/AbortSignal. No new shared secret is
needed: the short-lived selected-photo capability authorizes the read, and
Mitenya independently requires admin authentication for the preview and final post.

Apply FamilyToDo migrations 0084_message_photos.sql and 0087_photo_transfers.sql
using its existing migration/deploy pipeline. Preserve 0083, 0085 and 0086 from
other work. Deploy the Mitenya receiving endpoint/binding before exposing source
UI to users, then deploy FamilyToDo. No shared stamp Worker changes are required.
Do not run production SQL manually or alter secrets/YouTube flags/Cron.

## Verification

Disposable SQLite fixtures exercise upload replay, parallel writers, failed R2,
delete/retry, capability expiry and atomic redemption budgets. Mitenya route
fixtures cover admin-only preview, no storage mutation, no global-fetch fallback,
and a Service Binding accepting only portable request fields.

Live cross-Worker photo transfer, iOS LINE LIFF navigation, VoiceOver/TalkBack,
and real-device long press require authenticated preview/production verification;
unit/DOM tests alone do not establish these outcomes.
