import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/family-daily-journal.ts','utf8');
const start=source.indexOf('function summaryDetails('),end=source.indexOf('\nexport async function generateFamilyDailyJournal(',start);
assert.ok(start>=0&&end>start);
const script=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const scope=vm.createContext({MAX_SUMMARY_DETAILS:3,MAX_SUMMARY_DETAIL_CHARS:60});
vm.runInContext(script+'\nthis.summarize=summary;',scope);
const member=(stays)=>({memberId:1,name:'花',routePointCount:12,stays:stays.map(place=>({place,minutes:120,from:'',to:''}))});
assert.match(scope.summarize([member(['自宅'])],[],[]),/花さんは自宅で過ごしました/);
assert.match(scope.summarize([member(['職場'])],[],[]),/花さんは職場で過ごしました/);
assert.match(scope.summarize([member(['公園','図書館'])],[],[]),/公園・図書館に立ち寄りました/);
assert.doesNotMatch(scope.summarize([member(['自宅'])],[],[]),/記録がありません/);
console.log('Journal location narrative: home, workplace, outings without chores, and factual fallback pass.');
