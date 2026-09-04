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
]){
  if(!pattern.test(browser))throw new Error(message);
}

console.log('shopping edit URL disclosure contract ok');
