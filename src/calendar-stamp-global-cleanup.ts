const SHARED_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const CALENDAR_STAMP_OBJECT = /^families\/[1-9]\d*\/calendar-stamps\/.+/u;
const MESSAGE_PHOTO_OBJECT = /^families\/[1-9]\d*\/message-photos\/[a-f0-9-]{36}$/u;

function validCleanupKey(key:string):boolean {
  return (CALENDAR_STAMP_OBJECT.test(key)||MESSAGE_PHOTO_OBJECT.test(key))
    && !key.includes('..') && !/[\\?#]/u.test(key);
}

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

  // This row is only a purge-time admission guard. The central registry remains
  // authoritative after local completion, so the participant marker can be
  // removed once every local stamp trace has been purged.
  await db.prepare('INSERT INTO calendar_stamp_global_deletions(shared_stamp_id) VALUES(?) ON CONFLICT DO NOTHING')
    .bind(sharedId).run();
  if (await db.prepare('SELECT 1 FROM calendar_stamp_global_operations WHERE shared_stamp_id=? LIMIT 1')
    .bind(sharedId).first()) return { complete: false, cleanupPending: true };

  const targetMessages = `SELECT DISTINCT msa.message_id
    FROM message_stamp_attachments msa
    JOIN calendar_stamp_global_deleted_assets d
      ON d.asset_id=msa.asset_id AND d.family_id=msa.family_id
    WHERE d.shared_stamp_id=?`;

  // Snapshot stamp objects once, while the transient guard prevents new local
  // admission. Message-photo objects are journaled independently of `captured`
  // so an old 0083 deletion that already captured stamp keys can still be
  // upgraded safely after message photos were introduced.
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
    db.prepare(`INSERT INTO calendar_stamp_global_cleanup_keys(shared_stamp_id,object_key)
      SELECT DISTINCT d.shared_stamp_id,p.object_key
      FROM calendar_stamp_global_deleted_assets d
      JOIN message_stamp_attachments msa
        ON msa.asset_id=d.asset_id AND msa.family_id=d.family_id
      JOIN messages m ON m.id=msa.message_id AND m.family_id=msa.family_id
      JOIN message_photos p ON p.upload_id=m.image_upload_id AND p.family_id=m.family_id
      WHERE d.shared_stamp_id=? AND m.image_upload_id IS NOT NULL
        AND p.object_key='families/'||p.family_id||'/message-photos/'||p.upload_id
      ON CONFLICT DO NOTHING`).bind(sharedId),
    // Converted task/shopping rows are independent user content. Preserve them,
    // but sever provenance to a message that is being erased.
    db.prepare(`UPDATE tasks SET source_message_id=NULL
      WHERE source_message_id IN (${targetMessages})`).bind(sharedId),
    db.prepare(`UPDATE shopping_items SET source_message_id=NULL
      WHERE source_message_id IN (${targetMessages})`).bind(sharedId),
    // These are direct traces/capabilities of the deleted post. Do not create a
    // replacement deletion activity entry for the purge itself.
    db.prepare(`DELETE FROM notifications
      WHERE target_type='message' AND target_id IN (${targetMessages})`).bind(sharedId),
    db.prepare(`DELETE FROM activity_logs
      WHERE target_type='message' AND target_id IN (${targetMessages})`).bind(sharedId),
    db.prepare(`DELETE FROM photo_transfers
      WHERE source_kind='message' AND source_id IN (${targetMessages})`).bind(sharedId),
    // message_stamp_attachments and conversion claims cascade. The message-photo
    // trigger changes a linked private image to delete_pending before R2 cleanup.
    db.prepare(`DELETE FROM messages WHERE id IN (${targetMessages})`).bind(sharedId),
    db.prepare('UPDATE calendar_stamp_global_deletions SET captured=1 WHERE shared_stamp_id=?').bind(sharedId),
  ]);

  const rows = await db.prepare(`SELECT object_key FROM calendar_stamp_global_cleanup_keys
    WHERE shared_stamp_id=? ORDER BY object_key LIMIT 100`).bind(sharedId).all<{object_key: string}>();
  const keys = rows.results.map(row => row.object_key);
  if (keys.some(key => !validCleanupKey(key))) throw new Error('invalid calendar stamp cleanup scope');

  if (keys.length) {
    // A calendar-stamp object can be referenced by an unrelated local stamp.
    // Refuse to erase such an object rather than damaging another identity.
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

    // A message photo can still have the exact upload writer that created it in
    // flight. Message deletion makes the row delete_pending, preventing new
    // writers; wait only for already-admitted writers before deleting its bytes.
    const blockedRows = await db.prepare(`SELECT k.object_key
      FROM calendar_stamp_global_cleanup_keys k
      JOIN message_photos p ON p.object_key=k.object_key
      WHERE k.shared_stamp_id=? AND p.writers>0
      ORDER BY k.object_key LIMIT 100`).bind(sharedId).all<{object_key:string}>();
    const blocked = new Set(blockedRows.results.map(row=>row.object_key));
    const deletable = keys.filter(key=>!blocked.has(key));
    if (deletable.length) {
      const photoKeys=deletable.filter(key=>MESSAGE_PHOTO_OBJECT.test(key));
      if (photoKeys.length) {
        // Install the minimal opaque replay guard before removing bytes. If R2
        // deletion fails, the richer photo row remains and retry is safe; if the
        // DB cleanup fails after R2, the guard already prevents resurrection.
        await db.batch(photoKeys.map(key=>db.prepare(`INSERT INTO message_photo_replay_guards(upload_id)
          SELECT upload_id FROM message_photos
          WHERE object_key=? AND state IN ('delete_pending','deleted') AND writers=0
          ON CONFLICT(upload_id) DO NOTHING`).bind(key)));
      }
      await bucket.delete(deletable);
      const finish:D1PreparedStatement[]=[];
      for (const key of deletable) {
        if (MESSAGE_PHOTO_OBJECT.test(key)) {
          finish.push(db.prepare(`DELETE FROM message_photos
            WHERE object_key=? AND state IN ('delete_pending','deleted') AND writers=0`).bind(key));
        }
        finish.push(db.prepare(`DELETE FROM calendar_stamp_global_cleanup_keys
          WHERE shared_stamp_id=? AND object_key=?`).bind(sharedId,key));
      }
      await db.batch(finish);
    }
  }

  const pending = await db.prepare('SELECT 1 FROM calendar_stamp_global_cleanup_keys WHERE shared_stamp_id=? LIMIT 1')
    .bind(sharedId).first();
  if (pending) return { complete: false, cleanupPending: true };

  // R2 is now clear. Remove the local stamp identity and all temporary deletion
  // bookkeeping in one final D1 batch, with the admission guard deleted last.
  await db.batch([
    db.prepare(`DELETE FROM message_stamp_attachments
      WHERE EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets d
        WHERE d.shared_stamp_id=? AND d.asset_id=message_stamp_attachments.asset_id
          AND d.family_id=message_stamp_attachments.family_id)`).bind(sharedId),
    db.prepare(`DELETE FROM calendar_stamp_placements
      WHERE EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets d
        WHERE d.shared_stamp_id=? AND d.asset_id=calendar_stamp_placements.asset_id
          AND d.family_id=calendar_stamp_placements.family_id)`).bind(sharedId),
    db.prepare(`DELETE FROM calendar_stamp_asset_frames
      WHERE EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets d
        WHERE d.shared_stamp_id=? AND d.asset_id=calendar_stamp_asset_frames.asset_id
          AND d.family_id=calendar_stamp_asset_frames.family_id)`).bind(sharedId),
    db.prepare(`DELETE FROM calendar_shared_stamp_refs
      WHERE shared_stamp_id=? OR EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets d
        WHERE d.shared_stamp_id=? AND d.asset_id=calendar_shared_stamp_refs.asset_id
          AND d.family_id=calendar_shared_stamp_refs.family_id)`).bind(sharedId,sharedId),
    db.prepare(`DELETE FROM calendar_stamp_assets
      WHERE EXISTS(SELECT 1 FROM calendar_stamp_global_deleted_assets d
        WHERE d.shared_stamp_id=? AND d.asset_id=calendar_stamp_assets.id
          AND d.family_id=calendar_stamp_assets.family_id)`).bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_global_materializations WHERE shared_stamp_id=?').bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_global_sources WHERE shared_stamp_id=?').bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_global_deleted_assets WHERE shared_stamp_id=?').bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_global_cleanup_keys WHERE shared_stamp_id=?').bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_global_operations WHERE shared_stamp_id=?').bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_delete_approvals WHERE shared_id=?').bind(sharedId),
    db.prepare('DELETE FROM calendar_stamp_global_deletions WHERE shared_stamp_id=?').bind(sharedId),
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
      if (!CALENDAR_STAMP_OBJECT.test(key) || key.includes('..') || /[\\?#]/u.test(key)) {
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
