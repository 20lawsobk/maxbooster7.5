const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const path = require("node:path");
const eq = (field, value) => row => row[field] === value;
const and = (...checks) => row => checks.every(check => check(row));
const tables = Object.fromEntries(["listings", "listingStems", "orders", "storefronts", "userStorageFiles"].map(name =>
  [name, {name, id:"id", userId:"userId", listingId:"listingId", status:"status", fileUrl:"fileUrl", createdAt:"createdAt", fileKey:"fileKey", deletedAt:"deletedAt"}]));
const rows = {
  listings: [{id:"listing", userId:"seller"}],
  listingStems: [{id:"stem",listingId:"listing",userId:"seller",fileUrl:"/api/storage/file/users%2fseller%2fstem.wav"}],
  orders: [{id:"paid",listingId:"listing",userId:"buyer",status:"completed"},
    {id:"pending",listingId:"listing",userId:"pending",status:"pending"},
    {id:"refunded",listingId:"listing",userId:"refunded",status:"refunded"}],
  storefronts: [{id:"shop",userId:"seller"}],
  userStorageFiles: [{fileKey:"users/seller/stem.wav",userId:"seller",deletedAt:null}],
};
const db = {update:()=>({set:()=>({where:async()=>{}})}),select: () => ({from(table) {
  let result = [...rows[table.name]];
  const q = {
    where(predicate) {result=result.filter(predicate);return q},
    limit(n) {result=result.slice(0,n);return q},
    orderBy() {return q},
    then(resolve,reject) {return Promise.resolve(result).then(resolve,reject)},
  };return q;
}})};
const compile = code => ts.transpileModule(code,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
}}).outputText;
const exportsObject = {};
vm.runInNewContext(compile(fs.readFileSync("server/services/marketplaceStemAccess.ts","utf8")), {
  exports:exportsObject, require(name) {
    if(name==="drizzle-orm") return {eq,and};
    if(name==="../db") return {db};
    return tables;
  },
});
const access = exportsObject;
function handler(file, route, verb="get") {
  const text=fs.readFileSync(file,"utf8");
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  let call;
  function visit(n) {
    if(ts.isCallExpression(n) && [`router.${verb}`,`app.${verb}`].includes(n.expression.getText(ast)) &&
       n.arguments[0]?.text===route) call=n.getText(ast);
    ts.forEachChild(n,visit);
  }
  visit(ast); assert.ok(call, route);
  let handlers;
  vm.runInNewContext(compile(call), {
    router:{get(_path,...fns){handlers=fns},post(_path,...fns){handlers=fns}},
    app:{get(_path,...fns){handlers=fns}},
    require(name){
      if(name.includes("marketplaceStemAccess")) return access;
      if(name.includes("hybridStorageService")) return {hybridStorageService:{getMetadata:()=>null}};
      if(name.includes("storageService")) return {storageService:{downloadFile:async()=>Buffer.from("stem-bytes")}};
      if(name.includes("schema")) return tables;
      if(name==="drizzle-orm") return {eq,sql:()=>null};
      throw Error("Unexpected import: "+name);
    },
    normalizeStorageKey:raw=>Array.isArray(raw)?raw.join("/"):raw,
    requireAuth(req,res,next){if(!req.user)return res.status(401).json({error:"Unauthorized"});return next()},
    ...tables, ...access, db, eq, and, asc:x=>x, path,
    getPdimStorageKey:access.stemStorageKey, sql:()=>null,
    logger:{warn(){}},
    storefrontService:{async getMembershipTiers(){return [{name:"inactive",currentSubscribers:8,stripePriceId:"private"}]}},
    storageService:{
      fileExists(){throw Error("Unauthorized request reached storage")},
      async getDownloadUrl(key){return "/api/storage/file/"+encodeURIComponent(key)},
    },
  });
  return async (userId,params,body={}) => {
    const req={user:userId?{id:userId}:undefined,params,body,headers:{},isAuthenticated:()=>Boolean(userId)};
    const res={code:200,headers:{},status(n){this.code=n;return this},
      json(body){this.body=body;return this},send(body){this.body=body;return this},setHeader(k,v){this.headers[k]=v}};
    let index=0;
    const next=()=>handlers[index++](req,res,next);
    await next();return res;
  };
}
test("stem entitlement requires listing ownership or a completed purchase", async()=>{
  for(const id of [undefined,"stranger","pending","refunded"])
    assert.equal(await access.canReadListingStems("listing",id),false);
  for(const id of ["seller","buyer"])
    assert.equal(await access.canReadListingStems("listing",id),true);
  assert.equal(await access.canReadListingStems("missing","seller"),false);
});
test("generic storage route denies anonymous and unrelated authenticated stem readers",async()=>{
  const run=handler("server/routes.ts","/api/storage/file/*key");
  const params={key:["users","seller","stem.wav"]};
  assert.equal((await run(undefined,params)).code,401);
  assert.equal((await run("stranger",params)).code,403);
  assert.equal((await run("pending",params)).code,403);
});
test("generic storage route serves purchased stem bytes but not deleted uploads",async()=>{
  const run=handler("server/routes.ts","/api/storage/file/*key");
  for(const user of ["seller","buyer"]) {
    const response=await run(user,{key:["users","seller","stem.wav"]});
    assert.equal(response.code,200);
    assert.equal(response.body.toString(),"stem-bytes");
    assert.equal(response.headers["Cache-Control"],"private, no-store");
  }
  rows.userStorageFiles[0].deletedAt=new Date();
  try {assert.equal((await run("buyer",{key:["users","seller","stem.wav"]})).code,404)}
  finally {rows.userStorageFiles[0].deletedAt=null}
});
test("stem creation cannot turn another user's upload into a marketplace entitlement",async()=>{
  const run=handler("server/routes/marketplace.ts","/listings/:listingId/stems","post");
  rows.userStorageFiles[0].userId="other-user";
  try {
    const response=await run("seller",{listingId:"listing"},{
      stemName:"Stolen",fileUrl:"/api/storage/file/users%2Fseller%2Fstem.wav",
    });
    assert.equal(response.code,403);
  } finally {rows.userStorageFiles[0].userId="seller"}
});
test("actual stem detail endpoint retains seller and completed buyer access",async()=>{
  const run=handler("server/routes/marketplace.ts","/stems/:stemId");
  for(const [user,code] of [[undefined,401],["stranger",403],["pending",403],["refunded",403],["seller",200],["buyer",200]]) {
    assert.equal((await run(user,{stemId:"stem"})).code,code,user);
  }
});
test("actual download endpoint preserves completed buyer access and rejects unpaid or mismatched tracks",async()=>{
  const run=handler("server/routes/marketplace.ts","/stems/:stemId/download/:trackId");
  for(const [user,code] of [[undefined,401],["stranger",403],["pending",403],["refunded",403],["seller",200],["buyer",200]]) {
    const res=await run(user,{stemId:"stem",trackId:"stem"});
    assert.equal(res.code,code,user);
    if(code===200) assert.equal(res.body.downloadUrl,"/api/storage/file/users%2Fseller%2Fstem.wav");
  }
  assert.equal((await run("buyer",{stemId:"stem",trackId:"other"})).code,400);
});
test("access-sensitive endpoints bypass the real cache middleware before any cache read",async()=>{
  const file="server/middleware/apiCache.ts";
  const text=fs.readFileSync(file,"utf8");
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==="cacheMiddleware");
  assert.ok(declaration);
  const exports={};
  vm.runInNewContext(compile(declaration.getText(ast)), {
    exports, extractUserIdFromRequest:()=>"buyer",
    apiCache:{get(){throw Error("Protected response reached cache")}},
  });
  const middleware=exports.cacheMiddleware({authorize:async()=>true});
  for(const path of ["/api/marketplace/audio/key","/api/marketplace/cover/key",
    "/api/marketplace/stems/stem","/api/marketplace/listings/listing/stems",
    "/api/storage/file/key","/api/storage/public/key","/api/storefront/shop/membership-tiers"]) {
    let nextCalled=false;
    await middleware({method:"GET",path},{},()=>{nextCalled=true});
    assert.equal(nextCalled,true,path);
  }
});
test("stored URL encoding cannot bypass asset protection; unrelated previews remain public",async()=>{
  for(const id of [undefined,"stranger","pending","refunded"])
    assert.equal(await access.stemAssetAccess("users/seller/stem.wav",id),false);
  for(const id of ["seller","buyer"])
    assert.equal(await access.stemAssetAccess("users/seller/stem.wav",id),true);
  assert.equal(await access.stemAssetAccess("previews/clip.mp3"),null);
});
test("actual listing stems endpoint denies anonymous and unpaid callers",async()=>{
  const run=handler("server/routes/marketplace.ts","/listings/:listingId/stems");
  for(const [user,code] of [[undefined,401],["stranger",403],["pending",403],["refunded",403],["seller",200],["buyer",200]]) {
    const res=await run(user,{listingId:"listing"});assert.equal(res.code,code,user);
    if(code!==200) assert.equal(JSON.stringify(res.body).includes("fileUrl"),false);
    else assert.equal(res.body[0].id,"stem");
  }
});
test("actual public audio and cover aliases reject stem bytes before storage access",async()=>{
  for(const route of ["/audio/*path","/cover/*path"]) {
    const run=handler("server/routes/marketplace.ts",route);
    for(const [user,code] of [[undefined,401],["stranger",403],["pending",403]]) {
      assert.equal((await run(user,{path:["users","seller","stem.wav"]})).code,code);
    }
  }
});
test("public storage image alias also enforces stem entitlements",async()=>{
  const saved=rows.listingStems[0].fileUrl;
  rows.listingStems[0].fileUrl="/api/storage/file/storefronts%2Fsecret.wav";
  try {
    const run=handler("server/routes/storage.ts","/public/*key");
    assert.equal((await run(undefined,{key:["storefronts","secret.wav"]})).code,401);
    assert.equal((await run("stranger",{key:["storefronts","secret.wav"]})).code,403);
  } finally {rows.listingStems[0].fileUrl=saved}
});
test("shared stem keys require access to every referencing listing",async()=>{
  rows.listings.push({id:"other",userId:"other-seller"});
  rows.listingStems.push({id:"shared",listingId:"other",fileUrl:rows.listingStems[0].fileUrl});
  try {assert.equal(await access.stemAssetAccess("users/seller/stem.wav","buyer"),false)}
  finally {rows.listings.pop();rows.listingStems.pop()}
});
test("database failures cannot become public access",async()=>{
  const saved=db.select;db.select=()=>{throw Error("database unavailable")};
  try {
    await assert.rejects(access.stemAssetAccess("users/seller/stem.wav"),/database unavailable/);
    const run=handler("server/routes/marketplace.ts","/audio/*path");
    assert.equal((await run(undefined,{path:["users","seller","stem.wav"]})).code,500);
  } finally {db.select=saved}
});
test("owner tier endpoint rejects cross-tenant reads and missing storefronts",async()=>{
  const run=handler("server/routes/storefront.ts","/:storefrontId/membership-tiers");
  assert.equal((await run(undefined,{storefrontId:"shop"})).code,401);
  assert.equal((await run("stranger",{storefrontId:"shop"})).code,403);
  assert.equal((await run("seller",{storefrontId:"missing"})).code,404);
  const own=await run("seller",{storefrontId:"shop"});
  assert.equal(own.code,200);assert.equal(own.body[0].currentSubscribers,8);
});