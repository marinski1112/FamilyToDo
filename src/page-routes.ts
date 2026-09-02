import { loginPage, createFamilyPage, invitePage, home, today, tomorrow } from './core-pages';
import { taskEvents, recurring, taskView, taskEdit, itemEdit } from './task-pages';
import { calendar } from './calendar-page';
import { messages, messageNew } from './messages-pages';
import { shopping, shoppingNew, shoppingEdit } from './shopping-pages';
import { familyLog } from './family-log-page';
import { settings, settingsContent, settingsDiagnostics, settingsMembers, settingsNotifications } from './settings-pages';
import { childJournalPage } from './child-journal';
import { familyLogImportPage } from './family-log-import';
import { googleTasksSettings } from './google-tasks';
import { googleHomeSettings } from './google-home';
import { integrationsSettings } from './google-calendar';
import { calendarImportPage } from './calendar-ics-import';
import { logsPage } from './activity-log-page';
import { DEFAULT_FAMILY_TIMEZONE, familyDate } from './timezone';

function asDateOffset(days:number,timeZone=DEFAULT_FAMILY_TIMEZONE){const base=familyDate(timeZone),d=new Date(`${base}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

export async function dispatchPageRoute(request:Request,context:any,env:any,url:URL):Promise<Response|null>{
  if(url.pathname==='/login.php'||url.pathname==='/login'||url.pathname==='/login_error.php') return await loginPage(env,url.searchParams.get('next')||'/app/index.php');
  if(url.pathname==='/app/create.php'||url.pathname==='/app/create') return await createFamilyPage(context);
  if(url.pathname==='/app/join.php'||url.pathname==='/app/join') return await (url.searchParams.get('token') ? invitePage(context,url.searchParams.get('token')||'') : createFamilyPage(context));
  if(url.pathname==='/family/create.php'||url.pathname==='/family/create') return await createFamilyPage(context);
  if(url.pathname==='/family/join.php'||url.pathname==='/family/join') return await invitePage(context,url.searchParams.get('token')||'');
  if(url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php') return await home(context);
  if(url.pathname==='/today.php') return await today(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
  if(url.pathname==='/tomorrow.php') return await tomorrow(request,context,url.searchParams.get('date')||asDateOffset(1,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
  if(url.pathname==='/app/tasks.php') return await taskEvents(request,context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)));
  if(url.pathname==='/app/calendar.php') return await calendar(request,context,url.searchParams.get('month')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)).slice(0,7));
  if(url.pathname==='/app/messages.php') return await messages(request,context);
  if(url.pathname==='/app/shopping.php') return await shopping(request,context);
  if(url.pathname==='/app/family_log.php'||url.pathname==='/app/settings_family_log.php') return await familyLog(request,context);
  if(url.pathname==='/app/child_journal.php') return await childJournalPage(request,context);
  if(url.pathname==='/app/family_log_import.php') return await familyLogImportPage(context);
  if(url.pathname==='/app/calendar_import.php') return await calendarImportPage(context);
  if(url.pathname==='/app/settings.php') return await settings(request,context);
  if(url.pathname==='/app/settings_google_tasks.php') return await googleTasksSettings(request,context);
  if(url.pathname==='/app/settings_google_home.php') return await googleHomeSettings(request,context);
  if(url.pathname==='/app/settings_integrations.php') return await integrationsSettings(request,context);
  if(url.pathname==='/app/message_new.php') return await messageNew(context);
  if(url.pathname==='/app/shopping_new.php') return await shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));
  if(url.pathname==='/app/settings_content.php') return await settingsContent(context);
  if(url.pathname==='/app/settings_diagnostics.php') return await settingsDiagnostics(context);
  if(url.pathname==='/app/settings_members.php') return await settingsMembers(request,context);
  if(url.pathname==='/app/settings_notifications.php') return await settingsNotifications(request,context);
  if(url.pathname==='/app/settings_recurring.php') return await recurring(request,context);
  if(url.pathname==='/app/logs.php') return await logsPage(context);
  if(url.pathname==='/task/view.php') return await taskView(context,Number(url.searchParams.get('id')||0));
  if(url.pathname==='/task/edit.php') return await taskEdit(request,context,Number(url.searchParams.get('id')||0));
  if(url.pathname==='/item/edit.php') return await itemEdit(request,context,Number(url.searchParams.get('id')||0));
  if(url.pathname==='/app/shopping_edit.php') return await shoppingEdit(request,context,Number(url.searchParams.get('id')||0));
  return null;
}
