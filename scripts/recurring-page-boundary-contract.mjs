import fs from 'node:fs';

const page=fs.readFileSync('src/recurring-page.ts','utf8');
const helpers=fs.readFileSync('src/task-family-log-template.ts','utf8');
const projection=fs.readFileSync('src/recurrence-projection.ts','utf8');
const settings=fs.readFileSync('src/settings-page-handlers.ts','utf8');
const exceptions=fs.readFileSync('src/exception-routes.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

for(const source of [page,helpers,settings,exceptions])if(source.includes("from './app'"))throw new Error('retained recurring ownership must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { logActivity } from './activity-log';",
  "archiveRecurrenceRuleOccurrenceStatements",
  "archiveTaskChildCompletionStatements",
  "archiveTaskCompletionStatements",
  "import { matchesRecurrence, parseJsonArray } from './recurrence-projection';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "saveTaskFamilyLogTemplate",
  "validateTaskFamilyLogTemplateInput",
  "export async function recurring(request:Request,ctx:AppContext):Promise<Response>{",
  "action==='restore_excluded'",
  "matchesRecurrence(excluded,occurrenceDate)",
  "action==='delete'",
  "action==='update'",
  "edit_scope||'all')==='future'",
  "'recurrence_split_future'",
  "'SPLIT_FUTURE'",
  "DELETE FROM task_completions WHERE task_id=? AND member_id NOT IN",
  "DELETE FROM recurrence_occurrence_completions WHERE member_id NOT IN",
  "UPDATE recurrence_occurrences SET status=CASE WHEN",
  "archiveTaskChildCompletionStatements(ctx.env.DB,m.family_id,taskId,nowJst())",
  "saveTaskFamilyLogTemplate(ctx,newTaskId,b,validatedFamilyLogTemplate)",
  "saveTaskFamilyLogTemplate(ctx,taskId,b,validatedFamilyLogTemplate)",
  "await ensureFamilyLogMemberSubjects(ctx,m.family_id,m.id);",
  "o.status='excluded'",
  "id=\"recurringConfig\"",
  "/assets/recurring.js?v=${APP_VERSION}",
  "action=\"/app/recurring.php\"",
])if(!page.includes(marker))throw new Error(`retained recurring behavior marker missing: ${marker}`);

for(const marker of [
  "export const FAMILY_LOG_TYPES=Object.keys(FAMILY_LOG_TYPE_META);",
  "export const FAMILY_LOG_DETAILS",
  "export async function ensureFamilyLogMemberSubjects",
  "export async function validateTaskFamilyLogTemplateInput",
  "export async function saveTaskFamilyLogTemplate",
  "task_family_log_templates",
  "logType==='HOUSEWORK'",
])if(!helpers.includes(marker))throw new Error(`recurring Family Log helper marker missing: ${marker}`);
for(const marker of ['export function parseJsonArray','export function matchesRecurrence'])if(!projection.includes(marker))throw new Error(`recurrence matching helper must be shared: ${marker}`);
if(!settings.includes("export { recurring } from './recurring-page';"))throw new Error('settings boundary must route recurring through retained page');
if(!exceptions.includes("import { recurring } from './recurring-page';"))throw new Error('early /app/recurring.php route must use retained page');
if(!exceptions.includes("if(url.pathname!=='/app/recurring.php') return null;"))throw new Error('canonical recurring early route changed');
if(!routes.includes("if(url.pathname==='/app/settings_recurring.php') return await recurring(request,context);"))throw new Error('settings recurring alias route changed');

console.log('recurring-page-boundary: retained recurring ownership, split/archive/template/restore semantics ok');
