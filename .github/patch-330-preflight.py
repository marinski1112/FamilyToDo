from pathlib import Path
import re

app=Path('src/app.ts')
s=app.read_text()
start=s.index('export async function taskEdit(')
end=s.index('export async function taskApiLegacy(',start)
seg=s[start:end]

# Anchor to the POST body read without reconstructing the large retained source.
body_matches=list(re.finditer(r"const b\s*=\s*await\s+bodyJson\([^;]+;",seg))
if len(body_matches)!=1:
    raise SystemExit(f'taskEdit body read count={len(body_matches)}')
body_end=body_matches[0].end()

# Prove this insertion is before every known mutation family in taskEdit.
mutation_markers=['UPDATE notifications SET','UPDATE tasks SET','DELETE FROM task_assignees','INSERT OR IGNORE INTO task_assignees']
mutation_positions=[seg.find(m) for m in mutation_markers if seg.find(m)>=0]
if not mutation_positions:
    raise SystemExit('taskEdit mutation markers missing')
if body_end>=min(mutation_positions):
    raise SystemExit('taskEdit body read unexpectedly follows a database mutation')

preflight="""
    const rawShoppingCategories=Array.isArray(b.shopping)?(b.shopping as unknown[]).slice(0,50):[];
    for(const rawShopping of rawShoppingCategories){
      const raw=rawShopping as Record<string,unknown>|null;
      if(raw&&typeof raw==='object'&&Object.prototype.hasOwnProperty.call(raw,'category')&&String(raw.category||'').trim().length>255) throw new BadRequest('カテゴリーは255文字以内で入力してください。');
    }
    if(String(b.shopping_category||'').trim().length>255) throw new BadRequest('カテゴリーは255文字以内で入力してください。');
"""
if 'const rawShoppingCategories=' in seg:
    raise SystemExit('taskEdit category preflight already present')
seg=seg[:body_end]+preflight+seg[body_end:]
s=s[:start]+seg+s[end:]
app.write_text(s)

contract=Path('scripts/task-event-shopping-integration-contract.mjs')
cs=contract.read_text()
anchor="assert.ok(taskEditServer.includes('rawCategory.length>255'), 'task edit must bound per-item category metadata server-side');\n"
replacement=anchor+"""const shoppingCategoryPreflight=taskEditServer.indexOf('const rawShoppingCategories=');
const firstTaskEditMutation=taskEditServer.indexOf('UPDATE notifications SET');
assert.ok(shoppingCategoryPreflight>=0&&firstTaskEditMutation>shoppingCategoryPreflight,'task edit must validate all submitted shopping categories before database mutations');
assert.ok(taskEditServer.includes("String(b.shopping_category||'').trim().length>255"),'legacy shared category fallback must be bounded before database mutations');
"""
if cs.count(anchor)!=1:
    raise SystemExit(f'contract preflight anchor count={cs.count(anchor)}')
contract.write_text(cs.replace(anchor,replacement,1))
