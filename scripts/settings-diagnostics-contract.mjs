import assert from 'node:assert/strict';
import fs from 'node:fs';

const diagnostics=fs.readFileSync('src/settings-diagnostics.ts','utf8');
const aiDiagnostics=fs.readFileSync('src/settings-ai-diagnostics.ts','utf8');
const handlers=fs.readFileSync('src/settings-page-handlers.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');

for(const marker of [
  "import { integrationsHealth } from './environment-health';",
  "import { lineTokenExchangeDiagnostic } from './line-oauth-diagnostics';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  'export const DIAGNOSTIC_DEFINITIONS',
  'Promise.allSettled',
  '⚠️ この診断を実行できませんでした',
  '/api/settings/diagnostics-detail?issue=',
  '初期ロード ${DIAGNOSTIC_DEFINITIONS.length} query',
  'secret、token、Web Push endpoint/鍵は表示しません。',
  "export async function settingsDiagnostics(ctx:AppContext):Promise<Response>{",
  "export async function settingsDiagnosticsDetail(request:Request,ctx:AppContext):Promise<Response>{",
  "repair_unambiguous_task_ranges",
  "UPDATE tasks SET end_at=start_at,updated_at=?",
  "return json({ok:true,issue,repaired_count:Number(repaired.meta.changes||0)})",
  "return json({ok:true,issue,count:Number(counts?.c||0),repairable_count:Number(counts?.repairable||0)})",
  'SELECT id FROM tasks WHERE family_id=? AND id IN (SELECT task_id FROM external_calendar_links WHERE family_id=?) LIMIT 20',
  "return json({ok:true,issue,items:rows.results.map(x=>({id:Number(x.id)})),limited:20})",
]) assert.ok(diagnostics.includes(marker),marker);
assert.ok(!diagnostics.includes("from './app'"),'settings diagnostics must not depend on app.ts');

const start=diagnostics.indexOf('export const DIAGNOSTIC_DEFINITIONS');
const end=diagnostics.indexOf('function environmentAuditHtml');
assert.ok(start>=0&&end>start,'retained settings diagnostics source block must remain locatable');
const diagnosticBlock=diagnostics.slice(start,end);
assert.doesNotMatch(diagnosticBlock,/\bUNION(?:\s+ALL)?\b/i,'settings diagnostics must avoid compound SELECT fan-out');

for(const marker of [
  "import { settingsDiagnosticsDetail } from './settings-diagnostics';",
  "issue!=='ai_generation'",
  "feature:'MORNING_DIGEST'",
  "final_status:generation.status==='AI'?'AI_OK':'FALLBACK_DETERMINISTIC'",
  'line_daily_digest_ai_family_daily WHERE family_id=? AND finalized=1 ORDER BY local_date DESC LIMIT 20',
  'const generation=safeGeneration(row.frame_json);',
  "return json({ok:true,issue:'ai_generation',items,limited:20});",
]) assert.ok(aiDiagnostics.includes(marker),marker);
assert.ok(aiDiagnostics.includes("const ALLOWED_REASONS=new Set(['OK','NOT_CONFIGURED','DISABLED','BUDGET_OR_CIRCUIT','STORAGE','RATE_LIMIT','UPSTREAM','INVALID_OUTPUT','LEGACY']);"),'morning reason allowlist changed');
assert.doesNotMatch(aiDiagnostics,/return\s+\{[^}]*frame_json/s,'raw morning frame must never be returned');
assert.ok(!aiDiagnostics.includes('recap:'),'morning recap must not be projected by diagnostics');
assert.ok(!aiDiagnostics.includes('memberMorning:'),'member morning text must not be projected by diagnostics');
assert.ok(!aiDiagnostics.includes('latitude')&&!aiDiagnostics.includes('longitude'),'coordinates must not enter diagnostics');

assert.ok(handlers.includes("export { settingsDiagnostics } from './settings-diagnostics';"),'settings page handlers must use retained settingsDiagnostics');
const appExport=handlers.split('\n').find(line=>line.includes("from './app'"))||'';
assert.doesNotMatch(appExport,/\bsettingsDiagnostics\b/,'settingsDiagnostics must not remain exported from app.ts');
assert.ok(apiRoutes.includes("import { settingsDiagnosticsDetailWithMorningAi } from './settings-ai-diagnostics';"),'context API dispatcher must import morning AI diagnostics wrapper');
const appImport=apiRoutes.split('\n').find(line=>line.includes("from './app'"))||'';
assert.doesNotMatch(appImport,/\bsettingsDiagnosticsDetail\b/,'settingsDiagnosticsDetail must not remain imported from app.ts');
assert.ok(apiRoutes.includes("if(url.pathname==='/api/settings/diagnostics-detail') return await settingsDiagnosticsDetailWithMorningAi(request,context);"),'diagnostics detail route changed');
assert.ok(pageRoutes.includes("if(url.pathname==='/app/settings_diagnostics.php') return await settingsDiagnostics(context);"),'settings diagnostics page route changed');

console.log('settings-diagnostics-contract: retained diagnostics plus privacy-safe Morning Digest AI history boundary ok');