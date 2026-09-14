import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/assets/family-log-compact-ui.js','utf8');
const dockSource=source.slice(source.indexOf('const buildInputDock='),source.indexOf('const enhance='));
// Minimal DOM adapter: verifies identity/listener preservation and category state.
class Node {
  children=[]; attrs={}; listeners={}; className=''; hidden=false;
  classList={add:()=>{}};
  setAttribute(k,v){this.attrs[k]=v;}
  appendChild(node){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);this.children.push(node);node.parent=this;return node;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  focus(){this.focused=true;}
}
function setup({growth=true,chores=true,path='/app/family_log.php'}={}){
  const page=new Node(),g=new Node(),c=new Node(),button=new Node();
  let saves=0;button.addEventListener('click',()=>saves++);g.appendChild(button);
  if(growth)page.appendChild(g);if(chores)page.appendChild(c);
  page.querySelector=()=>page.children.find(n=>n.className==='family-log-input-dock');
  page.querySelectorAll=selector=>selector.includes('overview-quick')?(growth?[g]:[]):(chores?[c]:[]);
  const ctx=vm.createContext({location:{pathname:path},document:{querySelector:()=>page,createElement:()=>new Node()}});
  vm.runInContext("const DAILY_PATH='/app/family_log.php';"+dockSource+';globalThis.build=buildInputDock;',ctx);
  ctx.build();return {page,g,c,button,build:ctx.build,saves:()=>saves};
}
const f=setup(),dock=f.page.querySelector(),[swap,growth,chores]=dock.children;
assert.equal(growth.children[0],f.g,'original growth node is moved');
assert.equal(chores.children[0],f.c,'original chores node is moved');
assert.equal(f.saves(),0,'building UI performs no mutation');
assert.equal(growth.hidden,false);assert.equal(chores.hidden,true);
swap.listeners.click();
assert.equal(growth.hidden,true);assert.equal(chores.hidden,false);
assert.match(swap.attrs['aria-label'],/家事を表示中/);
swap.listeners.click();assert.equal(growth.hidden,false);
f.button.listeners.click();assert.equal(f.saves(),1,'one click retains one canonical listener');
f.build();assert.equal(f.page.children.length,1,'re-enhancement does not duplicate controls');
assert.equal(setup({growth:false}).page.querySelector().children[0].hidden,true);
assert.equal(setup({growth:false,chores:false}).page.querySelector(),undefined);
assert.equal(setup({path:'/app/settings_family_log.php'}).page.querySelector(),undefined);
assert.doesNotMatch(dockSource,/fetch\(|cloneNode|innerHTML|MutationObserver|disabled\s*=/,'dock must not own save, busy state, or observer loops');
const css=fs.readFileSync('public/assets/family-log-layout.css','utf8');
assert.match(css,/input-panel\[hidden\]\{display:none!important/);
assert.match(css,/bottom:var\(--nav-box-h/,'dock respects existing navigation height');
assert.match(css,/family-log-backdrop.open\) .family-log-input-dock\{visibility:hidden/,'editor overlays the dock');
console.log('Family Log input dock: node/listener identity, one click, swap category state, idempotent setup, empty/management fallback PASS');

assert.match(css,/flex-wrap:nowrap!important/,'legacy overview wrap must be overridden');
assert.match(css,/flex:0 0 64px!important;width:64px!important;min-width:64px!important/,'global 100% width cannot shrink the action row');
assert.match(css,/overflow-x:auto;overflow-y:hidden/,'only the horizontal axis may scroll');
