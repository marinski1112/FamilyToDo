import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const temp = mkdtempSync(join(tmpdir(), 'stamp-cleanup-test-'));
let cleanupFamilySharedStamp, withCalendarStampAdmission;
try {
  execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'),
    '--noCheck', '--target', 'ES2022', '--module', 'ESNext', '--outDir', temp,
    'src/calendar-stamp-global-cleanup.ts']);
  ({ cleanupFamilySharedStamp, withCalendarStampAdmission } = await import(
    `data:text/javascript;base64,${Buffer.from(readFileSync(join(temp, 'calendar-stamp-global-cleanup.js'))).toString('base64')}`));
} finally { rmSync(temp, { recursive: true, force: true }); }

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE families(id INTEGER PRIMARY KEY);
    CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER,active INTEGER DEFAULT 1,role TEXT DEFAULT 'MEMBER');
    CREATE TABLE messages(id INTEGER PRIMARY KEY,family_id INTEGER);
    CREATE TABLE tasks(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL);
    CREATE TABLE shopping_items(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL);
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL,target_type TEXT,target_id INTEGER);
    CREATE TABLE activity_logs(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL,target_type TEXT,target_id INTEGER);
    INSERT INTO families VALUES(1),(2);
    INSERT INTO members(id,family_id) VALUES(1,1),(2,2);
    INSERT INTO messages VALUES(1,1),(2,2),(3,1);`);
  for (const file of ['0045_calendar_animated_stamps.sql','0046_calendar_stamp_png_frames.sql',
    '0050_message_stamp_attachments.sql','0054_calendar_shared_stamp_refs.sql','0082_message_conversion_idempotency.sql',
    '0083_calendar_stamp_global_deletions.sql','0084_message_photos.sql','0087_photo_transfers.sql',
    '0088_calendar_stamp_physical_purge.sql']) {
    sql.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  const prepare = (query, values = []) => ({ query, values,
    bind(...args) { return prepare(query, args); },
    async first(column) { const row = sql.prepare(query).get(...values); return column ? row?.[column] ?? null : row ?? null; },
    async all() { return { results: sql.prepare(query).all(...values) }; },
    async run() { const r = sql.prepare(query).run(...values); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  const db = { prepare, async batch(statements) {
    sql.exec('BEGIN');
    try { const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  }};
  const objects = new Map();
  const batches = [];
  const bucket = { async delete(keys) { batches.push(keys.slice()); for (const key of keys) objects.delete(key); } };
  function seed(assetId, sharedId, { family = 1, version = 1, frames = 0, provider = 'UPLOAD' } = {}) {
    const root = `asset-${assetId}`;
    sql.prepare(`INSERT INTO calendar_stamp_assets(id,family_id,name,asset_kind,mime_type,storage_provider,
      storage_key,thumbnail_storage_key,active,created_by,created_at,updated_at)
      VALUES(?,?,?,'ANIMATED','image/png',?,?,?,1,?,'test','test')`)
      .run(assetId,family,'fixture',provider,`${root}/content.png`,`${root}/thumb.png`,family);
    sql.prepare(`INSERT INTO calendar_shared_stamp_refs(family_id,asset_id,shared_stamp_id,shared_version,
      representation,created_at,synchronized_at) VALUES(?,?,?,?,'FRAME_SEQUENCE','test','test')`)
      .run(family,assetId,sharedId,version);
    const keys = [`${root}/content.png`,`${root}/thumb.png`];
    for (let i=0; i<frames; i++) {
      const key = `${root}/frame-${i}.png`; keys.push(key);
      sql.prepare(`INSERT INTO calendar_stamp_asset_frames(family_id,asset_id,frame_index,storage_key,duration_ms,created_at,updated_at)
        VALUES(?,?,?,?,120,'test','test')`).run(family,assetId,i,key);
    }
    if (provider==='UPLOAD') for (const key of keys) objects.set(`families/${family}/calendar-stamps/${key}`, 'bytes');
  }
  function seedMessagePhoto(messageId, family=1, writers=0) {
    const suffix=String(messageId).padStart(12,'0');
    const uploadId=`0000000${messageId}-1111-4111-8111-${suffix}`;
    const key=`families/${family}/message-photos/${uploadId}`;
    sql.prepare(`INSERT INTO message_photos(upload_id,family_id,member_id,object_key,sha256,mime_type,byte_size,
      caption,reminder_at,state,writers,created_at) VALUES(?,?,?,?,?,'image/jpeg',4,'photo caption','2026-10-01 10:00:00','ready',?,'test')`)
      .run(uploadId,family,family,key,'0'.repeat(64),writers);
    sql.prepare('UPDATE messages SET image_upload_id=? WHERE id=? AND family_id=?').run(uploadId,messageId,family);
    objects.set(key,'photo-bytes');
    return {uploadId,key};
  }
  function seedTransfer(tokenHash,messageId,family=1) {
    sql.prepare(`INSERT INTO photo_transfers(token_hash,family_id,member_id,source_kind,source_id,caption,sha256,expires_at)
      VALUES(?,?,?,'message',?,'transfer','hash',9999999999)`).run(tokenHash,family,family,messageId);
  }
  const clean = (sharedId, confirm = async () => true) => cleanupFamilySharedStamp({ db,bucket,sharedId,confirmRegistryDeletion:confirm });
  return { sql,db,bucket,objects,batches,seed,seedMessagePhoto,seedTransfer,clean };
}

test('complete deletion removes target posts, photo bytes, capabilities, stamp rows and purge journals', async () => {
  const f = fixture();
  try {
    f.seed(1,'target',{frames:2}); f.seed(2,'target',{family:2,frames:2}); f.seed(3,'other');
    f.sql.exec(`INSERT INTO calendar_stamp_placements(family_id,asset_id,stamp_date,created_by,created_at,updated_at)
      VALUES(1,1,'2026-09-15',1,'test','test'),(1,3,'2026-09-16',1,'test','test');
      INSERT INTO message_stamp_attachments(family_id,message_id,asset_id,created_by,created_at)
      VALUES(1,1,1,1,'test'),(2,2,2,2,'test'),(1,3,3,1,'test');
      INSERT INTO tasks(id,family_id,source_message_id) VALUES(1,1,1),(2,1,3);
      INSERT INTO shopping_items(id,family_id,source_message_id) VALUES(1,1,1),(2,1,3);
      INSERT INTO notifications VALUES(1,1,'message',1),(2,1,'message',3);
      INSERT INTO activity_logs VALUES(1,1,'message',1),(2,1,'message',3);
      INSERT INTO message_conversion_claims(message_id,family_id,conversion_type,conversion_mode,source_updated_at,status)
      VALUES(1,1,'task','new','test','DONE');
      INSERT INTO calendar_stamp_delete_approvals(shared_id,family_id,member_id,approval,expires_at)
      VALUES('target',1,1,'fixture',9999999999);`);
    const photo=f.seedMessagePhoto(1,1,0);
    f.seedTransfer('target-transfer',1,1); f.seedTransfer('other-transfer',3,1);

    const result = await f.clean('target');
    assert.deepEqual(result,{complete:true,cleanupPending:false});
    assert.equal(f.objects.has(photo.key),false,'target message photo bytes must be erased');
    assert.equal(f.objects.size,2,'only unrelated stamp content/thumbnail remain');
    assert.deepEqual(f.sql.prepare('SELECT id FROM calendar_stamp_assets ORDER BY id').all(),[{id:3}]);
    assert.deepEqual(f.sql.prepare('SELECT id FROM messages ORDER BY id').all(),[{id:3}]);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM message_stamp_attachments WHERE asset_id IN (1,2)").get().n,0);
    assert.deepEqual(f.sql.prepare('SELECT asset_id FROM calendar_stamp_placements ORDER BY asset_id').all(),[{asset_id:3}]);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_asset_frames WHERE asset_id IN (1,2)').get().n,0);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM calendar_shared_stamp_refs WHERE shared_stamp_id='target'").get().n,0);
    assert.deepEqual(f.sql.prepare('SELECT id,source_message_id FROM tasks ORDER BY id').all(),[
      {id:1,source_message_id:null},{id:2,source_message_id:3},
    ]);
    assert.deepEqual(f.sql.prepare('SELECT id,source_message_id FROM shopping_items ORDER BY id').all(),[
      {id:1,source_message_id:null},{id:2,source_message_id:3},
    ]);
    assert.deepEqual(f.sql.prepare('SELECT id FROM notifications ORDER BY id').all(),[{id:2}]);
    assert.deepEqual(f.sql.prepare('SELECT id FROM activity_logs ORDER BY id').all(),[{id:2}]);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM message_conversion_claims').get().n,0);
    assert.deepEqual(f.sql.prepare('SELECT token_hash FROM photo_transfers ORDER BY token_hash').all(),[{token_hash:'other-transfer'}]);
    assert.deepEqual(f.sql.prepare('SELECT state,caption,reminder_at,writers FROM message_photos WHERE upload_id=?').get(photo.uploadId),
      {state:'deleted',caption:'',reminder_at:null,writers:0});
    for (const table of ['calendar_stamp_global_cleanup_keys','calendar_stamp_global_materializations',
      'calendar_stamp_global_sources','calendar_stamp_global_deleted_assets','calendar_stamp_global_operations',
      'calendar_stamp_global_deletions','calendar_stamp_delete_approvals']) {
      assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0,`${table} must be purged`);
    }
    assert.throws(()=>f.seedTransfer('late-transfer',1,1),/message source missing/,
      'a delayed capability mint cannot recreate a deleted-message trace');
    assert.deepEqual(await f.clean('target'),result,'retry stays idempotent without a permanent local stamp tombstone');
  } finally { f.sql.close(); }
});

test('cleanup is bounded to 100 stamp keys and progresses without re-capturing deleted pages', async () => {
  const f = fixture(); try {
    for(let i=1;i<=3;i++)f.seed(i,'target',{frames:48,version:i});
    assert.equal((await f.clean('target')).complete,false);
    assert.equal(f.objects.size,50);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets').get().n,3);
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets').get().n,0);
    assert.deepEqual(f.batches.map(x=>x.length),[100,50]);
  } finally { f.sql.close(); }
});

test('partial R2 failure keeps durable keys and database identity until retry succeeds', async () => {
  const f = fixture(); try {
    f.seed(1,'target',{frames:2});
    const normal=f.bucket.delete;
    f.bucket.delete=async keys=>{f.objects.delete(keys[0]);throw new Error('R2 fixture failure');};
    await assert.rejects(f.clean('target'));
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_cleanup_keys').get().n,4);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets').get().n,1);
    f.bucket.delete=normal;
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.objects.size,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets').get().n,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_deletions').get().n,0);
  } finally { f.sql.close(); }
});

test('a live message-photo writer delays only its photo object and retry completes after writer release', async () => {
  const f=fixture(); try {
    f.seed(1,'target');
    f.sql.exec("INSERT INTO message_stamp_attachments(family_id,message_id,asset_id,created_by,created_at) VALUES(1,1,1,1,'test')");
    const photo=f.seedMessagePhoto(1,1,1);
    const first=await f.clean('target');
    assert.deepEqual(first,{complete:false,cleanupPending:true});
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM messages WHERE id=1').get().n,0,'source post is gone immediately');
    assert.equal(f.sql.prepare('SELECT state FROM message_photos WHERE upload_id=?').get(photo.uploadId).state,'delete_pending');
    assert.equal(f.objects.has(photo.key),true,'in-flight writer keeps photo bytes until release');
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets WHERE id=1').get().n,1,'stamp master waits for all R2 cleanup');
    f.sql.prepare('UPDATE message_photos SET writers=0 WHERE upload_id=?').run(photo.uploadId);
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.objects.has(photo.key),false);
    assert.equal(f.sql.prepare('SELECT state FROM message_photos WHERE upload_id=?').get(photo.uploadId).state,'deleted');
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets WHERE id=1').get().n,0);
  } finally { f.sql.close(); }
});

test('requires confirmed global deletion and purges ASSETS-backed identity without R2 deletes', async () => {
  const f = fixture(); try {
    f.seed(1,'target',{provider:'ASSETS'});
    await assert.rejects(f.clean('target',async()=>false));
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_deletions').get().n,0);
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.batches.length,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets').get().n,0);
  } finally { f.sql.close(); }
});

test('does not erase a calendar-stamp object still used by an unrelated identity', async () => {
  const f = fixture(); try {
    f.seed(1,'target',{frames:1}); f.seed(2,'other',{frames:1});
    f.sql.exec("UPDATE calendar_stamp_asset_frames SET storage_key='asset-1/frame-0.png' WHERE asset_id=2");
    await assert.rejects(f.clean('target'),/another identity/);
    assert.equal(f.batches.length,0);
    assert.equal(f.sql.prepare("SELECT captured FROM calendar_stamp_global_deletions WHERE shared_stamp_id='target'").get().captured,1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets').get().n,2);
  } finally { f.sql.close(); }
});

test('tracks a late stamp R2 write, blocks new admission during deletion, then removes the transient marker', async () => {
  const f = fixture(); try {
    let release, started;
    const entered = new Promise(r=>{started=r;});
    const pause = new Promise(r=>{release=r;});
    const pending = withCalendarStampAdmission(f.db,'target',async remember=>{
      started(); await pause;
      const key='families/1/calendar-stamps/shared/target/v1/late.png';
      await remember(key); f.objects.set(key,'bytes');
    });
    await entered;
    assert.equal((await f.clean('target')).complete,false);
    await assert.rejects(withCalendarStampAdmission(f.db,'target',async()=>assert.fail('must not enter')));
    release(); await pending;
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.objects.size,0);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM calendar_stamp_global_deletions WHERE shared_stamp_id='target'").get().n,0);
    let reentered=false;
    await withCalendarStampAdmission(f.db,'target',async()=>{reentered=true;});
    assert.equal(reentered,true,'local admission is purge-only; central registry availability stays authoritative');
  } finally { f.sql.close(); }
});

test('upgrades a legacy captured deletion by additionally removing a target message photo', async () => {
  const f=fixture(); try {
    f.seed(1,'target');
    f.sql.exec("INSERT INTO message_stamp_attachments(family_id,message_id,asset_id,created_by,created_at) VALUES(1,1,1,1,'test');\n      INSERT INTO calendar_stamp_global_deletions(shared_stamp_id,captured,complete) VALUES('target',1,1);\n      INSERT INTO calendar_stamp_global_deleted_assets(asset_id,shared_stamp_id,family_id) VALUES(1,'target',1);");
    const photo=f.seedMessagePhoto(1,1,0);
    // Simulate old cleanup: stamp bytes are already gone and its cleanup journal is empty.
    for(const key of [...f.objects.keys()])if(key.includes('/calendar-stamps/'))f.objects.delete(key);
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.objects.has(photo.key),false);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM messages WHERE id=1').get().n,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets WHERE id=1').get().n,0);
  } finally { f.sql.close(); }
});

test('physically removes a source asset recorded before shared publication fails to attach a ref', async () => {
  const f = fixture(); try {
    f.seed(1,'temporary',{frames:2});
    f.sql.exec('DELETE FROM calendar_shared_stamp_refs WHERE asset_id=1');
    await assert.rejects(withCalendarStampAdmission(f.db,'target',async (_remember,rememberAsset)=>{
      await rememberAsset(1,1); throw new Error('publication failed');
    }));
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.objects.size,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_assets WHERE id=1').get().n,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_sources').get().n,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_deleted_assets').get().n,0);
  } finally { f.sql.close(); }
});

test('normal message deletion also invalidates outstanding message photo transfers', () => {
  const f=fixture(); try {
    f.seedTransfer('message-transfer',3,1);
    f.sql.prepare('DELETE FROM messages WHERE id=3 AND family_id=1').run();
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM photo_transfers WHERE token_hash='message-transfer'").get().n,0);
  } finally { f.sql.close(); }
});

test('a retained remember callback cannot admit a write after its operation ends', async () => {
  const f=fixture(); try {
    let remember;
    await withCalendarStampAdmission(f.db,'target',async callback=>{remember=callback;});
    await assert.rejects(remember('families/1/calendar-stamps/late.png'),/already ended/);
  } finally { f.sql.close(); }
});

test('in-progress deleted assets stay out of reversible admin controls until physical purge completes', () => {
  const inventorySource=readFileSync('src/calendar-stamp-admin-inventory.ts','utf8');
  const deletionUiSource=readFileSync('public/assets/global-stamp-deletion-ui.js','utf8');
  assert.match(inventorySource,/calendar_stamp_global_deleted_assets[\s\S]*?deleted\.asset_id=calendar_stamp_assets\.id/,
    'admin inventory must exclude assets while the transient purge marker is present');
  assert.match(deletionUiSource,/typeof options\.onDeleted==='function'[\s\S]*?globalThis\.location\?\.reload\?\.\(\)/,
    'successful permanent deletion must refresh admin inventory after the physical purge');
});
