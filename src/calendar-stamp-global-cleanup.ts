const SHARED_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/** Internal participant. The caller must verify the central deletion record. */
export async function cleanupFamilySharedStamp(options: {
  db: D1Database;
  bucket: R2Bucket;
  sharedId: string;
  confirmRegistryDeletion: (sharedId: string) => Promise<boolean>;
}): Promise<{ complete: boolean; cleanupPending: boolean }> {
  const { db, bucket, sharedId } = options;
  if (!SHARED_ID.test(sharedId)) throw new Error('invalid shared stamp id');
  if (!await options.confirmRegistryDeletion(sharedId)) throw new Error('global deletion not confirmed');
  // Admission is closed before inspecting active materialization operations.
  await db.prepare('INSERT INTO calendar_stamp_global_deletions(shared_stamp_id) VALUES(?) ON CONFLICT DO NOTHING')
    .bind(sharedId).run();
  if (await db.prepare('SELECT 1 FROM calendar_stamp_global_operations WHERE shared_stamp_id=? LIMIT 1')
    .bind(sharedId).first()) return { complete: false, cleanupPending: true };

  await db.batch([
    db.prepare(`INSERT INTO calendar_stamp_global_deleted_assets(asset_id,shared_stamp_id,family_id)
      SELECT asset_id,shared_stamp_id,family_id FROM calendar_shared_stamp_refs
      WHERE shared_stamp_id=?
      UNION SELECT asset_id,shared_stamp_id,family_id FROM calendar_stamp_global_sources WHERE shared_stamp_id=?
      ON CONFLICT DO NOTHING`).bind(sharedId,sharedId),
    db.prepare(`INSERT INTO calendar_stamp_global_cleanup_keys(shared_stamp_id,object_key)
      SELECT d.shared_stamp_id,'families/'||a.family_id||'/calendar-stamps/'||a.storage_key
      FROM calendar_stamp_global_deleted_assets d
      JOIN calendar_stamp_assets a ON a.id=d.asset_id AND a.family_id=d.family_id
      JOIN calendar_stamp_global_deletions g ON g.shared_stamp_id=d.shared_stamp_id
      WHERE d.shared_stamp_id=? AND g.captured=0 AND a.storage_provider='UPLOAD'
      UNION
      SELECT d.shared_stamp_id,'families/'||a.family_id||'/calendar-stamps/'||a.thumbnail_storage_key
      FROM calendar_stamp_global_deleted_assets d
      JOIN calendar_stamp_assets a ON a.id=d.asset_id AND a.family_id=d.family_id
      JOIN calendar_stamp_global_deletions g ON g.shared_stamp_id=d.shared_stamp_id
      WHERE d.shared_stamp_id=? AND g.captured=0 AND a.storage_provider='UPLOAD' AND a.thumbnail_storage_key IS NOT NULL
      UNION
      SELECT d.shared_stamp_id,'families/'||f.family_id||'/calendar-stamps/'||f.storage_key
      FROM calendar_stamp_global_deleted_assets d
      JOIN calendar_stamp_asset_frames f ON f.asset_id=d.asset_id AND f.family_id=d.family_id
      JOIN calendar_stamp_assets a ON a.id=d.asset_id AND a.family_id=d.family_id
      JOIN calendar_stamp_global_deletions g ON g.shared_stamp_id=d.shared_stamp_id
      WHERE d.shared_stamp_id=? AND g.captured=0 AND a.storage_provider='UPLOAD'
      UNION
      SELECT p.shared_stamp_id,p.object_key FROM calendar_stamp_global_materializations p
      JOIN calendar_stamp_global_deletions g ON g.shared_stamp_id=p.shared_stamp_id
      WHERE p.shared_stamp_id=? AND g.captured=0
      ON CONFLICT DO NOTHING`).bind(sharedId,sharedId,sharedId,sharedId),
    db.prepare('UPDATE calendar_stamp_global_deletions SET captured=1 WHERE shared_stamp_id=?').bind(sharedId),
  ]);
  const rows = await db.prepare(`SELECT object_key FROM calendar_stamp_global_cleanup_keys
    WHERE shared_stamp_id=? ORDER BY object_key LIMIT 100`).bind(sharedId).all<{object_key: string}>();
  const keys = rows.results.map(row => row.object_key);
  if (keys.some(key => !/^families\/[1-9]\d*\/calendar-stamps\/.+/u.test(key) || key.includes('..') || /[\\?#]/u.test(key))) {
    throw new Error('invalid calendar stamp cleanup scope');
  }
  if (keys.length) {
    // A frame can be reused by a different local stamp. Do not silently damage
    // that unrelated identity; retain the journal for explicit reconciliation.
    const reused = await db.prepare(`SELECT 1 FROM calendar_stamp_global_cleanup_keys k
      JOIN calendar_stamp_assets a ON a.storage_provider='UPLOAD'
      WHERE k.shared_stamp_id=?
        AND NOT EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets d
          WHERE d.asset_id=a.id AND d.shared_stamp_id=?)
        AND (k.object_key='families/'||a.family_id||'/calendar-stamps/'||a.storage_key
          OR k.object_key='families/'||a.family_id||'/calendar-stamps/'||a.thumbnail_storage_key
          OR EXISTS(SELECT 1 FROM calendar_stamp_asset_frames f WHERE f.asset_id=a.id AND f.family_id=a.family_id
            AND k.object_key='families/'||f.family_id||'/calendar-stamps/'||f.storage_key))
      LIMIT 1`).bind(sharedId,sharedId).first();
    if (reused) throw new Error('stamp object also used by another identity');
    await bucket.delete(keys);
    await db.batch(keys.map(key => db.prepare(`DELETE FROM calendar_stamp_global_cleanup_keys
      WHERE shared_stamp_id=? AND object_key=?`).bind(sharedId,key)));
  }
  const pending = await db.prepare('SELECT 1 FROM calendar_stamp_global_cleanup_keys WHERE shared_stamp_id=? LIMIT 1')
    .bind(sharedId).first();
  if (pending) return { complete: false, cleanupPending: true };
  await db.batch([
    db.prepare('UPDATE calendar_stamp_global_deletions SET complete=1 WHERE shared_stamp_id=?').bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_global_materializations WHERE shared_stamp_id=?').bind(sharedId),
  ]);
  return { complete: true, cleanupPending: false };
}

export async function withCalendarStampAdmission<T>(
  db: D1Database, sharedId: string, work: (
    rememberObject: (key: string) => Promise<void>,
    rememberAsset: (assetId: number, familyId: number) => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  if (!SHARED_ID.test(sharedId)) throw new Error('invalid shared stamp id');
  const operationId = crypto.randomUUID();
  await db.prepare('INSERT INTO calendar_stamp_global_operations(operation_id,shared_stamp_id) VALUES(?,?)')
    .bind(operationId,sharedId).run();
  try {
    return await work(async key => {
      if (!/^families\/[1-9]\d*\/calendar-stamps\/.+/u.test(key) || key.includes('..') || /[\\?#]/u.test(key)) {
        throw new Error('invalid calendar stamp cleanup scope');
      }
      // Record the exact destination before its R2 write, even if the eventual
      // asset/ref transaction fails. Active admissions delay snapshotting.
      await db.prepare(`INSERT INTO calendar_stamp_global_materializations(shared_stamp_id,object_key)
        SELECT shared_stamp_id,? FROM calendar_stamp_global_operations WHERE operation_id=?
        ON CONFLICT DO NOTHING`).bind(key,operationId).run();
      if (!await db.prepare('SELECT 1 FROM calendar_stamp_global_operations WHERE operation_id=?').bind(operationId).first()) {
        throw new Error('stamp operation already ended');
      }
    }, async (assetId,familyId) => {
      if (!Number.isSafeInteger(assetId) || assetId < 1 || !Number.isSafeInteger(familyId) || familyId < 1) {
        throw new Error('invalid stamp identity');
      }
      const asset=await db.prepare('SELECT id FROM calendar_stamp_assets WHERE id=? AND family_id=?').bind(assetId,familyId).first();
      if (!asset) throw new Error('stamp source not found');
      await db.prepare(`INSERT INTO calendar_stamp_global_sources(shared_stamp_id,asset_id,family_id)
        SELECT shared_stamp_id,?,? FROM calendar_stamp_global_operations WHERE operation_id=?
        ON CONFLICT DO NOTHING`).bind(assetId,familyId,operationId).run();
      if (!await db.prepare('SELECT 1 FROM calendar_stamp_global_operations WHERE operation_id=?').bind(operationId).first()) {
        throw new Error('stamp operation already ended');
      }
    });
  }
  finally {
    await db.prepare('DELETE FROM calendar_stamp_global_operations WHERE operation_id=?').bind(operationId).run();
  }
}
