import assert from 'node:assert/strict';
import {Keypair,soroticket,keypairSigner,submitTransaction,TESTNET} from '@soroticket/sdk';
const a=Keypair.random(),b=Keypair.random();
for(const k of [a,b]){
 const res=await fetch(`https://friendbot.stellar.org?addr=${k.publicKey()}`);
 assert(res.ok,'testnet funding failed');
}
const make=k=>soroticket(keypairSigner(k.secret()));
const A=make(a),B=make(b);
const args=owner=>({owner,name:'T1 concurrent creation',discount_type:'free_item',discount_value:1n,total_supply:1,valid_until:BigInt(Math.floor(Date.now()/1000)+3600)});
// Both simulations predict the same global campaign slot. Commit A first to
// deterministically invalidate B's footprint, then exercise the safe retry.
const preparedA=await A.create_campaign(args(a.publicKey()));
const preparedB=await B.create_campaign(args(b.publicKey()));
const first=await submitTransaction(()=>Promise.resolve(preparedA));
let builds=0;const events=[];
const second=await submitTransaction(()=>++builds===1?Promise.resolve(preparedB):B.create_campaign(args(b.publicKey())),{onTransaction:e=>events.push(e)});
assert.equal(events[0].status,'FAILED');assert.equal(events.at(-1).status,'SUCCESS');assert.equal(builds,2);
assert.notEqual(first.result.unwrap(),second.result.unwrap());
const campaigns=(await B.campaigns_of({owner:b.publicKey()})).result;
assert.equal(campaigns.length,1,'retry must create exactly one campaign');
console.log(JSON.stringify({network:'testnet',contract_id:TESTNET.contractId,first:first.hash,events,exactly_one_campaign:true},null,2));
