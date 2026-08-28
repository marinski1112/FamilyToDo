# Cloudflare Wave119 — 12.138.0-wave119

- LIFF primary redirect (`liff.state`) now always reaches the SDK bootstrap; the post-`liff.init` URL is authoritative for deep links and Google Home continuation.
- Google Home linking confirms the committed Family TODO session once and shows a terminal error instead of restarting an authentication loop.
- Calendar days without multi-day bands use a 29px mobile content anchor, while banded days retain the Wave118 per-day formula; jump controls are compact and labelled 「移動」.
- BABY Family Log presets now record milk, diaper, baby food, bath, and vomiting in one tap. Sleep keeps the existing start/stop timer, and 「その他」 retains the editable modal.
- `quick_record` validates family ownership, active BABY kind, enabled types, configured milk presets, and writes server time without task links. No migration is required.
