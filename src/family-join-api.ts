import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';
import { commitSession } from './session';

type Row = Record<string, unknown>;

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');

const familyLogSubjectKind=(value:unknown):string=>{
  const kind=String(value||'ADULT').toUpperCase();
  return ['BABY','CHILD','ADULT','PET','OTHER'].includes(kind)?kind:'OTHER';
};

/** Canonical family-join / Family Log promotion API independent from app.ts. */
export async function joinFamily(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  if (!ctx.session.lineUserId) return json({ok:false,error:'LINE認証が必要です。'},401);
  let body: Record<string, unknown>;
  try {
    body=await bodyJson(request);
  } catch (error) {
    if(error instanceof RequestBodyParseError)return json({ok:false,error:error.message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
    throw error;
  }
  const token = String(body.token ?? '').trim();
  const code = String(body.family_code ?? '').trim().toUpperCase();
  const name=String(body.member_name??ctx.session.lineDisplayName??'').trim()||'メンバー';
  if(name.length>255)return json({ok:false,error:'名前は255文字以内で入力してください。'},400);
  if(!token && !code) return json({ok:false,error:'家族コードまたは招待情報を入力してください。'},400);
  let family: ({id:number;name:string}&Row)|null = null;
  let invitationId=0,promotionSubjectId=0;
  if(token){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const hash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
    family=await ctx.env.DB.prepare('SELECT f.id,f.name,i.id invitation_id,COALESCE(i.family_log_subject_id,0) family_log_subject_id FROM family_invitations i JOIN families f ON f.id=i.family_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>=? LIMIT 1').bind(hash,nowJst()).first<({id:number;name:string}&Row)>();
    if(!family) return json({ok:false,error:'招待リンクが無効・使用済み・期限切れのいずれかです。'},404);
    invitationId=Number(family.invitation_id||0);promotionSubjectId=Number(family.family_log_subject_id||0);
  } else {
    family=await ctx.env.DB.prepare('SELECT id,name FROM families WHERE family_code=? LIMIT 1').bind(code).first<{id:number;name:string}>();
    if(!family) return json({ok:false,error:'家族コードが見つかりません。'},404);
  }

  // Validate promotion links before member creation/reactivation so stale links cannot
  // leave a half-created member behind.
  let promotionSubject:Row|undefined;
  if(promotionSubjectId){
    promotionSubject=await ctx.env.DB.prepare('SELECT id,name,subject_kind,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(promotionSubjectId,family.id).first<Row>()||undefined;
    if(!promotionSubject)return json({ok:false,error:'本登録対象の家族ログプロフィールが見つかりません。'},404);
    if(!['BABY','CHILD','ADULT'].includes(familyLogSubjectKind(promotionSubject.subject_kind)))return json({ok:false,error:'この家族ログ対象はLINE本登録できない種類です。'},400);
    const linkedMemberId=Number(promotionSubject.member_id||0);
    if(linkedMemberId){
      const linked=await ctx.env.DB.prepare('SELECT id,line_user_id,deleted_at FROM members WHERE id=? AND family_id=? LIMIT 1').bind(linkedMemberId,family.id).first<Row>();
      if(!linked||linked.deleted_at)return json({ok:false,error:'本登録対象に紐づく家族メンバーが無効です。管理者に確認してください。'},409);
      if(String(linked.line_user_id||'')!==String(ctx.session.lineUserId||''))return json({ok:false,error:'この家族ログ対象はすでに別のLINE家族メンバーへ本登録済みです。'},409);
    }
  }

  const now=nowJst();
  const existing=await ctx.env.DB.prepare('SELECT id,deleted_at FROM members WHERE family_id=? AND line_user_id=? LIMIT 1').bind(family.id,ctx.session.lineUserId).first<Row>();
  let memberId=Number(existing?.id||0)||0;
  if(existing?.deleted_at) return json({ok:false,error:'この家族では削除済みのメンバーです。管理者に再招待を依頼してください。'},409);

  if(memberId&&promotionSubjectId&&Number(promotionSubject?.member_id||0)===0){
    const otherProfile=await ctx.env.DB.prepare('SELECT id,name FROM family_log_subjects WHERE family_id=? AND member_id=? AND id<>? LIMIT 1').bind(family.id,memberId,promotionSubjectId).first<Row>();
    if(otherProfile)return json({ok:false,error:`このLINEアカウントはすでに家族メンバー「${String(otherProfile.name||name)}」として登録されています。既存プロフィールとの自動統合は行わず、管理者側で確認してください。`},409);
  }

  const promotedMemberType=promotionSubject&&['BABY','CHILD'].includes(familyLogSubjectKind(promotionSubject.subject_kind))?'CHILD':'ADULT';
  if(memberId){
    await ctx.env.DB.prepare('UPDATE members SET name=?,active=1,member_type=CASE WHEN ?<>\'\' THEN ? ELSE member_type END,updated_at=? WHERE id=? AND family_id=?')
      .bind(name,promotionSubject?promotedMemberType:'',promotionSubject?promotedMemberType:'',now,memberId,family.id).run();
  } else {
    const r=await ctx.env.DB.prepare('INSERT INTO members(family_id,line_user_id,name,member_type,role,notification_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(family.id,ctx.session.lineUserId,name,promotionSubject?promotedMemberType:'ADULT','MEMBER',1,1,now,now).run();
    memberId=Number(r.meta.last_row_id||0);
    if(!memberId)throw new Error('家族メンバーIDを取得できませんでした。');
  }

  const finishStatements:any[]=[];
  if(promotionSubjectId){
    finishStatements.push(
      ctx.env.DB.prepare('UPDATE family_log_subjects SET member_id=?,name=?,updated_at=? WHERE id=? AND family_id=? AND active=1 AND (member_id IS NULL OR member_id=?)').bind(memberId,name,now,promotionSubjectId,family.id,memberId),
      ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(family.id,memberId,'PROMOTED','family_log_subject',promotionSubjectId,JSON.stringify({invitation_id:invitationId,member_id:memberId,subject_kind:familyLogSubjectKind(promotionSubject?.subject_kind),source:'family_log_promotion'}),now)
    );
  }
  if(invitationId)finishStatements.push(
    ctx.env.DB.prepare('UPDATE family_invitations SET used_at=?,used_by=? WHERE id=? AND family_id=? AND used_at IS NULL').bind(now,memberId,invitationId,family.id)
  );
  if(finishStatements.length)await ctx.env.DB.batch(finishStatements);

  ctx.session.memberId=memberId;ctx.session.familyId=family.id;
  return commitSession(json({ok:true,redirect:'/app/index.php',family_id:family.id,promoted_subject_id:promotionSubjectId||null}),ctx.session,ctx.env.APP_SECRET);
}
