# Family membership / invitation / member administration function map

This map records the current FamilyToDo family/member ownership boundary. Runtime source on current `main`, migrations, and active regression contracts remain authoritative.

## Classification

| Surface | Class | Canonical owner | Role |
| --- | --- | --- | --- |
| Family create page | ACTIVE | `src/family-onboarding-page.ts#createFamilyPage()` | Server-rendered create/join onboarding UI. |
| Invitation join page | ACTIVE | `src/family-invite-page.ts#invitePage()` | Validate invitation token state and render invite/promotion join UI. |
| Family creation API | ACTIVE | `src/family-create-api.ts#createFamily()` | Create `families`, initial OWNER member, family defaults, and bind session membership. |
| Family join API | ACTIVE | `src/family-join-api.ts#joinFamily()` | Join by family code or invitation; reactivate/update eligible existing member; optionally promote a Family Log subject; bind session membership. |
| Invitation API | ACTIVE | `src/family-invite-api.ts#inviteCreate()` | OWNER/ADMIN invitation create/revoke, token hashing, optional Family Log promotion target. |
| Member settings page | ACTIVE | `src/settings-members-page.ts#settingsMembers()` | OWNER/ADMIN member/profile/invitation administration UI and member-linked Family Log profile editing. |
| Member lifecycle/settings API | ACTIVE | `src/settings-root.ts#settings()` | Current-member profile, notification preference, family timezone, member permission, deactivate/reactivate/delete lifecycle. |
| Family/member route wiring | ACTIVE | `src/context-api-routes.ts`, `src/page-routes.ts` | Dispatch family APIs and onboarding/member-management pages. |
| Family/member regression boundaries | TEST/CONTRACT | `scripts/*family*-boundary-contract.mjs`, `scripts/settings-root-boundary-contract.mjs`, `scripts/regression-manifest.mjs` | Protect retained route/ownership and lifecycle behavior. |

## 1. Family creation owner

`src/family-create-api.ts#createFamily()` owns `POST /api/family/create`.

Requirements and effects:

1. request must be POST;
2. a verified LINE identity must already exist in `ctx.session.lineUserId`;
3. request body is parsed through `src/request-body.ts`;
4. family name is required and bounded to 255 characters;
5. if the LINE user is already an active member, the existing member/family is rebound into the application session instead of creating a duplicate family;
6. otherwise a new `families` row is created with a generated `family_code`;
7. the first `members` row is created as `member_type='ADULT'`, `role='OWNER'`, notifications enabled, and active;
8. initial family settings are created for timezone, week start, and default completion mode;
9. `ctx.session.memberId` / `familyId` are updated and committed through `commitSession()`.

Family creation therefore owns initial family/member persistence, but not LINE identity verification itself. LINE verification remains in the Auth/LIFF boundary.

## 2. Family join owner

`src/family-join-api.ts#joinFamily()` owns `POST /api/family/join`.

A caller may join through either:

- a family code; or
- an invitation token.

The handler requires an existing LINE-authenticated session identity. It does not verify the LINE ID token itself.

### Family-code join

The supplied family code is normalized to uppercase and resolves a current family. A new member created through this path defaults to:

- `member_type='ADULT'`;
- `role='MEMBER'`;
- notifications enabled;
- active.

### Invitation-token join

Invitation tokens are not looked up as plaintext persistence. The submitted token is SHA-256 hashed, then matched against `family_invitations.token_hash` while requiring:

- `used_at IS NULL`; and
- non-expired `expires_at`.

After a successful invitation join, the invitation is marked used with `used_at` and `used_by`.

### Existing/deleted member rules

`joinFamily()` checks the family + LINE user pair before inserting a new member.

- An existing non-deleted member may be reused/updated.
- A member with `deleted_at` is rejected; family join is not a resurrection path for deleted members.
- Session member/family identity is rebound only after the join succeeds.

Do not replace these checks with a generic upsert that can silently revive deleted membership.

## 3. Invitation owner

`src/family-invite-api.ts#inviteCreate()` owns `POST /api/family/invite`.

The API requires:

- authenticated current member;
- POST;
- valid CSRF token from the application session;
- current role `OWNER` or `ADMIN`.

### Create

For create actions:

- expiry is bounded to 1–30 days, default 7;
- a high-entropy raw token is generated;
- only its SHA-256 hash is stored in `family_invitations.token_hash`;
- the raw token is returned to the caller in the invitation URL;
- `created_by`, expiry, family, and optional Family Log subject link are persisted;
- creation is written through the canonical activity-log helper;
- LINE official-account information is returned for invitation guidance when available.

The raw invitation token is therefore transport material, not durable database state.

### Revoke

For revoke actions:

- the invitation must belong to the current family;
- used invitations cannot be revoked;
- revocation is implemented by moving `expires_at` to the current time under `used_at IS NULL`;
- the UPDATE change count must confirm the guarded mutation before success/activity logging is returned.

