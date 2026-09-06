import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0058_family_member_profile_foundation.sql','utf8');
const permissionsMigration=fs.readFileSync('migrations/0059_ai_profile_field_permissions.sql','utf8');
const page=fs.readFileSync('src/settings-members-page.ts','utf8');
const browser=fs.readFileSync('public/assets/settings-members.js','utf8');

for(const marker of [
  'ALTER TABLE family_log_subjects ADD COLUMN sex_gender TEXT NULL;',
  'ALTER TABLE family_log_subjects ADD COLUMN birthplace TEXT NULL;',
  'ALTER TABLE family_log_subjects ADD COLUMN blood_type TEXT NULL;',
  'ALTER TABLE family_log_subjects ADD COLUMN personality_note TEXT NULL;',
  'ALTER TABLE family_log_subjects ADD COLUMN ai_personalization_enabled INTEGER NOT NULL DEFAULT 0;',
])if(!migration.includes(marker))throw new Error(`member profile migration marker missing: ${marker}`);
if(!permissionsMigration.includes('ALTER TABLE family_log_subjects ADD COLUMN ai_profile_permissions_json TEXT NULL;'))throw new Error('AI profile field-permission storage missing');

for(const marker of [
  "if(role!=='OWNER'&&role!=='ADMIN')return new Response('管理者権限が必要です。',{status:403});",
  "if(String(b.action||'')!=='profile_update')",
  "b.csrf!==ctx.session.csrfToken",
  "WHERE id=? AND family_id=? AND deleted_at IS NULL",
  "WHERE id=? AND family_id=? AND member_id=? AND active=1",
  "['A','B','O','AB'].includes(bloodType)",
  "raw>todayJst()",
  "optionalText(b.personality_note,1000)",
  "strictAiProfilePermissions(b.ai_profile_permissions)",
  "ai_profile_permissions_json=?",
  "changed_fields:changedFields",
  "ai_personalization_enabled:Boolean(aiEnabled)",
  '<details class=\"member-profile-details\"><summary>プロフィール（任意）</summary>',
  '<details class=\"member-profile-ai-permissions\"><summary>AIに使う項目</summary>',
  'value=\"personality\"',
  'value=\"birth_facts\"',
  'value=\"birthplace\"',
  'value=\"sex_gender\"',
  'value=\"blood_type\"',
  'すべて初期OFFです。生年月日はそのままAIへ渡さず',
  '/assets/settings-members.js?v=${APP_VERSION}-member-profile-permissions1',
])if(!page.includes(marker))throw new Error(`member profile server/UI marker missing: ${marker}`);

if(page.includes("personality_note:personalityNote")||page.includes("birthplace:birthplace")||page.includes("sex_gender:sexGender")||page.includes("blood_type:bloodType"))throw new Error('activity log must not contain raw profile values');
if(/gemini|generateContent|familyAi/i.test(migration+permissionsMigration))throw new Error('profile migrations must not wire AI behavior');

for(const marker of [
  "document.querySelectorAll('.member-profile-form')",
  "fetch('/app/settings_members.php'",
  "action:'profile_update'",
  "ai_personalization_enabled:fd.get('ai_personalization_enabled')==='on'",
  "input[name=\"ai_profile_permissions\"]:checked",
  'ai_profile_permissions:aiProfilePermissions',
])if(!browser.includes(marker))throw new Error(`member profile browser marker missing: ${marker}`);

console.log('member-profile-foundation-contract: admin-only, tenant-scoped optional profile storage with collapsed field-level AI permissions, privacy-safe audit metadata and no AI call ok');
