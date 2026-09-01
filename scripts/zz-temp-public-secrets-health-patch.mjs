import fs from 'node:fs';

const path='src/index.ts';
const source=fs.readFileSync(path,'utf8');
const old=`      if(url.pathname==='/__cf/secrets-health') {
        const names = ['APP_SECRET','LINE_ACCESS_TOKEN','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_LOGIN_CHANNEL_ID','LINE_LOGIN_CHANNEL_SECRET','LINE_LIFF_ID','NOTIFY_SECRET','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'] as const;
        const secrets = Object.fromEntries(names.map((name) => [name, { present: typeof env[name] === 'string' && env[name].length > 0, length: typeof env[name] === 'string' ? env[name].length : 0 }]));
        return json({ok:true,worker:env.ENVIRONMENT||'unknown',secrets});
      }
`;
const replacement=`      if(url.pathname==='/__cf/secrets-health') return json({ok:true,service:'familytodo-secrets'});
`;
const matches=source.split(old).length-1;
if(matches!==1)throw new Error(`exact public secrets health source mismatch: ${matches} matches`);
fs.writeFileSync(path,source.replace(old,replacement));
fs.rmSync('scripts/zz-temp-public-secrets-health-patch.mjs');
fs.rmSync('.github/workflows/zz-temp-public-secrets-health-patch.yml');
