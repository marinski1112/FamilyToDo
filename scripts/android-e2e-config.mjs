import { readFileSync, writeFileSync } from 'node:fs';

const databaseId=process.env.ANDROID_E2E_DB_ID?.trim();
const bucketName='familytodo-android-e2e';
const workerName='familytodo-android-e2e';
const origin='https://'+workerName+'.marinski1112.workers.dev';
const production=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const productionId=production.d1_databases?.[0]?.database_id;
if(production.name!=='familytodo'||productionId!=='9d9d6de8-ff45-4dd6-9fec-0de70ee1d093'||
   production.r2_buckets?.[0]?.bucket_name!=='familytodo')
  throw new Error('Production bindings changed; review isolation before generating config');
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId||'')||
   databaseId.toLowerCase()===productionId?.toLowerCase())
  throw new Error('ANDROID_E2E_DB_ID must be a separate D1 database UUID');
if(production.name===workerName||production.r2_buckets?.some(bucket=>bucket.bucket_name===bucketName))
  throw new Error('E2E Worker and bucket names must differ from production');
const config={
  $schema:'node_modules/wrangler/config-schema.json',
  name:workerName,
  main:production.main,
  compatibility_date:production.compatibility_date,
  compatibility_flags:production.compatibility_flags,
  assets:production.assets,
  d1_databases:[{binding:'DB',database_name:bucketName,database_id:databaseId,migrations_dir:'./migrations'}],
  r2_buckets:[{binding:'MEDIA',bucket_name:bucketName}],
  vars:{
    APP_NAME:'FamilyToDo Android E2E',
    APP_URL:origin,
    APP_TIMEZONE:'Asia/Tokyo',
    NOTIFY_MODE:'disabled',
    ENVIRONMENT:'android-e2e'
  },
  observability:{enabled:false},
  keep_vars:false
};
const output=new URL('../wrangler.android-e2e.generated.jsonc',import.meta.url);
writeFileSync(output,JSON.stringify(config,null,2)+'\n',{flag:'w'});
process.stdout.write('Generated isolated Android E2E configuration for '+workerName+'\n');
