(()=>{
'use strict';
if(location.pathname!=='/app/messages.php')return;
const form=document.getElementById('chatComposer'),text=form?.querySelector('textarea[name="text"]'),toolImage=document.getElementById('chatToolImage'),mainImage=document.getElementById('chatImage'),tools=document.getElementById('chatTools');
if(!form||!text)return;
const sync=()=>form.classList.toggle('has-text',Boolean(text.value.trim()));
text.addEventListener('input',sync);sync();
toolImage?.addEventListener('click',()=>tools?.classList.remove('open'));
mainImage?.addEventListener('click',()=>tools?.classList.remove('open'));
})();