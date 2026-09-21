(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
const section=page?.querySelector('.shopping-checklist-section');
if(!(page instanceof HTMLElement)||!(section instanceof HTMLElement))return;

const UNCLASSIFIED='未分類';
const payload=(()=>{try{return JSON.parse(document.getElementById('dailyPayload')?.textContent||'{}');}catch{return {};}})();
const style=document.createElement('style');
style.id='shoppingCategoryUxStyle';
style.textContent=`
.shopping-checklist-section .shopping-quick-category-row{display:none!important}
.shopping-category-title{min-height:58px!important;padding:8px 8px 8px 2px!important;border-bottom:1px solid #e5e7eb!important}
.shopping-category-name{font-size:20px!important;font-weight:800!important;line-height:1.3;color:#1f2937}
.shopping-category-toggle{transform:none!important;width:28px!important;min-width:28px!important;height:40px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#8e8e93!important;font-size:22px!important;font-weight:800!important}
.shopping-category-group.category-collapsed>.shopping-category-title>.shopping-category-toggle{transform:none!important}
.shopping-category-group.category-collapsed>.shopping-category-footer{display:none!important}
.shopping-category-draft>.shopping-category-title>.shopping-category-toggle{display:none!important}
.shopping-category-footer{border-top:1px solid #eef0f3;padding:4px 10px 10px 42px;background:#fff}
.shopping-category-add-item{display:flex;align-items:center;min-height:48px;width:100%;border:0;background:transparent;color:#007aff;font:inherit;font-size:16px;font-weight:800;text-align:left;padding:0}
.shopping-category-form-parking{display:none!important}
.shopping-checklist-section input.check.toggle{-webkit-appearance:none;appearance:none;border-radius:5px!important}
.shopping-continuous-composer{margin:4px 0 2px;padding:10px 12px 11px;border:1px solid #e5e7eb;border-radius:14px;background:#f8f8fa;box-sizing:border-box}
.shopping-continuous-main{display:flex;align-items:flex-start;gap:10px}
.shopping-continuous-circle{width:22px;height:22px;flex:0 0 22px;margin-top:13px;border:1.7px solid #c7c7cc;border-radius:5px;box-sizing:border-box;background:#fff}
.shopping-continuous-name{display:block;min-width:0;flex:1;width:100%;min-height:48px;max-height:96px;resize:none;overflow-y:auto;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;padding:8px 0!important;font:inherit;font-size:18px!important;line-height:1.45;color:#1c1c1e}
.shopping-continuous-name::placeholder{color:#8e8e93}
.shopping-continuous-fields{display:grid;gap:8px;margin:7px 0 0 32px}
.shopping-continuous-field{display:grid;gap:4px}
.shopping-continuous-field>span{font-size:12px;font-weight:700;color:#64748b}
.shopping-continuous-field textarea,.shopping-continuous-field input{width:100%;box-sizing:border-box;border:1px solid #dfe3e8!important;border-radius:10px!important;background:#fff!important;box-shadow:none!important;font:inherit;font-size:15px!important;padding:9px 10px!important;color:#1c1c1e}
.shopping-continuous-field textarea{min-height:62px;resize:vertical}
.shopping-continuous-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 0 32px}
.shopping-continuous-hint{font-size:12px;line-height:1.35;color:#64748b}
.shopping-continuous-save{min-width:64px;min-height:38px;border:0;border-radius:9px;background:#007aff;color:#fff;font:inherit;font-weight:800;padding:0 12px}
.shopping-continuous-save:disabled{opacity:.55}
.shopping-continuous-status{min-height:0;margin:4px 0 0 32px;font-size:12px;line-height:1.35;color:#64748b}
.shopping-continuous-status[data-error="1"]{color:#b42318}
@media(max-width:720px){.shopping-category-name{font-size:19px!important}.shopping-category-toggle{font-size:22px!important;min-width:28px!important}.shopping-category-footer{padding-left:28px}.shopping-continuous-fields,.shopping-continuous-actions,.shopping-continuous-status{margin-left:32px}}
`;
document.head.append(style);

section.querySelector(':scope > .checklist-more')?.remove();
section.querySelector(':scope > .section-quick-entry')?.remove();

const categoryOf=group=>String(group?.dataset?.category||UNCLASSIFIED).trim()||UNCLASSIFIED;
const rowsOf=group=>[...group.querySelectorAll(':scope > .linked-shopping-row')].filter(row=>row instanceof HTMLElement);
const rowCompleted=row=>row.querySelector('input.toggle[data-type="shopping"]')?.checked===true;
const groups=()=>[...section.querySelectorAll(':scope > .shopping-category-group:not(.belongings-category-group):not(.belongings-category-draft)')].filter(group=>group instanceof HTMLElement);

const parking=document.createElement('div');
parking.className='shopping-category-form-parking';
parking.hidden=true;
section.append(parking);

const composer=document.createElement('form');
composer.className='shopping-continuous-composer';
composer.hidden=true;
composer.innerHTML=`<div class="shopping-continuous-main"><span class="shopping-continuous-circle" aria-hidden="true"></span><textarea class="shopping-continuous-name" rows="1" maxlength="200" autocomplete="off" placeholder="買うものを入力" aria-label="買うものを入力"></textarea></div><div class="shopping-continuous-fields"><label class="shopping-continuous-field"><span>メモ</span><textarea class="shopping-continuous-memo" rows="2" maxlength="2000" placeholder="任意"></textarea></label><label class="shopping-continuous-field"><span>URL</span><input class="shopping-continuous-url" type="url" maxlength="2048" inputmode="url" autocomplete="url" placeholder="https://..."></label></div><div class="shopping-continuous-actions"><span class="shopping-continuous-hint">改行で保存して、次の項目を続けて入力できます</span><button class="shopping-continuous-save" type="submit">追加</button></div><div class="shopping-continuous-status" role="status" aria-live="polite"></div>`;
parking.append(composer);
const nameInput=composer.querySelector('.shopping-continuous-name');
const memoInput=composer.querySelector('.shopping-continuous-memo');
const urlInput=composer.querySelector('.shopping-continuous-url');
const saveButton=composer.querySelector('.shopping-continuous-save');
const status=composer.querySelector('.shopping-continuous-status');
if(!(nameInput instanceof HTMLTextAreaElement)||!(memoInput instanceof HTMLTextAreaElement)||!(urlInput instanceof HTMLInputElement)||!(saveButton instanceof HTMLButtonElement)||!(status instanceof HTMLElement))return;

let activeGroup=null;
let saving=false;
const draftKey=category=>`familytodo.shopping-category-draft:${encodeURIComponent(categoryOf({dataset:{category}}))}`;
const draftValue=()=>({name:nameInput.value,memo:memoInput.value,url:urlInput.value});
const writeDraft=()=>{
  if(!(activeGroup instanceof HTMLElement))return;
  const category=categoryOf(activeGroup),draft=draftValue();
  try{
    if(draft.name||draft.memo||draft.url)sessionStorage.setItem(draftKey(category),JSON.stringify(draft));
    else sessionStorage.removeItem(draftKey(category));
  }catch{/* storage is optional; server persistence remains authoritative */}
};
const clearDraft=category=>{try{sessionStorage.removeItem(draftKey(category));}catch{/* optional */}};
const restoreDraft=category=>{
  nameInput.value='';memoInput.value='';urlInput.value='';
  try{
    const raw=sessionStorage.getItem(draftKey(category));if(!raw)return false;
    const draft=JSON.parse(raw);nameInput.value=String(draft?.name||'');memoInput.value=String(draft?.memo||'');urlInput.value=String(draft?.url||'');return Boolean(nameInput.value||memoInput.value||urlInput.value);
  }catch{return false;}
};
const resizeName=()=>{nameInput.style.height='auto';nameInput.style.height=`${Math.min(96,Math.max(48,nameInput.scrollHeight))}px`;};
for(const field of [nameInput,memoInput,urlInput])field.addEventListener('input',()=>{writeDraft();if(field===nameInput)resizeName();});

const updateToggle=group=>{
  const toggle=group.querySelector(':scope > .shopping-category-title > .shopping-category-toggle');
  if(!(toggle instanceof HTMLButtonElement))return;
  const collapsed=group.classList.contains('category-collapsed');
  const label=collapsed?'展開':'閉じる';
  const symbol=collapsed?'›':'⌄';
  if(toggle.textContent!==symbol)toggle.textContent=symbol;
  toggle.setAttribute('aria-expanded',collapsed?'false':'true');
  toggle.setAttribute('aria-label',`${categoryOf(group)}を${collapsed?'展開':'閉じる'}（${rowsOf(group).length}件）`);
};

const keepFooterLast=group=>{
  const footer=group.querySelector(':scope > .shopping-category-footer');
  if(footer instanceof HTMLElement&&group.lastElementChild!==footer)group.append(footer);
};
const keepCompletedLast=group=>{
  const rows=rowsOf(group);
  const footer=group.querySelector(':scope > .shopping-category-footer');
  if(rows.length>=2){
    const pending=rows.filter(row=>!rowCompleted(row));
    const completed=rows.filter(row=>rowCompleted(row));
    const desired=[...pending,...completed];
    if(!rows.every((row,index)=>row===desired[index]))for(const row of desired)group.insertBefore(row,footer instanceof HTMLElement?footer:null);
  }
  keepFooterLast(group);
  updateToggle(group);
};

const resetAddButtons=except=>{
  for(const button of section.querySelectorAll('.shopping-category-add-item')){
    if(button===except)continue;
    if(button.textContent!=='＋ 買い物を追加')button.textContent='＋ 買い物を追加';
  }
};

const parkComposer=()=>{
  writeDraft();
  composer.hidden=true;
  parking.append(composer);
  activeGroup=null;
  resetAddButtons(null);
};

const addPersistedRow=(id,itemName,category,productUrl)=>{
  const group=groups().find(candidate=>categoryOf(candidate)===category)||activeGroup;
  if(!(group instanceof HTMLElement))return;
  const row=document.createElement('div');row.className='row linked-shopping-row reminders-new-row';
  row.innerHTML=`<div class="checklist-row-line"><label class="shopping-check-row"><input class="check toggle" type="checkbox" data-type="shopping" data-id="${id}"><span></span></label><a class="checklist-row-action" href="/app/shopping_edit.php?id=${id}" aria-label="編集">編集</a></div><div class="meta"></div>`;
  const title=row.querySelector('.shopping-check-row>span');if(title)title.textContent=itemName;
  const meta=row.querySelector('.meta');
  if(meta instanceof HTMLElement&&productUrl){const link=document.createElement('a');link.href=productUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='商品ページ';meta.append(link);}
  const footer=group.querySelector(':scope > .shopping-category-footer');
  group.insertBefore(row,footer instanceof HTMLElement?footer:null);
  const count=page.querySelector('.reminders-smart-card[data-tone="orange"] .reminders-smart-count');if(count)count.textContent=String(section.querySelectorAll('input.toggle[data-type="shopping"]').length);
  keepCompletedLast(group);
};

const validProductUrl=value=>{if(!value)return true;try{const parsed=new URL(value);return parsed.protocol==='http:'||parsed.protocol==='https:';}catch{return false;}};
const submitComposer=async()=>{
  if(!(activeGroup instanceof HTMLElement)||saving)return false;
  const itemName=nameInput.value.trim();if(!itemName){nameInput.focus();return false;}
  const category=categoryOf(activeGroup),memo=memoInput.value.trim(),productUrl=urlInput.value.trim();
  if(!validProductUrl(productUrl)){status.dataset.error='1';status.textContent='URLは http:// または https:// で入力してください。';urlInput.focus();return false;}
  saving=true;saveButton.disabled=true;nameInput.disabled=true;memoInput.disabled=true;urlInput.disabled=true;status.dataset.error='0';status.textContent='保存中…';
  try{
    const response=await fetch('/api/shopping',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({csrf:String(payload.csrf||''),action:'add',name:itemName,quantity:'1',category:category===UNCLASSIFIED?'':category,memo,url:productUrl})});
    const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
    if(!response.ok||!data.ok)throw new Error(data.error||'保存に失敗しました。');
    const id=Number(data.id||0);if(!id)throw new Error('保存結果を確認できませんでした。');
    addPersistedRow(id,itemName,category,productUrl);
    clearDraft(category);nameInput.value='';memoInput.value='';urlInput.value='';resizeName();
    status.dataset.error='0';status.textContent='保存しました。';
    if(category===UNCLASSIFIED){location.reload();return true;}status.textContent='保存しました。続けて入力できます。';return true;
  }catch(error){status.dataset.error='1';status.textContent=error?.message||String(error)||'保存に失敗しました。';writeDraft();return false;}
  finally{saving=false;saveButton.disabled=false;nameInput.disabled=false;memoInput.disabled=false;urlInput.disabled=false;requestAnimationFrame(()=>nameInput.focus({preventScroll:true}));}
};
composer.addEventListener('submit',event=>{event.preventDefault();void submitComposer();});
nameInput.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void submitComposer();}},true);

