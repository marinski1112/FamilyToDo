(()=>{
'use strict';
if(location.pathname!=='/app/tasks.php')return;
const page=document.querySelector('.checklist-page');
if(!(page instanceof HTMLElement))return;
const style=document.createElement('style');
style.textContent='.shopping-checklist-section .shopping-quick-category-row{display:none!important}.shopping-category-group.category-collapsed>.shopping-category-title>.shopping-category-toggle{transform:rotate(-90deg)}';
document.head.append(style);
const clearLegacyCategory=()=>{
  const input=page.querySelector('.shopping-checklist-section .shopping-quick-category');
  if(input instanceof HTMLInputElement)input.value='';
};
clearLegacyCategory();
new MutationObserver(clearLegacyCategory).observe(page,{childList:true,subtree:true});
})();
