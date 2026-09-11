(() => {
'use strict';
try{
  const form=document.getElementById('taskForm');if(!form)return;
  const payload=JSON.parse(document.getElementById('taskNewPayload')?.textContent||'{}');
  const allowedTypes=['task','event','shopping','item'];
  const initialType=allowedTypes.includes(String(payload.initialType||''))?String(payload.initialType):'task';
  const rough=document.createElement('section');
  rough.className='sub-card task-rough-input';
  rough.innerHTML=`<button type="button" class="section-button" id="roughInputToggle" aria-expanded="true" aria-controls="roughInputPanel">✨ AIざっくり入力</button><div id="roughInputPanel"><p class="rough-intro">まとめて入力して、確認して保存。</p><fieldset class="rough-primary-types"><legend>何を追加しますか？</legend><label class="checkrow inline-check"><input type="radio" name="rough_primary_type" value="task"> タスク</label><label class="checkrow inline-check"><input type="radio" name="rough_primary_type" value="event"> イベント</label><label class="checkrow inline-check"><input type="radio" name="rough_primary_type" value="shopping"> 買い物</label><label class="checkrow inline-check"><input type="radio" name="rough_primary_type" value="item"> 持ち物</label></fieldset><div class="rough-input-block"><label id="roughMainLabel" for="roughMainInput">タスクの内容</label><textarea id="roughMainInput" maxlength="4000" rows="4" placeholder="例：旅行の準備をする。土曜の朝までに"></textarea></div><details id="roughChildOptions"><summary>関連する買い物・持ち物なども追加</summary><label class="checkrow inline-check"><input type="checkbox" id="roughAllowChildTask"> 子タスク</label><label class="checkrow inline-check"><input type="checkbox" id="roughAllowShopping"> 買い物</label><label class="checkrow inline-check"><input type="checkbox" id="roughAllowItem"> 持ち物</label><div id="roughChildTaskWrap" class="rough-input-block" hidden><label for="roughChildTaskInput">子タスク</label><textarea id="roughChildTaskInput" maxlength="4000" rows="3" placeholder="例：ホテル確認&#10;猫を預ける&#10;荷造り"></textarea></div><div id="roughShoppingWrap" class="rough-input-block" hidden><label for="roughShoppingInput">買い物</label><textarea id="roughShoppingInput" maxlength="4000" rows="3" placeholder="例：歯ブラシ&#10;猫のおやつ&#10;電池"></textarea></div><div id="roughItemWrap" class="rough-input-block" hidden><label for="roughItemInput">持ち物</label><textarea id="roughItemInput" maxlength="4000" rows="3" placeholder="例：財布&#10;充電器&#10;保険証"></textarea></div></details><div class="rough-input-actions"><button type="button" class="btn" id="roughPreviewButton">下書きを作る</button><details class="rough-input-help"><summary>入力のヒント</summary><p class="small">登録先ごとに入力欄を分けています。「買い物:」などの接頭辞は不要です。入力欄そのものが登録先を決めます。</p><p class="small">全入力欄を合計して最大4,000文字・20行。このプレビューからはまだ登録されません。</p></details></div><div id="roughPreview" class="rough-preview" hidden></div></div>`;
  form.prepend(rough);
  const panel=rough.querySelector('#roughInputPanel'),toggle=rough.querySelector('#roughInputToggle'),childOptions=rough.querySelector('#roughChildOptions'),preview=rough.querySelector('#roughPreview'),mainInput=rough.querySelector('#roughMainInput');
  const initial=rough.querySelector(`[name=rough_primary_type][value="${initialType}"]`);if(initial)initial.checked=true;
  const primary=()=>String(rough.querySelector('[name=rough_primary_type]:checked')?.value||'task');
  const label=value=>({task:'タスク',event:'イベント',shopping:'買い物',item:'持ち物'}[value]||value);
  const sync=()=>{
    const mode=primary(),allowsChildren=mode==='task'||mode==='event';
    childOptions.hidden=!allowsChildren;
    rough.querySelector('#roughMainLabel').textContent=`${label(mode)}の内容`;
    if(!allowsChildren)childOptions.querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=false;});
    rough.querySelector('#roughChildTaskWrap').hidden=!allowsChildren||!rough.querySelector('#roughAllowChildTask').checked;
    rough.querySelector('#roughShoppingWrap').hidden=!allowsChildren||!rough.querySelector('#roughAllowShopping').checked;
    rough.querySelector('#roughItemWrap').hidden=!allowsChildren||!rough.querySelector('#roughAllowItem').checked;
    if(preview)preview.hidden=true;
  };
  toggle.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',open?'true':'false');if(open)mainInput?.focus();});
  rough.querySelectorAll('[name=rough_primary_type],#roughChildOptions input[type=checkbox]').forEach(input=>input.addEventListener('change',sync));
  sync();
  document.documentElement.dataset.taskRoughInputUi='ready';
}catch{document.documentElement.dataset.taskRoughInputUi='error';}
})();