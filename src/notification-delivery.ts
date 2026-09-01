import { sendWebPush, webPushConfigured } from './webpush';
import { logNotificationFailure } from './observability/errors';
import { cleanupNotificationLifecycle } from './notification-lifecycle';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

export async function processNotifications(env: Env): Promise<void> {
  await cleanupNotificationLifecycle(env);
  const due = await env.DB.prepare(`SELECT n.id,n.member_id,n.type,n.target_type,n.target_id,n.message,m.line_user_id,COALESCE(m.notification_channel,'LINE') notification_channel FROM notifications n JOIN members m ON m.id=n.member_id WHERE n.status IN ('pending','retry') AND n.sent_at IS NULL AND n.notify_at<=? AND m.active=1 AND m.notification_enabled=1 ORDER BY n.notify_at,n.id LIMIT 50`).bind(nowJst()).all();
  for(const n of due.results) {
    try {
      const channel='WEB_PUSH'; // Wave128: normal notifications never consume LINE quota.
      {
        if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');
        const subs=await env.DB.prepare('SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions WHERE member_id=? AND enabled=1 ORDER BY id DESC LIMIT 10').bind(Number(n.member_id)).all();
        if(!subs.results.length)throw new Error('Web Push subscription is not registered.');
        let sent=0;
        for(const sub of subs.results){
          const result=await sendWebPush(env,{id:Number(sub.id),endpoint:String(sub.endpoint),p256dh:String(sub.p256dh),auth:String(sub.auth)},{title:'Family TODO LINE',body:String(n.message||'Family TODO LINEからのお知らせです。'),url:n.target_type==='message'?'/app/messages.php':'/app/tasks.php',tag:`familytodo-${String(n.target_type||'notice')}-${String(n.target_id||n.id)}`});
          if(result.ok){sent++;await env.DB.prepare('UPDATE web_push_subscriptions SET last_success_at=?,last_error=NULL,failure_count=0,updated_at=? WHERE id=?').bind(nowJst(),nowJst(),Number(sub.id)).run();}
          else if(result.gone){await env.DB.prepare('DELETE FROM web_push_subscriptions WHERE id=?').bind(Number(sub.id)).run();}
          else{await env.DB.prepare('UPDATE web_push_subscriptions SET failure_count=failure_count+1,last_error=?,updated_at=? WHERE id=?').bind(String(result.error||`HTTP ${result.status}`).slice(0,500),nowJst(),Number(sub.id)).run();}
        }
        if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');
      }
      await env.DB.prepare('UPDATE notifications SET status=?,sent_at=?,updated_at=? WHERE id=?').bind('sent',nowJst(),nowJst(),n.id).run();
    } catch(e) {
      const current=await env.DB.prepare('SELECT COALESCE(attempt_count,0) attempt_count FROM notifications WHERE id=?').bind(n.id).first();
      const attempts=Number(current?.attempt_count||0)+1;
      const status=attempts>=5?'error':'retry';
      await env.DB.prepare('UPDATE notifications SET status=?,attempt_count=?,last_error=?,updated_at=? WHERE id=?').bind(status,attempts,String(e instanceof Error?e.message:e).slice(0,1000),nowJst(),n.id).run().catch(()=>{});
      logNotificationFailure(e);
    }
  }
}
