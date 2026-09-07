import { sendWebPush, webPushConfigured } from './webpush';
import { logNotificationFailure } from './observability/errors';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

export async function processNotifications(env: Env): Promise<void> {
  // Keep the five-minute empty path to one bounded, indexed due-work query.
  // Cross-table lifecycle repair/auditing is scheduled separately; send-time
  // EXISTS guards below preserve tenant, visibility, deletion and recurrence safety.
  const due = await env.DB.prepare(`SELECT n.id,n.family_id,n.member_id,n.target_type,n.target_id,n.message
    FROM notifications n
    JOIN members m ON m.id=n.member_id AND m.family_id=n.family_id
    WHERE n.status IN ('pending','retry')
      AND n.sent_at IS NULL
      AND n.notify_at<=?
      AND m.active=1
      AND m.deleted_at IS NULL
      AND m.notification_enabled=1
      AND (
        (n.target_type='task' AND n.target_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.id=n.target_id AND t.family_id=n.family_id
            AND lower(COALESCE(t.status,''))<>'completed'
            AND (COALESCE(t.visibility_scope,'FAMILY')<>'PRIVATE' OR t.private_owner_id=n.member_id)
            AND (
              lower(COALESCE(t.task_kind,'')) NOT IN ('recurring','recurrence_template')
              OR EXISTS (
                SELECT 1 FROM recurrence_rules r
                WHERE r.task_id=t.id AND r.family_id=t.family_id AND r.active=1 AND r.deleted_at IS NULL
              )
            )
        ))
        OR (n.target_type='message' AND n.target_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM messages x WHERE x.id=n.target_id AND x.family_id=n.family_id
        ))
        OR n.target_type IS NULL
        OR n.target_type NOT IN ('task','message')
      )
    ORDER BY n.notify_at,n.id
    LIMIT 50`).bind(nowJst()).all();
  for(const n of due.results) {
    try {
      if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');
      const subs=await env.DB.prepare('SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1 ORDER BY id DESC LIMIT 10').bind(Number(n.member_id),Number(n.family_id)).all();
      if(!subs.results.length)throw new Error('Web Push subscription is not registered.');
      let sent=0;
      for(const sub of subs.results){
        const result=await sendWebPush(env,{id:Number(sub.id),endpoint:String(sub.endpoint),p256dh:String(sub.p256dh),auth:String(sub.auth)},{title:'Family TODO LINE',body:String(n.message||'Family TODO LINEからのお知らせです。'),url:n.target_type==='message'?'/app/messages.php':'/app/tasks.php',tag:`familytodo-${String(n.target_type||'notice')}-${String(n.target_id||n.id)}`});
        if(result.ok){sent++;await env.DB.prepare('UPDATE web_push_subscriptions SET last_success_at=?,last_error=NULL,failure_count=0,updated_at=? WHERE id=?').bind(nowJst(),nowJst(),Number(sub.id)).run();}
        else if(result.gone){await env.DB.prepare('DELETE FROM web_push_subscriptions WHERE id=?').bind(Number(sub.id)).run();}
        else{await env.DB.prepare('UPDATE web_push_subscriptions SET failure_count=failure_count+1,last_error=?,updated_at=? WHERE id=?').bind(String(result.error||`HTTP ${result.status}`).slice(0,500),nowJst(),Number(sub.id)).run();}
      }
      if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');
      await env.DB.prepare('UPDATE notifications SET status=?,sent_at=?,updated_at=? WHERE id=?').bind('sent',nowJst(),nowJst(),n.id).run();
    } catch(e) {
      // Avoid a read-before-write on every failed delivery. The previous value
      // is referenced atomically in the UPDATE expression.
      await env.DB.prepare("UPDATE notifications SET attempt_count=COALESCE(attempt_count,0)+1,status=CASE WHEN COALESCE(attempt_count,0)+1>=5 THEN 'error' ELSE 'retry' END,last_error=?,updated_at=? WHERE id=?")
        .bind(String(e instanceof Error?e.message:e).slice(0,1000),nowJst(),n.id).run().catch(()=>{});
      logNotificationFailure(e);
    }
  }
}
