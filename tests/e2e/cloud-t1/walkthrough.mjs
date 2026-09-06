import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {soroticket,verifyTally,TESTNET,rpc,xdr,Address,nativeToScVal,Contract} from '../../../sdk/ts/dist/index.js';

const API=(process.env.SOROTICKET_API??'http://localhost:8787').replace(/\/$/,'');
const contractId=process.env.SOROTICKET_CONTRACT_ID??TESTNET.contractId;
const profile=process.argv[2]??'all';
assert(['all','burn','tally'].includes(profile),'Use burn, tally or all');
const out=resolve(process.env.SOROTICKET_EVIDENCE_DIR??'artifacts/t1');
await mkdir(out,{recursive:true});
const run=randomUUID().replaceAll('-','').slice(0,12);
const canaries=[`person-${run}@example.test`,`+1555${Date.now().toString().slice(-7)}`,`ORDER-PRIVATE-${run}`];
const server=new rpc.Server(TESTNET.rpcUrl),client=soroticket({contractId});
const report={run,profile,network:'testnet',contract_id:contractId,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),started_at:new Date().toISOString(),steps:[],transactions:[],privacy:{canary_hashes:canaries.map(s=>createHash('sha256').update(s).digest('hex')),arguments:0,events_and_storage_changes:0,current_storage_entries:0}};
const hashes=new Set(),keys=[];
report.source_dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()!=='';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function step(name,fn){const result=await fn();report.steps.push({name,passed:true});console.log(`PASS ${name}`);return result}
function collect(value){if(!value||typeof value!=='object')return;for(const[k,v]of Object.entries(value)){if(k==='tx_hash'&&typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))hashes.add(v);else collect(v)}}
function makeAPI(){
 let cookie='',key='';
 return {setKey:k=>{key=k},async request(method,path,body,{session=false,expected,idempotency}={}){
  const headers={'X-Env':'test'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(session&&cookie)headers.Cookie=cookie;else if(key)headers.Authorization=`Bearer ${key}`;
  if(method==='POST'&&path.startsWith('/v1'))headers['Idempotency-Key']=idempotency??randomUUID();
  const response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(100000)});
  const c=response.headers.get('set-cookie');if(c)cookie=c.split(';')[0];
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw new Error(`${method} ${path}: non-JSON response (${response.status})`)}
  if(expected!==undefined)assert.equal(response.status,expected,`${method} ${path}: ${text}`);
  else if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${text}`);
  collect(data);return data;
 }};
}
async function onboard(label){
 const api=makeAPI();
 await api.request('POST','/auth/signup',{email:`${label}-${run}@example.test`,password:`${randomUUID()}-testnet`},{session:true});
 await api.request('POST','/orgs',{name:`T1 ${label} ${run}`},{session:true});
 const key=await api.request('POST','/v1/keys',{label:'T1 acceptance'},{session:true});api.setKey(key.key);
 for(let i=0;i<60;i++){if((await api.request('GET','/v1/overview')).account_funded)return {api,key};await pause(1500)}
 throw new Error('Testnet funding did not become ready');
}
function storage(tag,...values){keys.push(xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(contractId).toScAddress(),key:xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(tag),...values]),durability:xdr.ContractDataDurability.persistent()})))}
const u64=n=>nativeToScVal(BigInt(n),{type:'u64'}),str=s=>xdr.ScVal.scvString(s);
function noPII(bytes,label){for(const canary of canaries)assert(!Buffer.from(bytes).includes(Buffer.from(canary)),`Plaintext reference in ${label}`)}
function unwrap(v){return typeof v?.unwrap==='function'?v.unwrap():v}
try{
 const ready=await step('API is ready on the configured testnet deployment',async()=>{const r=await(await fetch(API+'/readyz')).json();assert.equal(r.network,'testnet');assert.equal(r.contract_id,contractId);return r});
 const {api,key}=await step('Sign up, create organization, mint API key and fund testnet account',()=>onboard('owner'));
 const foreign=await step('Create a separate tenant for isolation checks',()=>onboard('foreign'));
 if(profile==='all'||profile==='burn'){
  const c=await step('Burn: create a capped ticket campaign',()=>api.request('POST','/v1/campaigns',{kind:'ticket',name:`T1 Burn ${run}`,discount_type:'free_item',discount_value:1,total_supply:2,valid_until:Math.floor(Date.now()/1000)+3600}));
  storage('Campaign',u64(c.chain_id));
  await step('Burn: another tenant cannot read this campaign',()=>foreign.api.request('GET',`/v1/campaigns/${c.id}`,undefined,{expected:404}));
  const code=`T1-${run.toUpperCase()}`;
  const issued=await step('Burn: issue exactly two codes',()=>api.request('POST',`/v1/campaigns/${c.id}/codes`,{codes:[code,code+'B']}));
  for(const item of issued.issued)storage('Token',u64(item.token_id));
  const body={campaign_id:c.id,code,redeemer_ref:canaries.join('|')},idem=randomUUID();
  const redeemed=await step('Burn: redeem with private references',()=>api.request('POST','/v1/redemptions',body,{idempotency:idem}));
  await step('Burn: idempotent replay returns the same transaction',async()=>{const replay=await api.request('POST','/v1/redemptions',body,{idempotency:idem});assert.equal(replay.receipt.tx_hash,redeemed.receipt.tx_hash)});
  await step('Burn: second redemption is rejected',async()=>{const r=await api.request('POST','/v1/redemptions',body,{expected:409});assert.equal(r.code,3)});
  await step('Burn: issuance cannot exceed supply',async()=>{const r=await api.request('POST',`/v1/campaigns/${c.id}/codes`,{codes:[code+'C']},{expected:409});assert.equal(r.code,5)});
  await step('Burn: chain state confirms the token is burned',async()=>{const token=unwrap((await client.verify({campaign_id:BigInt(c.chain_id),code})).result);assert.equal(token.is_burned,true)});
  await step('Burn: campaign activity is available',async()=>{const a=await api.request('GET',`/v1/activity?campaign_id=${c.id}`);assert(a.activity.some(e=>e.tx_hash===redeemed.receipt.tx_hash))});
  report.burn={campaign_id:c.chain_id,cloud_campaign_id:c.id,code,redeem_tx:redeemed.receipt.tx_hash};
 }
 if(profile==='all'||profile==='tally'){
  const code=`TALLY-${run.toUpperCase()}`;
  const c=await step('Tally: create count-only shared-code campaign',()=>api.request('POST','/v1/campaigns',{kind:'gift',name:`T1 Tally ${run}`,discount_type:'free_item',discount_value:1,shared:{code}}));
  storage('Campaign',u64(c.chain_id));storage('Shared',u64(c.chain_id),str(code));
  const recorded=[];
  for(let i=0;i<3;i++)recorded.push(await step(`Tally: sign receipt ${i+1}`,()=>api.request('POST',`/v1/shared-codes/${c.id}/${code}/events`,{customer_ref:canaries[i],order_ref:`${canaries[2]}-${i}`})));
  await step('Tally: duplicate business reference is rejected',()=>api.request('POST',`/v1/shared-codes/${c.id}/${code}/events`,{customer_ref:canaries[0],order_ref:`${canaries[2]}-0`},{expected:409}));
  const commit=await step('Tally: anchor count and Merkle root on Soroban',()=>api.request('POST',`/v1/shared-codes/${c.id}/${code}/commits`,{}));
  await step('Tally: collect creation, registration and commitment transactions from activity',async()=>{
   const a=await api.request('GET',`/v1/activity?campaign_id=${c.id}`);
   assert(a.activity.some(e=>e.tx_hash===commit.tx_hash));
   assert(new Set(a.activity.filter(e=>e.tx_hash).map(e=>e.tx_hash)).size>=3);
  });
  storage('Tally',u64(c.chain_id),str(code),u64(commit.period));
  let cursor=null,evidence,receipts=[];
  do{
   const page=await(await fetch(`${API}/v1/audit/tallies/${c.chain_id}/${code}/${commit.period}?contract=${contractId}&limit=2${cursor===null?'':`&cursor=${cursor}`}`)).json();
   assert(Array.isArray(page.receipts));evidence=page;receipts.push(...page.receipts);cursor=page.next_cursor;
  }while(cursor!==null);
  evidence={...evidence,receipts,next_cursor:null,cursor:0};
  const onchain=unwrap((await client.get_tally({campaign_id:BigInt(c.chain_id),code,period:BigInt(commit.period)})).result);
  const expected={network:'testnet',contract_id:contractId,campaign_id:c.chain_id,code,count:Number(onchain.count),merkle_root:Buffer.from(onchain.merkle_root).toString('hex')};
  await step('Tally: independently verify every signature, proof and on-chain root',async()=>{assert.equal(expected.count,3);assert.equal(expected.merkle_root,commit.merkle_root);await verifyTally(receipts,expected);for(const r of recorded)assert(receipts.some(p=>p.leaf_hash===r.receipt.leaf_hash))});
  await step('Tally: altered proof and wrong network are rejected',async()=>{const altered=structuredClone(receipts);altered[0].proof[0].hash='00'.repeat(32);await assert.rejects(()=>verifyTally(altered,expected));await assert.rejects(()=>verifyTally(receipts,{...expected,network:'mainnet'}))});
  for(const receipt of receipts)noPII(Buffer.from(receipt.payload_base64,'base64'),'signed receipt');
  await writeFile(resolve(out,`tally-${run}.json`),JSON.stringify(evidence,null,2)+'\n');
  report.tally={campaign_id:c.chain_id,cloud_campaign_id:c.id,code,period:commit.period,count:expected.count,merkle_root:expected.merkle_root,commit_tx:commit.tx_hash,receipt_file:`tally-${run}.json`};
 }
 await step('On-chain arguments, events and storage changes contain no plaintext references',async()=>{
  for(const hash of hashes){
   const tx=await server.getTransaction(hash);assert.equal(tx.status,'SUCCESS');
   noPII(tx.envelopeXdr.toXDR(),`arguments ${hash}`);report.privacy.arguments++;
   noPII(tx.resultMetaXdr.toXDR(),`events/storage changes ${hash}`);report.privacy.events_and_storage_changes++;
   const data={hash,status:tx.status,ledger:tx.ledger,envelope_xdr:tx.envelopeXdr.toXDR('base64'),result_meta_xdr:tx.resultMetaXdr.toXDR('base64')};
   report.transactions.push({hash,ledger:tx.ledger,url:`https://stellar.expert/explorer/testnet/tx/${hash}`});
   await writeFile(resolve(out,`${hash}.json`),JSON.stringify(data,null,2)+'\n');
  }
 });
 await step('Current contract storage contains no plaintext references',async()=>{
  keys.push(new Contract(contractId).getFootprint());
  const result=await server.getLedgerEntries(...keys);assert.equal(result.entries.length,keys.length,'all expected storage entries must exist');
  for(const entry of result.entries){noPII(entry.val.toXDR(),'current storage');report.privacy.current_storage_entries++}
  await writeFile(resolve(out,`storage-${run}.json`),JSON.stringify(result.entries.map(e=>({key:e.key.toXDR('base64'),value:e.val.toXDR('base64')})),null,2)+'\n');
 });
 await step('Revoked API key can no longer access the tenant',async()=>{await api.request('POST',`/v1/keys/${key.id}/revoke`,{});await api.request('GET','/v1/campaigns',undefined,{expected:401})});
 report.passed=true;
}catch(error){report.passed=false;report.error=error.message;console.error(error);process.exitCode=1}
finally{report.finished_at=new Date().toISOString();await writeFile(resolve(out,`manifest-${run}.json`),JSON.stringify(report,null,2)+'\n');console.log(`Evidence: ${out}/manifest-${run}.json`)}
