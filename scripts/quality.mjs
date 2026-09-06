import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node 22+ is required');
const env={...process.env,PATH:`${dirname(process.execPath)}:${process.env.PATH}`};
const npm=()=>process.env.npm_execpath||resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
function run(command,args,cwd=root){console.log(`\n${cwd.replace(root,'.')}: ${command.split('/').at(-1)} ${args.join(' ')}`);const r=spawnSync(command,args,{cwd,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1)}
function nodeTool(pkg,rel,cwd,...args){const require=createRequire(resolve(root,cwd,'package.json'));run(process.execPath,[resolve(dirname(require.resolve(`${pkg}/package.json`)),rel),...args],resolve(root,cwd))}
if(process.argv[2]==='bootstrap'){
 for(const dir of ['.','sdk/ts','web','cloud/console','tests/e2e/ts','tests/e2e/cloud-gift'])run(process.execPath,[npm(),'ci','--no-audit','--no-fund'],resolve(root,dir));
}else if(process.argv[2]==='check'){
 run('cargo',['test','--locked'],resolve(root,'contracts/coupon-ledger'));
 for(const dir of ['sdk/go','cloud/api','cloud/scanner','tests/e2e/go']){
  run('go',['test','-race','./...'],resolve(root,dir));run('go',['vet','./...'],resolve(root,dir));
 }
 nodeTool('typescript','bin/tsc','sdk/ts');
 run(process.execPath,['--test','sdk/ts/test/submit.test.mjs','sdk/ts/test/verifier.test.mjs']);
 for(const dir of ['web','cloud/console'])nodeTool('vite','bin/vite.js',dir,'build');
 run(process.execPath,['scripts/build-landing.mjs']);
 run(process.execPath,['scripts/check-openapi.mjs']);
}else throw new Error('Usage: node scripts/quality.mjs bootstrap|check');
