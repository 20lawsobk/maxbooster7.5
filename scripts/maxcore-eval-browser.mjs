// Loopback-only CDP bridge. Credentials enter the normal form, never logs/files.
import fs from 'node:fs/promises';
const base = 'http://127.0.0.1:9224';
const pages = await (await fetch(base + '/json/list')).json();
const page = pages.find(p => p.type === 'page');
if (!page) throw new Error('No dedicated evaluation browser page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
let loginStatus = null;
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Network.responseReceived' && message.params.response.url.endsWith('/api/auth/login')) {
    loginStatus = message.params.response.status;
  }
  if (message.id && pending.has(message.id)) {
    const {resolve, reject} = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error('CDP command failed')) : resolve(message.result);
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, {resolve, reject});
    ws.send(JSON.stringify({id:n, method, params}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
  if (result.exceptionDetails) throw new Error('Browser expression failed');
  return result.result.value;
}
await send('Network.enable');
if (process.argv[2] === 'login') {
  if (!process.env.E2E_USERNAME || !process.env.E2E_PASSWORD) throw new Error('Missing test credentials');
  await send('Page.navigate', {url:`https://${process.env.REPLIT_DEV_DOMAIN}/login`});
  let ready = false;
  for (let i=0;i<60;i++) {
    ready = await evaluate(`!!document.querySelector('[data-testid="input-username"]')`);
    if (ready) break;
    await new Promise(r=>setTimeout(r,1000));
  }
  if (!ready) throw new Error('Login form unavailable');
  for (const [field,key] of [['input-username','E2E_USERNAME'],['input-password','E2E_PASSWORD']]) {
    await evaluate(`document.querySelector('[data-testid="${field}"]').focus()`);
    await send('Input.insertText', {text:process.env[key]});
  }
  await evaluate(`document.querySelector('[data-testid="button-login-submit"]').click()`);
  for(let i=0;i<40 && loginStatus===null;i++) await new Promise(r=>setTimeout(r,1000));
  await new Promise(r=>setTimeout(r,1500));
  console.log(JSON.stringify({loginStatus,pathname:await evaluate('location.pathname')}));
} else if (process.argv[2] === 'goto') {
  await send('Page.navigate', {url:`https://${process.env.REPLIT_DEV_DOMAIN}${process.argv[3]}`});
  await new Promise(r=>setTimeout(r,3000));
  console.log(JSON.stringify({pathname:await evaluate('location.pathname')}));
} else if (process.argv[2] === 'click') {
  const selector=JSON.stringify(process.argv[3]);
  const box=await evaluate(`(()=>{const e=document.querySelector(${selector});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if(!box) throw new Error('Element not found');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...box,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...box,button:'left',clickCount:1});
  console.log('clicked');
} else if (process.argv[2] === 'type') {
  await evaluate(`document.querySelector(${JSON.stringify(process.argv[3])}).focus()`);
  await send('Input.insertText',{text:process.argv[4]});
  console.log('typed');
} else if (process.argv[2] === 'screenshot') {
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await fs.writeFile(process.argv[3],Buffer.from(shot.data,'base64'));
  console.log('saved');
} else if (process.argv[2] === 'eval-file') {
  // Use only public test actions, never dump authenticated user content.
  console.log(JSON.stringify(await evaluate(await fs.readFile(process.argv[3],'utf8'))));
}
ws.close();