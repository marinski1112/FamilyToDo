# Wave64 residual analysis

## Fixed in Wave64
- third/fourth single-day task disappearing from calendar month cells
- fixed-height collision between multi-day bands and date numbers
- today circle overlapping/visually touching multi-day bands
- fixed single-day content max-height introduced with Wave61 stable lanes

## Current display policy
- up to 4 multi-day lanes are drawn as horizontal stable bands
- >4 simultaneous multi-day bands become per-day `+N件`
- up to 4 single-day tasks are shown in the date cell
- >4 single-day tasks show `+N件`
- day-detail sheet always contains the complete task list
- week height expands only when that week needs more rows

## Next priorities
1. Consider making the `+N件` indicator an explicit day-detail affordance, although the whole date cell already opens detail.
2. Evaluate a compact overflow sheet for unusually dense weeks instead of unbounded calendar height.
3. Continue recurring exception delete semantics and future-only series edits.
4. Replace message -> shopping prompt with a proper conversion sheet.
5. Continue notification orphan/duplicate lifecycle audit.
6. Consolidate calendar.css after Wave64 is verified on iPhone; old XREA and later Wave override blocks still coexist.
