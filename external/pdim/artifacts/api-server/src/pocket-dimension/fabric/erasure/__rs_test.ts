import { randomBytes } from "crypto";
import { ReedSolomon } from "./ReedSolomon.js";

function check(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

let cases = 0;
await main();

async function main(): Promise<void> {
  for (const [k, m] of [
    [2, 1],
    [4, 2],
    [6, 3],
    [10, 4],
    [3, 3],
  ] as [number, number][]) {
    for (const len of [1, 100, 4096, 70000]) {
      const rs = new ReedSolomon(k, m);
      const payload = randomBytes(len);
      const { shards, shardSize } = await rs.encode(payload);
      check(shards.length === k + m, `${k}+${m}: shard count`);

      // Drop every combination of up to m shards and verify reconstruction.
      // Test: drop the last `m` shards, the first `m`, and m random ones.
      const dropSets: number[][] = [
        Array.from({ length: m }, (_, i) => k + m - 1 - i),
        Array.from({ length: m }, (_, i) => i),
      ];
      // random m-subset
      const idx = [...Array(k + m).keys()].sort(() => Math.random() - 0.5);
      dropSets.push(idx.slice(0, m));

      for (const drop of dropSets) {
        const avail: (Buffer | null)[] = shards.map((s, i) =>
          drop.includes(i) ? null : Buffer.from(s),
        );
        const data = await rs.reconstructData(avail);
        const recovered = Buffer.concat(data).subarray(0, payload.length);
        check(
          recovered.equals(payload),
          `${k}+${m} len=${len} drop=[${drop}] mismatch (shardSize=${shardSize})`,
        );
        cases++;
      }
    }
  }

  console.log(`OK — Reed–Solomon verified across ${cases} loss scenarios`);
}
