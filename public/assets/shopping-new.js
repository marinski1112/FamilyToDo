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
  const MAX_BATCH_PRODUCTS=64;
  const MAX_PRODUCT_NAME_UNITS=255;
  const MAX_PRODUCT_QUANTITY_UNITS=128;
  const MAX_CATEGORY_UNITS=255;
  const MAX_MEMO_UNITS=2000;
  const MAX_CSRF_UNITS=512;
  const csrf=String(payload.csrf||'');
  const safeEntityId=value=>{const id=Number(value);return Number.isSafeInteger(id)&&id>0?id:0};
  const safeProductUrl=value=>{const raw=String(value??'').trim();if(!raw)return '';if(raw.length>2048)return null;try{const parsed=new URL(raw);if(parsed.username||parsed.password)return null;return parsed.protocol==='http:'||parsed.protocol==='https:'?raw:null;}catch{return null;}};
  const safeDueDate=value=>{const raw=String(value??'').trim();if(!raw)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;const date=new Date(`${raw}T00:00:00Z`);return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==raw?null:raw;};
  const rowHtml=()=>'<input type="text" name="product_name[]" maxlength="255" placeholder="商品名" required><input type="text" name="product_quantity[]" value="1" maxlength="128" inputmode="text" placeholder="数量" aria-label="数量"><button type="button" class="product-url-toggle" aria-expanded="false" aria-label="商品URLを入力" title="商品URL">🔗</button><button type="button" class="remove-product" aria-label="商品欄を削除">×</button><div class="product-url-popover" hidden><div class="product-url-popover-head"><strong>商品URL</strong><button type="button" class="product-url-close" aria-label="URL入力を閉じる">×</button></div><input type="url" name="product_url[]" maxlength="2048" placeholder="https://..." aria-label="商品URL"><p class="small">商品ページのURLがある場合だけ入力してください。</p></div>';
  function closeUrl(row){const pop=row?.querySelector('.product-url-popover');const toggle=row?.querySelector('.product-url-toggle');if(pop)pop.hidden=true;if(toggle)toggle.setAttribute('aria-expanded','false');}
  function closeAll(except=null){list.querySelectorAll('[data-product-row]').forEach(row=>{if(row!==except)closeUrl(row);});}
  add.onclick=()=>{
    if(list.querySelectorAll('[data-product-row]').length>=MAX_BATCH_PRODUCTS){alert(`商品は一度に${MAX_BATCH_PRODUCTS}件まで追加できます。`);return;}
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
    if(!csrf||csrf.length>MAX_CSRF_UNITS){alert('追加に失敗しました。ページを再読み込みしてください。');return;}
    const rows=[...list.querySelectorAll('[data-product-row]')];
    if(!rows.length||rows.length>MAX_BATCH_PRODUCTS){alert(`商品は一度に1〜${MAX_BATCH_PRODUCTS}件まで追加できます。`);return;}
    const names=[...form.querySelectorAll('[name="product_name[]"]')].map(x=>String(x.value||'').trim());
    const quantities=[...form.querySelectorAll('[name="product_quantity[]"]')].map(x=>String(x.value||'').trim()||'1');
    const urls=[...form.querySelectorAll('[name="product_url[]"]')].map(x=>String(x.value||'').trim());
    if(!names.length||names.some(x=>!x)){alert('商品名を入力してください。');return;}
    if(names.length!==rows.length||quantities.length!==rows.length||urls.length!==rows.length){alert('商品入力の状態が不正です。ページを再読み込みしてください。');return;}
    if(names.some(name=>name.length>MAX_PRODUCT_NAME_UNITS)){alert(`商品名は${MAX_PRODUCT_NAME_UNITS}文字以内で入力してください。`);return;}
    if(quantities.some(quantity=>quantity.length>MAX_PRODUCT_QUANTITY_UNITS)){alert(`数量は${MAX_PRODUCT_QUANTITY_UNITS}文字以内で入力してください。`);return;}
    const safeUrls=urls.map(safeProductUrl);
    if(safeUrls.some(url=>url===null)){alert('商品URLは認証情報を含まない http または https のURLを入力してください。');return;}
    const fd=new FormData(form);
    const dueDate=safeDueDate(fd.get('due_date'));
    if(dueDate===null){alert('期限の日付が不正です。');return;}
    const category=String(fd.get('category')||'').trim();
    if(category.length>MAX_CATEGORY_UNITS){alert(`カテゴリーは${MAX_CATEGORY_UNITS}文字以内で入力してください。`);return;}
    const memo=String(fd.get('memo')||'').trim();
    if(memo.length>MAX_MEMO_UNITS){alert(`メモは${MAX_MEMO_UNITS}文字以内で入力してください。`);return;}
    const rawTaskId=String(fd.get('task_id')??'').trim();
    const taskId=rawTaskId===''||rawTaskId==='0'?0:safeEntityId(rawTaskId);
    if(rawTaskId!==''&&rawTaskId!=='0'&&!taskId){alert('タスクの指定が不正です。');return;}
    const assigneeValues=[...form.querySelectorAll('[name="assignees"]:checked')].map(x=>String(x.value??'').trim());
    const assignees=assigneeValues.map(safeEntityId);
    if(assignees.some(id=>!id)){alert('担当者の指定が不正です。');return;}
    const body={action:'add_batch',csrf,products:names.map((name,j)=>({name,quantity:quantities[j]||'1',url:safeUrls[j]||''})),category,due_date:dueDate,task_id:taskId,assignees,memo:memo};
    const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
    try{const r=await fetch('/api/shopping',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('追加に失敗しました。');location.href='/app/shopping.php';}
    catch(err){alert(err instanceof Error?err.message:'追加に失敗しました。');}
    finally{if(button)button.disabled=false;}
  };
} catch {
  root.dataset.shoppingNewJs='error';
  console.error('[shopping-new] initialization failed');
}
})();