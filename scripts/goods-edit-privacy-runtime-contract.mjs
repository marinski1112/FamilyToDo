import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+file,'utf8'));
db.exec(`
INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(701,'goods-runtime','Fixture','now','now');
INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES
(701,701,'goods-owner','Owner','OWNER',1,'now','now'),(702,701,'goods-admin','Admin','ADMIN',1,'now','now');
INSERT INTO tasks(id,family_id,title,status,created_by,created_at,updated_at,visibility_scope,private_owner_id)
VALUES(701,701,'Private','pending',701,'now','now','PRIVATE',701);
INSERT INTO items(id,family_id,name,status,created_by,created_at,updated_at,task_id,completed_by,completed_at)
VALUES(701,701,'Item','completed',701,'now','now',701,701,'2026-09-19 10:00:00');
INSERT INTO shopping_items(id,family_id,name,status,created_by,created_at,updated_at,task_id,completed_by,completed_at)
VALUES(701,701,'Shopping','completed',701,'now','now',701,701,'2026-09-19 10:00:00');
UPDATE items SET visibility_scope='PRIVATE',private_owner_id=701 WHERE id=701;
UPDATE shopping_items SET visibility_scope='PRIVATE',private_owner_id=701 WHERE id=701;
`);
const mutations=[];
const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this;},
  async first(){return db.prepare(sql).get(...args)??null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){mutations.push(sql);const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
};}};
const visibility=stripTypeScriptTypes(readFileSync('src/goods-visibility.ts','utf8')).replace(/export /g,'');
for(const [file,handler,table] of [['item-edit-page.ts','itemEdit','items'],['shopping-edit-page.ts','shoppingEdit','shopping_items']]){
  const source=stripTypeScriptTypes(readFileSync('src/'+file,'utf8')).replace(/^import .*;\s*$/gm,'').replace(/export /g,'');
  const context=vm.createContext({Response,URL,Intl,Date,crypto,APP_VERSION:'fixture',
    layout:(_title,body)=>body,html:body=>new Response(body),
    json:(body,status=200)=>new Response(JSON.stringify(body),{status}),
    redirect:location=>new Response(null,{status:302,headers:{location}}),
    bodyJson:request=>request.json(),RequestBodyParseError:class extends Error{},
    normalizeShoppingCategoryName:value=>String(value??'').trim(),
    isValidShoppingCategoryName:value=>value.length<=255,SHOPPING_CATEGORY_MAX_LENGTH:255,
    resolveShoppingCategoryOptions:()=>[],shoppingCategoryKey:value=>value.toLowerCase(),validateLiffNext:value=>value,
  });
  vm.runInContext(visibility+'\n'+source+`\nglobalThis.handler=${handler};`,context);
  for(const relation of [701,null]){
  db.prepare(`UPDATE ${table} SET task_id=? WHERE id=701`).run(relation);
  for(const memberId of [701,702])for(const method of ['GET','POST']){
    mutations.length=0;
    const request=new Request('https://fixture.invalid/edit',{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify({csrf:'fixture',name:'Updated',task_id:null,assignees:[],date:'2026-09-20',due_date:'2026-09-20'})}:{})});
    const result=await context.handler(request,{request,member:{id:memberId,family_id:701,role:memberId===701?'OWNER':'ADMIN'},session:{csrfToken:'fixture'},env:{DB}},701);
    if(memberId===702){assert.equal(result.status,404);assert.equal(mutations.length,0);continue;}
    if(method==='GET')assert.doesNotMatch(await result.text(),/name="(?:assignees|task_id)"/);
    else assert.equal(result.status,302);
    const row=db.prepare(`SELECT task_id,status,completed_by,completed_at FROM ${table} WHERE id=701`).get();
    assert.deepEqual({...row},{task_id:method==='POST'?null:relation,status:'completed',completed_by:701,completed_at:'2026-09-19 10:00:00'});
    assert(mutations.every(sql=>!/(?:DELETE|INSERT).*completions|SET status=/i.test(sql)));
  }
  }
}
db.close();
console.log('goods edit runtime: owner edits detach legacy Task linkage; admin denied; forged linkage/assignees cannot change Goods ownership, privacy or completion');
