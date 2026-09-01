from pathlib import Path


def replace_one(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    source = p.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one exact anchor, found {count}')
    p.write_text(source.replace(old, new, 1))


home = Path('src/google-home.ts')
source = home.read_text()
import_anchor = "import { DEFAULT_FAMILY_TIMEZONE, formatStoredUtcForFamily } from './timezone';\n"
import_line = "import { childJournalGoogleHomeReady, childJournalVoiceMilestoneFromSlug, recordExternalChildJournalMilestoneDomain } from './child-journal-google-home';\n"
if source.count(import_anchor) != 1 or import_line in source:
    raise SystemExit('Child Journal Google Home import anchor mismatch')
source = source.replace(import_anchor, import_anchor + import_line, 1)

old_consent = 'Googleから${escapeHtml(ctx.member.name)} さんの操作として睡眠開始・終了、排泄やちょこっと家事を記録できます。'
new_consent = 'Googleから${escapeHtml(ctx.member.name)} さんの操作として睡眠開始・終了、排泄、成長日記やちょこっと家事を記録できます。'
if source.count(old_consent) != 1:
    raise SystemExit('Google Home consent anchor mismatch')
source = source.replace(old_consent, new_consent, 1)

old_load = "  const [subjects,chores,quickActions]=await Promise.all([env.DB.prepare(\"SELECT id,name,subject_kind,enabled_types_json,overview_quick_types_json FROM family_log_subjects WHERE family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD','PET') ORDER BY id\").bind(familyId).all<Row>(),env.DB.prepare('SELECT id,name FROM family_quick_chores WHERE family_id=? AND active=1 ORDER BY sort_order,id').bind(familyId).all<Row>(),env.DB.prepare(\"SELECT q.id,q.name,q.subject_id,s.name subject_name,s.subject_kind FROM family_log_quick_actions q JOIN family_log_subjects s ON s.id=q.subject_id AND s.family_id=q.family_id AND s.active=1 WHERE q.family_id=? AND q.active=1 AND q.mode='QUICK' ORDER BY q.sort_order,q.id\").bind(familyId).all<Row>()]);\n"
new_load = "  const [subjects,chores,quickActions,journalReady]=await Promise.all([env.DB.prepare(\"SELECT id,name,subject_kind,enabled_types_json,overview_quick_types_json FROM family_log_subjects WHERE family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD','PET') ORDER BY id\").bind(familyId).all<Row>(),env.DB.prepare('SELECT id,name FROM family_quick_chores WHERE family_id=? AND active=1 ORDER BY sort_order,id').bind(familyId).all<Row>(),env.DB.prepare(\"SELECT q.id,q.name,q.subject_id,s.name subject_name,s.subject_kind FROM family_log_quick_actions q JOIN family_log_subjects s ON s.id=q.subject_id AND s.family_id=q.family_id AND s.active=1 WHERE q.family_id=? AND q.active=1 AND q.mode='QUICK' ORDER BY q.sort_order,q.id\").bind(familyId).all<Row>(),childJournalGoogleHomeReady(env)]);\n"
if source.count(old_load) != 1:
    raise SystemExit('Google Home scene catalog load anchor mismatch')
source = source.replace(old_load, new_load, 1)

sleep_anchor = "    if(types.includes('SLEEP'))scenes.push({...scene(`ft:sleep:start:${s.id}`,`${prefix}寝た`,[`${possessive}睡眠開始`,`${possessive}寝かしつけ完了`]),category:'睡眠',operation:'SLEEP_START'},{...scene(`ft:sleep:stop:${s.id}`,`${prefix}起きた`,[`${possessive}起床記録`,`${possessive}睡眠終了`]),category:'睡眠',operation:'SLEEP_STOP'});\n"
milestone_block = """    if(types.includes('SLEEP'))scenes.push({...scene(`ft:sleep:start:${s.id}`,`${prefix}寝た`,[`${possessive}睡眠開始`,`${possessive}寝かしつけ完了`]),category:'睡眠',operation:'SLEEP_START'},{...scene(`ft:sleep:stop:${s.id}`,`${prefix}起きた`,[`${possessive}起床記録`,`${possessive}睡眠終了`]),category:'睡眠',operation:'SLEEP_STOP'});
    if(journalReady)scenes.push(
      {...scene(`ft:journal:stand:${s.id}`,`${prefix}立った記録`,[single?'立った':`${s.name}が立った`,`${possessive}成長日記 立った記録`]),category:'成長日記',operation:'CHILD_JOURNAL_STAND'},
      {...scene(`ft:journal:first_step:${s.id}`,`${prefix}歩いた記録`,[single?'歩いた':`${s.name}が歩いた`,`${possessive}成長日記 歩いた記録`]),category:'成長日記',operation:'CHILD_JOURNAL_FIRST_STEP'},
      {...scene(`ft:journal:first_tooth:${s.id}`,`${prefix}最初の歯記録`,[single?'最初の歯が生えた':`${s.name}に最初の歯が生えた`,`${possessive}最初の歯を記録`]),category:'成長日記',operation:'CHILD_JOURNAL_FIRST_TOOTH'},
      {...scene(`ft:journal:tooth:${s.id}`,`${prefix}歯記録`,[single?'歯を記録':`${s.name}の歯を記録`,`${possessive}成長日記 歯記録`]),category:'成長日記',operation:'CHILD_JOURNAL_TOOTH'}
    );
"""
if source.count(sleep_anchor) != 1:
    raise SystemExit('Google Home sleep scene anchor mismatch')
source = source.replace(sleep_anchor, milestone_block, 1)

old_dispatch = "else{const pet=/^ft:pet:(meal|bath|medicine|water):(\\d+)$/.exec(id),match=/^ft:log:(wet|dirty):(\\d+):(now|m60)$/.exec(id);if(pet)ok=(await recordExternalPetQuickLogDomain(env,member,Number(pet[2]),pet[1])).ok;else if(match)ok=(await recordExternalFamilyLogDomain(env,member,Number(match[2]),match[1]==='wet'?'WET':'DIRTY',match[3]==='now'?'NOW':'MINUS_60')).ok;else error='deviceNotFound';}"
new_dispatch = "else{const journal=/^ft:journal:(stand|first_step|first_tooth|tooth):(\\d+)$/.exec(id),pet=/^ft:pet:(meal|bath|medicine|water):(\\d+)$/.exec(id),match=/^ft:log:(wet|dirty):(\\d+):(now|m60)$/.exec(id);if(journal){const code=childJournalVoiceMilestoneFromSlug(journal[1]);if(code)ok=(await recordExternalChildJournalMilestoneDomain(env,member,Number(journal[2]),code)).ok;}else if(pet)ok=(await recordExternalPetQuickLogDomain(env,member,Number(pet[2]),pet[1])).ok;else if(match)ok=(await recordExternalFamilyLogDomain(env,member,Number(match[2]),match[1]==='wet'?'WET':'DIRTY',match[3]==='now'?'NOW':'MINUS_60')).ok;else error='deviceNotFound';}"
if source.count(old_dispatch) != 1:
    raise SystemExit('Google Home execute dispatch anchor mismatch')
source = source.replace(old_dispatch, new_dispatch, 1)

old_fallback = "  const fallbackOperation=()=>/^ft:log:wet:/.test(recentId)?'排泄 WET':/^ft:log:dirty:/.test(recentId)?'排泄 DIRTY':/^ft:sleep:start:/.test(recentId)?'SLEEP_START':/^ft:sleep:stop:/.test(recentId)?'SLEEP_STOP':/^ft:chore:/.test(recentId)?'QUICK_CHORE':'不明';\n"
new_fallback = "  const fallbackOperation=()=>/^ft:journal:/.test(recentId)?'成長日記':/^ft:log:wet:/.test(recentId)?'排泄 WET':/^ft:log:dirty:/.test(recentId)?'排泄 DIRTY':/^ft:sleep:start:/.test(recentId)?'SLEEP_START':/^ft:sleep:stop:/.test(recentId)?'SLEEP_STOP':/^ft:chore:/.test(recentId)?'QUICK_CHORE':'不明';\n"
if source.count(old_fallback) != 1:
    raise SystemExit('Google Home diagnostic fallback anchor mismatch')
source = source.replace(old_fallback, new_fallback, 1)

old_preview = "  const preview=['睡眠','排泄','家族ログ','ペット','ちょこっと家事'].map(category=>{"
new_preview = "  const preview=['睡眠','排泄','成長日記','家族ログ','ペット','ちょこっと家事'].map(category=>{"
if source.count(old_preview) != 1:
    raise SystemExit('Google Home preview category anchor mismatch')
source = source.replace(old_preview, new_preview, 1)
home.write_text(source)

replace_one(
    'scripts/feature-contract-bundle.mjs',
    "    ['google-home-family-log',['node','scripts/google-home-family-log-contract.mjs']],\n",
    "    ['google-home-family-log',['node','scripts/google-home-family-log-contract.mjs']],\n    ['child-journal-google-home',['node','scripts/child-journal-google-home-contract.mjs']],\n",
    'Google integration bundle Child Journal contract',
)

docs = Path('docs/GOOGLE_HOME_VOICE_SETUP.md')
source = docs.read_text()
old_intro = '音声対象はactiveな **BABY / CHILDだけ**です。PET / ADULT / OTHERは対象外です。active対象が家族内で1人なら表示名から名前を省略し、2人以上なら必ず名前を付けます。IDにはどちらの場合もsubject IDを保持します。'
new_intro = '子どもの睡眠・排泄・成長日記Sceneはactiveな **BABY / CHILD**を対象にします。PETは専用のペットScene、ちょこっと家事は家族共通Sceneとして別に公開します。ADULT / OTHERは子ども向けSceneの対象外です。activeなBABY / CHILDが家族内で1人なら表示名から名前を省略し、2人以上なら必ず名前を付けます。IDにはどちらの場合もsubject IDを保持します。'
if source.count(old_intro) != 1:
    raise SystemExit('Google Home docs catalog intro anchor mismatch')
source = source.replace(old_intro, new_intro, 1)
bullet_anchor = '* 1時間前: `ft:log:wet:<subject_id>:m60` / `ft:log:dirty:<subject_id>:m60`\n'
bullet_add = '* 成長日記: `ft:journal:stand:<subject_id>` / `ft:journal:first_step:<subject_id>` / `ft:journal:first_tooth:<subject_id>` / `ft:journal:tooth:<subject_id>`（立った・歩いた・最初の歯・歯）\n'
if source.count(bullet_anchor) != 1:
    raise SystemExit('Google Home docs milestone bullet anchor mismatch')
source = source.replace(bullet_anchor, bullet_anchor + bullet_add, 1)
constraint_anchor = 'Cloud-to-cloud Sceneの `action.devices.commands.ActivateScene` がfulfillmentへ渡す動的parameterはactivate/deactivateだけです。自由な音声文をFamily TODOへそのまま転送できません。'
constraint_new = constraint_anchor + ' 成長日記も4つの固定マイルストーンだけをScene化し、身長・体重の数値や自由メモはGoogle Home Sceneから受け取りません。'
if source.count(constraint_anchor) != 1:
    raise SystemExit('Google Home docs constraint anchor mismatch')
source = source.replace(constraint_anchor, constraint_new, 1)
test_anchor = '6. 対象が1人なら「寝た」「おしっこ記録」「1時間前のうんち記録」、複数なら名前付きSceneがあることを確認します。PETや無効typeがないことも確認します。'
test_new = '6. 対象が1人なら「寝た」「おしっこ記録」「1時間前のうんち記録」に加えて「立った記録」「歩いた記録」「最初の歯記録」「歯記録」があり、複数なら名前付きSceneになることを確認します。PETや無効typeの扱いも確認します。'
if source.count(test_anchor) != 1:
    raise SystemExit('Google Home docs test step anchor mismatch')
docs.write_text(source.replace(test_anchor, test_new, 1))
