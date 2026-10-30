import { test } from "node:test";
import assert from "node:assert/strict";
import { PocketDimensionChunkStore } from "../server/pocket-dimension/fabric/storage/PocketDimensionChunkStore.ts";
import { RedisStore } from "../external/pdim/artifacts/api-server/src/redis/store.ts";

test("canonical PDIM permanently fences deleted replica keys and refuses immutable replacement", async () => {
  const values=new Map(),store=new RedisStore("replica-fixture","owner-fixture");
  store.attachEmbeddedSnapshot(values);
  const owner={get:async key=>await store.exec("GET",[key]),
    eval:async(script,count,...args)=>await store.exec("EVAL",[script,String(count),...args])};
  try {
    const node=new PocketDimensionChunkStore("node-a",()=>owner);
    const other=new PocketDimensionChunkStore("node-b",()=>owner);
    const content="a".repeat(64),old=`${content}.1`,current=`${content}.2`;
    await node.putChunk(old,Buffer.from("old"));
    await node.putChunk(current,Buffer.from("current"));
    await node.putChunk(current,Buffer.from("current"));
    await assert.rejects(node.putChunk(current,Buffer.from("replacement")),/replacement refused/);
    await other.putChunk(current,Buffer.from("other node"));
    await node.deleteChunk(old);await node.deleteChunk(old);
    await assert.rejects(node.putChunk(old,Buffer.from("late stale write")),/permanently deleted/);
    assert.equal(await node.hasChunk(old),false);
    assert.equal((await node.getChunk(current)).toString(),"current");
    assert.equal((await other.getChunk(current)).toString(),"other node");
    assert.equal([...values.values()].filter(entry=>entry.value==="1").length,1,"one retained control tombstone");
    assert.equal(values.size,3,"two live replicas plus the durable deletion tombstone");
    const restored=new RedisStore("replica-fixture","owner-fixture");
    restored.attachEmbeddedSnapshot(new Map(JSON.parse(JSON.stringify([...values]))));
    try{
      const restarted=new PocketDimensionChunkStore("node-a",()=>({
        get:async key=>await restored.exec("GET",[key]),
        eval:async(script,count,...args)=>await restored.exec("EVAL",[script,String(count),...args]),
      }));
      await assert.rejects(restarted.putChunk(old,Buffer.from("late after restart")),/permanently deleted/);
    }finally{restored.closeEmbedded()}
  }finally{store.closeEmbedded()}
});

test("a delayed replica publication cannot resurrect bytes after a newer cleanup ACK", async () => {
  const values=new Map(),store=new RedisStore("replica-delay-fixture","owner-fixture");store.attachEmbeddedSnapshot(values);
  let release,announce;
  const held=new Promise(resolve=>{release=resolve}),entered=new Promise(resolve=>{announce=resolve});
  const owner={get:async key=>await store.exec("GET",[key]),eval:async(script,count,...args)=>await store.exec("EVAL",[script,String(count),...args])};
  const old=new PocketDimensionChunkStore("shared-node",()=>({ ...owner,eval:async(...args)=>{announce();await held;return owner.eval(...args)} }));
  const current=new PocketDimensionChunkStore("shared-node",()=>owner),key=`${"b".repeat(64)}.1`;
  try{
    const late=old.putChunk(key,Buffer.from("delayed old publication"));
    await entered;await current.deleteChunk(key);release();
    await assert.rejects(late,/permanently deleted/);
    assert.equal(await current.hasChunk(key),false);
    assert.equal(values.size,1,"only the deletion tombstone remains");
  }finally{release();store.closeEmbedded()}
});
