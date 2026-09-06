import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html, json, redirect } from './response';
import { bodyJson, RequestBodyParseError } from './request-body';
import { logActivity } from './activity-log';
import { APP_VERSION } from './version';

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const todayJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const AI_PROFILE_PERMISSION_KEYS=['personality','birth_facts','birthplace','sex_gender','blood_type'] as const;
type AiProfilePermissionKey=typeof AI_PROFILE_PERMISSION_KEYS[number];

function optionalText(value:unknown,max:number):string|null{
  const text=String(value??'').trim();
  if(!text)return null;
  if(Array.from(text).length>max)throw new Error(`入力は${max}文字以内にしてください。`);
  return text;
}

function optionalBirthDate(value:unknown):string|null{
  const raw=String(value??'').trim();
  if(!raw)return null;
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if(!match)throw new Error('生年月日が不正です。');
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||raw>todayJst())throw new Error('生年月日が不正です。');
  return raw;
}

function strictToggle(value:unknown):0|1{
  if(value===true||value===1||value==='1')return 1;
  if(value===false||value===0||value==='0'||value===undefined||value===null)return 0;
  throw new Error('AI個別表現の設定が不正です。');
}

function strictAiProfilePermissions(value:unknown):AiProfilePermissionKey[]{
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value))throw new Error('AI利用項目の設定が不正です。');
  const allow=new Set<string>(AI_PROFILE_PERMISSION_KEYS),out:AiProfilePermissionKey[]=[];
  for(const raw of value){const key=String(raw);if(!allow.has(key))throw new Error('AI利用項目の設定が不正です。');if(!out.includes(key as AiProfilePermissionKey))out.push(key as AiProfilePermissionKey);}
  return out;
}

function storedAiProfilePermissions(value:unknown):Set<string>{
  try{const parsed=JSON.parse(String(value||'[]'));return new Set(Array.isArray(parsed)?parsed.map(String).filter(x=>AI_PROFILE_PERMISSION_KEYS.includes(x as AiProfilePermissionKey)):[]);}catch{return new Set();}
}

