import assert from 'node:assert/strict';
import fs from 'node:fs';
import './family-log-duplicate-preview-contract.mjs';

const read=path=>fs.readFileSync(path,'utf8');
const browser=read('public/assets/family-log-import-piyolog.js');
const targets=read('src/family-log-import-media-targets.ts');
const wrapper=read('src/family-log-piyolog-import-page.ts');
const importer=read('src/family-log-import.ts');
const media=read('src/family-log-media-api.ts');
const pageRoutes=read('src/page-routes.ts');
const apiRoutes=read('src/context-api-routes.ts');
const pkg=JSON.parse(read('package.json'));

// FamilyToDo receives only the already-converted JSON + extracted image bundle.
assert.match(browser,/ぴよログPDF自体はFamilyToDoへ送信・解析しません/,'UI must state that the source PDF is not uploaded for server parsing');
assert.match(browser,/source\|\|'\'\)\.trim\(\)\.toLowerCase\(\)!=='piyolog'/,'photo manifest must only be accepted for Piyolog conversion data');
assert.match(browser,/MAX_MEDIA_ITEMS=250/,'photo manifest must stay bounded');
assert.match(browser,/MAX_IMAGE_BYTES=4\*1024\*1024/,'client photo size must match the canonical private-media limit');
assert.match(browser,/IMAGE_TYPES=new Set\(\['image\/jpeg','image\/png','image\/webp'\]\)/,'only canonical image types are selectable for import');
assert.match(browser,/promotionRecords=.*detail_code.*BABY_FOOD/s,'promotion input must be restricted to explicit MEAL/BABY_FOOD records');
assert.match(browser,/promotionCall\('promotion_preview'\)/,'preview must check existing generic meals without writing');
assert.match(browser,/promotionCall\('promotion_apply'\)/,'confirmed import must promote generic meals before canonical record import');
assert.match(browser,/actual_new_count/,'preview must separate true new records from in-place baby-food promotions');
assert.match(browser,/既存のぴよログ「食事」.*同じ時刻の記録を新規追加せず離乳食として上書き/s,'UI must explain in-place promotion instead of duplicate creation');
assert.match(browser,/if\(actualNew>0\)/,'promotion-only runs must not create a redundant canonical import batch');
assert.match(browser,/fetch\('\/api\/family-log-media'/,'photo bytes must use the existing authenticated private Family Log media endpoint');
assert.match(browser,/if\(target\.has_media\)\{existing\+\+;continue;\}/,'existing private photos must never be overwritten');
assert.match(browser,/if\(error instanceof TypeError\)\{uncertain\+\+;/,'ambiguous network outcomes must be tracked separately');
assert.match(browser,/通信結果不明の写真は自動再試行していません/,'ambiguous uploads must not be retried automatically');
assert.match(browser,/対象未解決 \$\{targetMissing\}/,'photo status must distinguish unresolved imported-record targets from unselected files');
assert.match(browser,/mediaStage='target_api'/,'target API failures must carry a privacy-safe stage');
assert.match(browser,/mediaError\('upload_api'/,'upload API failures must carry a privacy-safe stage/status/reason tuple');
assert.match(browser,/SAFE_MEDIA_CODES=new Set/,'media diagnostics must use an explicit safe reason allowlist');
assert.match(browser,/failureDiagnostics=new Map/,'failure diagnostics must be aggregated by safe reason instead of exposing per-file identifiers');
assert.match(browser,/failureSummary=\[\.\.\.failureDiagnostics\.entries\(\)\]\.map\(\(\[diagnostic,count\]\)=>`\$\{diagnostic\} ×\$\{count\}`\)\.join\('、'\)/,'failure summary must contain only the safe diagnostic tuple and aggregate count');
const photoOnly=browser.match(/async function runPhotoOnly\([\s\S]*?\n}\n\nasync function runImport/);
assert.ok(photoOnly,'photo-only handler must remain explicit');
assert.ok(!photoOnly[0].includes("action:'start'")&&!photoOnly[0].includes("action:'chunk'")&&!photoOnly[0].includes("action:'finish'"),'photo-only retry must not invoke the record importer');
assert.ok(!browser.includes('application/pdf')&&!browser.includes('.pdf"')&&!browser.includes(".pdf'"),'browser import controller must not offer PDF upload');
assert.ok(!/gemini|generativelanguage|openai|ocr|pdfjs/i.test(browser),'browser import controller must not add AI/OCR/PDF parsing');

// Resolution/promotion is server-side, admin-only and tenant/subject/source/type constrained.
for(const marker of [
  "['OWNER','ADMIN']",
  "String(body.csrf||'')!==String(context.session.csrfToken||'')",
  "subject_kind IN ('BABY','CHILD')",
  "l.family_id=? AND l.subject_id=? AND l.deleted_at IS NULL",
  "l.log_type='MEAL' AND l.detail_code='BABY_FOOD'",
  "lower(b.source)='piyolog'",
  'l.import_external_id IN',
  "action==='promotion_preview'",
  "action==='promotion_apply'",
  "COALESCE(l.detail_code,'')<>'BABY_FOOD'",
  "SET detail_code='BABY_FOOD',import_source_key=?",
  "NOT EXISTS(SELECT 1 FROM family_logs x",
])assert.ok(targets.includes(marker),`missing Piyolog import safety boundary: ${marker}`);
assert.match(targets,/existingTargetKeys\.has\(record\.targetKey\)/,'already-correct canonical baby-food rows must not be promoted again');
assert.match(targets,/if\(candidates\.length>1&&record\.externalId\)/,'ambiguous same-time rows must be narrowed by stable external ID when available');
assert.match(targets,/if\(candidates\.length>1\).*exactText/s,'remaining ambiguity must be narrowed by retained source/value text');
assert.match(targets,/if\(candidates\.length>1\)ambiguous\+\+/,'unresolved ambiguous generic meals must be rejected');
assert.match(targets,/if\(ambiguous\.size\)throw new BadRequest/,'ambiguous photo external IDs must be rejected instead of silently choosing a log');
assert.ok(!targets.includes('env.MEDIA')&&!targets.includes('.MEDIA.'),'target resolution must never read or write private object bytes');
assert.ok(!/gemini|generativelanguage|openai|ocr|pdfjs/i.test(targets),'server target resolution must not add AI/OCR/PDF parsing');
assert.match(targets,/MAX_EXTERNAL_IDS=250/,'target resolver must stay bounded');
assert.match(targets,/MAX_PROMOTION_RECORDS=250/,'promotion resolver must stay bounded');
assert.match(targets,/MAX_BODY_BYTES=256\*1024/,'target resolver body must stay bounded');

// Reuse the canonical import and private-media contracts instead of creating parallel storage paths.
assert.match(importer,/familytodo-family-log-import-v1/,'canonical Family Log import format must remain the record ingress');
assert.match(importer,/import_external_id/,'canonical importer must retain the external ID used to resolve converted photo manifests');
assert.match(media,/one optional private BABY_FOOD photo per Family Log record|authenticated same-family proxy/i,'canonical private-media boundary must remain in use');
assert.match(wrapper,/CORE_IMPORT_ASSET='\/assets\/family-log-import\.js\?v=12\.121\.0-wave102'/,'wrapper must pin the exact retained canonical controller it replaces');
assert.match(wrapper,/PIYOLOG_IMPORT_ASSET='\/assets\/family-log-import-piyolog\.js\?v=piyolog-media3'/,'Piyolog controller must be cache-busted after media diagnostic behavior changes');
assert.ok(importer.includes('/assets/family-log-import.js?v=12.121.0-wave102'),'wrapper sentinel must stay aligned with the canonical import page');
assert.match(pageRoutes,/url\.pathname==='\/app\/family_log_import\.php'\) return await familyLogPiyologImportPage\(context\)/,'visible Family Log import page must use the restored Piyolog-capable controller');
assert.match(apiRoutes,/url\.pathname==='\/api\/family-log-import-media-targets'\) return await familyLogImportMediaTargetsApi\(request,context\)/,'Piyolog helper must remain routed through the authenticated context dispatcher');
assert.match(String(pkg.scripts?.['check:browser-js']||''),/family-log-import-piyolog\.js/,'Piyolog browser controller must be syntax checked in CI');

// D1 duplicate preview lookups must remain below the documented 100-bound-parameter ceiling.
assert.match(importer,/D1_MAX_BOUND_PARAMETERS=100, LOOKUP_FIXED_BINDS=2, LOOKUP_KEYS_PER_RECORD=2/,'duplicate lookup must keep an explicit D1 bind-parameter budget');
assert.match(importer,/LOOKUP_SIZE=Math\.floor\(\(D1_MAX_BOUND_PARAMETERS-LOOKUP_FIXED_BINDS\)\/LOOKUP_KEYS_PER_RECORD\)/,'duplicate lookup batch size must be derived from the parameter budget');
const lookupSize=Math.floor((100-2)/2);
assert.equal(2+lookupSize*2,100,'derived duplicate lookup must never bind more than 100 parameters');
assert.equal(lookupSize,49,'current canonical+legacy lookup budget must resolve to 49 records per query');

console.log('family-log Piyolog import: preview-first records, in-place generic-meal promotion, duplicate prevention, privacy-safe photo failure stages, unambiguous private baby-food photo resolution, record-free photo retry, tenant/admin/CSRF and no server PDF/AI parsing contracts pass');
