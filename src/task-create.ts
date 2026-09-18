import {
  TASK_CREATE_SCOPE,
  acquireTaskCreateClaim,
  markTaskCreateClaimError,
  readCompletedTaskCreate,
  taskCreateRequestHash,
} from './task-create-idempotency';

export type TaskCreateShoppingInput = {
  name: string;
  quantity: string;
  category: string | null;
  url: string | null;
};

export type TaskCreateInput = {
  familyId: number;
  memberId: number;
  idempotencyKey: string;
  title: string;
  description: string | null;
  dueValue: string | null;
  completionMode: 'ANY' | 'ALL';
  start: string | null;
  end: string | null;
  location: string | null;
  allDay: boolean;
  calendarVisible: number;
  calendarColor: string;
  taskKind: 'TASK' | 'EVENT';
  reminderAt: string | null;
  visibilityScope: 'FAMILY' | 'PRIVATE';
  privateOwnerId: number | null;
  parentTaskId: number | null;
  assigneeIds: number[];
  shopping: TaskCreateShoppingInput[];
  shoppingDueDate: string | null;
  shoppingCatalogName: string | null;
  itemNames: string[];
  itemDueAt: string | null;
};

export type TaskCreateResult =
  | { state: 'CREATED'; taskId: number }
  | { state: 'REPLAY'; taskId: number }
  | { state: 'GONE' }
  | { state: 'BUSY' }
  | { state: 'CONFLICT' }
  | { state: 'LEASE_LOST' };

const nowJst = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date()).replace(' ', ' ');

function requestFingerprint(input: TaskCreateInput) {
  return {
    title: input.title,
    description: input.description,
    dueValue: input.dueValue,
    completionMode: input.completionMode,
    start: input.start,
    end: input.end,
    location: input.location,
    allDay: input.allDay,
    calendarVisible: input.calendarVisible,
    calendarColor: input.calendarColor,
    taskKind: input.taskKind,
    reminderAt: input.reminderAt,
    visibilityScope: input.visibilityScope,
    privateOwnerId: input.privateOwnerId,
    parentTaskId: input.parentTaskId,
    assigneeIds: input.assigneeIds,
    shopping: input.shopping,
    shoppingDueDate: input.shoppingDueDate,
    shoppingCatalogName: input.shoppingCatalogName,
    itemNames: input.itemNames,
    itemDueAt: input.itemDueAt,
  };
}

