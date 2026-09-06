import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'artifacts/release');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git('status','--porcelain','--untracked-files=no'))throw new Error('Commit tracked changes before making a release artifact');
const pkg=JSON.parse(await readFile(resolve(root,'sdk/ts/package.json')));
const deployment=JSON.parse(await readFile(resolve(root,'deployments/testnet-v0.2.0.json')));
const wasm=resolve(root,'contracts/coupon-ledger/target/wasm32v1-none/release/coupon_ledger.wasm');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(await readFile(wasm))!==deployment.wasmHash)throw new Error('WASM does not match frozen v0.2.0; rebuild with the pinned toolchain');
execFileSync(process.execPath,[resolve(root,'scripts/package-sdk.mjs')],{cwd:root,stdio:'inherit'});
await mkdir(out,{recursive:true});
const files={
 'coupon_ledger.wasm':wasm,
 'abi-v0.2.0.txt':resolve(root,'contracts/coupon-ledger/abi-v0.2.0.txt'),
 [`soroticket-sdk-${pkg.version}.tgz`]:resolve(root,`artifacts/sdk/soroticket-sdk-${pkg.version}.tgz`),
 'openapi.json':resolve(root,'docs/api/openapi.json'),
 'tranche-1.postman_collection.json':resolve(root,'docs/api/tranche-1.postman_collection.json'),
 'testnet-v0.2.0.json':resolve(root,'deployments/testnet-v0.2.0.json'),
};
const manifest={sdk_version:pkg.version,contract_version:'0.2.0',source_commit:git('rev-parse','HEAD'),network:'testnet',contract_id:deployment.contractId,wasm_sha256:deployment.wasmHash,created_at:new Date().toISOString(),files:{}};
for(const[name,path]of Object.entries(files)){await copyFile(path,resolve(out,name));manifest.files[name]=sha(await readFile(path))}
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
manifest.files['manifest.json']=sha(await readFile(resolve(out,'manifest.json')));
await writeFile(resolve(out,'SHA256SUMS'),Object.entries(manifest.files).map(([name,hash])=>`${hash}  ${name}`).join('\n')+'\n');
console.log(`Release candidate: ${out}`);
