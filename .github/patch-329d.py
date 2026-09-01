from pathlib import Path
import runpy

try:
    runpy.run_path('.github/patch-329c.py', run_name='__main__')
except SystemExit as exc:
    if 'task-edit add-row category already present unexpectedly' not in str(exc):
        raise

p=Path('public/assets/task-edit.js')
s=p.read_text()
submit_start=s.index('f.onsubmit=')
submit_end=s.index("document.documentElement.dataset.taskEditJs='ready'",submit_start)
submit=s[submit_start:submit_end]
if 'shopping_category[]' not in s[s.index("document.getElementById('addShopRow')"):s.index("document.getElementById('addItemRow')")]:
    raise SystemExit('task-edit add-row per-item category missing')
url_payload=",url:f.querySelectorAll('[name=\"shopping_url[]\"]')[j]?.value.trim()||''"
category_payload=",category:f.querySelectorAll('[name=\"shopping_category[]\"]')[j]?.value.trim()||''"
if category_payload not in submit:
    if submit.count(url_payload)!=1:
        raise SystemExit(f'task-edit payload URL anchor count={submit.count(url_payload)}')
    submit=submit.replace(url_payload,category_payload+url_payload,1)
s=s[:submit_start]+submit+s[submit_end:]
p.write_text(s)

contract=Path('scripts/task-event-shopping-integration-contract.mjs')
cs=contract.read_text()
old="""  'shopping_quantity[]',
  'shopping_url[]',
  'shopping:[...f.querySelectorAll',
"""
new="""  'shopping_quantity[]',
  'shopping_category[]',
  'shopping_url[]',
  'category:f.querySelectorAll(\'[name=\"shopping_category[]\"]\')',
  'shopping:[...f.querySelectorAll',
"""
if old in cs:
    cs=cs.replace(old,new,1)
elif 'shopping_category[]' not in cs:
    raise SystemExit('contract client anchor mismatch')
anchor="""assert.match(taskEditServer,/INSERT OR IGNORE INTO shopping_assignees\\(shopping_item_id,member_id\\)[\\s\\S]{0,240}?\\.bind\\(sid2,mid,m\\.family_id\\)/,'task edit must preserve shopping assignee linkage');
"""
addition=anchor+"""assert.match(taskEditServer,/existingShopCategoryById=new Map\\(shops\\.results\\.map\\(r=>\\[Number\\(r\\.id\\),String\\(r\\.category\\|\\|'')\\.trim\\(\\)\\|\\|null\\]\\)\\)/,'task edit must retain persisted per-item categories for backward-compatible submissions');
assert.match(taskEditServer,/Object\\.prototype\\.hasOwnProperty\\.call\\(o,'category'\\)/,'task edit must distinguish an explicitly cleared per-item category from a missing legacy category field');
assert.match(taskEditServer,/rawCategory\\.length>255/,'task edit must bound per-item category metadata server-side');
"""
if 'existingShopCategoryById=new Map' not in cs:
    if cs.count(anchor)!=1: raise SystemExit('contract server anchor mismatch')
    cs=cs.replace(anchor,addition,1)
contract.write_text(cs)
