# Family TODO LINE Cloudflare Wave37

- TODAY/TOMORROW: replace task/member aggregate JOIN with a correlated assignee subquery to avoid D1 SQL parser/grouping edge cases that caused HTTP 500 around `makeViewData`.
- TODAY/TOMORROW: recurring template rows are explicitly excluded from the ordinary task query; occurrence rows remain supplied by the recurrence layer.
- Calendar: delegated pointer interaction hardened. Tap opens every date including empty dates; horizontal swipe changes month; dynamic cells remain interactive.
- Calendar: native button chrome/tap behavior reset and day number forced to top-left.
- Cache/version: family.css and calendar.css bumped to `12.56-wave37`.
- No D1 migration added.
- Deploy remains `npm run deploy`.
