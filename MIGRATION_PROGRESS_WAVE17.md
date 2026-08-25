# Wave17 migration progress

## Implemented in this wave
- [x] Calendar holiday names hidden from month grid; retained in selected-day detail.
- [x] Calendar day numbers top/left aligned.
- [x] Calendar month left/right swipe retained.
- [x] Calendar selected-day previous/next navigation buttons.
- [x] Calendar selected-day left/right swipe.
- [x] Today/tomorrow add buttons changed to neutral gray treatment.
- [x] Wave16 date/time input sizing retained.

## Remaining parity work
- [ ] Full original-source visual parity audit across all six bottom-nav pages.
- [ ] Calendar multi-day task/event visual spanning parity with the original UI.
- [ ] Calendar selected-day detail polish: preserve selection state when crossing month boundaries and refine transition behavior.
- [ ] Shopping full parity audit: batch registration, URL, category/free-input, quantity, expiry, assignees, task linkage, sorting and edit flows.
- [ ] Task full parity audit: all original fields, recurrence linkage, assignees, completion semantics and edit flows.
- [ ] Message full parity audit: recipient, conversion-to-task and reminder lifecycle.
- [ ] Recurrence full parity audit: 1st-5th weekday selection, occurrence handling and calendar visibility.
- [ ] Notification reliability audit: duplicate prevention, retry/error visibility and cron boundary behavior.
- [ ] Settings/member/content screens visual and behavior parity.
- [ ] XREA-only ad behavior intentionally remains excluded from Cloudflare unless a replacement is requested.
