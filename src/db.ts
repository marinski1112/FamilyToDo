import { createConnection, type Connection } from 'mysql2/promise';

export async function withDb<T>(env: Env, fn: (db: Connection) => Promise<T>): Promise<T> {
  const db = await createConnection({
    host: env.HYPERDRIVE.host,
    user: env.HYPERDRIVE.user,
    password: env.HYPERDRIVE.password,
    database: env.HYPERDRIVE.database,
    port: env.HYPERDRIVE.port,
    disableEval: true,
  });
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}
