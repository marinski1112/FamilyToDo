export function mountGlobalStampDeletion(host, options) {
  const section=document.createElement('section');
  const title=document.createElement('h3'); title.textContent='共有スタンプの完全削除';
  const explanation=document.createElement('p');
  explanation.textContent='登録元に関係なく、両アプリと共有R2の元画像・全フレームを削除します。履歴は画像なしで残ります。元に戻せません。';
  const status=document.createElement('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const list=document.createElement('div');
  const more=document.createElement('button'); more.type='button'; more.textContent='一覧を読み込む';
  section.append(title,explanation,status,list,more); host.append(section);
  let after=null,busy=false,disposed=false;
  const current=()=>!disposed&&section.isConnected&&options.isCurrent();
  function lock(value) { busy=value; for(const button of section.querySelectorAll('button')) button.disabled=value; }
  async function remove(stamp,button) {
    if(busy||!current())return;
    if(!globalThis.confirm('「'+stamp.name+'」を両アプリとR2から完全削除します。過去の表示も画像なしになります。続けますか？'))return;
    lock(true); status.textContent='両アプリとR2から削除中…';
    try {
      let result;
      for(let step=0;step<4;step++) {
        if(!current())return;
        result=await options.remove(stamp.sharedId);
        if(!current())return;
        if(result.deleted===true)break;
      }
      if(result?.deleted===true) {
        button.textContent='削除完了'; button.dataset.completed='true';
        status.textContent='両アプリとR2の削除を完了しました。';
        options.onDeleted?.();
      } else {
        button.textContent='完全削除を再試行';
        status.textContent='削除は未完了です。処理中または通信待ちのため、再試行してください。';
      }
    } catch {
      if(current()) {button.textContent='完全削除を再試行';status.textContent='完了を確認できませんでした。同じスタンプの削除を再試行できます。';}
    } finally {
      if(current()) {lock(false);for(const b of section.querySelectorAll('[data-completed]'))b.disabled=true;}
    }
  }
  more.addEventListener('click',async()=>{
    if(busy||!current())return;
    lock(true);status.textContent='共有スタンプ一覧を読み込み中…';
    try {
      const page=await options.list(after);
      if(!current())return;
      for(const stamp of page.stamps??[]) {
        const row=document.createElement('div'),name=document.createElement('span'),button=document.createElement('button');
        name.textContent=stamp.name+(stamp.enabled===0?'（無効）':'');
        button.type='button';button.style.minHeight='44px';
        button.textContent=stamp.state==='completed'?'削除完了':stamp.state==='pending'?'完全削除を再試行':'完全削除';
        button.setAttribute('aria-label',stamp.name+'：'+button.textContent);
        if(stamp.state==='completed')button.dataset.completed='true';
        button.addEventListener('click',()=>void remove(stamp,button));row.append(name,button);list.append(row);
      }
      after=page.next??null;more.hidden=!after;more.textContent='さらに読み込む';status.textContent='無効化・非表示の共有スタンプも削除できます。';
    } catch {if(current())status.textContent='一覧を取得できませんでした。共有Workerの配置を確認し、再試行してください。';}
    finally {if(current()){lock(false);for(const b of section.querySelectorAll('[data-completed]'))b.disabled=true;}}
  });
  return ()=>{disposed=true;section.remove();};
}

