import fs from 'node:fs';

const api=fs.readFileSync('src/family-log-media-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const boundary=fs.readFileSync('src/family-log-mutation-boundary.ts','utf8');
const importBoundary=fs.readFileSync('src/family-log-import-media-boundary.ts','utf8');
const migration=fs.readFileSync('migrations/0057_family_log_baby_food_media.sql','utf8');

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
  [importBoundary.includes('familyLogImportApi(request,context)')&&importBoundary.includes('reconcilePendingFamilyLogMedia'),'import rollback reconciliation must wrap the canonical importer'],
  [migration.includes('family_log_media_cleanup_queue')&&migration.includes('reconcile_pending'),'durable R2 cleanup/reconciliation state is missing'],
  [migration.includes("purpose TEXT NOT NULL CHECK (purpose IN ('ORPHAN','DELETE'))")&&api.includes("queueObjectCleanup(context.env,s.familyId,objectKey,'ORPHAN')")&&api.includes("queueObjectCleanup(env,familyId,key,'DELETE')"),'cleanup queue must distinguish orphan-upload compensation from intentional deletion'],
  [api.includes("String(queued.purpose)==='ORPHAN'")&&api.includes('SELECT id FROM family_log_media WHERE family_id=? AND storage_key=? LIMIT 1'),'orphan retry must not delete an object already linked to valid metadata'],
  [migration.includes('trg_family_log_media_parent_reconcile')&&migration.includes('AFTER UPDATE OF deleted_at,subject_id,log_type,detail_code ON family_logs'),'parent mutation reconciliation trigger is missing'],
  [migration.includes('trg_family_log_media_subject_reconcile')&&migration.includes('AFTER UPDATE OF subject_kind ON family_log_subjects'),'subject-kind reconciliation trigger is missing'],
  [api.includes('queueObjectCleanup')&&api.includes('deleteQueuedObject')&&api.includes('attempts=attempts+1'),'failed R2 cleanup must remain retryable'],
  [migration.includes('UNIQUE (log_id)')&&migration.includes('UNIQUE (storage_key)'),'one-photo/internal-key uniqueness is missing'],
  [migration.includes("RAISE(ABORT, 'family_log_media parent scope mismatch')")&&migration.includes("l.detail_code = 'BABY_FOOD'")&&migration.includes("s.subject_kind IN ('BABY','CHILD')"),'D1 parent tenant/subject guard is missing'],
  [!api.includes('console.log')&&!api.includes('console.error'),'media API must not log private media identifiers or content'],
];

const failed=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failed.length){
  console.error(failed.join('\n'));
  process.exit(1);
}
console.log('family-log-media-contract: ok');