const activateComposer=(group,button)=>{
  const footer=group.querySelector(':scope > .shopping-category-footer');
  if(!(footer instanceof HTMLElement))return;
  if(activeGroup===group&&!composer.hidden){parkComposer();return;}
  writeDraft();
  activeGroup=group;group.classList.remove('category-collapsed');resetAddButtons(button);composer.hidden=false;footer.append(composer);
  const category=categoryOf(group);const restored=restoreDraft(category);resizeName();
  button.textContent='入力を閉じる';nameInput.placeholder=`${category}に追加`;
  status.dataset.error='0';status.textContent=restored?'入力途中の内容を復元しました。':'';
  updateToggle(group);requestAnimationFrame(()=>nameInput.focus({preventScroll:true}));
};

const installFooter=group=>{
  if(group.classList.contains('shopping-category-draft'))return;
  let footer=group.querySelector(':scope > .shopping-category-footer');
  if(!(footer instanceof HTMLElement)){
    footer=document.createElement('div');footer.className='shopping-category-footer';
    const button=document.createElement('button');button.type='button';button.className='shopping-category-add-item';button.textContent='＋ 買い物を追加';button.addEventListener('click',()=>activateComposer(group,button));
    footer.append(button);group.append(footer);
  }
  keepFooterLast(group);
};

