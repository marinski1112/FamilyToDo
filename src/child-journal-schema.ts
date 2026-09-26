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
  // sqlite_master has no useful name index in D1: this check ran every five
  // minutes and scanned the entire schema even when there was no outbox work.
  // Identifiers come only from the fixed lists above, never from a request.
  const present=await Promise.all(names.map(async name=>{
    try{
      await db.prepare(`SELECT 1 FROM "${name}" LIMIT 1`).all();
      return name;
    }catch(error){
      if(/no such table:/i.test(String(error)))return null;
      throw error;
    }
  }));
  return new Set(present.filter((name):name is string=>name!==null));
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
