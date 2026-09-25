(()=>{
  'use strict';
  const key='familytodo.theme';
  const control=document.getElementById('appearanceTheme');
  if(!control)return;
  const status=document.getElementById('appearanceThemeStatus');
  control.value=document.documentElement.dataset.theme==='dark'?'DARK':'LIGHT';
  control.addEventListener('change',()=>{
    const dark=control.value==='DARK';
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',dark?'dark':'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#101827':'#4f46e5');
    try{localStorage.setItem(key,dark?'DARK':'LIGHT');status.textContent='表示モードを保存しました。';}
    catch{status.textContent='この画面には適用しました。端末の保存設定を確認してください。';}
  });
})();
