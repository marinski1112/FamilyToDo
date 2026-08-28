# Google Tasks voice-command inbox (Wave116)

Google Tasks created without a marker continue to import as ordinary private/shared Family TODO tasks. A title beginning with `FT`, `Family TODO`, or `ファミリーTODO` is instead parsed deterministically; the sync never calls Gemini.

Supported in Wave116:

- `FT 買い物 牛乳` → quantity 1
- `FT 買い物 牛乳 2` → quantity 2

For an initial device check, try asking Google Home to create a task whose title is exactly “FT 買い物 牛乳” (for example, 「『FT 買い物 牛乳』というタスクを作って」). Assistant/device behavior and the stored title are not guaranteed; inspect the Google Tasks title and Family TODO result after returning home. A successfully handled source task may remain in Google Tasks because Wave116 does not use the write API to complete or delete it.

A marker with a missing item or unsupported syntax is retained as `NEEDS_REVIEW`; it never creates an empty shopping item and never falls back to an ordinary task. BABY/PET numeric commands are represented by the typed `FAMILY_LOG_RECORD` schema for future work but are not executed in Wave116. PET subject omission is never inferred.
