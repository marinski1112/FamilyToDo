import { sendWebPush, webPushConfigured } from './webpush';
import { logNotificationFailure } from './observability/errors';

const NOTIFICATION_DELIVERY_LEASE_MS = 15 * 60 * 1000;
const nowJst = (date = new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date).replace(' ',' ');
const leaseIso = (date = new Date()) => date.toISOString();
const leaseExpiryIso = (date = new Date()) => new Date(date.getTime()+NOTIFICATION_DELIVERY_LEASE_MS).toISOString();
const reportNotificationFailure = (e: unknown) => { logNotificationFailure(e); };
type PushSubscriptionRow = { id: unknown; endpoint: unknown; p256dh: unknown; auth: unknown };

async function recordSubscriptionState(write: Promise<unknown>): Promise<void> {
  await write.catch((e)=>{ reportNotificationFailure(e); });
}

async function finalizeAcceptedNotification(env: Env, notificationId: number, leaseToken: string): Promise<boolean> {
  let lastError: unknown = null;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const sentNow=new Date();
      const sentResult=await env.DB.prepare(`UPDATE notifications
        SET status=?,sent_at=?,delivery_lease_token=NULL,delivery_lease_expires_at=NULL,updated_at=?
        WHERE id=? AND delivery_lease_token=? AND status IN ('pending','retry') AND sent_at IS NULL`)
        .bind('sent',nowJst(sentNow),nowJst(sentNow),notificationId,leaseToken).run();
      if(Number(sentResult.meta.changes || 0)===1)return true;
      const state=await env.DB.prepare('SELECT status,sent_at,delivery_lease_token FROM notifications WHERE id=?').bind(notificationId).first<Record<string,unknown>>();
      if(String(state?.status||'')==='sent' && Boolean(state?.sent_at))return true;
      if(String(state?.delivery_lease_token||'')!==leaseToken){
        lastError=new Error('Web Push accepted but the delivery lease was lost before sent finalization.');
        break;
      }
      lastError=new Error('Web Push accepted but sent finalization did not update the owned notification.');
    }catch(e){
      lastError=e;
    }
  }
  try{
    const quarantineNow=new Date();
    const quarantine=await env.DB.prepare(`UPDATE notifications
      SET status='error',last_error=?,delivery_lease_token=NULL,delivery_lease_expires_at=NULL,updated_at=?
      WHERE id=? AND delivery_lease_token=? AND status IN ('pending','retry') AND sent_at IS NULL`)
      .bind('Web Push accepted; sent finalization could not be confirmed.',nowJst(quarantineNow),notificationId,leaseToken).run();
    if(Number(quarantine.meta.changes || 0)===1){
      reportNotificationFailure(lastError || new Error('Web Push accepted but sent finalization was quarantined.'));
      return false;
    }
  }catch(e){
    reportNotificationFailure(e);
    if(lastError==null)lastError=e;
  }
  reportNotificationFailure(lastError || new Error('Web Push accepted but sent finalization could not be confirmed.'));
  return false;
}

