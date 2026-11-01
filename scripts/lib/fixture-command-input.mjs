import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

// Feed large private fixture archives directly to a child. fs.readFileSync has
// a 2 GiB limit and buffering ancestry archives duplicates their entire memory.
export function spawnFixtureCommand(command,args,{input,inputFile,...options}={}) {
  if(input!==undefined&&inputFile!==undefined)throw Error('Choose one fixture input source');
  if(inputFile===undefined)return spawnSync(command,args,{...options,input});
  const descriptor=fs.openSync(inputFile,'r');
  try {
    return spawnSync(command,args,{...options,stdio:[descriptor,'pipe','pipe']});
  } finally {
    fs.closeSync(descriptor);
  }
}
