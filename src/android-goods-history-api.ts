import type {AppContext} from './app-context';
import {goodsVisibilitySql} from './goods-visibility';
import {json} from './response';

type Row=Record<string,unknown>;
const headers={'cache-control':'private, no-store'};

/** Visible checklist item history, bounded to match the Web edit pages. */
export async function androidGoodsHistoryApi(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,{...headers,allow:'GET'});
  const member=ctx.member;
  if(!member)return json({ok:false,code:'AUTH_REQUIRED'},401,headers);
  const params=new URL(request.url).searchParams,kind=params.get('kind'),id=Number(params.get('id'));
  if(!['shopping','item'].includes(kind||'')||!Number.isSafeInteger(id)||id<=0)
    return json({ok:false,code:'INVALID_ITEM'},400,headers);
  const shopping=kind==='shopping',table=shopping?'shopping_items':'items',alias=shopping?'s':'i';
  const visible=await ctx.env.DB.prepare(`SELECT ${alias}.id FROM ${table} ${alias} WHERE ${alias}.id=? AND ${alias}.family_id=? AND ${goodsVisibilitySql(alias)} LIMIT 1`)
    .bind(id,member.family_id,member.id).first<Row>();
  if(!visible)return json({ok:false,code:'NOT_FOUND'},404,headers);
  const historyTable=shopping?'shopping_completion_history':'item_completion_history';
  const key=shopping?'shopping_item_id':'item_id';
  const history=await ctx.env.DB.prepare(`SELECT h.id,h.action,h.occurred_at,m.name member_name FROM ${historyTable} h
    LEFT JOIN members m ON m.id=h.member_id AND m.family_id=?
    WHERE h.${key}=? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 30`)
    .bind(member.family_id,id).all<Row>();
  return json({ok:true,kind,id,history:history.results},200,headers);
}
