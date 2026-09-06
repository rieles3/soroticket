import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {verifyTally,TESTNET} from '../dist/index.js';
const sha=x=>createHash('sha256').update(x).digest();
const signer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7));
const expected={network:'testnet',contract_id:TESTNET.contractId,campaign_id:42,code:'TEST',count:3};
const receipts=[1,2,3].map(n=>{
 const bytes=Buffer.from(JSON.stringify({version:2,network:expected.network,contract_id:expected.contract_id,campaign_id:42,code:'TEST',count:1,nonce:String(n),signer:signer.publicKey()}));
 return {payload_base64:bytes.toString('base64'),signature:signer.sign(bytes).toString('base64'),signer:signer.publicKey(),leaf_hash:sha(bytes).toString('hex'),proof:[]};
});
const [a,b,c]=receipts.map(r=>Buffer.from(r.leaf_hash,'hex')),ab=sha(Buffer.concat([a,b]));
expected.merkle_root=sha(Buffer.concat([ab,c])).toString('hex');
receipts[0].proof=[{position:'right',hash:b.toString('hex')},{position:'right',hash:c.toString('hex')}];
receipts[1].proof=[{position:'left',hash:a.toString('hex')},{position:'right',hash:c.toString('hex')}];
receipts[2].proof=[{position:'left',hash:ab.toString('hex')}];
test('signed receipts reconstruct an odd-sized Merkle tree',async()=>{assert.equal((await verifyTally(receipts,expected)).valid,true)});
test('tampering with identity, signature, payload, proof, root or receipt set fails',async()=>{
 for(const change of [r=>r[0].signature=Buffer.alloc(64).toString('base64'),r=>r[0].payload_base64=Buffer.from('{}').toString('base64'),r=>r[0].proof[0].hash='00'.repeat(32),r=>r.push(r[0]),r=>r.pop(),r=>r.reverse()]){
  const copy=structuredClone(receipts);change(copy);await assert.rejects(()=>verifyTally(copy,expected));
 }
 for(const change of [{network:'mainnet'},{contract_id:'another'},{campaign_id:43},{code:'OTHER'},{count:4},{merkle_root:'00'.repeat(32)}])await assert.rejects(()=>verifyTally(receipts,{...expected,...change}));
});
