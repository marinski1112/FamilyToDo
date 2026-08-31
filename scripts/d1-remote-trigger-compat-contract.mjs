import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0045_calendar_animated_stamps.sql','utf8');
const attrs=fs.readFileSync('.gitattributes','utf8');
const fail=(message)=>{console.error(`d1 remote trigger compat contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

must(/migrations\/\*\.sql\s+text\s+eol=lf/.test(attrs),'migration files must be normalized to LF for Wrangler/D1 remote apply');
must(!/\r/.test(migration),'Calendar stamp migration must not contain CR bytes');
must(/CREATE TRIGGER[\s\S]*?BEGIN/.test(migration),'Calendar stamp migration must retain trigger guards');
must(!/SELECT\s+CASE\b/i.test(migration),'unparenthesized CASE in D1 trigger bodies can be split as incomplete input remotely');
const guardedCases=(migration.match(/SELECT\s+\(CASE\b/g)||[]).length;
must(guardedCases>=8,`all Calendar stamp tenant guards must use parenthesized CASE (found ${guardedCases})`);

console.log('d1 remote trigger compat contract: ok');
