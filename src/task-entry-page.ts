import { redirect } from './response';
import { layout } from './app-shell';
import { CALENDAR_COLOR_OPTIONS } from './calendar-colors';
import { resolveShoppingCategoryOptions } from './shopping-categories';
import { APP_VERSION } from './version';

type EntryType='task'|'event';

const esc=(value:unknown)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

/**
 * Canonical create page for Task/Event/Shopping/Item entry.
 * The AI rough-input controls choose the registration type explicitly; the manual
 * Task/Event form is retained only as progressive enhancement/fallback.
 */
export async function taskEntryPage(
  ctx:any,
  date:string,
  returnTo:string='',
  initialType:EntryType='task',
):Promise<Response>{
  if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/task/new.php?date='+date));

  const [members,categoryRows]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all(),
    ctx.env.DB.prepare('SELECT name,enabled FROM shopping_category_catalog WHERE family_id=? ORDER BY name COLLATE NOCASE').bind(ctx.member.family_id).all(),
  ]);
  const categoryOptions=resolveShoppingCategoryOptions(categoryRows.results as any[]);
  const body=`<div class="card form-card"><h1>📝 追加</h1><form id="taskForm" class="compact-form" autocomplete="off">
    <input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}">
    <label>タイトル</label><input name="title" required maxlength="255" autofocus>
    <label>説明</label><textarea name="description" maxlength="5000"></textarea>
    <label class="checkrow private-task-option"><input id="isPrivate" type="checkbox" name="is_private"><span>🔒 自分専用</span></label><p class="small private-task-help">他の家族にはタスク・カレンダー・詳細を表示しません</p>
    <label>日付</label><div class="date-option-row date-range-grid task-date-row"><div><span class="small">開始日</span><input id="taskDate" type="date" name="dateOnly" value="${esc(date)}"></div><div id="endDateWrap"><span class="small">終了日</span><input id="taskEndDate" type="date" name="endDateOnly" value="${esc(date)}"></div><label id="taskNoDateWrap" class="checkrow"><input id="noDate" type="checkbox" name="noDate"><span>期限なし（未整理）</span></label></div>
    <label class="checkrow"><input id="allDay" type="checkbox" name="allDay" checked><span>終日</span></label><div id="dateTimes" class="task-time-fields" style="display:none"><div class="field-block"><label>開始時刻</label><input type="time" name="startTime"></div><div class="field-block"><label>終了時刻</label><input type="time" name="endTime"></div></div>
    <label>場所</label><input name="location" maxlength="500">
    <label>カレンダー表示</label><label class="checkrow"><input id="taskCalendarVisible" type="checkbox" name="calendar_visible" checked><span>カレンダーに表示する</span></label>
    <div id="taskCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color">${CALENDAR_COLOR_OPTIONS.map(option=>`<option value="${option.value}">${esc(option.label)}</option>`).join('')}</select><label class="small" for="taskCalendarCustomColor">カスタム色</label><input id="taskCalendarCustomColor" type="color" value="${CALENDAR_COLOR_OPTIONS[0].value}" aria-label="カレンダーのカスタム色"></div>
    <div id="taskCompletionWrap" data-task-only="1"><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">担当者全員が完了</option></select></div>
    <div id="taskAssigneeWrap" data-task-only="1"><label>担当者</label><div class="assignee-list">${members.results.map((member:any)=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${Number(member.id)}"> ${esc(member.name)}</label>`).join('')}</div></div>
    <label>通知日時（任意）</label><input type="datetime-local" name="reminderAt"><p class="small">指定するとタスク・イベントの詳細を設定した通知方法で通知します。</p>
    <button type="submit">登録する</button>
  </form></div>
  <script type="application/json" id="taskNewPayload">${JSON.stringify({returnTo,categoryOptions,initialType}).replaceAll('<','\u003c').replaceAll('>','\u003e').replaceAll('&','\u0026')}</script>
  <script src="/assets/task-entry-manual.js?v=${APP_VERSION}"></script>`;
  return new Response(layout('追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}});
}
