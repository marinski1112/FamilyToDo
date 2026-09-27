import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';

const window=new Window({url:'https://familytodo.test/app/messages.php'}),{document}=window;
document.body.innerHTML=`<script type="application/json" id="messagesChatPayload">{"csrf":"test"}</script><section id="chatMessages"><article class="chat-message" data-message-id="10"><div class="chat-stack"></div></article></section><div id="chatMenuBackdrop" class="chat-menu-backdrop"><div id="chatMenu"><button class="chat-menu-cancel">キャンセル</button></div></div>`;
const chat=document.getElementById('chatMessages'),row=chat.querySelector('.chat-message'),menu=document.getElementById('chatMenu'),backdrop=document.getElementById('chatMenuBackdrop');
let selected='',count=0;
window.fetch=async(url,options={})=>{
  if(options.method==='POST'){const body=JSON.parse(options.body);selected=body.emoji;assert.equal(body.messageId,10);count=1;return {ok:true};}
  assert.match(String(url),/\/api\/message-reactions\?ids=10/);
  return {ok:true,json:async()=>({ok:true,emojis:['👍','❤️'],reactions:count?[{messageId:10,emoji:'❤️',count:1,mine:true}]:[]})};
};
menu.querySelector('.chat-menu-cancel').addEventListener('click',()=>{backdrop.classList.remove('open');menu.replaceChildren();});
window.eval(readFileSync('public/assets/messages-reactions.js','utf8'));
await new Promise(resolve=>setTimeout(resolve,180));
assert.equal(row.querySelector('.chat-reactions'),null,'no permanent plus button on an unreached message');
backdrop.classList.add('open');backdrop.dispatchEvent(new window.CustomEvent('message-chat-menu-open',{detail:{row}}));
const entry=[...menu.querySelectorAll('button')].find(button=>button.textContent==='リアクション');
assert.ok(entry,'long-press menu contains the reaction action');
entry.click();await new Promise(resolve=>setTimeout(resolve,10));
const choices=menu.querySelectorAll('.chat-menu-reaction-picker button');
assert.deepEqual([...choices].map(button=>button.textContent),['👍','❤️']);
choices[1].click();await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(selected,'❤️');assert.equal(backdrop.classList.contains('open'),false);
assert.equal(row.querySelector('.chat-reaction-chip')?.textContent,'❤️ 1');
assert.equal(row.querySelector('.chat-reaction-add'),null);
await window.happyDOM.cancelAsync();
console.log('Message reactions menu: long press action, picker, POST and chips without permanent plus OK');
