import fs from "node:fs";
import { StringDecoder } from "node:string_decoder";

/** Keep the existing JSON object format without constructing a whole-file string. */
export function snapshotJsonChunks(entries: Record<string, unknown>): string[] {
  const chunks = ["{"];
  let first = true;
  for (const [key, value] of Object.entries(entries)) {
    chunks.push(`${first ? "" : ","}${JSON.stringify(key)}:${JSON.stringify(value)}`);
    first = false;
  }
  chunks.push("}");
  return chunks;
}

/** Frame top-level members; JSON.parse still validates each complete member. */
export function readSnapshotJson(file: string, chunkBytes = 1024 * 1024): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  const fd = fs.openSync(file, "r");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.alloc(chunkBytes);
  let begun = false, ended = false, quoted = false, escaped = false;
  let depth = 0, afterComma = false;
  let parts: string[] = [];
  const member = (allowEmpty: boolean) => {
    const raw = parts.join("").trim();
    parts = [];
    if (!raw && allowEmpty) return;
    if (!raw) throw new Error("Empty snapshot member");
    const parsed = JSON.parse(`{${raw}}`);
    const keys = Object.keys(parsed);
    if (keys.length !== 1 || Object.hasOwn(result, keys[0])) throw new Error("Invalid or duplicate snapshot member");
    result[keys[0]] = parsed[keys[0]];
  };
  const consume = (text: string) => {
    let start = 0;
    const stringTokens = /["\\]/g;
    for (let i = 0; i < text.length; i++) {
      let char = text[i];
      if (!begun) {
        start = i + 1;
        if (/\s/.test(char)) continue;
        if (char !== "{") throw new Error("Snapshot must be a JSON object");
        begun = true; depth = 1; continue;
      }
      if (ended) {
        if (!/\s/.test(char)) throw new Error("Trailing snapshot content");
        start = i + 1; continue;
      }
      if (quoted) {
        if (escaped) { escaped = false; continue; }
        // Capsule values are large base64 strings. Search their delimiters in
        // native code instead of iterating hundreds of millions of JS characters.
        stringTokens.lastIndex = i;
        const token = stringTokens.exec(text);
        if (!token) break;
        i = token.index;
        char = token[0];
        if (char === "\\") escaped = true;
        else quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === "{" || char === "[") depth++;
      if (char === "}" || char === "]") depth--;
      if ((char === "," && depth === 1) || (char === "}" && depth === 0)) {
        parts.push(text.slice(start, i));
        member(char === "}" && !afterComma);
        afterComma = char === ",";
        ended = char === "}";
        start = i + 1;
      }
    }
    if (start < text.length) parts.push(text.slice(start));
  };
  try {
    let count: number;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) consume(decoder.write(buffer.subarray(0, count)));
    consume(decoder.end());
    if (!begun || !ended || quoted || depth !== 0) throw new Error("Incomplete snapshot JSON");
    return result;
  } finally { fs.closeSync(fd); }
}