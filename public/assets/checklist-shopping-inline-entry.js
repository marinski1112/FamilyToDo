(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const section=document.querySelector('.checklist-page .shopping-checklist-section');
if(!(section instanceof HTMLElement))return;

const style=document.createElement('style');
style.id='shoppingInlineTextboxStyle';
style.textContent=`
.shopping-category-title{min-height:50px!important;padding:4px 4px 4px 2px!important}
.shopping-category-name{font-size:18px!important}
.shopping-category-toggle{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:44px!important;min-width:44px!important;height:44px!important;padding:0!important;border:0!important;border-radius:22px!important;background:transparent!important;color:#8e8e93!important;font-size:0!important;font-weight:500!important}
.shopping-category-toggle::after{font-size:28px;line-height:1}
.shopping-category-toggle[aria-expanded="false"]::after{content:'›'}
.shopping-category-toggle[aria-expanded="true"]::after{content:'⌄'}
.cat-grip,.item-grip{display:none!important}
.shopping-category-footer{padding:0 4px 2px!important;border-top:0!important}
.shopping-category-add-item{display:flex!important;align-items:center!important;gap:10px!important;width:100%!important;min-height:48px!important;padding:0 4px!important;border:0!important;border-bottom:1px solid #f0f0f2!important;background:transparent!important;color:#8e8e93!important;text-align:left!important;font-size:0!important;font-weight:400!important}
.shopping-category-add-item::before{content:'';width:22px;height:22px;flex:0 0 22px;border:1.7px solid #c7c7cc;border-radius:5px;box-sizing:border-box;background:#fff}
.shopping-category-add-item::after{content:'新しい買い物';font-size:17px;line-height:1.35;color:#8e8e93}
.shopping-category-footer:has(.shopping-continuous-composer:not([hidden]))>.shopping-category-add-item{display:none!important}
.shopping-continuous-composer{margin:0!important;padding:0 4px 2px!important;border:0!important;border-bottom:1px solid #f0f0f2!important;border-radius:0!important;background:#fff!important}
.shopping-continuous-main{display:flex!important;align-items:center!important;gap:10px!important;min-height:48px!important}
.shopping-continuous-circle{width:22px!important;height:22px!important;flex:0 0 22px!important;margin-top:0!important;border:1.7px solid #c7c7cc!important;border-radius:5px!important}
.shopping-continuous-name{min-height:44px!important;max-height:84px!important;padding:10px 0 8px!important;font-size:17px!important;line-height:1.35!important}
.shopping-inline-detail-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 40px;width:40px;height:40px;border:0;border-radius:20px;background:transparent;color:#007aff;font:inherit;font-size:20px;font-weight:700;padding:0}
.shopping-continuous-composer[data-inline-details="closed"] .shopping-continuous-fields,
.shopping-continuous-composer[data-inline-details="closed"] .shopping-continuous-actions{display:none!important}
.shopping-continuous-fields{gap:6px!important;margin:2px 0 8px 32px!important}
.shopping-continuous-field{gap:0!important}
.shopping-continuous-field>span{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.shopping-continuous-field textarea,.shopping-continuous-field input{border:0!important;border-radius:9px!important;background:#f2f2f7!important;padding:8px 10px!important;font-size:15px!important}
.shopping-continuous-field textarea{min-height:42px!important;max-height:76px!important;resize:none!important}
.shopping-continuous-hint{display:none!important}
.shopping-continuous-actions{justify-content:flex-end!important;margin:0 0 4px 32px!important}
.shopping-continuous-save{min-width:54px!important;min-height:34px!important;border:0!important;background:transparent!important;color:#007aff!important;font-size:15px!important;padding:0 8px!important}
.shopping-continuous-status[data-error="0"]{display:none!important}
.shopping-continuous-status:empty{display:none!important}
.shopping-continuous-status{margin:0 0 6px 32px!important;color:#b42318!important}
@media(max-width:720px){.shopping-category-footer{padding-left:2px!important;padding-right:2px!important}.shopping-continuous-fields,.shopping-continuous-actions,.shopping-continuous-status{margin-left:32px!important}}
`;
document.head.append(style);

const composer=section.querySelector('.shopping-continuous-composer');
if(!(composer instanceof HTMLFormElement))return;
const main=composer.querySelector('.shopping-continuous-main');
const name=composer.querySelector('.shopping-continuous-name');
const memo=composer.querySelector('.shopping-continuous-memo');
const url=composer.querySelector('.shopping-continuous-url');
if(!(main instanceof HTMLElement)||!(name instanceof HTMLTextAreaElement)||!(memo instanceof HTMLTextAreaElement)||!(url instanceof HTMLInputElement))return;

name.placeholder='新しい買い物';
memo.placeholder='メモを追加…';
url.placeholder='URLを追加…';
composer.dataset.inlineDetails='closed';

const detail=document.createElement('button');
detail.type='button';
detail.className='shopping-inline-detail-toggle';
detail.textContent='ⓘ';
detail.setAttribute('aria-label','メモとURL');
detail.setAttribute('aria-expanded','false');
main.append(detail);

const setDetails=open=>{
  composer.dataset.inlineDetails=open?'open':'closed';
  detail.setAttribute('aria-expanded',open?'true':'false');
};
detail.addEventListener('click',()=>{
  const open=composer.dataset.inlineDetails!=='open';
  setDetails(open);
  if(open)requestAnimationFrame(()=>memo.focus({preventScroll:true}));
});

const syncComposer=()=>{
  name.placeholder='新しい買い物';
  memo.placeholder='メモを追加…';
  url.placeholder='URLを追加…';
  if(memo.value||url.value)setDetails(true);
};
section.addEventListener('click',event=>{
  if(event.target instanceof Element&&event.target.closest('.shopping-category-add-item'))requestAnimationFrame(syncComposer);
});
name.addEventListener('focus',syncComposer);

composer.addEventListener('submit',()=>{
  const started=performance.now();
  const settle=()=>{
    if(name.disabled||name.value){
      if(performance.now()-started<4000)requestAnimationFrame(settle);
      return;
    }
    if(!memo.value&&!url.value)setDetails(false);
  };
  requestAnimationFrame(settle);
},true);
})();