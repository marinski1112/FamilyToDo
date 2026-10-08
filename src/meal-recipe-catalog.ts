import {BadRequest} from './errors';
import {mealId} from './meal-domain';

export async function readRecipeCatalog(db:D1Database,familyId:number,url:URL){
  const q=(url.searchParams.get('q')||'').trim();if(q.length>100)throw new BadRequest('検索語は100文字以内にしてください。');
  const archived=url.searchParams.get('archived')==='1';
  const cursor=url.searchParams.get('after');let after:string[]|null=null;
  if(cursor){try{const v=JSON.parse(cursor);if(!Array.isArray(v)||v.length!==2||typeof v[0]!=='string'||v[0].length>120||typeof v[1]!=='string')throw Error();after=[v[0],mealId(v[1])];}catch{throw new BadRequest('一覧を最初から開き直してください。');}}
  let where='family_id=? AND archived=?';const values:(string|number)[]=[familyId,Number(archived)];
  if(q){where+=' AND instr(name,?)>0';values.push(q);}
  if(after){where+=' AND (name>? OR (name=? AND id>?))';values.push(after[0],after[0],after[1]);}
  const rows=(await db.prepare(`SELECT id,name,is_main,servings,minutes,source_url,revision,json_array_length(ingredients_json) ingredient_count FROM recipes WHERE ${where} ORDER BY name,id LIMIT 31`).bind(...values).all<Record<string,unknown>>()).results;
  const recipes=rows.slice(0,30).map(r=>({...r,is_main:!!r.is_main})),last=rows.slice(0,30).at(-1);
  return {recipes,q,archived,next_cursor:rows.length>30&&last?JSON.stringify([last.name,last.id]):null};
}

export async function restoreRecipe(db:D1Database,familyId:number,raw:{id:unknown;revision:unknown}){
  const id=mealId(raw.id),revision=mealId(raw.revision);
  // The same unchanged revision may be retried after response loss. Concurrent recipe edits fail closed.
  await db.prepare('UPDATE recipes SET archived=0,updated_at=? WHERE family_id=? AND id=? AND revision=?').bind(new Date().toISOString(),familyId,id,revision).run();
  const row=await db.prepare('SELECT archived,revision FROM recipes WHERE family_id=? AND id=?').bind(familyId,id).first<{archived:number;revision:string}>();
  if(!row||row.archived!==0||row.revision!==revision)throw new BadRequest('レシピが更新されています。一覧を読み込み直してください。');
  return {id};
}
