import assert from 'node:assert/strict';
import fs from 'node:fs';

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
assert.match(browser,/record\.log_type\|\|''\)\.toUpperCase\(\)!=='MEAL'.*record\.detail_code\|\|''\)\.toUpperCase\(\)!=='BABY_FOOD'/s,'manifest records must be explicit MEAL/BABY_FOOD entries');
assert.match(browser,/fetch\('\/api\/family-log-media'/,'photo bytes must use the existing authenticated private Family Log media endpoint');
assert.match(browser,/if\(target\.has_media\)\{existing\+\+;continue;\}/,'existing private photos must never be overwritten');
assert.match(browser,/if\(error instanceof TypeError\)\{uncertain\+\+;/,'ambiguous network outcomes must be tracked separately');
assert.match(browser,/通信結果不明の写真は自動再試行していません/,'ambiguous uploads must not be retried automatically');
assert.match(browser,/button\.onclick=\(\)=>d\.new_count\?runImport\(d,button,progress\):runPhotoOnly\(button,progress\)/,'all-duplicate previews must enter the photo-only path');
const photoOnly=browser.match(/async function runPhotoOnly\([\s\S]*?\n}\n\nasync function runImport/);
assert.ok(photoOnly,'photo-only handler must remain explicit');
assert.ok(!photoOnly[0].includes('call(')&&!photoOnly[0].includes("action:'start'")&&!photoOnly[0].includes("action:'chunk'")&&!photoOnly[0].includes("action:'finish'"),'photo-only retry must not invoke the record importer');
assert.ok(!browser.includes('application/pdf')&&!browser.includes('.pdf"')&&!browser.includes(".pdf'"),'browser import controller must not offer PDF upload');
assert.ok(!/gemini|generativelanguage|openai|ocr|pdfjs/i.test(browser),'browser import controller must not add AI/OCR/PDF parsing');

// Resolution is server-side, admin-only and tenant/subject/source/type constrained.
for(const marker of [
  "['OWNER','ADMIN']",
  "String(body.csrf||'')!==String(context.session.csrfToken||'')",
  "subject_kind IN ('BABY','CHILD')",
  "l.family_id=? AND l.subject_id=? AND l.deleted_at IS NULL",
  "l.log_type='MEAL' AND l.detail_code='BABY_FOOD'",
  "lower(b.source)='piyolog'",
  'l.import_external_id IN',
])assert.ok(targets.includes(marker),`missing Piyolog media target boundary: ${marker}`);
assert.match(targets,/if\(previous\)\{previous\.count\+\+;continue;\}/,'duplicate active matches for one external ID must be counted');
assert.match(targets,/some\(match=>match\.count!==1\).*写真参照IDが一意に特定できません/s,'ambiguous external IDs must be rejected instead of silently picking the newest log');
assert.ok(!targets.includes('env.MEDIA')&&!targets.includes('.MEDIA.'),'target resolution must never read or write private object bytes');
assert.ok(!/gemini|generativelanguage|openai|ocr|pdfjs/i.test(targets),'server target resolution must not add AI/OCR/PDF parsing');
assert.match(targets,/MAX_EXTERNAL_IDS=250/,'target resolver must stay bounded');
assert.match(targets,/MAX_BODY_BYTES=256\*1024/,'target resolver body must stay bounded');

// Reuse the canonical import and private-media contracts instead of creating parallel storage paths.
assert.match(importer,/familytodo-family-log-import-v1/,'canonical Family Log import format must remain the record ingress');
assert.match(importer,/import_external_id/,'canonical importer must retain the external ID used to resolve converted photo manifests');
assert.match(media,/one optional private BABY_FOOD photo per Family Log record|authenticated same-family proxy/i,'canonical private-media boundary must remain in use');
assert.match(wrapper,/CORE_IMPORT_ASSET='\/assets\/family-log-import\.js\?v=12\.121\.0-wave102'/,'wrapper must pin the exact retained canonical controller it replaces');
assert.match(wrapper,/PIYOLOG_IMPORT_ASSET='\/assets\/family-log-import-piyolog\.js\?v=piyolog-media1'/,'Piyolog controller must be cache-busted');
assert.ok(importer.includes('/assets/family-log-import.js?v=12.121.0-wave102'),'wrapper sentinel must stay aligned with the canonical import page');
assert.match(pageRoutes,/url\.pathname==='\/app\/family_log_import\.php'\) return await familyLogPiyologImportPage\(context\)/,'visible Family Log import page must use the restored Piyolog-capable controller');
assert.match(apiRoutes,/url\.pathname==='\/api\/family-log-import-media-targets'\) return await familyLogImportMediaTargetsApi\(request,context\)/,'photo target resolver must be routed through the authenticated context dispatcher');
assert.match(String(pkg.scripts?.['check:browser-js']||''),/family-log-import-piyolog\.js/,'Piyolog browser controller must be syntax checked in CI');

console.log('family-log Piyolog import: external conversion, preview-first records, unambiguous private baby-food photo resolution, record-free photo retry, no overwrite/auto-retry, tenant/admin/CSRF and no server PDF/AI parsing contracts pass');
