(() => {
'use strict';
const root=document.documentElement;
try {
  const payloadNode=document.getElementById('shoppingNewPayload');
  const list=document.getElementById('shoppingProducts');
  const add=document.getElementById('addProduct');
  const form=document.getElementById('shopBatchForm');
  if(!list||!add||!form) throw new Error('買い物フォームの初期化対象が見つかりません。');
  let payload={};
  try{payload=JSON.parse(payloadNode?.textContent||'{}');}catch{payload={};}
  root.dataset.shoppingNewJs='ready';
  let sequence=list.querySelectorAll('[data-product-row]').length;
  const rowHtml=()=>'<input type="text" name="product_name[]" maxlength="255" placeholder="商品名" required><input type="text" name="product_quantity[]" value="1" inputmode="text" placeholder="数量" aria-label="数量"><button type="button" class="product-url-toggle" aria-expanded="false" aria-label="商品URLを入力" title="商品URL">🔗</button><button type="button" class="remove-product" aria-label="商品欄を削除">×</button><div class="product-url-popover" hidden><div class="product-url-popover-head"><strong>商品URL</strong><button type="button" class="product-url-close" aria-label="URL入力を閉じる">×</button></div><input type="url" name="product_url[]" placeholder="https://..." aria-label="商品URL"><p class="small">商品ページのURLがある場合だけ入力してください。</p></div>';
  function closeUrl(row){const pop=row?.querySelector('.product-url-popover');const toggle=row?.querySelector('.product-url-toggle');if(pop)pop.hidden=true;if(toggle)toggle.setAttribute('aria-expanded','false');}
  function closeAll(except=null){list.querySelectorAll('[data-product-row]').forEach(row=>{if(row!==except)closeUrl(row);});}
  add.onclick=()=>{
    sequence++;
    const row=document.createElement('div');row.className='product-row batch-product';row.dataset.productRow='';row.dataset.rowNumber=String(sequence);row.innerHTML=rowHtml();list.appendChild(row);
    // Intentionally no focus and no scroll. Users may add the desired number of rows first.
  };
  list.onclick=e=>{
    const target=e.target instanceof Element?e.target:null;if(!target)return;
    const toggle=target.closest('.product-url-toggle');
    if(toggle){const row=toggle.closest('[data-product-row]');const pop=row?.querySelector('.product-url-popover');if(!row||!pop)return;const open=pop.hidden;closeAll(row);pop.hidden=!open;toggle.setAttribute('aria-expanded',open?'true':'false');return;}
    const close=target.closest('.product-url-close');if(close){closeUrl(close.closest('[data-product-row]'));return;}
    const remove=target.closest('.remove-product');if(remove){if(list.querySelectorAll('[data-product-row]').length>1)remove.closest('[data-product-row]')?.remove();return;}
  };
  document.addEventListener('click',e=>{const target=e.target instanceof Element?e.target:null;if(!target||target.closest('#shoppingProducts'))return;closeAll();});
  form.onsubmit=async e=>{
    e.preventDefault();
    const names=[...form.querySelectorAll('[name="product_name[]"]')].map(x=>String(x.value||'').trim());
    const quantities=[...form.querySelectorAll('[name="product_quantity[]"]')].map(x=>String(x.value||'').trim()||'1');
    const urls=[...form.querySelectorAll('[name="product_url[]"]')].map(x=>String(x.value||'').trim());
    if(!names.length||names.some(x=>!x)){alert('商品名を入力してください。');return;}
    const fd=new FormData(form);
    const body={action:'add_batch',csrf:String(payload.csrf||''),products:names.map((name,j)=>({name,quantity:quantities[j]||'1',url:urls[j]||''})),category:String(fd.get('category')||'').trim(),due_date:String(fd.get('due_date')||''),task_id:Number(fd.get('task_id')||0),assignees:[...form.querySelectorAll('[name="assignees"]:checked')].map(x=>Number(x.value)),memo:String(fd.get('memo')||'').trim()};
    const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
    try{const r=await fetch('/api/shopping',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'追加に失敗しました。');location.href='/app/shopping.php';}
    catch(err){alert(err instanceof Error?err.message:'追加に失敗しました。');}
    finally{if(button)button.disabled=false;}
  };
} catch(error) {
  root.dataset.shoppingNewJs='error';
  console.error('[shopping-new] initialization failed',error);
}
})();
