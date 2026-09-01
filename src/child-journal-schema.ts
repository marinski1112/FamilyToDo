type ChildJournalSchemaStatus = {
  foundation: boolean;
  calendar: boolean;
};

const FOUNDATION_TABLES = ['family_log_journal_entries'] as const;
const CALENDAR_TABLES = [
  'child_journal_calendar_accounts',
  'child_journal_calendar_links',
  'child_journal_calendar_outbox',
] as const;

async function existingTables(db: D1Database, names: readonly string[]): Promise<Set<string>> {
  const placeholders = names.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`)
    .bind(...names)
    .all<{name?: string}>();
  return new Set(rows.results.map(row => String(row.name || '')).filter(Boolean));
}

export async function childJournalSchemaStatus(db: D1Database): Promise<ChildJournalSchemaStatus> {
  const names = [...FOUNDATION_TABLES, ...CALENDAR_TABLES];
  const existing = await existingTables(db, names);
  return {
    foundation: FOUNDATION_TABLES.every(name => existing.has(name)),
    calendar: CALENDAR_TABLES.every(name => existing.has(name)),
  };
}

export async function childJournalFoundationReady(db: D1Database): Promise<boolean> {
  return (await childJournalSchemaStatus(db)).foundation;
}

export async function childJournalCalendarReady(db: D1Database): Promise<boolean> {
  return (await childJournalSchemaStatus(db)).calendar;
}