export async function createTaskIdempotently(db: D1Database, input: TaskCreateInput): Promise<TaskCreateResult> {
  const requestHash = await taskCreateRequestHash(requestFingerprint(input));
  const claim = await acquireTaskCreateClaim(db, input.familyId, input.memberId, input.idempotencyKey, requestHash);
  if (claim.state === 'REPLAY') return { state: 'REPLAY', taskId: claim.taskId };
  if (claim.state === 'GONE') return { state: 'GONE' };
  if (claim.state === 'BUSY') return { state: 'BUSY' };
  if (claim.state === 'CONFLICT') return { state: 'CONFLICT' };

  const token = claim.token;
  const createdAt = nowJst();
  const guardNow = new Date().toISOString();
  const itemGroupKey = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  const assigneesJson = JSON.stringify(input.assigneeIds);
  const shoppingJson = JSON.stringify(input.shopping);
  const itemsJson = JSON.stringify(input.itemNames);
  const notificationMessage = `【タスク】${input.title}\n${input.description?.trim() || '詳細なし'}${input.start ? '\n予定: ' + input.start.slice(0, 16) : ''}${input.end ? ' ～ ' + input.end.slice(11, 16) : ''}${input.location?.trim() ? '\n場所: ' + input.location.trim() : ''}`;
  const guard = `r.family_id=? AND r.member_id=? AND r.scope=? AND r.idempotency_key=? AND r.request_hash=? AND r.status='PROCESSING' AND r.lease_token=? AND COALESCE(r.lease_expires_at,'')>?`;
  const guardArgs = () => [input.familyId, input.memberId, TASK_CREATE_SCOPE, input.idempotencyKey, requestHash, token, guardNow] as const;
  const statements: D1PreparedStatement[] = [];

  statements.push(db.prepare(`INSERT INTO tasks(
      family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,
      start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,
      visibility_scope,private_owner_id,parent_task_id,create_request_id
    )
    SELECT ?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,r.id
    FROM task_create_requests r
    WHERE ${guard}`)
    .bind(
      input.familyId, input.title, input.description, input.dueValue, input.completionMode, input.memberId,
      createdAt, createdAt, input.start, input.end, input.location, input.allDay ? 1 : 0, input.calendarVisible,
      input.calendarColor, input.taskKind, 0, input.reminderAt, input.visibilityScope, input.privateOwnerId,
      input.parentTaskId, ...guardArgs(),
    ));

  statements.push(db.prepare(`INSERT OR IGNORE INTO task_assignees(task_id,member_id)
    SELECT t.id,m.id
    FROM tasks t
    JOIN task_create_requests r ON r.id=t.create_request_id
    JOIN json_each(?) a
    JOIN members m ON m.id=CAST(a.value AS INTEGER) AND m.family_id=? AND m.active=1
    WHERE ${guard}`)
    .bind(assigneesJson, input.familyId, ...guardArgs()));

  if (input.shoppingCatalogName) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO shopping_categories(family_id,name,created_at)
      SELECT ?,?,?
      WHERE EXISTS(SELECT 1 FROM task_create_requests r WHERE ${guard})`)
      .bind(input.familyId, input.shoppingCatalogName, createdAt, ...guardArgs()));
  }

  statements.push(db.prepare(`INSERT INTO shopping_items(
      family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url
    )
    SELECT ?,CAST(json_extract(j.value,'$.name') AS TEXT),
      COALESCE(NULLIF(CAST(json_extract(j.value,'$.quantity') AS TEXT),''),'1'),
      NULLIF(CAST(json_extract(j.value,'$.category') AS TEXT),''),NULL,?,'pending',?,?,?,t.id,
      NULLIF(CAST(json_extract(j.value,'$.url') AS TEXT),'')
    FROM tasks t
    JOIN task_create_requests r ON r.id=t.create_request_id
    JOIN json_each(?) j
    WHERE ${guard}`)
    .bind(input.familyId, input.shoppingDueDate, input.memberId, createdAt, createdAt, shoppingJson, ...guardArgs()));

  statements.push(db.prepare(`INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id)
    SELECT s.id,m.id
    FROM tasks t
    JOIN task_create_requests r ON r.id=t.create_request_id
    JOIN shopping_items s ON s.task_id=t.id AND s.family_id=t.family_id
    JOIN json_each(?) a
    JOIN members m ON m.id=CAST(a.value AS INTEGER) AND m.family_id=? AND m.active=1
    WHERE ${guard}`)
    .bind(assigneesJson, input.familyId, ...guardArgs()));

  statements.push(db.prepare(`INSERT INTO items(
      family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key
    )
    SELECT ?,CAST(j.value AS TEXT),NULL,?,'pending','ANY',?,?,?,t.id,?
    FROM tasks t
    JOIN task_create_requests r ON r.id=t.create_request_id
    JOIN json_each(?) j
    WHERE ${guard}`)
    .bind(input.familyId, input.itemDueAt, input.memberId, createdAt, createdAt, itemGroupKey, itemsJson, ...guardArgs()));

  statements.push(db.prepare(`INSERT OR IGNORE INTO item_assignees(item_id,member_id)
    SELECT i.id,m.id
    FROM tasks t
    JOIN task_create_requests r ON r.id=t.create_request_id
    JOIN items i ON i.task_id=t.id AND i.family_id=t.family_id
    JOIN json_each(?) a
    JOIN members m ON m.id=CAST(a.value AS INTEGER) AND m.family_id=? AND m.active=1
    WHERE ${guard}`)
    .bind(assigneesJson, input.familyId, ...guardArgs()));

  if (input.reminderAt && input.assigneeIds.length) {
    statements.push(db.prepare(`INSERT INTO notifications(
        family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at
      )
      SELECT ?,m.id,'task_reminder','task',t.id,?,'pending',?,?
      FROM tasks t
      JOIN task_create_requests r ON r.id=t.create_request_id
      JOIN json_each(?) a
      JOIN members m ON m.id=CAST(a.value AS INTEGER) AND m.family_id=? AND m.active=1
      WHERE ${guard}`)
      .bind(input.familyId, input.reminderAt, notificationMessage, createdAt, assigneesJson, input.familyId, ...guardArgs()));
  }

  if (input.visibilityScope === 'FAMILY') {
    statements.push(db.prepare(`INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at)
      SELECT ?,?,'CREATED','task',t.id,?,?
      FROM tasks t
      JOIN task_create_requests r ON r.id=t.create_request_id
      WHERE ${guard}`)
      .bind(input.familyId, input.memberId, JSON.stringify({ title: input.title }), createdAt, ...guardArgs()));
  }

  statements.push(db.prepare(`UPDATE task_create_requests
    SET status='DONE',task_id=(SELECT id FROM tasks WHERE create_request_id=task_create_requests.id),
        lease_token=NULL,lease_expires_at=NULL,updated_at=?
    WHERE family_id=? AND member_id=? AND scope=? AND idempotency_key=? AND request_hash=?
      AND status='PROCESSING' AND lease_token=? AND COALESCE(lease_expires_at,'')>?
      AND EXISTS(SELECT 1 FROM tasks t WHERE t.create_request_id=task_create_requests.id)`)
    .bind(createdAt, input.familyId, input.memberId, TASK_CREATE_SCOPE, input.idempotencyKey, requestHash, token, guardNow));

  try {
    const results = await db.batch(statements);
    const finalized = results[results.length - 1];
    if (Number(finalized?.meta?.changes || 0) !== 1) {
      const replayId = await readCompletedTaskCreate(db, input.familyId, input.memberId, input.idempotencyKey, requestHash);
      return replayId > 0 ? { state: 'REPLAY', taskId: replayId } : { state: 'LEASE_LOST' };
    }
  } catch (error) {
    await markTaskCreateClaimError(db, input.familyId, input.memberId, input.idempotencyKey, requestHash, token).catch(() => {});
    throw error;
  }

  const taskId = await readCompletedTaskCreate(db, input.familyId, input.memberId, input.idempotencyKey, requestHash);
  if (taskId <= 0) return { state: 'LEASE_LOST' };
  return { state: 'CREATED', taskId };
}
