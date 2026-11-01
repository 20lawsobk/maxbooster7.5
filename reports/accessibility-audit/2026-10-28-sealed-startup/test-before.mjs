// Real Chromium keyboard/AX regression for the shared application navigation.
// Authentication and unrelated widgets are fixtures; layout, navigation,
// buttons, icons and the production stylesheet execute unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { trackBrowserProcesses } from './helpers-browser-processes.mjs';

test('Shared navigation exposes named controls and keeps closed mobile navigation out of keyboard focus', { timeout: 45000 }, async t => {
  const root = process.cwd();
  const chromium = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
  assert.ok(chromium, 'Actual Chromium is required; missing runtime is not a skip');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-a11y-'));
  const assets = path.join(root, 'dist/public/assets');
  const cssFiles = fs.readdirSync(assets).filter(name => name.endsWith('.css'));
  assert.ok(cssFiles.length, 'Run npm run build first to provide the actual production styles');
  const stylesheet = cssFiles.map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
  const modules = {
    '@/hooks/useAuth': `const user={id:'layout-fixture',role:'user',username:'Keyboard fixture',email:'fixture@example.invalid',subscriptionTier:'monthly'};export const useAuth=()=>({user,logout:async()=>{window.fixtureLogoutCalls++}});`,
    '@/components/notifications/NotificationCenter': 'export const NotificationCenter=()=>null;',
    '@/components/offline/PendingChangesIndicator': 'export const PendingChangesIndicator=()=>null;',
    '@/components/LanguageSwitcher': `export const LanguageSwitcher=()=>null;`,
    '@/components/ui/theme-toggle': `export const ThemeToggle=()=>null;`,
    '@/lib/logger': 'export const logger={warn(){}};',
    'react-i18next': 'export const useTranslation=()=>({t:s=>s});',
    '@/hooks/useFluidLayout': `import {useRef} from 'react';export function useFluidLayout(){return {containerRef:useRef(null),layoutMode:'mobile',isMobile:true,isTablet:false,isDesktop:false,isWide:false,isSmallHeight:false,containerWidth:390,containerHeight:844}}export const getFluidPadding=()=>'';export const getFluidGap=()=>'';`,
  };
  const bundled = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AppLayout} from './client/src/components/layout/AppLayout.tsx';window.fixtureLogoutCalls=0;createRoot(document.getElementById('app')).render(<AppLayout title="Navigation fixture"><button id="content-action">Page action</button></AppLayout>);`, resolveDir: root, sourcefile: 'layout-a11y-fixture.tsx', loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', alias: {'@': path.join(root, 'client/src')},
    define: {'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'false'},
    plugins: [{name: 'owned-layout-boundaries', setup(api) {
      api.onResolve({filter: /^(?:@\/|react-i18next$)/}, args => Object.hasOwn(modules, args.path) ? {path: args.path, namespace: 'fixture'} : undefined);
      api.onResolve({filter: /^\.\/Breadcrumb$/}, args => args.importer.endsWith('/layout/AppLayout.tsx') ? {path: 'breadcrumb', namespace: 'fixture'} : undefined);
      api.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: modules[args.path] ?? 'export const BreadcrumbTrail=()=>null;', loader:'jsx', resolveDir:root}));
    }}],
  });
  const server = http.createServer((req,res) => {
    if(req.url === '/fixture.js') {res.setHeader('Content-Type','text/javascript');res.end(bundled.outputFiles[0].text);}
    else if(req.url === '/fixture.css') {res.setHeader('Content-Type','text/css');res.end(stylesheet);}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Owned navigation fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><button id="before">Before layout</button><div id="app"></div><script src="/fixture.js"></script></body></html>');}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = server.address().port;
  const childEnv = {PATH:process.env.PATH,HOME:temp,TMPDIR:temp};
  for (const key of ['LD_LIBRARY_PATH','FONTCONFIG_PATH','XDG_DATA_DIRS']) if(process.env[key]) childEnv[key]=process.env[key];
  const browser = spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${temp}`,'about:blank'],{env:childEnv,stdio:['ignore','ignore','pipe']});
  const stopBrowser = trackBrowserProcesses(browser);
  let socket;
  const errors=[];
  try {
    const endpoint=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('Chromium startup timeout')),10000);
      browser.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
      browser.once('error',error=>{clearTimeout(timer);reject(error);});
    });
    const targets=await(await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
    socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    let sequence=0;const pending=new Map();
    socket.on('message',raw=>{
      const event=JSON.parse(raw);
      if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.exception?.description??event.params.exceptionDetails.text);
      const request=pending.get(event.id);if(request){pending.delete(event.id);clearTimeout(request.timer);event.error?request.reject(new Error(event.error.message)):request.resolve(event.result);}
    });
    const command=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},5000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression=>{
      const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      assert.equal(result.exceptionDetails,undefined,result.exceptionDetails?.text);return result.result?.value;
    };
    const settle=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    const key=async(value,code=value,modifiers=0)=>{
      const virtualKeyCode = {Enter:13,Tab:9,Escape:27}[value];
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:value,code,modifiers,windowsVirtualKeyCode:virtualKeyCode,...(value==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:value,code,modifiers,windowsVirtualKeyCode:virtualKeyCode});await settle();
    };
    const axName=async selector=>{
      const doc=await command('DOM.getDocument');const found=await command('DOM.querySelector',{nodeId:doc.root.nodeId,selector});assert.ok(found.nodeId,selector);
      const ax=await command('Accessibility.getPartialAXTree',{nodeId:found.nodeId,fetchRelatives:false});return ax.nodes.find(node=>!node.ignored)?.name?.value??'';
    };
    await command('Runtime.enable');await command('Page.enable');await command('Accessibility.enable');
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await command('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    for(let n=0;n<100&&!await evaluate('Boolean(document.querySelector("[data-testid=mobile-menu-button]"))');n++)await new Promise(resolve=>setTimeout(resolve,50));
    await settle();
    for(const [selector,expected] of [['[data-testid=mobile-menu-button]','Open navigation menu'],['[data-testid=settings-button]','Settings'],['[data-testid=sign-out-button]','Sign Out']]) {
      await t.test(`390px actual accessibility name: ${expected}`,async()=>assert.equal(await axName(selector),expected));
    }
    await t.test('Settings is one link without nested button or link descendants',async()=>{
      assert.deepEqual(await evaluate(`(()=>{const el=document.querySelector('[data-testid=settings-button]');return {tag:el.tagName,href:el.getAttribute('href'),nested:el.querySelectorAll('button,a').length}})()`),{tag:'A',href:'/settings',nested:0});
    });
    await t.test('Closed mobile drawer cannot receive sequential keyboard focus',async()=>{
      await evaluate("document.getElementById('before').focus()");await key('Tab');
      assert.equal(await evaluate("document.activeElement?.getAttribute('data-testid')"),'mobile-menu-button');
      assert.equal(await evaluate("Boolean(document.activeElement?.closest('aside'))"),false);
    });
    await t.test('Menu control references existing drawer and exposes closed state',async()=>{
      assert.deepEqual(await evaluate(`(()=>{const b=document.querySelector('[data-testid=mobile-menu-button]');return{expanded:b.getAttribute('aria-expanded'),target:document.getElementById(b.getAttribute('aria-controls'))?.tagName??null}})()`),{expanded:'false',target:'ASIDE'});
    });
    await evaluate("document.querySelector('[data-testid=mobile-menu-button]').focus()");await key('Enter');
    await t.test('Opening with Enter moves focus into named mobile drawer',async()=>{
      assert.equal(await evaluate("document.activeElement?.getAttribute('data-testid')"),'sidebar-close');
      assert.equal(await axName('[data-testid=sidebar-close]'),'Close navigation menu');
      assert.equal(await evaluate("document.querySelector('[data-testid=mobile-menu-button]').getAttribute('aria-expanded')"),'true');
      assert.equal(await evaluate("document.querySelector('aside').hasAttribute('inert')"),false);
    });
    await key('Escape');
    await t.test('Escape closes drawer and restores opener focus and body scrolling',async()=>{
      assert.equal(await evaluate("document.activeElement?.getAttribute('data-testid')"),'mobile-menu-button');
      assert.equal(await evaluate("document.querySelector('aside').getAttribute('aria-hidden')"),'true');
      assert.equal(await evaluate("document.body.style.overflow"),'');
    });
    await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await settle();
    await t.test('Desktop resize exposes real navigation and releases mobile inert state',async()=>{
      assert.equal(await evaluate("document.querySelector('aside').getAttribute('aria-hidden')"),'false');
      assert.equal(await evaluate("document.querySelector('aside').hasAttribute('inert')"),false);
      assert.equal(await axName('aside a[href="/dashboard"]'),'navigation.dashboard');
      await evaluate("document.querySelector('aside a[href=\"/dashboard\"]').focus()");
      assert.equal(await evaluate("document.activeElement?.getAttribute('href')"),'/dashboard');
    });
    assert.deepEqual(errors,[],'No React or runtime exceptions');
  } finally {
    socket?.terminate();await stopBrowser();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
