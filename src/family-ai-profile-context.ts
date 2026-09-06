type Row=Record<string,unknown>;

export type FamilyAiSafeProfileContext={
  subject_ref:string;
  display_name:string;
  subject_kind:'BABY'|'CHILD'|'ADULT'|'PET'|'OTHER';
  personality_note?:string;
};

export type ExplicitBirthFacts={
  age:number;
  birth_month_day:string;
  zodiac:string;
};

const SUBJECT_KINDS=new Set(['BABY','CHILD','ADULT','PET','OTHER']);
const MAX_DISPLAY_NAME_CHARS=80;
const MAX_PERSONALITY_CONTEXT_CHARS=320;

const clampText=(value:unknown,max:number)=>Array.from(String(value??'').trim()).slice(0,max).join('');

/**
 * Current privacy boundary for personalized AI profile context.
 *
 * The query intentionally does not select birth_date, sex_gender, birthplace, or blood_type.
 * Until separate field-level permissions are persisted, those fields cannot cross this boundary.
 * ai_personalization_enabled is necessary but not sufficient to authorize future sensitive fields.
 */
export async function loadSafeFamilyAiProfileContext(db:D1Database,familyId:number):Promise<FamilyAiSafeProfileContext[]>{
  if(!Number.isSafeInteger(familyId)||familyId<=0)return [];
  const rows=await db.prepare(`SELECT id,name,subject_kind,personality_note
    FROM family_log_subjects
    WHERE family_id=? AND active=1 AND ai_personalization_enabled=1
    ORDER BY id`).bind(familyId).all<Row>();
  const out:FamilyAiSafeProfileContext[]=[];
  for(const row of rows.results){
    const id=Number(row.id||0);
    if(!Number.isSafeInteger(id)||id<=0)continue;
    const displayName=clampText(row.name,MAX_DISPLAY_NAME_CHARS);
    if(!displayName)continue;
    const rawKind=String(row.subject_kind||'OTHER').toUpperCase();
    const subjectKind=(SUBJECT_KINDS.has(rawKind)?rawKind:'OTHER') as FamilyAiSafeProfileContext['subject_kind'];
    const personality=clampText(row.personality_note,MAX_PERSONALITY_CONTEXT_CHARS);
    out.push({subject_ref:`S${id}`,display_name:displayName,subject_kind:subjectKind,...(personality?{personality_note:personality}:{})});
  }
  return out;
}

/**
 * Deterministic birth-date minimization helper for a future explicit birth-date permission.
 * It never returns the raw birth date or birth year. Callers must establish field-level consent
 * before supplying a birth date to this function.
 */
export function deriveBirthFactsForExplicitPermission(birthDate:string,today:string):ExplicitBirthFacts|null{
  const birth=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate||''));
  const now=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today||''));
  if(!birth||!now)return null;
  const by=Number(birth[1]),bm=Number(birth[2]),bd=Number(birth[3]);
  const ty=Number(now[1]),tm=Number(now[2]),td=Number(now[3]);
  const b=new Date(Date.UTC(by,bm-1,bd)),t=new Date(Date.UTC(ty,tm-1,td));
  if(b.getUTCFullYear()!==by||b.getUTCMonth()!==bm-1||b.getUTCDate()!==bd)return null;
  if(t.getUTCFullYear()!==ty||t.getUTCMonth()!==tm-1||t.getUTCDate()!==td||b>t)return null;
  let age=ty-by;
  if(tm<bm||(tm===bm&&td<bd))age--;
  if(age<0||age>130)return null;
  const md=bm*100+bd;
  const zodiac=md>=1222||md<=119?'山羊座':md<=218?'水瓶座':md<=320?'魚座':md<=419?'牡羊座':md<=520?'牡牛座':md<=621?'双子座':md<=722?'蟹座':md<=822?'獅子座':md<=922?'乙女座':md<=1023?'天秤座':md<=1122?'蠍座':'射手座';
  return {age,birth_month_day:`${String(bm).padStart(2,'0')}-${String(bd).padStart(2,'0')}`,zodiac};
}
