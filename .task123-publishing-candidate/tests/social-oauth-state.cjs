const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const {spawn}=require("node:child_process");
const Redis=require("ioredis");
test("real Redis atomic OAuth state is session/user/provider bound, opaque and single-use",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"oauth-state-test-"));
  const socket=path.join(dir,"redis.sock");
  const proc=spawn("redis-server",["--port","0","--unixsocket",socket,"--save","","--appendonly","no"],{stdio:"ignore"});
  let redis;
  try {
    for(let i=0;i<100&&!fs.existsSync(socket);i++) await new Promise(r=>setTimeout(r,25));
    assert.ok(fs.existsSync(socket),"isolated Redis started");
    redis=new Redis({path:socket,lazyConnect:true,retryStrategy:()=>null});
    redis.on("error",()=>{}); // Expected connection failure is asserted below.
    await redis.connect();
    const exports={};
    const source=fs.readFileSync("server/services/socialOAuthState.ts","utf8");
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
    }}).outputText,{exports,require:n=>n==="node:crypto"?require(n):{getRedisClient:()=>redis}});
    const create=exports.createSocialOAuthState, consume=exports.consumeSocialOAuthState;
    const state=await create("alice","session-a","twitter","private-verifier");
    assert.match(state,/^[A-Za-z0-9_-]{43}$/);
    assert.ok(!state.includes("private-verifier"));
    assert.equal(await consume(state,"bob","session-b","twitter"),null);
    assert.equal(await consume(state,"alice","session-b","twitter"),null);
    assert.equal(await consume(state,undefined,undefined,"twitter"),null);
    assert.equal(await consume(state,"alice","session-a","linkedin"),null);
    const results=await Promise.all(Array.from({length:20},()=>consume(state,"alice","session-a","twitter")));
    assert.equal(results.filter(Boolean).length,1);
    assert.equal(results.find(Boolean).codeVerifier,"private-verifier");
    assert.equal(await consume(state,"alice","session-a","twitter"),null);
    const alias=await create("alice","session-a","meta");
    assert.equal((await consume(alias,"alice","session-a","facebook")).platform,"meta");
    const expired=await create("alice","session-a","threads");
    await redis.pexpire("social-oauth-state:"+expired,1);
    await new Promise(r=>setTimeout(r,10));
    assert.equal(await consume(expired,"alice","session-a","threads"),null);
    assert.equal(await consume("old~signed-state","alice","session-a","threads"),null);
    // Execute the real public callback and prove rejected states never reach
    // provider exchange or credential storage.
    const routeText=fs.readFileSync("server/routes/socialOAuth.ts","utf8");
    const ast=ts.createSourceFile("socialOAuth.ts",routeText,ts.ScriptTarget.Latest,true);
    let callbackCall;
    function visit(n) {
      if(ts.isCallExpression(n)&&n.expression.getText(ast)==="router.get"&&n.arguments[0]?.text==="/callback/:platform")
        callbackCall=n.getText(ast);
      ts.forEachChild(n,visit);
    }
    visit(ast);assert.ok(callbackCall);
    let callback;let providerCalls=0;
    vm.runInNewContext(ts.transpileModule(callbackCall,{compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
    }}).outputText,{
      router:{get(_path,fn){callback=fn}},consumeSocialOAuthState:consume,
      logger:{warn(){},error(){}},
      timedFetch(){providerCalls++;throw Error("Must not exchange transferred state")},
      db:{insert(){throw Error("Must not persist transferred state")}},
    });
    const transferred=await create("alice","session-a","threads");
    for(const [user,session] of [[undefined,undefined],["bob","session-b"],["alice","session-other"]]) {
      let location;
      await callback({params:{platform:"threads"},query:{state:transferred,code:"provider-code"},
        user:user?{id:user}:undefined,session:{userId:user},sessionID:session},
        {setHeader(){},redirect(url){location=url}});
      assert.equal(location,"/social-media?error=invalid_state");
    }
    assert.equal(providerCalls,0);
    assert.equal((await consume(transferred,"alice","session-a","threads")).userId,"alice");
    await redis.quit();
    await assert.rejects(create("alice","session-a","threads"));
  } finally {
    redis?.disconnect();proc.kill("SIGTERM");
    await new Promise(resolve=>proc.exitCode!==null?resolve():proc.once("exit",resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});