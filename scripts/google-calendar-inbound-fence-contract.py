import pathlib
import sqlite3
import time

source = pathlib.Path('src/google-calendar-inbound-auto.ts').read_text()
migration = pathlib.Path('migrations/0109_google_calendar_inbound_lease_fence.sql').read_text()
for marker in ('await renewState(env,target.familyId,state.leaseToken)', 'owned(await env.DB.prepare',
               'if(error instanceof LeaseLost)return', 'env.DB.batch(statements)',
               'google_calendar_inbound_lease_fence'):
    assert marker in source, marker

db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE google_calendar_inbound_sync_state (family_id INTEGER PRIMARY KEY, lease_token TEXT, lease_expires_at INTEGER, page_token TEXT, last_error TEXT)')
db.execute('CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT)')
db.execute('CREATE TABLE google_calendar_inbound_links (id INTEGER PRIMARY KEY, task_id INTEGER, external_event_id TEXT UNIQUE)')
db.executescript(migration)
now = int(time.time())
db.execute('INSERT INTO google_calendar_inbound_sync_state VALUES (1, ?, ?, NULL, NULL)', ('A', now+120))
db.commit()

def batch(token, event):
    try:
        with db:
            db.execute('INSERT INTO google_calendar_inbound_lease_fence VALUES (1,?,?) ON CONFLICT(family_id) DO UPDATE SET lease_token=excluded.lease_token,checked_at=excluded.checked_at', (token,'now'))
            db.execute('INSERT INTO tasks(title) VALUES (?)', (event,))
            db.execute('INSERT INTO google_calendar_inbound_links(task_id,external_event_id) VALUES (last_insert_rowid(),?)', (event,))
        return True
    except sqlite3.IntegrityError:
        return False

# A owns the first page. After takeover, its stale candidate batch must be atomic.
assert batch('A','first')
db.execute('UPDATE google_calendar_inbound_sync_state SET lease_token=?,lease_expires_at=? WHERE family_id=1', ('B',now+120))
db.commit()
assert not batch('A','lost-during-fetch')
assert not batch('A','lost-before-insert')
assert not batch('A','lost-before-checkpoint')
assert db.execute('SELECT count(*) FROM tasks').fetchone()[0] == 1
assert db.execute('SELECT count(*) FROM google_calendar_inbound_links').fetchone()[0] == 1
assert db.execute('UPDATE google_calendar_inbound_sync_state SET page_token=? WHERE family_id=1 AND lease_token=? AND lease_expires_at>?', ('stale','A',now)).rowcount == 0
assert db.execute('UPDATE google_calendar_inbound_sync_state SET last_error=? WHERE family_id=1 AND lease_token=? AND lease_expires_at>?', ('stale','A',now)).rowcount == 0
assert db.execute('UPDATE google_calendar_inbound_sync_state SET lease_token=NULL WHERE family_id=1 AND lease_token=? AND lease_expires_at>?', ('A',now)).rowcount == 0
assert batch('B','next-page')
assert not batch('B','next-page')  # replay is rolled back; no duplicate task
assert db.execute('SELECT count(*) FROM tasks').fetchone()[0] == 2
assert db.execute('SELECT count(*) FROM google_calendar_inbound_links').fetchone()[0] == 2
assert db.execute('SELECT lease_token FROM google_calendar_inbound_sync_state').fetchone()[0] == 'B'
db.execute('UPDATE google_calendar_inbound_sync_state SET lease_expires_at=? WHERE family_id=1', (now-1,))
db.commit()
assert not batch('B','expired')
assert db.execute('SELECT count(*) FROM tasks').fetchone()[0] == 2
print('Google inbound lease fence: takeover, stale checkpoints/error/release, replay and expiry OK')
