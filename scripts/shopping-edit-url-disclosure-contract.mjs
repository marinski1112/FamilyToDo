import {readFileSync} from 'node:fs';

const browser=readFileSync(new URL('../public/assets/shopping-edit.js',import.meta.url),'utf8');

for(const [pattern,message] of [
  [/querySelector\('input\[name="url"\]'\)/,'Shopping edit must locate the retained URL field'],
  [/toggle\.type='button'/,'Shopping edit URL disclosure control must never submit the form'],
  [/shopping-edit-url-toggle/,'Shopping edit must expose a compact URL disclosure control'],
  [/toggle\.setAttribute\('aria-expanded','false'\)/,'Shopping edit URL disclosure must expose its collapsed state'],
  [/wrap\.hidden=true/,'Shopping edit URL field must be collapsed by default'],
  [/toggle\.setAttribute\('aria-expanded',open\?'true':'false'\)/,'Shopping edit URL disclosure must keep aria-expanded in sync'],
  [/if\(open\)urlInput\.focus\(\)/,'Opening Shopping edit URL disclosure must move focus to the URL field'],
  [/categoryRegisterToggle\.type='button'/,'Shopping edit category registration disclosure must never submit the form'],
  [/shopping-edit-category-register-toggle/,'Shopping edit must expose a compact category registration disclosure'],
  [/categoryRegisterToggle\.setAttribute\('aria-expanded','false'\)/,'Shopping edit category registration disclosure must start collapsed'],
  [/categoryRegisterControl\.hidden=true/,'Shopping edit reusable-category registration control must be collapsed by default'],
  [/categoryRegisterToggle\.setAttribute\('aria-controls',categoryRegisterControl\.id\)/,'Shopping edit category registration disclosure must identify its controlled element'],
  [/categoryRegisterToggle\.setAttribute\('aria-expanded',open\?'true':'false'\)/,'Shopping edit category registration disclosure must keep aria-expanded in sync'],
  [/if\(open\)categoryRegister\.focus\(\)/,'Opening Shopping edit category registration disclosure must move focus to the checkbox'],
  [/if\(!custom\)categoryRegister\.checked=false/,'Leaving custom category mode must clear reusable-category registration'],
  [/if\(!custom\)\{\s*if\(categoryRegisterControl\)categoryRegisterControl\.hidden=true;\s*if\(categoryRegisterToggle\)categoryRegisterToggle\.setAttribute\('aria-expanded','false'\);/,'Leaving custom category mode must collapse reusable-category registration'],
  [/const registerCategory=categorySelect\.value==='__custom__'&&categoryRegister\.checked/,'Shopping edit must preserve explicit opt-in reusable-category registration semantics'],
  [/fetch\('\/api\/shopping-categories'/,'Shopping edit must preserve the canonical category registration API'],
]){
  if(!pattern.test(browser))throw new Error(message);
}

console.log('shopping edit URL/category disclosure contract ok');
