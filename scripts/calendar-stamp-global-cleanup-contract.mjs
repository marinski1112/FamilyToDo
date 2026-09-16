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
    CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER);
    CREATE TABLE messages(id INTEGER PRIMARY KEY,family_id INTEGER);
    INSERT INTO families VALUES(1),(2);
    INSERT INTO members VALUES(1,1),(2,2);
    INSERT INTO messages VALUES(1,1),(2,2);`);
  for (const file of ['0045_calendar_animated_stamps.sql','0046_calendar_stamp_png_frames.sql',
    '0050_message_stamp_attachments.sql','0054_calendar_shared_stamp_refs.sql','0083_calendar_stamp_global_deletions.sql']) {
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
  const clean = (sharedId, confirm = async () => true) => cleanupFamilySharedStamp({ db,bucket,sharedId,confirmRegistryDeletion:confirm });
  return { sql,db,bucket,objects,batches,seed,clean };
}

test('originals, thumbnails, all 48 frames and multiple app copies are physically removed; history survives', async () => {
  const f = fixture();
  try {
    f.seed(1,'target',{frames:48}); f.seed(2,'target',{family:2,frames:48});
    f.seed(3,'other');
    f.sql.exec(`INSERT INTO calendar_stamp_placements(family_id,asset_id,stamp_date,created_by,created_at,updated_at)
      VALUES(1,1,'2026-09-15',1,'test','test');
      INSERT INTO message_stamp_attachments(family_id,message_id,asset_id,created_by,created_at) VALUES(1,1,1,1,'test');`);
    const result = await f.clean('target');
    assert.deepEqual(result,{complete:true,cleanupPending:false});
    assert.equal(f.objects.size,2);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_placements').get().n,1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM message_stamp_attachments').get().n,1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_cleanup_keys').get().n,0);
    assert.throws(()=>f.sql.exec('UPDATE calendar_stamp_assets SET active=1 WHERE id=1'));
    assert.throws(()=>f.sql.exec('DELETE FROM calendar_stamp_assets WHERE id=1'));
    assert.deepEqual(await f.clean('target'),result);
  } finally { f.sql.close(); }
});

test('cleanup is bounded to 100 keys and does not skip later versions', async () => {
  const f = fixture(); try {
    for(let i=1;i<=3;i++)f.seed(i,'target',{frames:48,version:i});
    assert.equal((await f.clean('target')).complete,false);
    assert.equal(f.objects.size,50);
    assert.equal((await f.clean('target')).complete,true);
    assert.deepEqual(f.batches.map(x=>x.length),[100,50]);
  } finally { f.sql.close(); }
});

test('partial R2 failure retains durable keys and repeated deletion finishes', async () => {
  const f = fixture(); try {
    f.seed(1,'target',{frames:2});
    const normal=f.bucket.delete;
    f.bucket.delete=async keys=>{f.objects.delete(keys[0]);throw new Error('R2 fixture failure');};
    await assert.rejects(f.clean('target'));
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_cleanup_keys').get().n,4);
    f.bucket.delete=normal;
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.objects.size,0);
  } finally { f.sql.close(); }
});

test('requires confirmed global deletion and preserves static assets', async () => {
  const f = fixture(); try {
    f.seed(1,'target',{provider:'ASSETS'});
    await assert.rejects(f.clean('target',async()=>false));
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_deletions').get().n,0);
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.batches.length,0);
  } finally { f.sql.close(); }
});

test('does not erase a frame still used by an unrelated identity', async () => {
  const f = fixture(); try {
    f.seed(1,'target',{frames:1}); f.seed(2,'other',{frames:1});
    f.sql.exec("UPDATE calendar_stamp_asset_frames SET storage_key='asset-1/frame-0.png' WHERE asset_id=2");
    await assert.rejects(f.clean('target'),/another identity/);
    assert.equal(f.batches.length,0);
    assert.equal(f.sql.prepare("SELECT complete FROM calendar_stamp_global_deletions WHERE shared_stamp_id='target'").get().complete,0);
  } finally { f.sql.close(); }
});

test('tracks a late R2 write even when materialization never attaches a local ref', async () => {
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
  } finally { f.sql.close(); }
});

test('retains original source identity when shared publication cannot attach a ref', async () => {
  const f = fixture(); try {
    f.seed(1,'temporary',{frames:2});
    f.sql.exec('DELETE FROM calendar_shared_stamp_refs WHERE asset_id=1');
    await assert.rejects(withCalendarStampAdmission(f.db,'target',async (_remember,rememberAsset)=>{
      await rememberAsset(1,1); throw new Error('publication failed');
    }));
    assert.equal((await f.clean('target')).complete,true);
    assert.equal(f.objects.size,0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM calendar_stamp_global_deleted_assets WHERE asset_id=1').get().n,1);
  } finally { f.sql.close(); }
});

test('a retained remember callback cannot admit a write after its operation ends', async () => {
  const f=fixture(); try {
    let remember;
    await withCalendarStampAdmission(f.db,'target',async callback=>{remember=callback;});
    await assert.rejects(remember('families/1/calendar-stamps/late.png'),/already ended/);
  } finally { f.sql.close(); }
});