Revocation does not delete the invitation row.

## 4. Onboarding and invitation page ownership

`src/family-onboarding-page.ts#createFamilyPage()` renders the create/family-code-join UI and points forms at:

- `/api/family/create`
- `/api/family/join`

`src/family-invite-page.ts#invitePage()` owns invitation-link rendering. It hashes the supplied token, validates invitation usage/expiry, validates any linked active Family Log subject, and renders the join form.

Current page aliases are dispatched by `src/page-routes.ts`:

- `/app/create.php`, `/app/create`
- `/family/create.php`, `/family/create`
- `/app/join.php`, `/app/join`
- `/family/join.php`, `/family/join`

These aliases are current routed surfaces. Do not classify them as dead merely because multiple URL forms reach the same page handler.

## 5. Family Log promotion bridge

Family membership owns the **promotion transaction**, while Family Log remains owner of ordinary subject/log semantics.

An invitation may carry `family_log_subject_id`. `inviteCreate()` only accepts an active subject in the same family that:

- is not already bound to a member; and
- has subject kind `BABY`, `CHILD`, or `ADULT`.

Before member creation/reactivation, `joinFamily()` revalidates the promotion target so stale or conflicting links do not leave a half-created membership.

Important promotion rules:

- `PET` and `OTHER` subjects are not promotable to LINE family membership;
- existing bindings to another LINE member are rejected;
- an existing LINE account already linked to another Family Log profile is not automatically merged;
- promoted `BABY`/`CHILD` subjects produce a `CHILD` member type; `ADULT` produces `ADULT`;
- after membership succeeds, the Family Log subject is linked through `member_id` and its name is synchronized;
- activity evidence records the promotion source and invitation id;
- invitation usage is finalized in the same post-validation completion phase.

Do not move ordinary Family Log CRUD into this membership owner. This bridge exists only for registration/promotion identity linking.

## 6. Member administration owner

Member administration is split intentionally between two current owners.

### `src/settings-members-page.ts#settingsMembers()`

This is the dedicated OWNER/ADMIN server-rendered family-member administration page at `/app/settings_members.php`.

It owns:

- member/invitation listing UI;
- invitation history/status display;
- member-linked optional profile editing;
- Family Log subject creation-on-demand for a member profile when needed;
- AI-personalization consent fields and optimistic permission-snapshot conflict checking for that member-linked profile.

The member-linked profile data remains stored in `family_log_subjects`; membership UI does not create a second profile store.

### `src/settings-root.ts#settings()`

`POST /api/settings` owns the current member-lifecycle mutations:

- current member display-name update;
- current member notification preference;
- OWNER/ADMIN family timezone update;
- OWNER/ADMIN `MANAGE_QUICK_CHORES` capability grant/revoke in `member_permissions`;
- OWNER/ADMIN member active toggle;
- OWNER/ADMIN member delete lifecycle.

There is no current generic role-edit action in this handler. Do not document an admin role-escalation flow that source does not implement.

## 7. Member deactivate/reactivate/delete semantics

These operations are not equivalent.

### Deactivate

For `member_toggle` active -> inactive:

- pending/retry notifications for that member are cancelled;
- task/item/shopping assignee links are removed;
- task/item/shopping completion rows owned by that member are removed;
- task and item completion status is recalculated against remaining active assignees;
- activity log records `MEMBER_DEACTIVATED`.

A non-deleted inactive member may later be reactivated through the same admin action.

### Reactivate

`member_toggle` inactive -> active is permitted only when `deleted_at` is not set and records `MEMBER_REACTIVATED`.

### Delete

`member_delete` performs a soft member deletion:

- pending/retry notifications are cancelled;
- assignee/completion links are removed;
- `members.active=0`;
- `notification_enabled=0`;
- `deleted_at` is set;
- activity log records `MEMBER_DELETED`.

The member row is retained. A deleted member cannot be reactivated through `member_toggle`, and `joinFamily()` also rejects deleted membership rather than implicitly recreating it.

### Safety rules

For toggle/delete:

- the target must belong to the current family;
- the current caller must be OWNER/ADMIN;
- the caller cannot target themselves through these actions;
- a target OWNER cannot be toggled/deleted by this path.

These lifecycle restrictions are part of the canonical membership contract.

## 8. Permission ownership

`member_permissions` is used here for the explicit `MANAGE_QUICK_CHORES` capability.

`src/settings-root.ts` owns grant/revoke of that capability and requires OWNER/ADMIN. This is distinct from the coarse `members.role` field.

Do not conflate:

- role (`OWNER` / `ADMIN` / `MEMBER`), and
- explicit capability rows in `member_permissions`.

Likewise, per-domain authorization remains with the consuming domain. Membership administration does not globally replace task visibility, Family Log authorization, Location sharing consent, notification ownership, or Google integration permissions.

## 9. Persistence boundaries

