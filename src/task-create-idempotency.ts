export const TASK_CREATE_SCOPE = 'TASK_CREATE_V1';
export const TASK_CREATE_LEASE_MS = 120000;
export const TASK_CREATE_DONE_CLEANUP_BATCH = 200;

type ClaimRow = {
  id: number;
  request_hash: string;
  task_id: number | null;
  status: 'PROCESSING' | 'DONE' | 'ERROR';
  lease_token: string | null;
  lease_expires_at: string | null;
  task_exists: number;
};

type TombstoneRow = {
  request_hash: string;
  task_id: number;
  task_exists: number;
};

export type TaskCreateClaim =
  | { state: 'ACQUIRED'; token: string }
  | { state: 'REPLAY'; taskId: number }
  | { state: 'GONE' }
  | { state: 'BUSY' }
  | { state: 'CONFLICT' };

const iso = (date = new Date()) => date.toISOString();
const leaseExpiry = (date = new Date()) => new Date(date.getTime() + TASK_CREATE_LEASE_MS).toISOString();

export function normalizeTaskCreateKey(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key) return '';
  if (key.length < 16 || key.length > 128) return '';
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return '';
  return key;
}

export async function taskCreateRequestHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readTombstone(db: D1Database, familyId: number, memberId: number, key: string): Promise<TombstoneRow | null> {
  const row = await db.prepare(`SELECT r.request_hash,r.task_id,
      CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS task_exists
    FROM task_create_tombstones r
    LEFT JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
    WHERE r.family_id=? AND r.member_id=? AND r.scope=? AND r.idempotency_key=?
    LIMIT 1`).bind(familyId, memberId, TASK_CREATE_SCOPE, key).first<TombstoneRow>();
  return row || null;
}

function tombstoneClaim(row: TombstoneRow, requestHash: string): TaskCreateClaim {
  if (String(row.request_hash) !== requestHash) return { state: 'CONFLICT' };
  const taskId = Number(row.task_id || 0);
  return taskId > 0 && Number(row.task_exists || 0) === 1 ? { state: 'REPLAY', taskId } : { state: 'GONE' };
}

async function readClaim(db: D1Database, familyId: number, memberId: number, key: string): Promise<ClaimRow | null> {
  const row = await db.prepare(`SELECT r.id,r.request_hash,r.task_id,r.status,r.lease_token,r.lease_expires_at,
      CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS task_exists
    FROM task_create_requests r
    LEFT JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
    WHERE r.family_id=? AND r.member_id=? AND r.scope=? AND r.idempotency_key=?
    LIMIT 1`).bind(familyId, memberId, TASK_CREATE_SCOPE, key).first<ClaimRow>();
  return row || null;
}

export async function acquireTaskCreateClaim(
  db: D1Database,
  familyId: number,
  memberId: number,
  key: string,
  requestHash: string,
): Promise<TaskCreateClaim> {
  const durable = await readTombstone(db, familyId, memberId, key);
  if (durable) return tombstoneClaim(durable, requestHash);

  const token = crypto.randomUUID();
  const now = new Date();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO task_create_requests(
      family_id,member_id,scope,idempotency_key,request_hash,status,lease_token,lease_expires_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,'PROCESSING',?,?,?,?)`)
    .bind(familyId, memberId, TASK_CREATE_SCOPE, key, requestHash, token, leaseExpiry(now), iso(now), iso(now)).run();
  if (Number(inserted.meta.changes || 0) === 1) return { state: 'ACQUIRED', token };

  let row = await readClaim(db, familyId, memberId, key);
  if (!row) {
    const completed = await readTombstone(db, familyId, memberId, key);
    return completed ? tombstoneClaim(completed, requestHash) : { state: 'BUSY' };
  }
  if (String(row.request_hash) !== requestHash) return { state: 'CONFLICT' };
  if (String(row.status) === 'DONE') {
    const taskId = Number(row.task_id || 0);
    return taskId > 0 && Number(row.task_exists || 0) === 1 ? { state: 'REPLAY', taskId } : { state: 'GONE' };
  }

  const nowText = iso(now);
  const reclaimed = await db.prepare(`UPDATE task_create_requests
    SET status='PROCESSING',lease_token=?,lease_expires_at=?,updated_at=?
    WHERE family_id=? AND member_id=? AND scope=? AND idempotency_key=? AND request_hash=?
      AND (status='ERROR' OR (status='PROCESSING' AND COALESCE(lease_expires_at,'')<=?))`)
    .bind(token, leaseExpiry(now), nowText, familyId, memberId, TASK_CREATE_SCOPE, key, requestHash, nowText).run();
  if (Number(reclaimed.meta.changes || 0) === 1) return { state: 'ACQUIRED', token };

  row = await readClaim(db, familyId, memberId, key);
  if (row && String(row.request_hash) !== requestHash) return { state: 'CONFLICT' };
  if (row && String(row.status) === 'DONE') {
    const taskId = Number(row.task_id || 0);
    return taskId > 0 && Number(row.task_exists || 0) === 1 ? { state: 'REPLAY', taskId } : { state: 'GONE' };
  }
  if (!row) {
    const completed = await readTombstone(db, familyId, memberId, key);
    if (completed) return tombstoneClaim(completed, requestHash);
  }
  return { state: 'BUSY' };
}

export async function markTaskCreateClaimError(
  db: D1Database,
  familyId: number,
  memberId: number,
  key: string,
  requestHash: string,
  token: string,
): Promise<void> {
  await db.prepare(`UPDATE task_create_requests
    SET status='ERROR',lease_token=NULL,lease_expires_at=NULL,updated_at=?
    WHERE family_id=? AND member_id=? AND scope=? AND idempotency_key=? AND request_hash=?
      AND status='PROCESSING' AND lease_token=?`)
    .bind(iso(), familyId, memberId, TASK_CREATE_SCOPE, key, requestHash, token).run();
}

export async function readCompletedTaskCreate(
  db: D1Database,
  familyId: number,
  memberId: number,
  key: string,
  requestHash: string,
): Promise<number> {
  const row = await db.prepare(`SELECT r.task_id
    FROM task_create_tombstones r
    JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
    WHERE r.family_id=? AND r.member_id=? AND r.scope=? AND r.idempotency_key=? AND r.request_hash=?
    LIMIT 1`).bind(familyId, memberId, TASK_CREATE_SCOPE, key, requestHash).first<{task_id:number|null}>();
  return Number(row?.task_id || 0);
}

export async function cleanupCompletedTaskCreateRequests(
  db: D1Database,
  limit = TASK_CREATE_DONE_CLEANUP_BATCH,
): Promise<number> {
  const batch = Math.max(1, Math.min(500, Math.trunc(Number(limit) || TASK_CREATE_DONE_CLEANUP_BATCH)));
  const result = await db.prepare(`DELETE FROM task_create_requests
    WHERE id IN (
      SELECT r.id
      FROM task_create_requests r
      JOIN task_create_tombstones d
        ON d.family_id=r.family_id AND d.member_id=r.member_id AND d.scope=r.scope AND d.idempotency_key=r.idempotency_key
       AND d.request_hash=r.request_hash AND d.task_id=r.task_id
      WHERE r.status='DONE' AND r.task_id IS NOT NULL
      ORDER BY r.id
      LIMIT ?
    )`).bind(batch).run();
  return Number(result.meta.changes || 0);
}
