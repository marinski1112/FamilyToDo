import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const api=fs.readFileSync('src/family-log-media-api.ts','utf8');
const page=fs.readFileSync('src/child-journal.ts','utf8');
const journal=api.match(/const JOURNAL_PARENT_SQL=`([\s\S]*?)`;/)[1];
const predicate=api.match(/const PHOTO_PARENT_SQL=`([\s\S]*?)`;/)[1].replace('${JOURNAL_PARENT_SQL}',journal);
assert.equal((api.match(/\$\{PHOTO_PARENT_SQL\}/g)||[]).length,4,'read/list/upload/reconciliation must share eligibility');
assert.ok(api.includes('Number(parent.media_eligible)===1'));
assert.ok(api.includes('CSRF_FAILED')&&api.includes('await activeMember('));
assert.ok(page.includes('journalPhotos:true')&&page.includes('journalLogIds:entries.results.map'));
assert.ok(page.includes('l.subject_id=j.subject_id'));
assert.ok(page.includes('family-log-baby-food-media.js?v=journal-photo1'));
const test=spawnSync('python3',['-c',`
import json,sqlite3,sys
p=json.load(sys.stdin)
d=sqlite3.connect(':memory:')
d.executescript('''CREATE TABLE family_logs(id INTEGER,family_id INTEGER,subject_id INTEGER,deleted_at TEXT,log_type TEXT,detail_code TEXT);
CREATE TABLE family_log_subjects(id INTEGER,family_id INTEGER,subject_kind TEXT,active INTEGER);
CREATE TABLE family_log_journal_entries(log_id INTEGER,family_id INTEGER,subject_id INTEGER,journal_kind TEXT,entry_kind TEXT);
INSERT INTO family_log_subjects VALUES(1,1,'BABY',1),(2,2,'CHILD',1),(3,1,'PET',1);
INSERT INTO family_logs VALUES(1,1,1,NULL,'MEAL','BABY_FOOD'),(2,1,1,NULL,'MEMO','JOURNAL_MEMO'),(3,2,2,NULL,'MEMO','JOURNAL_MEMO'),(4,1,3,NULL,'MEMO','JOURNAL_MEMO'),(5,1,1,NULL,'MEMO','JOURNAL_MEMO'),(6,1,1,NULL,'MEAL','BREAKFAST'),(7,1,1,'deleted','MEMO','JOURNAL_MEMO'),(8,1,1,NULL,'HEIGHT','JOURNAL_HEIGHT'),(9,1,1,NULL,'MEMO','JOURNAL_FIRST_STEP');
INSERT INTO family_log_journal_entries VALUES(2,1,1,'CHILD','MEMO'),(3,2,2,'CHILD','MEMO'),(4,1,3,'CHILD','MEMO'),(5,2,1,'CHILD','MEMO'),(6,1,1,'CHILD','MEMO'),(7,1,1,'CHILD','MEMO'),(8,1,1,'CHILD','MEASUREMENT'),(9,1,1,'CHILD','MILESTONE');''')
q="SELECT l.id FROM family_logs l JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id WHERE l.family_id=? AND l.deleted_at IS NULL AND s.subject_kind IN ('BABY','CHILD') AND "+p+" ORDER BY l.id"
assert [x[0] for x in d.execute(q,(1,))]==[1,2,8,9]
assert [x[0] for x in d.execute(q,(2,))]==[3]
d.execute("UPDATE family_logs SET detail_code='OTHER' WHERE id=2")
assert 2 not in [x[0] for x in d.execute(q,(1,))], 'edited non-journal parent loses photo eligibility'
d.execute('UPDATE family_log_journal_entries SET subject_id=99 WHERE log_id=8')
assert 8 not in [x[0] for x in d.execute(q,(1,))], 'subject mismatch rejected'
print('journal photo SQL: valid membership, tenant/subject/deleted/type boundaries ok')
`],{input:JSON.stringify(predicate),encoding:'utf8'});
assert.equal(test.status,0,test.stderr);process.stdout.write(test.stdout);
