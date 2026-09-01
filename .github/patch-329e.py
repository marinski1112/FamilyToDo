from pathlib import Path
import runpy

runpy.run_path('.github/patch-329d.py', run_name='__main__')

contract=Path('scripts/task-event-shopping-integration-contract.mjs')
cs=contract.read_text()
broken="  'category:f.querySelectorAll('[name=\"shopping_category[]\"]')',\n"
if cs.count(broken)!=1:
    raise SystemExit(f'broken contract quoting anchor count={cs.count(broken)}')
contract.write_text(cs.replace(broken,'',1))
