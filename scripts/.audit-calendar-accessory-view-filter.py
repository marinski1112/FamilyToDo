from pathlib import Path

app = Path('src/app.ts')
text = app.read_text()
old = """  const visibleRecur=recurRows.filter(t=>Number(t.calendar_visible??1)===1 && view!=='private' && (view!=='assigned'||String(t.assignee_ids||'').split(',').map(Number).includes(member.id)));
  const [shopping,items]=await Promise.all([
    ctx.env.DB.prepare(`SELECT s.*,t.title task_title,(SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id) assignees FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')}) AND s.due_date BETWEEN ? AND ? ORDER BY s.due_date,s.category,s.name,s.id`).bind(fid,member.id,from,to).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*,(SELECT GROUP_CONCAT(m.name,'、') FROM item_assignees ia JOIN members m ON m.id=ia.member_id AND m.active=1 WHERE ia.item_id=i.id) assignees FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id WHERE i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('pt')}) AND i.due_at IS NOT NULL AND date(i.due_at) BETWEEN date(?) AND date(?) ORDER BY i.due_at,i.id`).bind(fid,member.id,from,to).all<Row>()
  ]);"""
new = """  const visibleRecur=recurRows.filter(t=>Number(t.calendar_visible??1)===1 && view!=='private' && (view!=='assigned'||String(t.assignee_ids||'').split(',').map(Number).includes(member.id)));
  const shoppingViewSql=view==='family'?\" AND (s.task_id IS NULL OR t.visibility_scope='FAMILY')\":view==='assigned'?\" AND (s.task_id IS NULL OR t.visibility_scope='FAMILY') AND EXISTS (SELECT 1 FROM shopping_assignees viewer_sa WHERE viewer_sa.shopping_item_id=s.id AND viewer_sa.member_id=?)\":view==='private'?\" AND s.task_id IS NOT NULL AND t.visibility_scope='PRIVATE' AND t.private_owner_id=?\":'';
  const itemViewSql=view==='family'?\" AND (i.task_id IS NULL OR pt.visibility_scope='FAMILY')\":view==='assigned'?\" AND (i.task_id IS NULL OR pt.visibility_scope='FAMILY') AND EXISTS (SELECT 1 FROM item_assignees viewer_ia WHERE viewer_ia.item_id=i.id AND viewer_ia.member_id=?)\":view==='private'?\" AND i.task_id IS NOT NULL AND pt.visibility_scope='PRIVATE' AND pt.private_owner_id=?\":'';
  const accessoryViewBinds=(view==='assigned'||view==='private')?[member.id]:[];
  const [shopping,items]=await Promise.all([
    ctx.env.DB.prepare(`SELECT s.*,t.title task_title,(SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id) assignees FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')}) ${shoppingViewSql} AND s.due_date BETWEEN ? AND ? ORDER BY s.due_date,s.category,s.name,s.id`).bind(fid,member.id,...accessoryViewBinds,from,to).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*,(SELECT GROUP_CONCAT(m.name,'、') FROM item_assignees ia JOIN members m ON m.id=ia.member_id AND m.active=1 WHERE ia.item_id=i.id) assignees FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id WHERE i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('pt')}) ${itemViewSql} AND i.due_at IS NOT NULL AND date(i.due_at) BETWEEN date(?) AND date(?) ORDER BY i.due_at,i.id`).bind(fid,member.id,...accessoryViewBinds,from,to).all<Row>()
  ]);"""
if old not in text:
    raise SystemExit('calendar accessory query block did not match expected branch source')
app.write_text(text.replace(old, new, 1))

Path('scripts/calendar-accessory-view-filter-contract.mjs').write_text("""import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('src/app.ts','utf8');
const calendarStart=source.indexOf('export async function calendar(');
const calendarEnd=source.indexOf('export function calendarDisplayLabel',calendarStart);
assert.ok(calendarStart>=0&&calendarEnd>calendarStart,'calendar handler must exist');
const calendar=source.slice(calendarStart,calendarEnd);

assert.match(calendar,/const shoppingViewSql=view==='family'\?\" AND \(s\.task_id IS NULL OR t\.visibility_scope='FAMILY'\)\"/,'family view must exclude shopping attached to PRIVATE tasks while retaining unlinked family shopping');
assert.match(calendar,/view==='assigned'\?\" AND \(s\.task_id IS NULL OR t\.visibility_scope='FAMILY'\) AND EXISTS \(SELECT 1 FROM shopping_assignees viewer_sa WHERE viewer_sa\.shopping_item_id=s\.id AND viewer_sa\.member_id=\?\)\"/,'assigned view must use shopping assignees and exclude PRIVATE-parent shopping');
assert.match(calendar,/view==='private'\?\" AND s\.task_id IS NOT NULL AND t\.visibility_scope='PRIVATE' AND t\.private_owner_id=\?\"/,'private view must show only owner-visible shopping attached to PRIVATE tasks');
assert.match(calendar,/const itemViewSql=view==='family'\?\" AND \(i\.task_id IS NULL OR pt\.visibility_scope='FAMILY'\)\"/,'family view must exclude belongings attached to PRIVATE tasks while retaining unlinked family belongings');
assert.match(calendar,/view==='assigned'\?\" AND \(i\.task_id IS NULL OR pt\.visibility_scope='FAMILY'\) AND EXISTS \(SELECT 1 FROM item_assignees viewer_ia WHERE viewer_ia\.item_id=i\.id AND viewer_ia\.member_id=\?\)\"/,'assigned view must use item assignees and exclude PRIVATE-parent belongings');
assert.match(calendar,/view==='private'\?\" AND i\.task_id IS NOT NULL AND pt\.visibility_scope='PRIVATE' AND pt\.private_owner_id=\?\"/,'private view must show only owner-visible belongings attached to PRIVATE tasks');
assert.match(calendar,/\$\{shoppingViewSql\} AND s\.due_date BETWEEN \? AND \?/,'shopping query must apply the active Calendar view');
assert.match(calendar,/\$\{itemViewSql\} AND i\.due_at IS NOT NULL/,'belongings query must apply the active Calendar view');
const binds=calendar.match(/\.bind\(fid,member\.id,\.\.\.accessoryViewBinds,from,to\)\.all<Row>\(\)/g)||[];
assert.equal(binds.length,2,'shopping and belongings queries must bind assigned/private member predicates');
console.log('Calendar accessory view filter contract: ok');
""")

bundle = Path('scripts/feature-contract-bundle.mjs')
bundle_text = bundle.read_text()
marker = "    ['calendar-presentation',['node','scripts/calendar-presentation-contract.mjs']],\n"
addition = marker + "    ['calendar-accessory-view-filter',['node','scripts/calendar-accessory-view-filter-contract.mjs']],\n"
if marker not in bundle_text:
    raise SystemExit('calendar feature bundle marker missing')
if 'calendar-accessory-view-filter-contract.mjs' not in bundle_text:
    bundle.write_text(bundle_text.replace(marker, addition, 1))
