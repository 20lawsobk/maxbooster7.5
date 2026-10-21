// Real React DOM transitions in isolated Chromium. API/query fixtures provide
// pending/data states; this verifies component lifecycle, not payment delivery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import WebSocket from "ws";

test("Studio playback processes saved inserts, edits, bypass, ordering and removal in real Chromium", { timeout: 45000 }, async () => {
  const root = process.cwd();
  const chromium = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(chromium, "Chromium is required for the actual lifecycle regression");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "media-renderer-"));
  const bundle = await build({
    stdin: { contents: `import {AudioWorkletEngine} from './client/src/lib/daw/AudioWorkletEngine.ts';
      window.fixtureReady=true;
      window.renderPlugins=async(inserts,mutation,master)=>{
        const context=new OfflineAudioContext(1,48000,48000);const engine=new AudioWorkletEngine();
        engine.audioContext=context;engine.masterGain=context.createGain();engine.masterGain.connect(context.destination);
        engine.createTrack('one');const unavailable=engine.setTrackPlugins('one',inserts);
        if(mutation)engine.setTrackPlugins('one',mutation);
        if(master)engine.setTrackPlugins('master',master);
        const buffer=context.createBuffer(1,48000,48000);const samples=buffer.getChannelData(0);
        for(let i=0;i<samples.length;i++)samples[i]=.05*Math.sin(2*Math.PI*1000*i/48000);
        engine.scheduleClipPlayback({id:'clip',trackId:'one',buffer,startSample:0,durationSamples:48000,offsetSamples:0,gain:1,fadeInSamples:0,fadeOutSamples:0});
        const output=(await context.startRendering()).getChannelData(0);let sum=0;
        for(let i=12000;i<output.length;i++)sum+=output[i]*output[i];
        const rms=Math.sqrt(sum/(output.length-12000));
        engine.trackNodes.get('one').inserts.destroy();engine.masterInserts?.destroy();return {rms,unavailable};
      };`, resolveDir: root, sourcefile: 'studio-insert-regression.ts' },
    alias: {'@':path.join(root,'client/src'),'@plugins':path.join(root,'built-in plugins dsp')}, bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"development"','import.meta.env.DEV':'false'},
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<div id="app"></div><script src="/fixture.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${temp}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = "";
      const timer = setTimeout(() => reject(new Error("Chromium debugger startup timed out")), 10000);
      browser.stderr.on("data", chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      browser.once("error", error => { clearTimeout(timer); reject(error); });
    });
    const address = new URL(endpoint);
    const targets = await (await fetch(`http://${address.host}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let id = 0;
    const waiting = new Map();
    const errors = [];
    socket.on("message", raw => {
      const message = JSON.parse(raw);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      const pending = waiting.get(message.id);
      if (pending) { waiting.delete(message.id); clearTimeout(pending.timer); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { waiting.delete(key); reject(new Error(`CDP timed out: ${method}`)); }, 5000);
      waiting.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
      const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.text);
      return result.result?.value;
    };
    const contains = async text => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (await evaluate(`Boolean(document.body?.textContent.includes(${JSON.stringify(text)}))`)) return;
        assert.equal(errors.length, 0, errors.join("\n"));
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.fail(`Expected component state: ${text}; errors: ${errors.join("\n")}`);
    };
    await command("Runtime.enable"); await command("Page.enable");
    await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await contains('');
    for(let n=0;n<100&&!await evaluate('Boolean(window.fixtureReady)');n++)await new Promise(r=>setTimeout(r,25));
    const render=async(plugins,mutation)=>evaluate(`window.renderPlugins(${JSON.stringify(plugins)},${JSON.stringify(mutation)??'undefined'})`);
    const eq={id:'eq-one',name:'EQ',type:'eq',parameters:{mid:12,midFreq:1000},bypassed:false};
    const dry=await render([]);const wet=await render([eq]);
    const master=await evaluate(`window.renderPlugins([],undefined,${JSON.stringify([eq])})`);
    assert(master.rms>dry.rms*3.5,'Master inserts must process the mixed playback signal');
    const masterBypass=await evaluate(`window.renderPlugins([],undefined,${JSON.stringify([{...eq,bypassed:true}])})`);
    assert(Math.abs(masterBypass.rms-dry.rms)<1e-5,'Master bypass must preserve the mix');
    assert(wet.rms>dry.rms*3.5,'Saved EQ inserts must affect the real Studio playback signal');
    const legacy=await render([{...eq,type:undefined,pluginSlug:'mb-eq-parametric'}]);assert(Math.abs(legacy.rms-wet.rms)<1e-5,'Known saved plugin slugs must retain their processor');
    const bypass=await render([{...eq,bypassed:true}]);assert(Math.abs(bypass.rms-dry.rms)<1e-5);
    const removed=await render([eq],[]);assert(Math.abs(removed.rms-dry.rms)<1e-5,'Removing the last effect must reconnect the dry path');
    const edited=await render([eq],[{...eq,parameters:{mid:-12,midFreq:1000}}]);assert(edited.rms<dry.rms*.3,'Parameter edits must reach the live processor');
    const duplicate=await render([eq,{...eq,id:'eq-two'}]);assert(duplicate.rms>wet.rms*3.5,'Separate instances must each process audio');
    const unknown=await render([{...eq,type:'native-vst3'}]);assert.deepEqual(unknown.unavailable,['eq-one']);assert(Math.abs(unknown.rms-dry.rms)<1e-5);
    for(const [type,parameters] of Object.entries({
      reverb:{size:50,decay:2,mix:40},delay:{time:30,feedback:20,mix:30},
      distortion:{drive:50,tone:50,mix:80},chorus:{rate:1,depth:50,mix:50},
      flanger:{rate:.3,depth:60,mix:50},phaser:{rate:.5,depth:60,mix:50},
    })) {
      const insert={id:type,name:type,type,parameters};
      const processed=await render([insert]);assert(Number.isFinite(processed.rms)&&processed.rms>0,type+' must render audio');
      const bypassed=await render([{...insert,bypassed:true}]);assert(Math.abs(bypassed.rms-dry.rms)<1e-5,type+' bypass must restore the source');
    }
    const compressor={id:'comp',name:'Compressor',type:'compressor',parameters:{threshold:-45,ratio:12,attack:2,release:100}};
    const first=await render([eq,compressor]);const second=await render([compressor,eq]);
    assert(Math.abs(first.rms-second.rms)>.005,'Insert order must be audible');
    assert.deepEqual(errors, []);

  } finally {
    socket?.terminate();
    browser.kill("SIGTERM");
    await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else browser.once("exit", resolve); });
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
