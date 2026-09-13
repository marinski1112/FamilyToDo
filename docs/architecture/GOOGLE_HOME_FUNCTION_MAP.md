# Google Home ownership map

Verified against main `96d35fa4b6c5419f32f1af81c75a24603117663d`.

This map records the current Google Home runtime ownership boundaries. Historical Wave/setup documents remain useful configuration references, but current source, migrations and active regression contracts are authoritative.

## Canonical boundaries

| Concern | Canonical owner / exported function | Route / caller | Data / side effects | Regression boundary |
| --- | --- | --- | --- | --- |
| Account Linking authorization | `src/google-home.ts#googleAuthorize()` | `/oauth/google/authorize` via `src/exception-routes.ts` | validates Google Home client/redirect/response type, requires a FamilyToDo member, records one-time authorization-code hash in `google_home_authorization_codes`, and returns the Google redirect | exception-route and Google integration contracts |
| LINE Login continuation for an unlogged-in linking flow | `src/oauth-continuation.ts` (`preserveGoogleHomeLogin()`, `lineGoogleHomeStart()`, `lineGoogleHomeCallback()`, `resumeGoogleHome()`) | `/oauth/line/google-home/start`, `/oauth/line/google-home/callback`, `/oauth/google/continue` via `src/public-routes.ts`; wrapper invoked from `src/exception-routes.ts` | seals the original Google authorize path, performs LINE Login OAuth+PKCE, commits the FamilyToDo session and resumes the original authorization request. This is login transport, not Google Home authorization ownership | public/exception route contracts and OAuth continuation contracts |
| OAuth token endpoint / linked member identity | `src/google-home.ts#googleToken()` and bearer-member validation | `/oauth/google/token` via `src/public-routes.ts` | exchanges one-time code for hashed access/refresh credentials in `google_home_tokens`; refresh keeps the raw refresh token out of storage and emits a signed expiring access token; bearer resolution revalidates active member + family tuple | Google integration/token/privacy contracts |
| Scene catalog + SYNC | `src/google-home.ts` scene catalog and SYNC handler | `action.devices.SYNC` through `/api/google-home/fulfillment` | projects active Family Log subjects, configured quick actions, Child Journal milestones, PET quick operations and family quick chores as `action.devices.types.SCENE`; custom aliases are merged into the projection | Google integrations feature contracts and alias contract |
| EXECUTE orchestration and replay protection | `src/google-home.ts` EXECUTE handler | `action.devices.EXECUTE` through `/api/google-home/fulfillment` | accepts only allowlisted `ActivateScene` IDs, claims `(provider,request_id,command_key)` in `external_command_receipts`, delegates the actual write to canonical domain adapters, persists SUCCESS/ERROR receipt and safely replays prior result | Google integrations feature contracts |
| Canonical Family Log / chore / Child Journal mutations | domain adapters imported by `src/google-home.ts` from `src/family-external-domain.ts` plus `src/child-journal-google-home.ts` | allowlisted Scene IDs from EXECUTE | Google Home does not own canonical log/journal/chore persistence; it delegates sleep, toilet/diaper, PET quick log, configured Family Log quick action, quick chore and Child Journal milestone recording to their canonical domain owners | Family Log/Child Journal/domain contracts plus Google integrations |
| Fulfillment diagnostics wrapper | `src/google-home-execute-diagnostics.ts#googleFulfillmentWithExecuteDiagnostics()` | `/api/google-home/fulfillment` via `src/public-routes.ts` | calls canonical fulfillment first, then stores only a bounded structural EXECUTE envelope in `activity_logs` after a receipt identifies family/member. Payload text, Scene IDs, param values, OAuth credentials and state are not persisted by this diagnostic | privacy/Google integration diagnostic contracts |
| Settings + diagnostic presentation | `src/google-home.ts#googleHomeSettings()` wrapped by `src/google-home-execute-diagnostics.ts#googleHomeSettingsWithExecuteDiagnostics()` | `/app/settings_google_home.php` via `src/page-routes.ts` | member disconnect; admin alias save, service-account validation and Request Sync; GET diagnostics append privacy-safe latest EXECUTE structure | page-route, alias, request-sync and diagnostic contracts |
| Custom Scene aliases | `src/google-home-aliases.ts` | settings page; merged during scene catalog generation | validates bounded phrases, preserves built-ins, prevents family-level phrase collisions, atomically replaces a scene's custom aliases in `google_home_aliases`; no Google network call occurs during alias edit | `scripts/google-home-aliases-contract.mjs` |
| HomeGraph Request Sync | `src/google-home-request-sync.ts` | admin settings action `request_sync` -> `requestGoogleHomeSyncForFamily()` | locally validates `GOOGLE_HOME_SERVICE_ACCOUNT_JSON`, creates a HomeGraph-scoped service-account JWT, obtains a Google access token and requests sync once for each currently linked member; records only safe status in activity log | Google Home request-sync/service-account contracts |
| Health/readiness | `src/google-home.ts#googleHomeHealth()` plus request-sync readiness helpers | `/__cf/google-home-health` via `src/public-routes.ts`; settings page | reports bounded integration/readiness state without exposing secrets | public integration health/privacy contracts |

