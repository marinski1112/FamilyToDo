from pathlib import Path

app=Path('src/app.ts')
s=app.read_text()
old="const rawCategory=Object.prototype.hasOwnProperty.call(o,'category')?String(o.category||'').trim():(fallbackCategory||existingShopCategoryById.get(sid)||'');"
new="const rawCategory=Object.prototype.hasOwnProperty.call(o,'category')?String(o.category||'').trim():(existingShopCategoryById.get(sid)||fallbackCategory||'');"
if s.count(old)!=1:
    raise SystemExit(f'category precedence anchor count={s.count(old)}')
app.write_text(s.replace(old,new,1))

contract=Path('scripts/task-event-shopping-integration-contract.mjs')
cs=contract.read_text()
anchor="assert.ok(taskEditServer.includes('rawCategory.length>255'), 'task edit must bound per-item category metadata server-side');\n"
addition=anchor+"assert.ok(taskEditServer.includes(\"(existingShopCategoryById.get(sid)||fallbackCategory||'')\"), 'legacy task edit submissions must preserve each persisted category before using the shared fallback');\n"
if cs.count(anchor)!=1:
    raise SystemExit(f'contract precedence anchor count={cs.count(anchor)}')
contract.write_text(cs.replace(anchor,addition,1))
