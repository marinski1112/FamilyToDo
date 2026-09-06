import fs from 'node:fs';

const api=fs.readFileSync('src/family-log-media-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const boundary=fs.readFileSync('src/family-log-mutation-boundary.ts','utf8');
const importBoundary=fs.readFileSync('src/family-log-import-media-boundary.ts','utf8');
const migration=fs.readFileSync('migrations/0057_family_log_baby_food_media.sql','utf8');
const migrationSql=migration.replace(/^\s*--.*$/gm,'');

const checks=[
  [routes.includes("url.pathname==='/api/family-log-media'"),'Family Log media route is missing'],
  [routes.includes("familyLogImportMediaBoundary as familyLogImportApi")&&routes.includes("if(url.pathname==='/api/family-log-import') return await familyLogImportApi(request,context);"),'Family Log import reconciliation boundary must preserve canonical dispatcher contract'],
  [api.includes("family_id=?")&&api.includes("active=1")&&api.includes("deleted_at IS NULL"),'active same-family member gate is missing'],
  [api.includes("x-csrf-token")&&api.includes("CSRF_FAILED"),'mutation CSRF gate is missing'],
  [api.includes("l.log_type='MEAL'")&&api.includes("l.detail_code='BABY_FOOD'")&&api.includes("s.subject_kind IN ('BABY','CHILD')"),'BABY_FOOD BABY/CHILD parent restriction is missing'],
  [api.includes("image/jpeg")&&api.includes("image/png")&&api.includes("image/webp")&&api.includes('MAX_IMAGE_BYTES=4*1024*1024'),'bounded image MIME/size policy is missing'],
  [api.includes('readBoundedBody')&&api.includes('reader.cancel')&&!api.includes('request.arrayBuffer()'),'upload body must be capped before full buffering'],
  [api.includes('hasValidSignature')&&api.includes('INVALID_IMAGE'),'image signature validation is missing'],
  [api.includes('families/${s.familyId}/family-log/subjects/${Number(parent.subject_id)}/logs/${logId}/'),'tenant/subject/log R2 namespace is missing'],
  [api.includes("url:`/api/family-log-media?media=${Number(row.id)}`")&&!api.includes('storageKey:String(row.storage_key)'),'public projection must use authenticated proxy URL and hide storage key'],
  [api.includes("JOIN family_logs l ON l.id=m.log_id AND l.family_id=m.family_id AND l.subject_id=m.subject_id"),'media reads must retain parent family/subject scope'],
  [boundary.includes("action==='delete'")&&boundary.includes('cleanupFamilyLogMediaForLog'),'Family Log delete lifecycle cleanup hook is missing'],
  [boundary.includes("action==='save'")&&boundary.includes('reconcileFamilyLogMediaForLog'),'Family Log edit lifecycle reconciliation hook is missing'],
  [importBoundary.includes('familyLogImportApi(request,context)')&&importBoundary.includes("UPDATE family_log_media SET reconcile_pending=1 WHERE family_id=?")&&importBoundary.includes('drainPendingFamilyLogMedia'),'import reconciliation must explicitly mark and drain family media without relying on D1 triggers'],
  [migration.includes('family_log_media_cleanup_queue')&&migration.includes('reconcile_pending'),'durable R2 cleanup/reconciliation state is missing'],
  [migration.includes("purpose TEXT NOT NULL CHECK (purpose IN ('ORPHAN','DELETE'))")&&api.includes("queueObjectCleanup(context.env,s.familyId,objectKey,'ORPHAN')")&&api.includes("queueObjectCleanup(env,familyId,key,'DELETE')"),'cleanup queue must distinguish orphan-upload compensation from intentional deletion'],
  [api.includes("purpose==='ORPHAN'")&&api.includes('SELECT id FROM family_log_media WHERE family_id=? AND storage_key=? LIMIT 1'),'orphan retry must not delete an object already linked to valid metadata'],
  [api.includes("datetime(created_at)<=datetime('now','-5 minutes')"),'fresh ORPHAN cleanup must have an in-flight upload grace window'],
  [api.includes("if(purpose==='DELETE')")&&api.includes('DELETE FROM family_log_media WHERE family_id=? AND storage_key=?'),'successful queued DELETE must remove stale metadata'],
  [api.includes('export async function drainPendingFamilyLogMedia')&&api.includes('for(let batch=0;batch<128;batch++)'),'import cleanup must drain across bounded batches'],
  [api.includes('await context.env.MEDIA.delete(objectKey)')&&api.includes("DELETE FROM family_log_media_cleanup_queue WHERE family_id=? AND storage_key=?"),'failed metadata insert must compensate without racing fresh ORPHAN reconciliation'],
  [!migrationSql.includes('CREATE TRIGGER'),'0057 executable SQL must remain free of CREATE TRIGGER bodies so remote Wrangler/D1 statement splitting cannot fail with incomplete input'],
  [migrationSql.includes('DROP TRIGGER IF EXISTS trg_family_log_media_insert_scope')&&migrationSql.includes('DROP TRIGGER IF EXISTS trg_family_log_media_subject_reconcile'),'0057 must defensively remove any trigger left by a partial failed remote attempt'],
  [api.includes('queueObjectCleanup')&&api.includes('deleteQueuedObject')&&api.includes('attempts=attempts+1'),'failed R2 cleanup must remain retryable'],
  [migration.includes('UNIQUE (log_id)')&&migration.includes('UNIQUE (storage_key)'),'one-photo/internal-key uniqueness is missing'],
  [api.includes('babyFoodParent')&&api.includes('Number(parent.subject_id)')&&api.includes('created_by,created_at,reconcile_pending'),'application insert path must retain validated parent/subject/member metadata'],
  [!api.includes('console.log')&&!api.includes('console.error'),'media API must not log private media identifiers or content'],
];

const failed=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failed.length){
  console.error(failed.join('\n'));
  process.exit(1);
}
console.log('family-log-media-contract: ok');
