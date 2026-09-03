import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../migrations/0051_shopping_category_catalog.sql',import.meta.url),'utf8');
const domain=readFileSync(new URL('../src/shopping-categories.ts',import.meta.url),'utf8');
const newPage=readFileSync(new URL('../src/shopping-new-page.ts',import.meta.url),'utf8');
const newJs=readFileSync(new URL('../public/assets/shopping-new.js',import.meta.url),'utf8');
const categoryApi=readFileSync(new URL('../src/shopping-category-api.ts',import.meta.url),'utf8');
const contextRoutes=readFileSync(new URL('../src/context-api-routes.ts',import.meta.url),'utf8');

const requireMatch=(text,pattern,message)=>{
  if(!pattern.test(text))throw new Error(message);
};

requireMatch(migration,/CREATE TABLE IF NOT EXISTS shopping_category_catalog/i,'shopping category catalog table must exist');
requireMatch(migration,/family_id INTEGER NOT NULL/i,'shopping category catalog must be family scoped');
requireMatch(migration,/enabled INTEGER NOT NULL DEFAULT 1/i,'shopping category catalog must support future-option disablement');
requireMatch(migration,/is_custom INTEGER NOT NULL DEFAULT 1/i,'shopping category catalog must distinguish custom/default overrides');
requireMatch(migration,/UNIQUE INDEX[\s\S]*family_id, name COLLATE NOCASE/i,'shopping category names must be unique per family');
if(/UPDATE\s+shopping_items|DELETE\s+FROM\s+shopping_items/i.test(migration)){
  throw new Error('catalog migration must not rewrite/delete historical shopping item category strings');
}

requireMatch(domain,/DEFAULT_SHOPPING_CATEGORY_NAMES[\s\S]*'食品'[\s\S]*'日用品'[\s\S]*'子供'[\s\S]*'薬・衛生'[\s\S]*'その他'/,'canonical Shopping defaults must be defined in one retained domain module');
requireMatch(domain,/SHOPPING_CATEGORY_MAX_LENGTH\s*=\s*255/,'category length contract must preserve existing 255-character storage/UI compatibility');
requireMatch(domain,/String\(value \?\? ''\)\.trim\(\)/,'category normalization must trim user input');
requireMatch(domain,/resolveShoppingCategoryOptions/,'category selector options must resolve through the retained domain module');
requireMatch(domain,/if \(override && !override\.enabled\) continue/,'disabled catalog rows must be able to suppress canonical defaults');

for(const pattern of [
  /SELECT name,enabled FROM shopping_category_catalog WHERE family_id=\?/,
  /resolveShoppingCategoryOptions\(catalog\.results\)/,
  /id="shoppingCategorySelect"/,
  /<option value="__custom__">自由入力<\/option>/,
  /id="shoppingCategoryCustomWrap" hidden/,
  /id="shoppingCategoryRegister"/,
  /このカテゴリを登録/,
  /name="category" id="shoppingCategoryValue"/,
]) requireMatch(newPage,pattern,'Shopping new page must render the family category dropdown and explicit custom registration control');

for(const pattern of [
  /const categorySelect=document\.getElementById\('shoppingCategorySelect'\)/,
  /const categoryRegister=document\.getElementById\('shoppingCategoryRegister'\)/,
  /const syncCategory=\(\)=>/,
  /categoryCustomWrap\.hidden=!custom/,
  /if\(!custom\)categoryRegister\.checked=false/,
  /categorySelect\.value==='__custom__'&&!category/,
  /const registerCategory=categorySelect\.value==='__custom__'&&categoryRegister\.checked/,
  /fetch\('\/api\/shopping-categories'/,
  /const body=\{action:'add_batch',[\s\S]*category,/,
]) requireMatch(newJs,pattern,'Shopping new browser helper must register only explicitly checked custom categories and preserve add_batch submission');

for(const pattern of [
  /if\(!member\)return json\(\{ok:false,error:'ログインが必要です。'/,
  /body\.csrf!==ctx\.session\.csrfToken/,
  /normalizeShoppingCategoryName\(body\.name\)/,
  /isValidShoppingCategoryName\(name\)/,
  /INSERT OR IGNORE INTO shopping_category_catalog\(family_id,name,enabled,is_custom,created_by_member_id/,
  /UPDATE shopping_category_catalog SET enabled=1,updated_at=CURRENT_TIMESTAMP[\s\S]*WHERE family_id=\? AND name=\? COLLATE NOCASE/,
]) requireMatch(categoryApi,pattern,'Shopping category registration API must be CSRF-protected, validated, family-scoped, duplicate-safe, and re-enable existing options');
if(/UPDATE\s+shopping_items|DELETE\s+FROM\s+shopping_items/i.test(categoryApi)){
  throw new Error('category registration API must not rewrite/delete historical shopping item category strings');
}
requireMatch(contextRoutes,/url\.pathname==='\/api\/shopping-categories'[\s\S]*shoppingCategoryApi\(request,context\)/,'Shopping category registration API must be reachable through the retained context router');

console.log('shopping category catalog contract ok');
