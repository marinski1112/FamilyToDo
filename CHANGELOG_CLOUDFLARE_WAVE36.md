# Cloudflare D1 Wave36

- Calendar date tap handling hardened with delegated touch/pointer/click events.
- Calendar month swipe now has one authoritative gesture handler and ignores tap-after-swipe.
- Calendar floating task-add button made explicitly clickable and kept above the bottom navigation.
- Calendar date numbers forced to top-left alignment on mobile and desktop.
- Cache-busting version bumped to 12.55-wave36.
- No new D1 migration. Wave34/35 migrations remain unchanged.
- Retains task-only model; legacy event data is not reintroduced.
