import {writeFile} from 'node:fs/promises';
const variable=[{key:'base_url',value:'http://localhost:8787'}];
const event=(listen,code)=>({listen,script:{type:'text/javascript',exec:code.split('\n')}});
const item=[];
function request(name,method,path,body,status=200,test='',auth=true){
 const headers=[{key:'X-Env',value:'test'}];
 if(auth)headers.push({key:'Authorization',value:'Bearer {{api_key}}'});
 if(body!==undefined)headers.push({key:'Content-Type',value:'application/json'});
 if(method==='POST'&&path.startsWith('/v1'))headers.push({key:'Idempotency-Key',value:'{{$guid}}'});
 item.push({name,request:{method,header:headers,url:'{{base_url}}'+path,...(body===undefined?{}:{body:{mode:'raw',raw:JSON.stringify(body,null,2),options:{raw:{language:'json'}}}})},event:[event('test',`pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));\nif (pm.response.code !== ${status}) { pm.execution.setNextRequest(null); } else {\nconst data = pm.response.json();\n${test}\n}`)]});
}
request('Ready','GET','/readyz',undefined,200,"pm.test('testnet only',()=>pm.expect(data.network).to.eql('testnet')); pm.collectionVariables.set('contract_id',data.contract_id);",false);
item[0].event.unshift(event('prerequest',"const run=pm.variables.replaceIn('{{$guid}}'); pm.collectionVariables.set('run',run); pm.collectionVariables.set('password',pm.variables.replaceIn('{{$guid}}')); pm.collectionVariables.set('fund_attempt',0);"));
request('Sign up','POST','/auth/signup',{email:'postman-{{run}}@example.test',password:'{{password}}'},201,'',false);
request('Create organization','POST','/orgs',{name:'T1 Postman {{run}}'},201,'',false);
request('Create API key','POST','/v1/keys',{label:'T1 collection'},201,"pm.collectionVariables.set('api_key',data.key); pm.collectionVariables.set('key_id',data.id);",false);
request('Wait for testnet funding','GET','/v1/overview',undefined,200,"if (!data.account_funded) { const attempt=Number(pm.collectionVariables.get('fund_attempt'))+1; pm.collectionVariables.set('fund_attempt',attempt); pm.test('funded within 60 polls',()=>pm.expect(attempt).to.be.below(60)); pm.execution.setNextRequest(attempt<60 ? 'Wait for testnet funding' : null); }");
request('Create Burn campaign','POST','/v1/campaigns',{kind:'ticket',name:'T1 Postman Burn',discount_type:'free_item',discount_value:1,total_supply:1},201,"pm.collectionVariables.set('burn_id',data.id);");
request('Issue unique code','POST','/v1/campaigns/{{burn_id}}/codes',{codes:['T1-POSTMAN']},201,"pm.test('one issued',()=>pm.expect(data.issued.length).to.eql(1));");
request('Verify unique code','GET','/v1/verify?campaign_id={{burn_id}}&code=T1-POSTMAN');
request('Redeem unique code','POST','/v1/redemptions',{campaign_id:'{{burn_id}}',code:'T1-POSTMAN',redeemer_ref:'synthetic-{{run}}'},201);
request('Reject second redemption','POST','/v1/redemptions',{campaign_id:'{{burn_id}}',code:'T1-POSTMAN',redeemer_ref:'synthetic-{{run}}'},409,"pm.test('AlreadyRedeemed',()=>pm.expect(data.code).to.eql(3));");
request('Campaign activity','GET','/v1/activity?campaign_id={{burn_id}}&limit=2',undefined,200,"pm.test('activity has pagination',()=>pm.expect(data).to.have.property('next_cursor'));");
request('Create Tally campaign','POST','/v1/campaigns',{kind:'gift',name:'T1 Postman Tally',discount_type:'free_item',discount_value:1,shared:{code:'T1-TALLY'}},201,"pm.collectionVariables.set('tally_id',data.id); pm.collectionVariables.set('chain_id',data.chain_id);");
for(let n=1;n<=3;n++)request('Record signed receipt '+n,'POST','/v1/shared-codes/{{tally_id}}/T1-TALLY/events',{customer_ref:'synthetic-person-'+n,order_ref:'synthetic-order-'+n},201,"pm.test('original signed bytes available',()=>pm.expect(data.receipt.payload_base64).to.be.a('string'));");
request('Reject duplicate business reference','POST','/v1/shared-codes/{{tally_id}}/T1-TALLY/events',{customer_ref:'synthetic-person-1',order_ref:'synthetic-order-1'},409);
request('Commit Tally','POST','/v1/shared-codes/{{tally_id}}/T1-TALLY/commits',{},201,"pm.collectionVariables.set('period',data.period); pm.collectionVariables.set('root',data.merkle_root);");
request('Public audit proofs','GET','/v1/audit/tallies/{{chain_id}}/T1-TALLY/{{period}}?contract={{contract_id}}&limit=100',undefined,200,"pm.test('three receipts',()=>pm.expect(data.receipts.length).to.eql(3)); pm.test('anchored root',()=>pm.expect(data.merkle_root).to.eql(pm.collectionVariables.get('root')));",false);
request('Revoke API key','POST','/v1/keys/{{key_id}}/revoke',{});
request('Reject revoked API key','GET','/v1/campaigns',undefined,401,"pm.collectionVariables.unset('api_key'); pm.collectionVariables.unset('password');");
// API IDs are JSON numbers, not quoted template strings.
for(const entry of item)if(entry.request.body)entry.request.body.raw=entry.request.body.raw.replaceAll('"{{burn_id}}"','{{burn_id}}');
await writeFile(new URL('../docs/api/tranche-1.postman_collection.json',import.meta.url),JSON.stringify({info:{name:'Soroticket T1 — Burn and Tally (testnet)',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',description:'Synthetic fixtures only. Run sequentially with a 1500 ms request delay and 100000 ms request timeout. New tenant each run. For independent RPC, signature and privacy verification also run npm run e2e:cloud.'},variable,item},null,2)+'\n');
