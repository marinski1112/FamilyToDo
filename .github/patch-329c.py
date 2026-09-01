from pathlib import Path
import runpy

try:
    runpy.run_path('.github/patch-329b.py', run_name='__main__')
except SystemExit as exc:
    if 'public/assets/task-edit.js: expected exactly one match, found 0' not in str(exc):
        raise

p=Path('public/assets/task-edit.js')
s=p.read_text()
# The retained file is minified into a few long lines. Patch by unique semantic neighbors
# instead of reserializing the source or depending on whitespace/quote formatting.
qty_marker='shopping_quantity[]'
add_start=s.index("document.getElementById('addShopRow')")
add_end=s.index("document.getElementById('addItemRow')",add_start)
add=s[add_start:add_end]
url_marker='name="shopping_url[]"'
url_pos=add.index(url_marker)
input_pos=add.rfind('<input',0,url_pos)
category_html='<input name="shopping_category[]" list="taskShopCategories" maxlength="255" placeholder="カテゴリー">'
if 'shopping_category[]' in add:
    raise SystemExit('task-edit add-row category already present unexpectedly')
add=add[:input_pos]+category_html+add[input_pos:]
s=s[:add_start]+add+s[add_end:]

submit_start=s.index('f.onsubmit=')
submit_end=s.index("document.documentElement.dataset.taskEditJs='ready'",submit_start)
submit=s[submit_start:submit_end]
url_payload=",url:f.querySelectorAll('[name=\"shopping_url[]\"]')[j]?.value.trim()||''"
if submit.count(url_payload)!=1:
    raise SystemExit(f'task-edit payload URL anchor count={submit.count(url_payload)}')
category_payload=",category:f.querySelectorAll('[name=\"shopping_category[]\"]')[j]?.value.trim()||''"
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
if cs.count(old)!=1: raise SystemExit('contract client anchor mismatch')
cs=cs.replace(old,new,1)
anchor="""assert.match(taskEditServer,/INSERT OR IGNORE INTO shopping_assignees\\(shopping_item_id,member_id\\)[\\s\\S]{0,240}?\\.bind\\(sid2,mid,m\\.family_id\\)/,'task edit must preserve shopping assignee linkage');
"""
addition=anchor+"""assert.match(taskEditServer,/existingShopCategoryById=new Map\\(shops\\.results\\.map\\(r=>\\[Number\\(r\\.id\\),String\\(r\\.category\\|\\|'')\\.trim\\(\\)\\|\\|null\\]\\)\\)/,'task edit must retain persisted per-item categories for backward-compatible submissions');
assert.match(taskEditServer,/Object\\.prototype\\.hasOwnProperty\\.call\\(o,'category'\\)/,'task edit must distinguish an explicitly cleared per-item category from a missing legacy category field');
assert.match(taskEditServer,/rawCategory\\.length>255/,'task edit must bound per-item category metadata server-side');
"""
if cs.count(anchor)!=1: raise SystemExit('contract server anchor mismatch')
contract.write_text(cs.replace(anchor,addition,1))
