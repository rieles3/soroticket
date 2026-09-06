import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {xdr} from '@stellar/stellar-sdk';
import {submitTransaction, isFootprintConflict, SubmissionError} from '../dist/index.js';
const fixture=JSON.parse(readFileSync(new URL('./footprint-conflict.json',import.meta.url)));
const conflict={status:'FAILED',diagnosticEventsXdr:fixture.diagnostics.map(d=>xdr.DiagnosticEvent.fromXDR(d,'base64'))};

test('a confirmed footprint conflict is re-simulated before the result is decoded',async()=>{
 let builds=0;
 const events=[];
 const result=await submitTransaction(async()=>{
  const attempt=++builds;
  return {signAndSend:async()=>({sendTransactionResponse:{hash:`hash-${attempt}`},getTransactionResponse:attempt===1?conflict:{status:'SUCCESS'},get result(){assert.equal(attempt,2);return 42n}})};
 },{onTransaction:e=>events.push(e)});
 assert.equal(result.result,42n);assert.equal(builds,2);assert.deepEqual(events.map(e=>e.status),['FAILED','SUCCESS']);
});
test('network uncertainty retains the signed hash without rebuilding',async()=>{
 let builds=0;
 await assert.rejects(()=>submitTransaction(async()=>{
  builds++;return {signed:{hash:()=>Buffer.alloc(32,1)},signAndSend:async()=>{throw new Error('connection lost')}};
 }),e=>e instanceof SubmissionError&&e.status==='UNKNOWN'&&e.hash==='01'.repeat(32));
 assert.equal(builds,1);
});
test('business failures and pending outcomes never re-execute',async()=>{
 for(const status of ['FAILED','NOT_FOUND']){
  let builds=0;
  await assert.rejects(()=>submitTransaction(async()=>{builds++;return {signAndSend:async()=>({sendTransactionResponse:{hash:'known'},getTransactionResponse:{status},get result(){throw new Error('must not decode failure')}})}}),e=>e.status===status&&e.hash==='known');
  assert.equal(builds,1);
 }
 assert.equal(isFootprintConflict({...conflict,status:'SUCCESS'}),false);
});
