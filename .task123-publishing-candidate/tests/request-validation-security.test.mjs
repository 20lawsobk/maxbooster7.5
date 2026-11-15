import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';

test('oversized Zod collections reject before producing an issue per member', () => {
  const result = z.array(z.string()).max(2).safeParse(Array(5000).fill({}));
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
  assert.deepEqual(z.array(z.string()).max(2).parse(['valid']), ['valid']);
});

test('compressed JSON with trailing bytes cannot crash the HTTP parser process', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import express from 'express';
    import http from 'node:http';
    import {gzipSync} from 'node:zlib';
    import assert from 'node:assert/strict';
    const app=express(); app.use(express.json());
    app.post('/',(req,res)=>res.json(req.body));
    app.use((err,req,res,next)=>res.status(err.status || 500).json({error:'invalid body'}));
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    async function send(payload,encoding) {
      return await new Promise((resolve,reject)=>{
        const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/',method:'POST',
          headers:{'content-type':'application/json','content-length':payload.length,...(encoding?{'content-encoding':encoding}:{})}},res=>{
          res.resume();res.on('end',()=>resolve(res.statusCode));
        });req.on('error',reject);req.end(payload);
      });
    }
    try {
      const malformed=Buffer.concat([gzipSync('{"ok":true}'),Buffer.from('invalid trailing bytes')]);
      assert.equal(await send(malformed,'gzip'),400);
      assert.equal(await send(Buffer.from('{"ok":true}')),200);
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
