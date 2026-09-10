-- Family-scoped home-screen branding for PWA/Safari installs.
-- Icon bytes remain private in R2; D1 stores only display metadata/state.
ALTER TABLE families ADD COLUMN pwa_display_name TEXT;
ALTER TABLE families ADD COLUMN pwa_icon_updated_at TEXT;