/** Canonical server-rendered family-member administration page. */
export async function settingsMembers(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return redirect('/login.php?next=%2Fapp%2Fsettings_members.php');
  const role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN')return new Response('管理者権限が必要です。',{status:403});

  if(request.method==='POST'){
    let b:Record<string,unknown>;
    try{b=await bodyJson(request);}catch(error){
      if(error instanceof RequestBodyParseError)return json({ok:false,error:'入力内容が不正です。',code:'BAD_REQUEST'},400);
      throw error;
    }
    if(!ctx.session.csrfToken||typeof b.csrf!=='string'||b.csrf!==ctx.session.csrfToken)return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);
    if(String(b.action||'')!=='profile_update')return json({ok:false,error:'操作が不正です。',code:'BAD_REQUEST'},400);
    const memberId=Number(b.member_id||0);
    if(!Number.isSafeInteger(memberId)||memberId<=0)return json({ok:false,error:'対象メンバーが不正です。',code:'BAD_REQUEST'},400);
    const target=await ctx.env.DB.prepare('SELECT id,name,member_type,created_at FROM members WHERE id=? AND family_id=? AND deleted_at IS NULL').bind(memberId,m.family_id).first<Row>();
    if(!target)return json({ok:false,error:'メンバーが見つかりません。',code:'NOT_FOUND'},404);

    let birthDate:string|null,sexGender:string|null,birthplace:string|null,bloodType:string|null,personalityNote:string|null,aiEnabled:0|1,aiProfilePermissions:AiProfilePermissionKey[];
    try{
      birthDate=optionalBirthDate(b.birth_date);
      sexGender=optionalText(b.sex_gender,40);
      birthplace=optionalText(b.birthplace,120);
      personalityNote=optionalText(b.personality_note,1000);
      bloodType=String(b.blood_type??'').trim().toUpperCase()||null;
      if(bloodType&&!['A','B','O','AB'].includes(bloodType))throw new Error('血液型が不正です。');
      aiEnabled=strictToggle(b.ai_personalization_enabled);
      aiProfilePermissions=strictAiProfilePermissions(b.ai_profile_permissions);
    }catch(error){return json({ok:false,error:error instanceof Error?error.message:'入力内容が不正です。',code:'BAD_REQUEST'},400);}
    const permissionsJson=JSON.stringify(aiProfilePermissions);

    let subject=await ctx.env.DB.prepare('SELECT id,birth_date,sex_gender,birthplace,blood_type,personality_note,ai_personalization_enabled,ai_profile_permissions_json FROM family_log_subjects WHERE family_id=? AND member_id=? AND active=1 ORDER BY id LIMIT 1').bind(m.family_id,memberId).first<Row>();
    if(!subject){
      const now=nowJst();
      await ctx.env.DB.prepare(`INSERT INTO family_log_subjects(family_id,member_id,name,subject_kind,birth_date,icon,active,created_by,created_at,updated_at,enabled_types_json,auto_complete_linked_task,sex_gender,birthplace,blood_type,personality_note,ai_personalization_enabled,ai_profile_permissions_json)
        SELECT family_id,id,name,CASE WHEN upper(COALESCE(member_type,'ADULT'))='BABY' THEN 'BABY' WHEN upper(COALESCE(member_type,'ADULT')) IN ('CHILD','KID') THEN 'CHILD' ELSE 'ADULT' END,NULL,icon,1,?,COALESCE(created_at,?),?,NULL,CASE WHEN upper(COALESCE(member_type,'ADULT')) IN ('BABY','CHILD','KID') THEN 1 ELSE 0 END,NULL,NULL,NULL,NULL,0,'[]'
        FROM members WHERE id=? AND family_id=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM family_log_subjects s WHERE s.family_id=? AND s.member_id=? AND s.active=1)`).bind(m.id,now,now,memberId,m.family_id,m.family_id,memberId).run();
      subject=await ctx.env.DB.prepare('SELECT id,birth_date,sex_gender,birthplace,blood_type,personality_note,ai_personalization_enabled,ai_profile_permissions_json FROM family_log_subjects WHERE family_id=? AND member_id=? AND active=1 ORDER BY id LIMIT 1').bind(m.family_id,memberId).first<Row>();
    }
    if(!subject)return json({ok:false,error:'プロフィール対象を作成できませんでした。',code:'CONFLICT'},409);
    const fields:[string,unknown,unknown][]=[
      ['birth_date',subject.birth_date,birthDate],['sex_gender',subject.sex_gender,sexGender],['birthplace',subject.birthplace,birthplace],['blood_type',subject.blood_type,bloodType],['personality_note',subject.personality_note,personalityNote],['ai_personalization_enabled',Number(subject.ai_personalization_enabled||0),aiEnabled],['ai_profile_permissions',String(subject.ai_profile_permissions_json||'[]'),permissionsJson],
    ];
    const changedFields=fields.filter(([,before,after])=>String(before??'')!==String(after??'')).map(([name])=>name);
    await ctx.env.DB.prepare('UPDATE family_log_subjects SET birth_date=?,sex_gender=?,birthplace=?,blood_type=?,personality_note=?,ai_personalization_enabled=?,ai_profile_permissions_json=?,updated_at=? WHERE id=? AND family_id=? AND member_id=? AND active=1').bind(birthDate,sexGender,birthplace,bloodType,personalityNote,aiEnabled,permissionsJson,nowJst(),Number(subject.id),m.family_id,memberId).run();
    if(changedFields.length)await logActivity(ctx,'UPDATED','family_log_subject_profile',Number(subject.id),{changed_fields:changedFields,ai_personalization_enabled:Boolean(aiEnabled)});
    return json({ok:true,id:Number(subject.id)});
  }

  const [members,invitations]=await Promise.all([
    ctx.env.DB.prepare(`SELECT m.id,m.name,m.member_type,m.role,m.active,m.deleted_at,m.created_at,
      EXISTS(SELECT 1 FROM member_permissions p WHERE p.family_id=m.family_id AND p.member_id=m.id AND p.permission_key='MANAGE_QUICK_CHORES') manage_quick_chores,
      s.id profile_subject_id,s.birth_date,s.sex_gender,s.birthplace,s.blood_type,s.personality_note,s.ai_personalization_enabled,s.ai_profile_permissions_json
      FROM members m
      LEFT JOIN family_log_subjects s ON s.id=(SELECT MIN(s2.id) FROM family_log_subjects s2 WHERE s2.family_id=m.family_id AND s2.member_id=m.id AND s2.active=1)
      WHERE m.family_id=? ORDER BY m.id`).bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT i.id,i.expires_at,i.used_at,i.created_at,i.family_log_subject_id,c.name created_by_name,u.name used_by_name,s.name subject_name FROM family_invitations i LEFT JOIN members c ON c.id=i.created_by LEFT JOIN members u ON u.id=i.used_by LEFT JOIN family_log_subjects s ON s.id=i.family_log_subject_id AND s.family_id=i.family_id WHERE i.family_id=? ORDER BY i.id DESC LIMIT 20').bind(m.family_id).all<Row>()
  ]);
  const now=nowJst();
  const invitationRows=invitations.results.map(i=>{const used=Boolean(i.used_at),active=!used&&String(i.expires_at||'')>now;const status=used?'使用済み':active?'有効':'期限切れ/取消済み';const subject=i.subject_name?`<div class="meta invite-subject-link">🐣 ${esc(i.subject_name)} のLINE本登録</div>`:'';return `<div class="invite-history-row"><div><strong>${status}</strong>${subject}<div class="meta">発行 ${esc(String(i.created_at||'').slice(0,16))}${i.created_by_name?' ・ '+esc(i.created_by_name):''}</div><div class="meta">期限 ${esc(String(i.expires_at||'').slice(0,16))}${used&&i.used_at?' ・ 使用 '+esc(String(i.used_at).slice(0,16)):''}${used&&i.used_by_name?' ・ '+esc(i.used_by_name):''}</div></div>${active?`<button type="button" class="btn danger small invite-revoke" data-id="${i.id}">取消</button>`:''}</div>`}).join('')||'<p class="empty">発行履歴はありません。</p>';
  const payload=JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const profileForm=(x:Row)=>{const permissions=storedAiProfilePermissions(x.ai_profile_permissions_json),checked=(key:string)=>permissions.has(key)?'checked':'';return `<details class="member-profile-details"><summary>プロフィール（任意）</summary><form class="member-profile-form" data-id="${x.id}"><div class="member-profile-grid"><label>生年月日<input type="date" name="birth_date" value="${esc(x.birth_date||'')}"></label><label>性別・ジェンダー<input name="sex_gender" maxlength="40" value="${esc(x.sex_gender||'')}" placeholder="任意"></label><label>出身地<input name="birthplace" maxlength="120" value="${esc(x.birthplace||'')}" placeholder="例：東京都"></label><label>血液型<select name="blood_type"><option value="">未設定</option>${['A','B','O','AB'].map(v=>`<option value="${v}" ${String(x.blood_type||'').toUpperCase()===v?'selected':''}>${v}型</option>`).join('')}</select></label></div><label>性格・好みのメモ<textarea name="personality_note" maxlength="1000" placeholder="例：朝は静かめが好き、褒められるとやる気が出る">${esc(x.personality_note||'')}</textarea></label><label class="checkrow"><input type="checkbox" name="ai_personalization_enabled" ${Number(x.ai_personalization_enabled||0)===1?'checked':''}><span>AI文章の個別表現を有効にする</span></label><details class="member-profile-ai-permissions"><summary>AIに使う項目</summary><div class="ai-profile-permission-list"><label class="checkrow"><input type="checkbox" name="ai_profile_permissions" value="personality" ${checked('personality')}><span>性格・好みのメモ</span></label><label class="checkrow"><input type="checkbox" name="ai_profile_permissions" value="birth_facts" ${checked('birth_facts')}><span>年齢・誕生日（月日）・星座</span></label><label class="checkrow"><input type="checkbox" name="ai_profile_permissions" value="birthplace" ${checked('birthplace')}><span>出身地</span></label><label class="checkrow"><input type="checkbox" name="ai_profile_permissions" value="sex_gender" ${checked('sex_gender')}><span>性別・ジェンダー</span></label><label class="checkrow"><input type="checkbox" name="ai_profile_permissions" value="blood_type" ${checked('blood_type')}><span>血液型</span></label><p class="small">すべて初期OFFです。生年月日はそのままAIへ渡さず、許可時も年齢・月日・星座だけに変換します。血液型や性別から健康・性格などを推測させません。</p></div></details><p class="small">上のAI個別表現をOFFにすると、項目別許可が残っていてもプロフィール情報はAI用境界を通りません。現在はまだGemini文章生成へ接続していません。</p><div class="member-profile-status small" aria-live="polite"></div><button type="submit" class="btn small">プロフィールを保存</button></form></details>`};
  const body=`<style>.member-profile-details{margin-top:9px}.member-profile-details summary{cursor:pointer;font-weight:700;color:#475569}.member-profile-form{display:grid;gap:9px;margin-top:10px;padding:10px;border-radius:12px;background:#f8fafc}.member-profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.member-profile-form label{display:grid;gap:4px;font-size:13px}.member-profile-form textarea{min-height:74px;resize:vertical}.member-profile-ai-permissions{border:1px solid #e2e8f0;border-radius:10px;padding:8px}.member-profile-ai-permissions summary{font-size:13px}.ai-profile-permission-list{display:grid;gap:6px;margin-top:8px}@media(max-width:520px){.member-profile-grid{grid-template-columns:1fr}}</style><div class="page-head"><div><div class="eyebrow">管理</div><h1>👨‍👩‍👧 家族メンバー</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card member-list">${members.results.map(x=>`<div class="member-row"><div><strong>${esc(x.name)}</strong><div class="meta">${esc(x.member_type||'ADULT')} / ${esc(x.role||'MEMBER')} / ${x.deleted_at?'削除済み':(Number(x.active)?'有効':'停止中')}</div>${!x.deleted_at?profileForm(x):''}${String(x.role||'').toUpperCase()==='MEMBER'&&!x.deleted_at?`<label class="checkrow small"><input type="checkbox" class="quick-chore-permission" data-id="${x.id}" ${Number(x.manage_quick_chores)?'checked':''}> ちょこっと家事項目を管理</label>`:''}</div>${Number(x.id)!==m.id&&String(x.role||'').toUpperCase()!=='OWNER'&&!x.deleted_at?`<div class="actions"><button class="btn gray small member-toggle" data-id="${x.id}">${Number(x.active)?'停止':'再開'}</button><button class="btn danger small member-del" data-id="${x.id}">削除</button></div>`:''}</div>`).join('')}</div><div class="card"><h2>招待</h2><div class="invite-guide"><strong>招待前の流れ</strong><ol><li>招待相手に Family TODO LINE 公式アカウントを友だち追加してもらう</li><li>7日間有効の招待リンクを発行してLINEで送る</li><li>相手はLINE内でリンクを開き、名前を確認して参加する</li></ol><p class="small">招待リンク発行時に公式アカウント情報を自動取得し、友だち追加URLも一緒に共有できます。</p></div><button id="invite" class="btn">招待リンクを発行</button><div id="inviteOut"></div><details class="invite-history" open><summary>発行済み招待リンク</summary>${invitationRows}</details></div><script type="application/json" id="settingsMembersPayload">${payload}</script><script src="/assets/settings-members.js?v=${APP_VERSION}-member-profile-permissions1"></script>`;
  return html(layout('家族メンバー',body,'/app/settings.php'));
}
