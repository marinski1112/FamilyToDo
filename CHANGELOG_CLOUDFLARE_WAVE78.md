# Cloudflare Wave78

Version: **12.97.0-wave78**

## Family Log profile templates
Family Log is now explicitly a family-wide logging domain, not only a baby log.

Default templates:
- BABY: milk / breastfeeding / meals / diaper / sleep / bath / temperature / medicine / height / weight / condition / memo
- CHILD: meals / toilet / sleep / bath / temperature / medicine / height / weight / condition / exercise / memo
- ADULT: condition / sleep / exercise / weight / blood pressure / temperature / medicine / meals / bath / memo
- PET: meals / water / toilet / walk / sleep / bath / weight / medicine / condition / memo
- OTHER: memo / condition / temperature / medicine / sleep / weight

Each subject still owns its own ON/OFF list. Applying a preset only changes the enabled quick-entry list; historical records are not deleted.

## Recorder -> linked task completion
`family_log_subjects.auto_complete_linked_task` is added.

Default:
- BABY / CHILD / PET: ON
- ADULT / OTHER: OFF

When a care-profile log is saved with a linked normal task or recurring occurrence:
- the currently logged-in family member is the completion actor
- if the linked task has no assignee, the recorder is added as assignee
- if the task already has assignees and the recorder is not one of them, the task is not mutated and the user is told why
- task `ANY` / `ALL` semantics remain authoritative
- Event rows remain non-completable
- activity log metadata records `source: family_log`

This preserves task semantics while making care logs auditable as actual work performed by the recorder.

## Family activity log
The admin activity-log page now renders Family Log records with:
- action
- log type
- subject
- logger/editor
- record time
- detail / amount / duration / value

Task completion caused from Family Log carries a `家族ログから` source badge.

## Future child/adult LINE promotion
Migration 0019 adds `family_invitations.family_log_subject_id`.

For an unlinked BABY / CHILD / ADULT profile, an admin can issue `LINE本登録へ招待`.
After the invitee joins:
- the existing `family_log_subjects.id` is linked to the new `members.id`
- past Family Log rows keep the same `subject_id`
- no duplicate historical person record is created
- the invitation is marked used
- a `PROMOTED` activity-log entry is recorded

PET profiles are intentionally not promotable.

Promotion preflight validates stale/duplicate links before creating a new member. An existing LINE member with a different Family Log profile is rejected rather than silently merging two people.

## Lifecycle diagnostics
Added audit-only checks for:
- Family Log subject/member cross-family or missing links
- Family Log record/timer subject mismatches
- active LINE-promotion invitations pointing to disabled/missing/already-promoted subjects

Ambiguous data is not auto-repaired.

## Validation
- `npx --no-install tsc --noEmit`
- `npm run check:browser-js`
- fresh SQLite migrations 0001–0019
- upgrade 0001–0018 -> 0019 with BABY/CHILD/ADULT/PET/OTHER rows
- care-profile task completion smoke test
- promotion history continuity smoke test
- diagnostic SQL smoke test
- `PRAGMA foreign_key_check`

## Migration
New migration:
`0019_wave78_family_log_templates_and_promotion.sql`
