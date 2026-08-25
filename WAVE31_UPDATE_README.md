# Wave31 更新版

このZIPはWave30からの更新対象だけです。

GitHubのmainで、ZIPの中身を同じパスに配置してください。

- `src/index.ts`
- `src/app.ts`
- `migrations/0008_wave31_task_only.sql`
- `CHANGELOG_CLOUDFLARE_WAVE31.md`
- `MIGRATION_PROGRESS_WAVE31.md`

`wrangler.jsonc` と Secrets は変更不要です。

CloudflareのGit連携がmain pushを自動Deployする構成なら、push後にDeploy完了を待ってください。
D1 migrationが自動適用されない構成の場合は、migrationを一度だけ適用してください。
