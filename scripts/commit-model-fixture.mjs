import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export function writeFakeCodex(directory) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'codex');
  writeFileSync(file, String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const args = process.argv.slice(2);
const mode = () => fs.readFileSync(process.env.GITTOGETHER_MODEL_MODE, 'utf8').trim();
if (args[0] === 'app-server') {
  const lines = readline.createInterface({input:process.stdin});
  lines.on('line', line => {
    if (mode() === 'settings-hang') return;
    const request = JSON.parse(line);
    if (request.id === undefined) return;
    const result = request.method === 'initialize' ? {} : request.method === 'config/read'
      ? {config:{mcp_servers:{fixture_required:{required:true}}}}
      : {data: mode() === 'no-luna' ? [{model:'fixture-default',isDefault:true}] : [{model:'gpt-5.6-luna'},{model:'gpt-6-luna'},{model:'fixture-default',isDefault:true}]};
    process.stdout.write(JSON.stringify({id:request.id,result})+'\n');
  });
} else if (args[0] === 'exec') {
  let input = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', text => input += text);
  process.stdin.on('end', () => {
    fs.appendFileSync(process.env.GITTOGETHER_MODEL_LOG,JSON.stringify({args,input,cwd:process.cwd(),pid:process.pid})+'\n');
    if (mode() === 'hang') {setInterval(()=>{},1000);return;}
    if (mode() === 'auth') {process.stderr.write('401 authentication required fixture-private-diagnostic');process.exitCode=1;return;}
    const target = args[args.indexOf('--output-last-message')+1];
    const write = () => fs.writeFileSync(target, mode() === 'invalid' ? 'bad json' : JSON.stringify({title:'生成测试提交说明',description:'保留可编辑的提交草稿。'}));
    if (mode() === 'delay') setTimeout(write,750); else write();
  });
} else {process.stderr.write('unexpected argument');process.exitCode=1;}
`);
  chmodSync(file, 0o755);
  return file;
}
