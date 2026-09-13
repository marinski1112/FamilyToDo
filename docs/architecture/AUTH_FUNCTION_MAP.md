# Auth / Session / Login / CSRF function map

This map records the current FamilyToDo application-authentication boundaries. Runtime source on current `main` remains authoritative.

## Classification

| Surface | Class | Canonical owner | Role |
| --- | --- | --- | --- |
| Application session cookie | ACTIVE | `src/session.ts` | Encrypt/decrypt the signed-in application session and read/commit the `family_line_cf` cookie. |
| Request auth context | ACTIVE | `src/app-context.ts` | Open the application session and hydrate the current active member. |
| Login page | ACTIVE | `src/login-page.ts` | Render the LINE/LIFF login bootstrap page and validate the requested post-login target. |
| Login page export boundary | ACTIVE | `src/auth-page-handlers.ts` | Retained page-handler boundary for the login page; not the session or authentication owner. |
| LIFF login POST | ACTIVE | `src/liff-login.ts#liffLogin()` | Verify the LINE ID token, bind the matching active member/family when present, mint a CSRF token when absent, and commit the application session. |
| Logout | ACTIVE | `src/exception-routes.ts#logout()` | Clear the application session cookie and redirect to `/login.php`. |
| Auth health | ACTIVE | `src/auth-health.ts#authHealth()` | Privacy-safe presence/status diagnostics only; it is not an authentication or authorization gate. |
| CSRF validation | ACTIVE / distributed | Mutation handlers | Compare request body/header CSRF values with `ctx.session.csrfToken`; there is no single central CSRF middleware owner in the current runtime. |
| Auth regression boundaries | TEST/CONTRACT | `scripts/*-boundary-contract.mjs`, `scripts/regression-manifest.mjs` | Protect retained login/LIFF/context/route wiring. |

## 1. Application session owner

`src/session.ts` is the canonical application-session primitive.

- Cookie name: `family_line_cf`.
- `sealSession()` encrypts serialized `SessionData` using AES-GCM with a key derived from `APP_SECRET`.
- `openSession()` decrypts and parses the cookie. Missing, malformed, undecryptable, or expired input becomes a fresh session object rather than an authenticated session.
- Session maximum age is 14 days.
- `commitSession()` refreshes `iat`, seals the session, and emits `HttpOnly; Secure; SameSite=Lax; Path=/` with the session Max-Age.
- `getSessionCookie()` only extracts the application cookie from the request.

`SessionData` in `src/types.ts` currently carries optional member/family/LINE identity, optional `csrfToken`, optional auth redirect attempt state, and `iat`.

This is a cookie-carried encrypted application session. No D1-backed application-session table is the owner of this flow.

## 2. Request context and active-member hydration

`src/app-context.ts#makeContext()` is the canonical request-context bridge:

1. read `family_line_cf` through `getSessionCookie()`;
2. open it with `APP_SECRET` through `openSession()`;
3. if `session.memberId` exists, resolve it through `memberById()`;
4. accept only an active member joined to its family;
5. return request, environment, session, current member, and optional execution context.

A decrypted cookie containing a stale/inactive member id therefore does not by itself make `ctx.member` valid.

`src/index.ts#fetch()` creates this context after public and early-authenticated route dispatch, then passes it to context API/page/fallback dispatchers. Domain handlers still own their own authorization rules; `makeContext()` does not replace per-domain tenant/role/visibility checks.

## 3. LINE / LIFF application login

### Login page

`src/login-page.ts#loginPage()` renders the retained login page. It:

- validates the requested `next` target with `validateLiffNext()`;
- embeds the configured LIFF ID and safe next target;
- loads the LINE LIFF SDK and `/assets/liff-auth.js`.

`src/auth-page-handlers.ts` re-exports `loginPage()` as the retained page boundary. It is not the owner of session cryptography or LINE token verification.

### LIFF login POST

`src/liff-login.ts#liffLogin()` owns the application login mutation at:

- `/app/api/liff_login.php`
- `/app/api/liff_login`

The route is dispatched by `src/exception-routes.ts#dispatchContextPreludeRoute()`.

The handler:

1. accepts POST only;
2. parses the request body through `src/request-body.ts`;
3. requires an LINE ID token and configured `LINE_CHANNEL_ID`;
4. verifies the token through `verifyLineIdToken()`;
5. stores the verified LINE user/display identity in the application session;
6. creates `ctx.session.csrfToken` with `crypto.randomUUID()` only when one is not already present;
7. resolves an active `members.line_user_id` match;
8. binds or clears session member/family identity accordingly;
9. validates the requested next target;
10. commits the encrypted application session through `commitSession()`.

An existing active member is redirected to the safe requested target or `/app/index.php`; an unbound LINE identity is directed to `/family/create.php`.

## 4. Logout lifecycle

`src/exception-routes.ts#logout()` is the current logout owner for:

- `/logout.php`
- `/logout`

