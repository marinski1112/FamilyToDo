from pathlib import Path
import runpy

try:
    runpy.run_path('.github/patch-329.py', run_name='__main__')
except SystemExit as exc:
    if 'public/assets/task-edit.js: expected exactly one match, found 0' not in str(exc):
        raise

def replace_once(path, old, new):
    p=Path(path)
    s=p.read_text()
    count=s.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(s.replace(old,new,1))

replace_once(
    'public/assets/task-edit.js',
    '<input name="shopping_quantity[]" value="1" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）">',
    '<input name="shopping_quantity[]" value="1" placeholder="数量"><input name="shopping_category[]" list="taskShopCategories" maxlength="255" placeholder="カテゴリー"><input type="url" name="shopping_url[]" placeholder="URL（任意）">',
)
replace_once(
    'public/assets/task-edit.js',
    "quantity:f.querySelectorAll('[name=\"shopping_quantity[]\"]')[j]?.value.trim()||'1',url:f.querySelectorAll('[name=\"shopping_url[]\"]')[j]?.value.trim()||''",
    "quantity:f.querySelectorAll('[name=\"shopping_quantity[]\"]')[j]?.value.trim()||'1',category:f.querySelectorAll('[name=\"shopping_category[]\"]')[j]?.value.trim()||'',url:f.querySelectorAll('[name=\"shopping_url[]\"]')[j]?.value.trim()||''",
)

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
if cs.count(old)!=1:
    raise SystemExit('contract client anchor mismatch')
cs=cs.replace(old,new,1)
anchor="""assert.match(taskEditServer,/INSERT OR IGNORE INTO shopping_assignees\\(shopping_item_id,member_id\\)[\\s\\S]{0,240}?\\.bind\\(sid2,mid,m\\.family_id\\)/,'task edit must preserve shopping assignee linkage');
"""
addition=anchor+"""assert.match(taskEditServer,/existingShopCategoryById=new Map\\(shops\\.results\\.map\\(r=>\\[Number\\(r\\.id\\),String\\(r\\.category\\|\\|'')\\.trim\\(\\)\\|\\|null\\]\\)\\)/,'task edit must retain persisted per-item categories for backward-compatible submissions');
assert.match(taskEditServer,/Object\\.prototype\\.hasOwnProperty\\.call\\(o,'category'\\)/,'task edit must distinguish an explicitly cleared per-item category from a missing legacy category field');
assert.match(taskEditServer,/rawCategory\\.length>255/,'task edit must bound per-item category metadata server-side');
"""
if cs.count(anchor)!=1:
    raise SystemExit('contract server anchor mismatch')
contract.write_text(cs.replace(anchor,addition,1))
