import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0047_web_push_member_family_integrity.sql','utf8');
const webpush=fs.readFileSync('src/webpush.ts','utf8');
const app=fs.readFileSync('src/app.ts','utf8');

const fail=(message)=>{console.error(`web push tenant integrity contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

for(const trigger of ['trg_web_push_member_family_insert','trg_web_push_member_family_update']){
  must(migration.includes(trigger),`missing ${trigger}`);
}
must(/BEFORE INSERT ON web_push_subscriptions/.test(migration),'insert path must be guarded before persistence');
must(/BEFORE UPDATE OF member_id, family_id ON web_push_subscriptions/.test(migration),'tenant-key updates must be guarded before persistence');
const tenantPredicate=/m\.id\s*=\s*NEW\.member_id\s+AND\s+m\.family_id\s*=\s*NEW\.family_id/;
must((migration.match(new RegExp(tenantPredicate.source,'g'))||[]).length===2,'both triggers must require member and family to match');
must(/RAISE\(ABORT, 'web_push_subscription_member_family_mismatch'\)/.test(migration),'tenant mismatch must abort rather than repair or delete data');

must(/WHERE member_id=\? AND family_id=\? AND enabled=1 ORDER BY id DESC LIMIT \?/.test(webpush),'shared member Web Push delivery must remain family + member scoped');
must(/Math\.min\(10,/.test(webpush),'shared Web Push fan-out must remain bounded');
must(/INSERT INTO web_push_subscriptions\(family_id,member_id/.test(app),'subscription registration must persist both tenant keys');
must(/WHERE member_id=\? AND family_id=\?/.test(app),'member-facing Web Push subscription operations must retain family scope');

console.log('web push tenant integrity contract: ok');