const decorateGroup=group=>{
  if(group.classList.contains('shopping-category-draft'))return;
  installFooter(group);
  if(group.dataset.categoryUxInit!=='1'){group.classList.add('category-collapsed');group.dataset.categoryUxInit='1';}
  keepCompletedLast(group);
};

const ensureUnclassifiedGroup=()=>{
  const existing=groups().filter(group=>categoryOf(group)===UNCLASSIFIED);if(existing.length){const keep=existing[0];for(const duplicate of existing.slice(1)){for(const row of rowsOf(duplicate))keep.append(row);duplicate.remove();}return;}
  const group=document.createElement('div');group.className='shopping-category-group';group.dataset.category=UNCLASSIFIED;
  const head=document.createElement('div');head.className='shopping-category-title';
  const name=document.createElement('strong');name.className='shopping-category-name';name.textContent=UNCLASSIFIED;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='shopping-category-toggle';toggle.addEventListener('click',()=>{group.classList.toggle('category-collapsed');updateToggle(group);});head.append(name,toggle);group.append(head);
  const anchor=groups().at(-1)||section.querySelector(':scope > .section-head');anchor?.insertAdjacentElement('afterend',group);
};

ensureUnclassifiedGroup();groups().forEach(decorateGroup);

let queued=false;
const syncGroups=()=>{
  if(queued)return;queued=true;
  queueMicrotask(()=>{queued=false;ensureUnclassifiedGroup();for(const group of groups())decorateGroup(group);});
};
new MutationObserver(syncGroups).observe(section,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-category']});

section.addEventListener('change',event=>{
  const checkbox=event.target;
  if(!(checkbox instanceof HTMLInputElement)||!checkbox.matches('input.toggle[data-type="shopping"]'))return;
  const started=performance.now();
  const settle=()=>{if(checkbox.disabled){if(performance.now()-started<12000)requestAnimationFrame(settle);return;}const group=checkbox.closest('.shopping-category-group');if(group instanceof HTMLElement)keepCompletedLast(group);};
  requestAnimationFrame(settle);
},true);
})();
