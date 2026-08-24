# Cloudflare D1 Wave 7

## Included

- Fixed invitation-token join flow so `/family/join.php?token=...` can complete membership creation.
- Added legacy-compatible routes for message_new, shopping_new, settings subpages and logs.
- Added `/task/delete.php` compatibility endpoint with family/role/creator authorization.
- Added `/task/convert_occurrence.php` to materialize a recurring occurrence as an independent task.
- Added `/logout.php` compatibility route.
- Kept the existing Worker/D1/LIFF implementation intact; no XREA files are modified.

## Deployment

Upload the updated package to GitHub `main`, then let Cloudflare Build run `npm run deploy`.
