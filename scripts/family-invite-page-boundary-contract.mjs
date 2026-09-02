import fs from 'node:fs';

const page=fs.readFileSync('src/family-invite-page.ts','utf8');
const lineOfficial=fs.readFileSync('src/line-official-account.ts','utf8');
const handlers=fs.readFileSync('src/auth-page-handlers.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { lineOfficialAccountInfo } from './line-official-account';",
  "import { html } from './response';",
  "import { APP_VERSION } from './version';",
  'export async function invitePage(ctx: AppContext, token: string): Promise<Response> {',
  "crypto.subtle.digest('SHA-256',new TextEncoder().encode(trimmed))",
  'FROM family_invitations i',
  'LEFT JOIN family_log_subjects s ON s.id=i.family_log_subject_id AND s.family_id=i.family_id AND s.active=1',
  'WHERE i.token_hash=? LIMIT 1',
  'この招待リンクは無効・使用済み・期限切れのいずれかです。',
  '本登録対象の家族ログプロフィールが無効です。',
  'LINE公式アカウントを友だち追加',
  'data-family-endpoint="/api/family/join"',
  'name="token"',
  'name="member_name"',
  '/assets/family-onboarding.js?v=${APP_VERSION}',
]) if(!page.includes(marker)) throw new Error(`family invite page lost behavior marker: ${marker}`);
if(page.includes("from './app'")) throw new Error('family invite page must not depend on app.ts');

for(const marker of [
  'export async function lineOfficialAccountInfo(env: Env): Promise<LineOfficialAccountInfo | null> {',
  "fetch('https://api.line.me/v2/bot/info',{headers:{Authorization:`Bearer ${token}`}})",
  "display_name:String(d.displayName||'Family TODO LINE')",
  'add_friend_url:`https://line.me/R/ti/p/${encoded}`',
  'recommend_url:`https://line.me/R/nv/recommendOA/${encoded}`',
]) if(!lineOfficial.includes(marker)) throw new Error(`LINE official account helper lost behavior marker: ${marker}`);
if(lineOfficial.includes("from './app'")) throw new Error('LINE official account helper must not depend on app.ts');

if(!handlers.includes("export { invitePage } from './family-invite-page';")) throw new Error('auth page boundary must route invitePage through retained module');
if(!handlers.includes("export { home } from './home-page';")) throw new Error('auth page boundary must route home through retained module');
if(handlers.includes("from './app'")) throw new Error('auth page boundary must not depend on app.ts');

console.log('family invite page retained boundary contract ok');
