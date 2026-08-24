export interface D1Row { [key: string]: unknown }

export interface DbResultMeta {
  changes: number;
  lastInsertId: number;
}

export async function withDb<T>(env: Env, fn: (db: D1Database) => Promise<T>): Promise<T> {
  return fn(env.DB);
}

/**
 * Compatibility helper for the initial migration scaffold.
 * Existing route code can keep execute/query-shaped calls while the
 * underlying database is moved from MySQL/PDO to Cloudflare D1.
 */
export async function execute(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<[D1Row[], DbResultMeta]> {
  const result = await db.prepare(sql).bind(...params).all<D1Row>();
  return [
    result.results,
    {
      changes: result.meta.changes ?? 0,
      lastInsertId: result.meta.last_row_id ?? 0,
    },
  ];
}

export async function query(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<D1Row[]> {
  const result = await db.prepare(sql).bind(...params).all<D1Row>();
  return result.results;
}