Current membership state spans these active stores:

- `families` — family identity/name/code and family-level state;
- `members` — LINE-linked member identity, member type, coarse role, active/deleted state, notification flag;
- `family_settings` — initial/default family configuration written at creation;
- `family_invitations` — hashed invitation identity, creator, expiry, usage, optional Family Log promotion target;
- `member_permissions` — explicit member capabilities such as `MANAGE_QUICK_CHORES`;
- `family_log_subjects.member_id` — optional bridge between a Family Log subject and a real family member;
- `activity_logs` — bounded lifecycle/audit evidence, not canonical membership state.

The base `families` / `members` / `family_invitations` tables are present in the D1 schema lineage. Later migrations extend current member/invitation/profile semantics; migration files remain schema history and are not replaced by this map.

## 10. Auth/session boundary

The Auth function map owns:

- LINE/LIFF identity verification;
- encrypted application-session mechanics;
- active-member hydration;
- logout;
- CSRF token carriage.

Family membership consumes those primitives but owns membership mutations.

Concrete boundary examples:

- `createFamily()` / `joinFamily()` require `ctx.session.lineUserId` but do not verify a LINE ID token;
- create/join commit the newly resolved `memberId` / `familyId` back into the session;
- invitation/admin mutations perform their own current-member role and CSRF checks;
- `makeContext()` accepting a current active member does not authorize every family administration action.

## 11. Scheduling boundary

Family creation, joining, invitation creation/revocation, and member administration are request-driven. `src/index.ts#scheduled()` has no family-membership maintenance job.

Invitation expiry is enforced when invitations are read/used and revoke is represented by expiring the row. Do not invent a scheduled invitation-deletion owner.

## 12. Active regression contracts

Current active regression coverage includes:

- `scripts/family-create-api-boundary-contract.mjs`
  - pins family creation ownership, OWNER bootstrap, defaults, session binding, and `/api/family/create` routing.
- `scripts/family-join-api-boundary-contract.mjs`
  - pins code/token join, hashed token lookup, deleted-member protection, Family Log promotion validation/linking, invitation usage, session binding, and `/api/family/join` routing.
- `scripts/family-invite-api-boundary-contract.mjs`
  - pins authenticated OWNER/ADMIN + CSRF creation/revoke flow, token hashing, bounded expiry, atomic revoke guard, Family Log promotion targeting, activity logging, and route wiring.
- `scripts/family-onboarding-page-boundary-contract.mjs`
  - pins retained create/join page ownership.
- `scripts/family-invite-page-boundary-contract.mjs`
  - pins invitation page ownership and invite/promotion rendering behavior.
- `scripts/settings-members-page-boundary-contract.mjs`
  - pins the dedicated member-admin page boundary.
- `scripts/member-profile-foundation-contract.mjs`
  - protects member-linked profile and consent foundations.
- `scripts/settings-root-boundary-contract.mjs`
  - pins `/api/settings` member permission/toggle/delete cleanup and retained settings ownership.
- `scripts/context-api-route-dispatcher-contract.mjs` and `scripts/page-route-dispatcher-contract.mjs`
  - protect API/page route dispatch ownership.

These are TEST/CONTRACT artifacts, not duplicate runtime owners.

## 13. Explicit non-owners / adjacent domains

Do not collapse these into family membership:

- application login/session/CSRF primitive ownership — `AUTH_FUNCTION_MAP.md`;
- ordinary Family Log subject/log/media/journal behavior — Family Log / Child Journal owner maps;
- notification generation/delivery — `NOTIFICATION_FUNCTION_MAP.md`;
- task/item/shopping business ownership — their domain maps; membership lifecycle only performs bounded cleanup required by member deactivation/deletion;
- Google Home/Calendar/Tasks OAuth and integration state — dedicated Google owner maps;
- Location device identity/sharing/route access — Location/config owner boundaries;
- LINE webhook verification — webhook integration boundary.

## 14. Cleanup invariants

Before deleting, merging, or moving a family/member-looking artifact:

1. prove page/API/import/static-asset/contract reachability from current `main`;
2. preserve both family-code and invitation-token join paths unless deliberately migrated;
3. never persist or log raw invitation tokens where the current contract stores only a hash;
4. preserve invitation family scoping, expiry, one-use semantics, and guarded revoke behavior;
5. preserve deleted-member non-resurrection rules;
6. preserve OWNER protection and current-caller self-target restrictions for member lifecycle mutations;
7. preserve member deactivation/delete cleanup of notifications, assignments, completions, and dependent completion status;
8. preserve Family Log promotion validation before membership creation/reactivation;
9. do not auto-merge conflicting Family Log/member identities;
10. do not invent role-management, scheduled invitation cleanup, or central authorization owners absent from current source;
11. retain active route aliases and contracts until their callers are deliberately migrated;
12. treat incomplete reachability evidence as UNKNOWN, not DEAD.
