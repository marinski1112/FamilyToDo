# Wave63 residual analysis

## Fixed in this wave

### Calendar silent interaction failure
Wave62 rendered the calendar HTML correctly but the calendar controller failed to parse in the browser. The newly added reorder code used an invalid declaration-style destructuring target containing member expressions. Because the browser program was embedded as a string inside `src/app.ts`, `tsc --noEmit` only checked the TypeScript outer template and could not detect the browser JavaScript syntax error.

Wave63 fixes the offending swap logic and moves the calendar controller to `public/assets/calendar.js`, which can be checked directly with `node --check`. This materially reduces future LINE WebView regressions caused by render-time escaping or inline script syntax.

## Structural improvement
- Calendar HTML/data stay server-rendered.
- Calendar behavior lives in a static browser asset.
- Dynamic values are passed only through JSON (`calendarPayload`).
- The browser asset sets `data-calendar-js=ready` on successful initialization and `error` if runtime initialization throws.

## Next priorities
1. Validate Wave62 reorder functionality after the calendar controller fix.
2. Validate recurring occurrence -> normal task conversion on production D1, including shopping/items/completion inheritance.
3. Convert remaining large inline page scripts (recurring/settings/messages where practical) into static assets after behavior stabilizes.
4. Replace message -> shopping prompt with a proper conversion sheet.
5. Define exception deletion semantics and future-only recurrence edits.
6. Continue notification orphan/duplicate lifecycle audit.
7. Continue SQL schema-reference audit; Wave62 already found invalid `shopping_items.group_key` references.
8. Consolidate calendar CSS only after the multi-day band layout and reorder UI are confirmed stable.

## Validation commands
```bash
npx --no-install tsc --noEmit
node --check public/assets/calendar.js
npm run check:calendar-js
```

No migration is required.
