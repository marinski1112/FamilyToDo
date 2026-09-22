import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const nativeRequire=createRequire(import.meta.url),modules=new Map();
export function loadTs(path){
 path=resolve(path);if(modules.has(path))return modules.get(path).exports;
 const module={exports:{}};modules.set(path,module);
 const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',source)(name=>name.startsWith('.')?loadTs(resolve(dirname(path),name+'.ts')):nativeRequire(name),module,module.exports);
 return module.exports;
}
export function database(beforeLifecycle=false){
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')&&(!beforeLifecycle||n<'0101')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
 db.exec("INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'goods-a','A','2000-01-01','2000-01-01'),(2,'goods-b','B','2000-01-01','2000-01-01'); INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,1,'goods-a','A','OWNER',1,'2000-01-01','2000-01-01'),(2,2,'goods-b','B','OWNER',1,'2000-01-01','2000-01-01');");
 return db;
}
export function context(db){
 const ctx={member:{id:1,family_id:1,role:'OWNER'},session:{csrfToken:'goods-test'},env:{APP_SECRET:'test-only'},failSql:null};
 ctx.env.DB={prepare(sql){let values=[];const stmt={bind(...v){values=v;return stmt},_run(){if(ctx.failSql?.test(sql))throw new Error('injected transaction failure');const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}},async run(){return stmt._run()},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}}};return stmt},async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s._run());db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}};
 return ctx;
}
const shopping=loadTs('src/shopping-category-api.ts').shoppingCategoryApi;
const mutation=loadTs('src/shopping-category-mutation-api.ts').shoppingCategoryMutationApi;
const item=loadTs('src/item-api.ts').itemApi;
export async function api(ctx,path,body){
 const handler=path==='/api/shopping'?loadTs('src/shopping-root.ts').shopping:path.startsWith('/api/shopping-categories')?shopping:path.startsWith('/api/shopping-category-mutation')?mutation:item;
 return handler(new Request('https://familytodo.test'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:'goods-test',...body})}:{}),ctx);
}
export async function call(ctx,path,body){const response=await api(ctx,path,body),data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;}
export const operations=(ctx,kind)=>({
 create:name=>call(ctx,kind==='shopping'?'/api/shopping-categories':'/api/item',{action:kind==='shopping'?'add':'category_add',name}),
 rename:(name,new_name)=>call(ctx,kind==='shopping'?'/api/shopping-category-mutation':'/api/item',{action:kind==='shopping'?'rename':'category_rename',kind,name,new_name}),
 remove:(name,policy='unclassified')=>call(ctx,'/api/shopping-category-mutation',{action:'delete_many',kind,names:[name],item_policy:policy}),
 reorder:order=>call(ctx,kind==='shopping'?'/api/shopping-categories':'/api/item',{action:kind==='shopping'?'reorder':'category_reorder',order}),
 load:()=>call(ctx,kind==='shopping'?'/api/shopping-categories':'/api/item?view=categories'),
});
