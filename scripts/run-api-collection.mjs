import newman from 'newman';
import {readFile} from 'node:fs/promises';
const collection=JSON.parse(await readFile(new URL('../docs/api/tranche-1.postman_collection.json',import.meta.url)));
newman.run({collection,envVar:[{key:'base_url',value:process.env.SOROTICKET_API??'http://localhost:8787'}],delayRequest:1500,timeoutRequest:100000,bail:true,reporters:'cli'},(error,summary)=>{
 if(error){console.error(error.message);process.exitCode=1}
 else if(summary.run.failures.length)process.exitCode=1;
});