## Persistence lineage

- `migrations/0032_wave96_google_home.sql` creates `google_home_authorization_codes`, `google_home_tokens` and the generic replay ledger `external_command_receipts` used with provider `GOOGLE_HOME`.
- `migrations/0071_google_home_aliases.sql` creates family-scoped custom Scene aliases with a `(family_id, phrase_key)` primary key and a scene lookup index.
- `activity_logs` is used for bounded operational evidence such as authorization/SYNC/disconnect/Request Sync and privacy-safe EXECUTE-envelope diagnostics; it is not a raw Google Home payload store.

## Ownership rules

- Google Home is a **request-driven adapter**. Current `src/index.ts` has no Google Home scheduled job. Do not add a cron owner merely because other Google integrations have one.
- Account Linking, LINE Login continuation and HomeGraph Request Sync are distinct flows. `oauth-continuation.ts` authenticates a FamilyToDo member and resumes linking; it does not own Google Home token or fulfillment semantics.
- The linked FamilyToDo member is the trusted recorder identity. Do not infer a speaker/Voice Match identity from a shared Google Home device.
- SYNC publishes SCENE devices only. Do not invent physical device types or stateful QUERY behavior to work around Google console/product constraints.
- EXECUTE is an allowlisted command adapter, not arbitrary NLU. `ActivateScene` parameters do not provide a general free-text/value channel; arbitrary utterance parsing must not be added to this path based on assumptions.
- `external_command_receipts` provides idempotency for Google Home EXECUTE. Do not bypass the claim/result ledger or retry a command by directly calling a canonical write owner.
- Google Home owns protocol validation and dispatch, while Family Log, Child Journal and chore modules own canonical persistence. A new Scene should delegate to an existing canonical owner instead of duplicating its write logic in `google-home.ts`.
- EXECUTE diagnostics deliberately store field presence/counts and bounded command names/keys rather than raw payload text or values. Preserve that privacy boundary when extending diagnostics.
- Alias editing is local catalog metadata. It does not itself call Google; after catalog changes, HomeGraph Request Sync is the explicit propagation path when configured.
- `GOOGLE_HOME_SERVICE_ACCOUNT_JSON` is only for HomeGraph Request Sync. Account Linking OAuth uses the separate Google Home client credentials and remains functional independently of Request Sync configuration.
- `docs/GOOGLE_HOME_VOICE_SETUP.md` contains Wave-by-Wave operational history. Statements from an earlier section can be superseded by later runtime additions such as Request Sync; use current source and this map for ownership decisions.
- A zero-result repository search is not proof that a Google Home component is absent or dead. Require direct route/runtime/build/contract evidence before classifying DEAD.
