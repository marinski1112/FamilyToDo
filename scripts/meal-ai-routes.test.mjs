import test from 'node:test';
import assert from 'node:assert/strict';
import {ROUTED_AI_FEATURES,resolveFeatureModels,parseFeatureRouteModels,routeSettingKey} from '../src/ai-model-routing.ts';
import {resolveMealLiveRoute,parseMealLiveModel,mealLiveSettingKey} from '../src/meal-live-model-routing.ts';
const db=(rows=new Map())=>({prepare(){return {bind(family,key){return {async first(){const value=rows.get(`${family}|${key}`);return value===undefined?null:{setting_value:value};}};}};}});
test('five meal defaults follow the design; reads call no generation provider',async()=>{
 const saved=globalThis.fetch;globalThis.fetch=()=>{throw new Error('unexpected HTTP');};try{
 for(const feature of ['MEAL_INBOX','MEAL_RECIPE_EXTRACT','MEAL_RECEIPT_PARSE'])assert.deepEqual((await resolveFeatureModels(db(),1,feature,'OWNER')).models,['gemini-3.5-flash-lite','gemini-3.5-flash']);
 assert.deepEqual((await resolveFeatureModels(db(),1,'MEAL_WEEKLY_PLAN','OWNER')).models,['gemini-3.5-flash','gemini-3.5-flash-lite']);
 assert.deepEqual((await resolveFeatureModels(db(),1,'MEAL_BABY_GUIDANCE','OWNER')).models,['gemini-3.5-flash']);
 }finally{globalThis.fetch=saved;}
});
test('meal normal routes refuse Live/TTS models; baby guidance has no fallback',async()=>{
 for(const model of ['gemini-3.8-live','gemini-3.8-live-extended-thinking','gemini-test-tts','gemini-test-native-audio'])assert.equal(parseFeatureRouteModels('MEAL_INBOX',[model]),null);
 assert.equal(parseFeatureRouteModels('MEAL_BABY_GUIDANCE',['gemini-3.5-flash','gemini-3.5-flash-lite']),null);
 const rows=new Map([[`1|${routeSettingKey('MEAL_INBOX','OWNER')}`,JSON.stringify(['gemini-3.8-live'])]]);assert.equal((await resolveFeatureModels(db(rows),1,'MEAL_INBOX','OWNER')).source,'FEATURE_DEFAULT');
});
test('meal settings remain scoped to family and audience; invalid scope is refused',async()=>{
 const rows=new Map([[`1|${routeSettingKey('MEAL_WEEKLY_PLAN','MEMBER')}`,JSON.stringify(['gemini-3.5-flash-lite'])]]);
 assert.deepEqual((await resolveFeatureModels(db(rows),1,'MEAL_WEEKLY_PLAN','ADMIN')).models,['gemini-3.5-flash-lite']);
 assert.equal((await resolveFeatureModels(db(rows),2,'MEAL_WEEKLY_PLAN','ADMIN')).source,'FEATURE_DEFAULT');assert.equal((await resolveFeatureModels(db(rows),1,'MEAL_WEEKLY_PLAN','OWNER')).source,'FEATURE_DEFAULT');
 await assert.rejects(resolveFeatureModels(db(),0,'MEAL_INBOX','OWNER'));await assert.rejects(resolveFeatureModels(db(),1,'MEAL_COOKING_LIVE','OWNER'));
});
test('Live is a separate unverified transport policy; Flash-Lite and extended thinking are not implicit alternatives',async()=>{
 assert(!ROUTED_AI_FEATURES.includes('MEAL_COOKING_LIVE'));assert.equal(parseMealLiveModel('gemini-3.5-flash-lite'),null);assert.equal(parseMealLiveModel('gemini-3.8-live-extended-thinking'),null);
 const rows=new Map([[`1|${mealLiveSettingKey('OWNER')}`,'gemini-3.8-live']]);assert.deepEqual(await resolveMealLiveRoute(db(rows),1,'OWNER'),{transport:'LIVE',model:'gemini-3.8-live',source:'FAMILY_SETTING',availability:'UNVERIFIED'});
 assert.equal((await resolveMealLiveRoute(db(rows),2,'OWNER')).source,'DESIGN_DEFAULT');await assert.rejects(resolveMealLiveRoute(db(),0,'OWNER'));
});