export async function processNotifications(env: Env): Promise<void> {
  // Keep the five-minute empty path to one bounded, indexed due-work query.
  // Cross-table lifecycle repair/auditing is scheduled separately; send-time
  // EXISTS guards below preserve tenant, visibility, deletion and recurrence safety.
  const dueNow=new Date();
  const due = await env.DB.prepare(`SELECT n.id,n.family_id,n.member_id,n.target_type,n.target_id,n.message
    FROM notifications n
    JOIN members m ON m.id=n.member_id AND m.family_id=n.family_id
    WHERE n.status IN ('pending','retry')
      AND n.sent_at IS NULL
      AND n.notify_at<=?
      AND (
        n.delivery_lease_token IS NULL
        OR n.delivery_lease_expires_at IS NULL
        OR n.delivery_lease_expires_at<=?
      )
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
    LIMIT 50`).bind(nowJst(dueNow),leaseIso(dueNow)).all();
  const subscriptionCache=new Map<string,PushSubscriptionRow[]>();
  for(const n of due.results) {
    const leaseToken=crypto.randomUUID();
    try {
      // The due SELECT is intentionally only a candidate scan. Claim immediately
      // before any subscription/provider work so overlapping cron runs converge
      // on one active owner. Expired/malformed half-claims can be reclaimed.
      const claimNow=new Date();
      const claim=await env.DB.prepare(`UPDATE notifications
        SET delivery_lease_token=?,delivery_lease_expires_at=?,updated_at=?
        WHERE id=?
          AND status IN ('pending','retry')
          AND sent_at IS NULL
          AND notify_at<=?
          AND (
            delivery_lease_token IS NULL
            OR delivery_lease_expires_at IS NULL
            OR delivery_lease_expires_at<=?
          )`)
        .bind(leaseToken,leaseExpiryIso(claimNow),nowJst(claimNow),n.id,nowJst(claimNow),leaseIso(claimNow)).run();
      if(Number(claim.meta.changes || 0)!==1)continue;

      if(!webPushConfigured(env))throw new Error('Web Push VAPID configuration is missing.');
      const familyId=Number(n.family_id),memberId=Number(n.member_id),subscriptionKey=`${familyId}:${memberId}`;
      let subs=subscriptionCache.get(subscriptionKey);
      if(subs===undefined){
        const rows=await env.DB.prepare('SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions WHERE member_id=? AND family_id=? AND enabled=1 ORDER BY id DESC LIMIT 10').bind(memberId,familyId).all<PushSubscriptionRow>();
        subs=rows.results;
        subscriptionCache.set(subscriptionKey,subs);
      }
      if(!subs.length)throw new Error('Web Push subscription is not registered.');
      let sent=0;
      for(const sub of [...subs]){
        const messageTarget=String(n.target_type||'').startsWith('message');
        const result=await sendWebPush(env,{id:Number(sub.id),endpoint:String(sub.endpoint),p256dh:String(sub.p256dh),auth:String(sub.auth)},{title:'Family TODO LINE',body:String(n.message||'Family TODO LINEからのお知らせです。'),url:messageTarget?'/app/messages.php':'/app/tasks.php',tag:`familytodo-${String(n.target_type||'notice')}-${String(n.target_id||n.id)}`});
        if(result.ok){sent++;await recordSubscriptionState(env.DB.prepare('UPDATE web_push_subscriptions SET last_success_at=?,last_error=NULL,failure_count=0,updated_at=? WHERE id=?').bind(nowJst(),nowJst(),Number(sub.id)).run());}
        else if(result.gone){
          await recordSubscriptionState(env.DB.prepare('DELETE FROM web_push_subscriptions WHERE id=?').bind(Number(sub.id)).run());
          const cached=subscriptionCache.get(subscriptionKey),index=cached?.findIndex(row=>Number(row.id)===Number(sub.id))??-1;
          if(cached&&index>=0)cached.splice(index,1);
        }
        else{await recordSubscriptionState(env.DB.prepare('UPDATE web_push_subscriptions SET failure_count=failure_count+1,last_error=?,updated_at=? WHERE id=?').bind(String(result.error||`HTTP ${result.status}`).slice(0,500),nowJst(),Number(sub.id)).run());}
      }
      if(sent===0)throw new Error('Web Push delivery failed for all subscriptions.');
      await finalizeAcceptedNotification(env,Number(n.id),leaseToken);
    } catch(e) {
      // Only the current lease owner may consume an attempt or release ownership.
      // A stale worker that resumes after takeover must not clobber its successor.
      const failedNow=new Date();
      await env.DB.prepare(`UPDATE notifications
        SET attempt_count=COALESCE(attempt_count,0)+1,
            status=CASE WHEN COALESCE(attempt_count,0)+1>=5 THEN 'error' ELSE 'retry' END,
            last_error=?,delivery_lease_token=NULL,delivery_lease_expires_at=NULL,updated_at=?
        WHERE id=? AND delivery_lease_token=? AND status IN ('pending','retry') AND sent_at IS NULL`)
        .bind(String(e instanceof Error?e.message:e).slice(0,1000),nowJst(failedNow),n.id,leaseToken).run().catch(()=>{});
      reportNotificationFailure(e);
    }
  }
}
