import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../migrations/0051_shopping_category_catalog.sql',import.meta.url),'utf8');
const domain=readFileSync(new URL('../src/shopping-categories.ts',import.meta.url),'utf8');

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

console.log('shopping category catalog contract ok');
