# Family TODO LINE — Wave60 residual analysis

## P0 — calendar / production behavior

1. **Day detail and month swipe**
   - Wave59 functionality was present but the rendered inline script could fail before registering any event listeners.
   - Wave60 fixes the render-time JavaScript parsing issue and adds native touch fallback for LINE iOS WebView.
   - Validate on device before layering additional gesture complexity.

2. **Stable multi-day task bands**
   - Current Worker calendar repeats a task segment inside each individual day cell.
   - The later XREA calendar assigned tasks to stable lanes and rendered one bar spanning the relevant weekday columns of each week.
   - This remains the highest visual-parity gap after tap/swipe is confirmed.

3. **Day-detail reorder**
   - XREA day detail implemented task reorder and posted IDs to `/app/api/reorder.php`.
   - The Worker route exists but calendar day detail does not currently expose a reliable mobile reorder UI.
   - Do not copy HTML5 desktop drag-and-drop directly for iPhone; use explicit up/down controls or a touch-safe sortable interaction.

4. **Calendar task detail parity**
   - Keep task check, task detail link, linked item/shopping summary, holiday display, add FAB, and date navigation coherent in one sheet.
   - Day-detail state should refresh after edit/completion without requiring a full month reload where practical.

## P1 — recurring-task lifecycle

1. One occurrence -> normal task exception must be tested end-to-end.
2. Verify exception conversion preserves/handles linked shopping and items deliberately.
3. Verify recurring edit propagation rules: future occurrences vs one date only.
4. Verify delete/toggle cancels or archives any scheduled notification work tied to removed future occurrences.
5. Audit orphan protection across template task, recurrence_rules, recurrence_occurrences and completion tables.

## P1 — task / today / tomorrow

1. Current Worker has richer task-linked shopping/items than early XREA, but UI density is inconsistent.
2. Normalize create/edit/view fields so all support the same date/time/location/calendar/reminder/completion/assignee semantics.
3. Review completion metadata (who/when) presentation; old XREA pages surfaced completion information explicitly in several lists.
4. Add a touch-friendly day reorder entry point once calendar reorder behavior is decided.

## P1 — shopping

1. Wave53 simplified the list substantially; continue compact-detail design.
2. Category management and free-input coexistence should be consistent between create/edit/batch flows.
3. Expired/completed lifecycle should have one clear archive/history model instead of multiple visually different sections.
4. Ensure task-linked shopping does not duplicate or disappear when recurring occurrences are converted.

## P1 — messages

1. Message-to-task is now much richer than the old prompt flow, but message edit UI should be a proper modal/sheet rather than browser prompts anywhere they still remain.
2. Message-to-shopping conversion should support the same richer fields/target-task choices as normal shopping creation where useful.
3. Converted message relationships should remain visible after the target task/shopping item is edited or deleted; define whether the message keeps an archived conversion reference or returns to convertible state.

## P1 — family / invite / settings

1. Invitation creation now discovers LINE official-account ID when possible, but active invite list/revoke/expiry management still needs a coherent UI.
2. Add explicit invitation state: active, expired, revoked, used/accepted where schema supports it.
3. Settings should separate normal-member self settings from OWNER/ADMIN family administration more clearly.
4. Activity log retention and UI should match the intended one-month lifecycle rather than only a fixed display limit.

## P1 — notifications

1. Confirm all task/message/recurrence edit/delete paths cancel obsolete pending/retry notifications.
2. Confirm rescheduling creates exactly one current notification and does not leave retry garbage.
3. Add a user-facing diagnostic/status view only if operationally useful; avoid exposing internal IDs unnecessarily.

## P2 — UI/design consistency

1. Standardize bottom-sheet/modal behavior, close buttons, safe-area spacing, FAB positions and touch targets.
2. Standardize compact list rows: primary label first, secondary metadata hidden behind detail where possible.
3. Use one form pattern for conditional fields (all-day/time, calendar/color, recurrence-specific inputs).
4. Avoid inline `alert()/prompt()` as the primary editing UI.
5. Maintain LINE iOS WebView compatibility: native touch fallbacks, no fragile inline-script escape sequences, no hover-only actions.

## P2 — CSS / repository cleanup (“garbage”)

### calendar.css
- The file currently contains both old XREA-oriented `.cal/#calBody/.week/.week-bars` rules and newer `.calendar-grid/.calendar-cell` rules.
- Numerous later Wave overrides repeat the same selectors with `!important`.
- This is now a regression risk: old and new layout systems coexist even though only one is rendered.
- After multi-day lane rendering is finalized, consolidate into one calendar layout system and delete obsolete duplicate blocks.

### Historical docs
- Repository root contains many `CHANGELOG_CLOUDFLARE_WAVE*.md`, `MIGRATION_PROGRESS_WAVE*.md`, and residual-analysis files.
- They are useful audit history but create noise.
- After feature stabilization, move historical files to `docs/history/` or generate a consolidated history file. Do not delete migration SQL.

### Compatibility routes
- PHP-looking route aliases are still intentionally useful for old bookmarks/LINE links during migration.
- Do not classify them as garbage until access logs and invite/LIFF flows show they are no longer needed.

### Schema transitional tables
- Multiple completion/history/archive tables are intentionally preserving lifecycle information.
- Do not drop them merely for tidiness. First document the canonical write/read path and prove old tables are unused.

## P2 — engineering audits

1. Parser-aware SQL placeholder count vs `.bind()` count audit across all D1 statements.
2. Rendered inline-script syntax audit, not only TypeScript compilation.
3. Route coverage audit: every visible button should have an endpoint and every write endpoint should have UI or documented internal use.
4. Orphan-data audit after delete/conversion flows.
5. Session/login redirect loop guard and error-page fallback review.
