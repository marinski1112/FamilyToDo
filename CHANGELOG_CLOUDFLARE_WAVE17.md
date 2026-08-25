# Family TODO LINE Cloudflare D1 Wave17

## Calendar interaction
- Month calendar no longer prints holiday names inside each day cell; holiday name remains in the selected-day detail/modal.
- Calendar day numbers are explicitly top/left aligned.
- Month swipe remains enabled for left/right month navigation.
- Selected-day detail now has previous/next day buttons.
- Selected-day detail supports left/right swipe to move one day at a time.
- Holiday names remain visible in the selected-day detail only.

## Daily pages
- Today/tomorrow section add buttons use a neutral gray treatment for better contrast and consistency.

## Input sizing
- Existing Wave16 date/time/datetime-local width fix is retained.

## LIFF entry URLs
Use the single LIFF endpoint with `next`:
- `/liff?next=%2Ftoday.php`
- `/liff?next=%2Ftomorrow.php`
- `/liff?next=%2Fapp%2Fcalendar.php`
- `/liff?next=%2Fapp%2Fshopping.php`
- `/liff?next=%2Fapp%2Fmessages.php`
- `/liff?next=%2Fapp%2Fsettings.php`

## Verification
- `npx tsc --noEmit` completed without TypeScript diagnostics in the current source tree.
