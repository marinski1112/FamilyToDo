import { goodsVisibilitySql } from './goods-visibility';
import type { AppContext } from './app-context';

type Row=Record<string,unknown>;

export type OverdueShoppingCursor={
  due:string;
  categoryPresent:0|1;
  category:string;
  name:string;
  id:number;
};

export const OVERDUE_SHOPPING_PAGE_SIZE=50;

const encoder=new TextEncoder();
const binaryTextCompare=(left:unknown,right:unknown)=>{
  const a=encoder.encode(String(left??'')),b=encoder.encode(String(right??''));
  const length=Math.min(a.length,b.length);
  for(let index=0;index<length;index++){if(a[index]!==b[index])return a[index]-b[index];}
  return a.length-b.length;
};

const overdueShoppingCompare=(a:Row,b:Row)=>{
  const due=binaryTextCompare(a.effective_due,b.effective_due);if(due)return due;
  const categoryPresence=Number(a.category!=null)-Number(b.category!=null);if(categoryPresence)return categoryPresence;
  const category=binaryTextCompare(a.category,b.category);if(category)return category;
  const name=binaryTextCompare(a.name,b.name);if(name)return name;
  return Number(a.id||0)-Number(b.id||0);
};

const cursorSql=(effectiveDueSql:string,cursor?:OverdueShoppingCursor)=>cursor
  ?` AND (${effectiveDueSql},(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id) > (?,?,?,?,?)`
  :'';
const cursorBindings=(cursor?:OverdueShoppingCursor):unknown[]=>cursor
  ?[cursor.due,cursor.categoryPresent,cursor.category,cursor.name,cursor.id]
  :[];

const selectColumns=`s.*,t.title AS task_title,t.start_at AS task_start_at,t.end_at AS task_end_at,t.due_at AS task_due_at,
  (SELECT GROUP_CONCAT(am.name,'、') FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=s.id) AS assignees`;

export async function expiredShoppingPageFor(ctx:AppContext,date:string,cursor?:OverdueShoppingCursor):Promise<Row[]>{
  const member=ctx.member;if(!member)return [];
  const pageLimit=OVERDUE_SHOPPING_PAGE_SIZE+1;
  const ownDueCursor=cursorSql('s.due_date',cursor);
  const parentDueCursor=cursorSql('COALESCE(t.end_at,t.due_at,t.start_at)',cursor);
  const ownCursorBindings=cursorBindings(cursor);
  const parentCursorBindings=cursorBindings(cursor);
  const parentVisible=goodsVisibilitySql('s');
  const [unlinkedOwnDue,linkedOwnDue,parentFallback]=await Promise.all([
    ctx.env.DB.prepare(`SELECT s.*,NULL AS task_title,NULL AS task_start_at,NULL AS task_end_at,NULL AS task_due_at,
        s.due_date AS effective_due,
        (SELECT GROUP_CONCAT(am.name,'、') FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=s.id) AS assignees
      FROM shopping_items s
      WHERE s.family_id=? AND ${goodsVisibilitySql('s')} AND s.task_id IS NULL AND s.status<>'completed'
        AND s.due_date IS NOT NULL AND date(s.due_date)<date(?)${ownDueCursor}
      ORDER BY s.due_date,(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id
      LIMIT ${pageLimit}`).bind(member.family_id,member.id,date,...ownCursorBindings).all<Row>(),
    ctx.env.DB.prepare(`SELECT ${selectColumns},s.due_date AS effective_due
      FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
      WHERE s.family_id=? AND s.task_id IS NOT NULL AND ${parentVisible} AND s.status<>'completed'
        AND s.due_date IS NOT NULL AND date(s.due_date)<date(?)${ownDueCursor}
      ORDER BY s.due_date,(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id
      LIMIT ${pageLimit}`).bind(member.family_id,member.id,date,...ownCursorBindings).all<Row>(),
    ctx.env.DB.prepare(`SELECT ${selectColumns},COALESCE(t.end_at,t.due_at,t.start_at) AS effective_due
      FROM shopping_items s JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id
      WHERE s.family_id=? AND s.task_id IS NOT NULL AND ${parentVisible} AND s.status<>'completed'
        AND s.due_date IS NULL
        AND COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL
        AND date(COALESCE(t.end_at,t.due_at,t.start_at))<date(?)${parentDueCursor}
      ORDER BY COALESCE(t.end_at,t.due_at,t.start_at),(s.category IS NOT NULL),COALESCE(s.category,''),s.name,s.id
      LIMIT ${pageLimit}`).bind(member.family_id,member.id,date,...parentCursorBindings).all<Row>(),
  ]);
  return [...unlinkedOwnDue.results,...linkedOwnDue.results,...parentFallback.results]
    .sort(overdueShoppingCompare)
    .slice(0,pageLimit);
}

export function overdueShoppingCursorFromRow(row:Row):OverdueShoppingCursor|null{
  const due=String(row.effective_due||row.due_date||row.task_end_at||row.task_due_at||row.task_start_at||'').trim();
  const id=Number(row.id||0),name=String(row.name??'');
  if(!due||!Number.isSafeInteger(id)||id<=0)return null;
  return {
    due,
    categoryPresent:row.category==null?0:1,
    category:String(row.category??''),
    name,
    id,
  };
}

const esc=(value:unknown)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const safeProductUrl=(value:unknown)=>{
  const raw=String(value||'').trim();if(!raw||raw.length>2048)return '';
  try{const parsed=new URL(raw);if(parsed.username||parsed.password)return '';return parsed.protocol==='http:'||parsed.protocol==='https:'?parsed.href:'';}catch{return '';}
};
const effectiveShoppingDue=(item:Row)=>String(item.due_date||item.task_end_at||item.task_due_at||item.task_start_at||'').slice(0,10);

export function renderOverdueShoppingRows(items:Row[]):string{
  const groups=new Map<string,{title:string;due:string;items:Row[]}>();
  for(const item of items){
    const taskId=Number(item.task_id||0),due=effectiveShoppingDue(item);
    const key=taskId&&item.task_title?`${taskId}|${due}`:`item:${String(item.id)}`;
    const group=groups.get(key)||{title:taskId?String(item.task_title||''):'',due,items:[]};
    group.items.push(item);groups.set(key,group);
  }
  return [...groups.values()].map(group=>{
    const groupHead=group.title?`<div class="shopping-group-head"><strong>${esc(group.title)}</strong>${group.due?`<span class="meta">${esc(group.due)}</span>`:''}</div>`:'';
    const rows=group.items.map(item=>{
      const productUrl=safeProductUrl(item.url);
      const itemMeta=[item.category||'',item.assignees?'担当 '+item.assignees:''].filter(Boolean).map(esc).join(' ・ ');
      return `<div class="row linked-shopping-row" data-expired-shopping-id="${esc(item.id)}"><div class="checklist-row-line"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="shopping" data-id="${esc(item.id)}" ${item.status==='completed'?'checked':''}><span class="${item.status==='completed'?'done':''}">${esc(item.name)}${item.quantity&&item.quantity!=='1'?` × ${esc(item.quantity)}`:''}</span></label><a class="checklist-row-action" href="/app/shopping_edit.php?id=${esc(item.id)}" aria-label="${esc(item.name)}を編集">編集</a></div>${itemMeta||productUrl?`<div class="meta">${itemMeta}${itemMeta&&productUrl?' ・ ':''}${productUrl?`<a href="${esc(productUrl)}" target="_blank" rel="noopener noreferrer">商品ページ</a>`:''}</div>`:''}</div>`;
    }).join('');
    return `<div class="shopping-group">${groupHead}${rows}</div>`;
  }).join('');
}
