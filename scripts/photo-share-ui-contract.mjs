import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/assets/mitenya-photo-share.js','utf8');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.style={};this.events={};this.value='';}
 setAttribute(k,v){this.attrs[k]=v;} append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
 addEventListener(k,f){(this.events[k]??=[]).push(f);} emit(k,event={}){for(const f of this.events[k]||[])f(event);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);} replaceWith(n){this.parent.append(n);this.remove();}
 focus(){this.focused=true;} showModal(){this.open=true;} close(){this.open=false;this.emit('close');}
 getBoundingClientRect(){return {left:0,top:0,right:400,bottom:400};}
}
function fixture(){const body=new Element('body');let resolve,calls=[];const payload={textContent:JSON.stringify({csrf:'test-session'})};
 const context={document:{body,createElement:tag=>new Element(tag),getElementById:id=>id==='messagesChatPayload'?payload:null,querySelectorAll:()=>[],addEventListener:()=>{},activeElement:null},window:{addEventListener:()=>{}},navigator:{},URL,Error,JSON,Number,Date,
 fetch:(url,init)=>{calls.push({url,init});return new Promise(r=>{resolve=r;});}};
 vm.runInNewContext(source,context);const opener=new Element('button');context.window.openMitenyaPhotoShare('message',42,opener);
 const dialog=body.children[0],caption=dialog.children[2].children[0],next=dialog.children[4];
 return {body,dialog,caption,next,opener,payload,calls,complete:()=>resolve({ok:true,json:async()=>({ok:true,url:'https://mitenya.marinski1112.workers.dev/#import-photo='+'a'.repeat(64)})})};}

test('explicit caption only and fixed selected source; link appears after confirmation',async()=>{const f=fixture();f.caption.value='共有する文章';const pending=f.next.onclick();assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(f.calls[0].init.body),{kind:'message',id:42,caption:'共有する文章'});assert.equal(f.calls[0].url,'/api/messages?photo_transfer=1');f.complete();await pending;assert.equal(f.dialog.children.at(-1).tag,'a');assert.equal(f.dialog.children.at(-1).rel,'noreferrer');});
test('closing while request pending discards late token and restores opener focus',async()=>{const f=fixture();const pending=f.next.onclick();f.dialog.close();f.complete();await pending;assert.equal(f.body.children.length,0);assert.equal(f.opener.focused,true);assert.equal(f.dialog.children.some(x=>x.tag==='a'),false);});
test('changed session discards response and preserves caption',async()=>{const f=fixture();f.caption.value='入力';const pending=f.next.onclick();f.payload.textContent=JSON.stringify({csrf:'other-session'});f.complete();await pending;assert.equal(f.dialog.children.some(x=>x.tag==='a'),false);assert.equal(f.caption.value,'入力');assert.equal(f.next.disabled,false);});