It expires `family_line_cf` with `Max-Age=0` using the same Path/HttpOnly/Secure/SameSite attributes and redirects to `/login.php`.

Logout is cookie invalidation. There is no application-session database row to revoke in this flow.

## 5. CSRF ownership is distributed, not middleware-owned

The CSRF secret is session state: `SessionData.csrfToken`.

Current login establishes it in `liffLogin()` when absent. Mutation handlers then validate the submitted value against `ctx.session.csrfToken`. For example, `src/task-api.ts#taskApi()` validates:

- the `x-csrf` request header for DELETE; and
- `body.csrf` for POST.

Therefore the architectural rule is:

> Do not invent or document a central CSRF middleware owner. The session carries the token; each current mutation boundary that requires CSRF owns its request-specific extraction and comparison.

When changing a mutation endpoint, its current CSRF contract must be read directly before modifying it. A repository search result alone is not proof that another endpoint is protected or unprotected.

## 6. Routing and unauthenticated behavior

`src/index.ts#fetch()` dispatch order relevant to application auth is:

1. `dispatchPublicRoute()`;
2. `dispatchEarlyAuthenticatedRoute()`;
3. `makeContext()`;
4. `dispatchContextPreludeRoute()`;
5. context API/page/fallback routes.

`AuthRequired` is translated centrally by `src/index.ts`: API-style paths receive a 401 JSON response; browser pages are redirected to a validated `/login.php?next=...` target.

The recurring page is an explicit early-authenticated exception in `src/exception-routes.ts`; it builds context before the ordinary context flow and redirects an unauthenticated browser to login.

`/__cf/auth-health` is a public diagnostic route that constructs an `AppContext` and returns booleans such as session/LINE/member/family/CSRF presence. It does not return session-cookie contents, CSRF token values, LINE user IDs, or application secrets.

## 7. Scheduling / persistence boundary

Application login/session/logout/CSRF are request-driven. `src/index.ts#scheduled()` contains no application-auth session maintenance job.

The application session itself is not persisted in D1 by `src/session.ts`; current-member hydration reads the existing `members`/`families` domain data. Those tables belong to family/member domain ownership, not to a separate session store.

## 8. Explicit non-owners / adjacent integrations

Do not collapse these into this application-auth owner map:

- **Family creation, joining, invitations, member administration** — family/member domain. They consume authenticated context but own their own membership and authorization semantics.
- **Google Home Account Linking** — `src/google-home.ts` plus LINE continuation support in `src/oauth-continuation.ts`; separate OAuth credential/token/authorization-code lifecycle.
- **Google Calendar OAuth** — Google Calendar integration owner map and source.
- **Google Tasks OAuth** — Google Tasks integration owner map and source.
- **OwnTracks/Overland device authentication** — Location ingestion/device-auth domain, not the browser application session.
- **LINE webhook verification** — webhook transport/integration boundary, not LIFF browser login.
- **Per-domain authorization** — tenant, role, privacy, visibility, ownership, and capability checks remain with each domain handler even after `ctx.member` exists.

## 9. Active regression contracts

The current regression manifest keeps these auth-boundary checks active:

- `scripts/login-page-boundary-contract.mjs`
  - pins `auth-page-handlers.ts -> login-page.ts` ownership and retained LIFF bootstrap behavior.
- `scripts/liff-login-boundary-contract.mjs`
  - pins LINE token verification, active-member lookup, CSRF creation, safe next target, session commit, body compatibility, and route wiring.
- `scripts/app-context-boundary-contract.mjs`
  - pins session/context/member hydration, auth-health boundary, public-route wiring, and Worker entrypoint consumption.
- `scripts/liff-entry-boundary-contract.mjs`
  - protects the LIFF entry/continuation boundary.
- `scripts/exception-route-dispatchers-contract.mjs`
  - protects exception-route dispatch structure including retained auth-adjacent routing.
- `scripts/public-route-dispatcher-contract.mjs`
  - protects public dispatcher wiring including auth health and external auth callbacks.
- `scripts/index-entrypoint-final-contract.mjs`
  - protects final Worker dispatch ownership/order.

`package.json` also includes `/assets/liff-auth.js` in `check:browser-js` and exposes `check:liff-js` for syntax validation.

## 10. Cleanup invariants

Before deleting, merging, or moving an auth-looking artifact:

1. prove route/import/static-asset/contract reachability from current `main`;
2. preserve the `family_line_cf` compatibility contract unless all callers are migrated deliberately;
3. preserve safe `next` validation at browser-login boundaries;
4. preserve LINE ID-token verification before assigning LINE/session identity;
5. preserve active-member revalidation rather than trusting `memberId` from cookie state alone;
6. preserve CSRF validation at each mutation boundary that currently owns it;
7. never log or expose cookie ciphertext, plaintext session contents, CSRF token values, LINE tokens, `APP_SECRET`, or OAuth credentials;
8. do not classify OAuth callbacks, LIFF routes, logout compatibility routes, or webhook/device auth as DEAD from filename/search evidence alone.
