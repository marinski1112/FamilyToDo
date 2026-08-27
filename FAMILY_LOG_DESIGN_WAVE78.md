# Family Log domain design — Wave78

## 1. Person model
`members` and `family_log_subjects` serve different purposes.

- `members`: authenticated Family TODO users / LINE identities / task actors.
- `family_log_subjects`: people or pets whose chronological life/care data is recorded.

A subject may have `member_id=NULL` for a baby, child, dependent adult, or pet that has no login.
Later, a human subject can be promoted by linking the same subject row to a real member.

This separation is intentional because a baby or pet must be loggable long before they can have a LINE account.

## 2. Profile modes
The `subject_kind` drives a recommended template, not a hard schema.
Every type remains stored in the generic `family_logs` table and each subject can enable/disable quick-entry items.

- BABY: care + growth
- CHILD: daily care + growth + activity
- ADULT: self/family health and lifestyle log
- PET: feeding / water / toilet / walk / health
- OTHER: minimal generic log

Historical logs survive profile-type changes and item ON/OFF changes.

## 3. Actor semantics
`family_logs.created_by` is the original recorder.
Activity logs record each create/update/delete actor separately.

For BABY/CHILD/PET, linked-task auto completion defaults ON:
- no assignee -> recorder becomes assignee and completion actor
- recorder already assignee -> recorder completion is applied normally
- other assignees exist but recorder is not assigned -> save log, do not mutate task ownership

This is deliberately asymmetric: care work is credited when unambiguous, but task ownership is not silently rewritten.

## 4. Promotion to an authenticated family member
Promotion uses a normal one-time family invitation carrying `family_log_subject_id`.

Join flow:
1. validate invitation
2. validate target subject is active and human-promotable
3. reject stale/already-linked different user before member creation
4. create/reactivate member
5. attach existing subject to the member
6. preserve all historical `family_logs.subject_id`
7. mark invite used
8. write a `PROMOTED` activity log

No historical log migration is needed because the subject primary key is retained.

## 5. Audit model
Admin activity log is the human-readable audit trail.
Lifecycle diagnostics check referential family consistency and stale promotion invitations.
Ambiguous person/profile merges are never automatic.

## 6. Future extensions
- explicit profile merge for a person who registered before promotion
- medicine catalog + dose unit
- growth and lifestyle charts
- custom log types per family
- recurring task -> preconfigured log action
- permissions for private adult logs if the family later needs per-person privacy
