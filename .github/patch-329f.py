from pathlib import Path
import runpy

runpy.run_path('.github/patch-329e.py', run_name='__main__')

p=Path('scripts/task-event-shopping-integration-contract.mjs')
cs=p.read_text()
start=cs.index("assert.match(taskEditServer,/existingShopCategoryById=")
end=cs.index("\n\n// Task creation",start)
replacement="""assert.ok(taskEditServer.includes('existingShopCategoryById=new Map(shops.results.map'), 'task edit must retain persisted per-item categories for backward-compatible submissions');
assert.ok(taskEditServer.includes("Object.prototype.hasOwnProperty.call(o,'category')"), 'task edit must distinguish an explicitly cleared per-item category from a missing legacy category field');
assert.ok(taskEditServer.includes('rawCategory.length>255'), 'task edit must bound per-item category metadata server-side');
"""
p.write_text(cs[:start]+replacement+cs[end:])
