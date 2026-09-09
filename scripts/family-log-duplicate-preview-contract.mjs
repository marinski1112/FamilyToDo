import fs from 'node:fs';

const api=fs.readFileSync('src/family-log-duplicate-preview.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');

const checks=[
  [routes.includes("import { familyLogDuplicatePreviewApi } from './family-log-duplicate-preview';")&&routes.includes("if(url.pathname==='/api/family-log-duplicate-preview') return await familyLogDuplicatePreviewApi(request,context);"),'duplicate preview route is missing'],
  [api.includes("['OWNER','ADMIN']")&&api.includes('context.session.csrfToken'),'preview must require OWNER/ADMIN and CSRF'],
  [api.includes("subject_kind IN ('BABY','CHILD')")&&api.includes('family_id=?')&&api.includes('subject_id=?')&&api.includes('l.deleted_at IS NULL'),'preview must remain same-family/same-subject and active-row scoped'],
  [api.includes('MAX_RANGE_DAYS=90')&&api.includes('MAX_ROWS=1500')&&api.includes('MAX_CANDIDATE_PAIRS=500'),'preview must remain bounded by date, row and pair limits'],
  [api.includes("l.occurred_at>=?")&&api.includes("l.occurred_at<?")&&api.includes('LIMIT ?'),'preview query must use a bounded occurred_at range and SQL row limit'],
  [api.includes("EXISTS(SELECT 1 FROM family_log_media")&&api.includes('AS has_media')&&!api.includes('storage_key'),'preview may expose media presence but never R2 storage keys'],
  [api.includes("normalizeText(a.log_type)!==normalizeText(b.log_type)")&&api.includes("String(a.occurred_at||'')!==String(b.occurred_at||'')"),'candidate pairing must require same time and log type'],
  [api.includes('isBabyFood(a)||isBabyFood(b)')&&api.includes("normalizeText(a.detail_code)===normalizeText(b.detail_code)"),'BABY_FOOD pairing must require matching detail code'],
  [api.includes("classification:DuplicateClass=coreEqual&&comparison.content_equal?'exact':coreEqual?'likely':'ambiguous'")&&api.includes('provenance_equal'),'preview must classify exact/likely/ambiguous and compare provenance'],
  [api.includes("return 'MANUAL'")&&api.includes("?'PIYOLOG_IMPORT':'IMPORT'")&&api.includes('has_import_identity'),'preview must expose bounded provenance rather than raw import source identity'],
  [api.includes('read_only:true')&&!/\b(?:UPDATE|DELETE|INSERT|REPLACE)\s+/i.test(api),'duplicate preview must remain read-only'],
  [!api.includes('console.log')&&!api.includes('console.error'),'duplicate preview must not log Family Log content'],
];

const failed=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failed.length){
  console.error(failed.join('\n'));
  process.exit(1);
}
console.log('family-log-duplicate-preview-contract: ok');
