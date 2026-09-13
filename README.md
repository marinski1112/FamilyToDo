# FamilyToDo

FamilyToDo is a Cloudflare Workers + D1 family application integrated with LINE. The current application includes family membership, tasks/items/shopping, calendar and recurrence, messages, Family Log and journals, notifications, Location, Family AI, Google Calendar, Google Tasks, Google Home, PWA/Web Push, and related administration surfaces.

The repository is no longer an initial XREA-to-Cloudflare migration scaffold. Current `main`, runtime source, migrations, `wrangler.jsonc`, and active regression contracts are authoritative.

## Runtime architecture

- **Worker entrypoint:** `src/index.ts`
- **Database:** Cloudflare D1 binding `DB`, migrations under `migrations/`
- **Static assets:** `public/` through Workers Static Assets binding `ASSETS`
- **Media:** R2 binding `MEDIA`
- **AI:** Workers AI binding plus configured Family AI provider paths
- **Service binding:** shared calendar-stamp service through `SHARED_STAMPS_SERVICE`
- **Scheduled execution:** active cron triggers in `wrangler.jsonc`; `src/index.ts#scheduled()` dispatches notification, digest, Google Tasks/Calendar, journal, Location/archive, lifecycle-cleanup, and audit work
- **External integrations:** LINE/LIFF, Google Calendar, Google Tasks, Google Home, Location device ingress, Web Push

The configured application URL and integration callback URLs live in `wrangler.jsonc`. Do not duplicate them in new source unless the owning integration explicitly requires a separate contract.

## Request dispatch

Worker requests enter `src/index.ts` and are dispatched in this order:

1. `src/public-routes.ts`
2. early authenticated routes in `src/exception-routes.ts`
3. authenticated context creation in `src/app-context.ts`
4. context prelude routes in `src/exception-routes.ts`
5. `src/context-api-routes.ts`
6. `src/page-routes.ts`
7. context fallback routes in `src/exception-routes.ts`
8. static asset fallback

Do not infer ownership from URL shape or a `.php` suffix. Compatibility aliases and current first-class routes coexist.

## Architecture navigation

Start structural or feature work from `docs/architecture/README.md`. The architecture directory contains current owner/reachability maps for the major domains, including:

- route ownership: `docs/architecture/ROUTE_MAP.md`
- configuration and shared-function ownership: `docs/architecture/CONFIG_FUNCTION_MAP.md`
- authentication/session/CSRF: `docs/architecture/AUTH_FUNCTION_MAP.md`
- family membership/invitations/member administration: `docs/architecture/FAMILY_MEMBERSHIP_FUNCTION_MAP.md`
- task/item/completion, messages, Family Log/journals, calendar, notifications, Family AI, Google Calendar/Tasks/Home, and other mapped domains
- legacy classification and cleanup rules: `docs/architecture/LEGACY_INVENTORY.md`

These maps are navigation aids, not source-of-truth replacements. If a map disagrees with current source, current source wins and the map should be corrected in the same bounded structural change.

## Local development

Prerequisites:

- Node.js 22-compatible environment
- npm
- Wrangler authentication when Cloudflare resources are required

Typical setup:

```bash
npm ci
npx wrangler types
npm run typecheck
npm run dev
```

Use `.dev.vars.example` as the reference for local/test configuration. Put only test/staging credentials in local environment files and never commit secret values.

D1 schema changes must be represented by migrations. Review the current migration chain before applying anything remotely. The repository deploy script applies D1 migrations before Worker deploy; do not run it casually against an environment you did not intend to modify.

## Validation

CI runs TypeScript checks, browser JavaScript checks, static-asset and migration checks, Location/journal/AI contracts, and the regression suite. Before merging a bounded change, validate the relevant contract plus the full CI/Workers Build path required by the repository workflow.

Useful health endpoints exposed by the current Worker include:

- `/__cf/health`
- `/__cf/db-health`
- `/__cf/db-schema-health`
- `/__cf/db-runtime-health`
- `/__cf/auth-health`
- `/__cf/integrations-health`
- `/__cf/google-home-health`
- `/__cf/secrets-health`

Health and diagnostic endpoints must remain privacy-safe and must not return secret values.

## Secrets and credentials

Do not commit LINE secrets/tokens, Google credentials, application secrets, VAPID/private push material, Location device secrets, database credentials, or provider API keys.

Runtime Worker secrets belong in Cloudflare Worker runtime configuration, not in repository files and not only in Workers Build variables. Use `wrangler secret put <NAME>` or the equivalent Cloudflare runtime secret configuration for each required secret. Consult `.dev.vars.example`, current environment-health code, and the owning integration module for the actual required names.

The LINE Login credentials used by Google Home account-linking continuation are distinct from LINE Messaging API credentials. Do not reuse one channel's secret as the other.

## Database and data ownership

D1 is the active application database. Current schema behavior is defined by the migration chain and current runtime queries; historical Wave documentation is not authoritative.

When changing persistence:

- preserve tenant/family scoping;
- preserve auth and CSRF boundaries;
- avoid logging credentials, raw provider payloads, raw GPS where prohibited, or sensitive user content in diagnostics;
- keep compatibility and external callback contracts unless their callers are explicitly migrated;
- do not recreate removed legacy stores merely because an old document references them.

## Structural cleanup rule

The repository contains historical Wave-era artifacts and compatibility paths. Before deleting or consolidating anything, classify it using `docs/architecture/LEGACY_INVENTORY.md` and prove runtime/build/static-asset/scheduler/test/contract/external-callback reachability. `UNKNOWN` is not deletion evidence.

Keep cleanup PRs small and separate from unrelated behavior fixes.