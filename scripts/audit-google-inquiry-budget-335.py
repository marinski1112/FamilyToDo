from pathlib import Path
p=Path('src/google-tasks.ts')
s=p.read_text()
old="export const MAX_D1_QUERY_BUDGET=40;\nexport const MAX_TASKS_PER_INVOCATION=8;"
new="export const MAX_D1_QUERY_BUDGET=40;\n// A page can be all INQUIRY commands; keep the requested page itself inside the D1 statement budget.\nexport const MAX_TASKS_PER_INVOCATION=3;"
assert s.count(old)==1
p.write_text(s.replace(old,new))

c=Path('scripts/google-tasks-inquiry-runtime-wiring-contract.mjs')
s=c.read_text()
needle="must(tasks.includes(\"if(inquiry!=='not-inquiry')\"),'non-inquiry commands must fall through');\n"
insert=needle+"must(tasks.includes('MAX_D1_QUERY_BUDGET=40')&&tasks.includes('MAX_TASKS_PER_INVOCATION=3'),'inbound page size must reserve D1 budget for an all-inquiry page');\nmust(tasks.includes('maxResults:String(MAX_TASKS_PER_INVOCATION)')&&tasks.includes('.slice(0,MAX_TASKS_PER_INVOCATION)'),'fetch and processing caps must stay aligned so no fetched command is dropped');\n"
assert s.count(needle)==1
c.write_text(s.replace(needle,insert))

g=Path('scripts/google-integration-contract.mjs')
s=g.read_text()
old="assert.match(tasks,/MAX_D1_QUERY_BUDGET=40/);assert.match(tasks,/MAX_TASKS_PER_INVOCATION=8/);"
new="assert.match(tasks,/MAX_D1_QUERY_BUDGET=40/);assert.match(tasks,/MAX_TASKS_PER_INVOCATION=3/);"
assert s.count(old)==1
g.write_text(s.replace(old,new))

sync=Path('scripts/google-tasks-sync-contract.mjs')
s=sync.read_text()
s=s.replace("'MAX_TASKS_PER_INVOCATION=8'","'MAX_TASKS_PER_INVOCATION=3'")
s=s.replace("// Worst case: scheduler selection + lease + 8 * (identity lookup + domain insert + assignee + receipt) + cursor commit.\nassert.ok(1+1+8*4+1<=40);","// Worst-case all-INQUIRY page: scheduler selection + lease + 3 * conservative ten-statement command cost + cursor commit.\nassert.ok(1+1+3*10+1<=40);")
s=s.replace("while(remaining){remaining-=Math.min(8,remaining);invocations++;}\nassert.equal(invocations,25);","while(remaining){remaining-=Math.min(3,remaining);invocations++;}\nassert.equal(invocations,67);")
assert "MAX_TASKS_PER_INVOCATION=8" not in s
assert "Math.min(8,remaining)" not in s
sync.write_text(s)
