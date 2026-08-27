# Cloudflare Wave77

Version: **12.96.0-wave77**

## Family Log: per-person profiles
- Active Family TODO members are automatically exposed as Family Log subjects.
- Member-linked subjects are kept visible while the member is active.
- Standalone subjects remain available for babies, children, pets, or other people who do not have a Family TODO account.
- Added explicit Family Log screen types:
  - BABY
  - CHILD
  - ADULT
  - PET
  - OTHER

## Per-subject record item ON/OFF
Added `family_log_subjects.enabled_types_json`.

Each subject can choose which quick-entry items are visible:
- milk
- breastfeeding
- meal
- diaper
- sleep
- bath
- temperature
- medicine
- memo

The underlying log feature remains available; the setting controls the subject-specific Family Log UI.

Preset defaults:
- BABY: all baby-care items
- CHILD: meal / sleep / bath / temperature / medicine / memo
- ADULT: sleep / temperature / medicine / meal / memo
- PET: meal / sleep / temperature / medicine / memo
- OTHER: memo / temperature / medicine / sleep

A formula-fed baby can therefore switch Breastfeeding OFF without removing the capability from the application.

## Baby-specific Family Log view
When a subject is configured as BABY, the daily summary is baby-oriented:
- record count
- milk total
- pee count
- poop count
- sleep minutes
- latest temperature

Existing CHILD subjects that already have MILK / BREASTFEED / DIAPER records are automatically promoted to BABY by migration 0018.

## Diaper and bath detail UX
Diaper detail entry now uses direct choice pills:
- pee
- poop
- both

Bath detail also supports:
- bath
- shower

Existing `detail_code` storage is reused.

## Subject settings
A selected subject now has an `対象設定` action:
- edit display name
- choose screen type
- edit birth date
- toggle quick-entry items
- reset to preset recommendations
- hide standalone subjects

Member-linked subjects cannot be hidden from Family Log; stop the member from member management instead.

## Migration
Added:
- `0018_wave77_family_log_profiles.sql`

Latest migration is now 0018.

## Validation
Passed:
- `npx --no-install tsc --noEmit`
- `npm run check:browser-js`
- fresh SQLite migrations 0001–0018
- Wave75/76-style existing CHILD + MILK row upgraded to BABY
- active-member subject auto-sync SQL
- diaper wet/dirty/BOTH aggregation
- `PRAGMA foreign_key_check`
