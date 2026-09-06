#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {soroticket,verifyTally,TESTNET} from '../dist/index.js';
const file=process.argv[2];
if(!file)throw new Error('Usage: soroticket-verify tally-evidence.json');
const evidence=JSON.parse(await readFile(file,'utf8'));
if(evidence.network!=='testnet')throw new Error('This preview verifier supports testnet only');
const contractId=process.env.SOROTICKET_CONTRACT_ID??TESTNET.contractId;
if(evidence.contract_id!==contractId)throw new Error('Evidence does not target the configured contract');
const client=soroticket({contractId});
const onchain=(await client.get_tally({campaign_id:BigInt(evidence.campaign_id),code:evidence.code,period:BigInt(evidence.period)})).result.unwrap();
const expected={network:'testnet',contract_id:contractId,campaign_id:evidence.campaign_id,code:evidence.code,count:Number(onchain.count),merkle_root:Buffer.from(onchain.merkle_root).toString('hex')};
const result=await verifyTally(evidence.receipts,expected);
console.log(JSON.stringify({...result,network:expected.network,contract_id:contractId,period:evidence.period},null,2));
