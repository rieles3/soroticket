import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
const docker=process.env.DOCKER_BIN??'docker',image=process.argv[2];
if(!image)throw new Error('Usage: node scripts/check-container.mjs soroticket-cloud:tag');
const name='soroticket-check-'+randomUUID().slice(0,8),volume=name+'-data',restored=name+'-restored';
const password=randomUUID(),email=name+'@example.test';
function run(args,input){const r=spawnSync(docker,args,{input,maxBuffer:20*1024*1024});if(r.status!==0)throw new Error(r.stderr?.toString()||r.error?.message);return r.stdout}
async function start(data){
 run(['run','-d','--name',name,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:size=64m','--mount',`source=${data},target=/data`,'-p','127.0.0.1::8787',image]);
 const [info]=JSON.parse(run(['inspect',name]));
 assert.equal(info.Config.User,'65532:65532');
 const base='http://127.0.0.1:'+info.NetworkSettings.Ports['8787/tcp'][0].HostPort;
 for(let n=0;n<40;n++){try{if((await fetch(base+'/readyz')).ok)return base}catch{}await new Promise(r=>setTimeout(r,500))}
 throw new Error('Container did not become ready');
}
async function post(base,path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(r.ok,`${path} returned ${r.status}`);return r.json()}
try{
 const base=await start(volume);
 assert((await(await fetch(base+'/')).text()).includes('<html'));
 const user=await post(base,'/auth/signup',{email,password});
 // The exact stored files, including all key material, must survive restore.
 const before=run(['exec',name,'sh','-c','find /data -maxdepth 1 -type f ! -name "console.db*" -exec sha256sum {} + | sort']).toString();
 run(['stop','-t','100',name]);run(['rm',name]);
 const backup=run(['run','--rm','--mount',`source=${volume},target=/data`,'--entrypoint','tar',image,'-C','/data','-czf','-','.']);
 run(['run','--rm','-i','--mount',`source=${restored},target=/data`,'--entrypoint','sh',image,'-c','cd /data && tar -xzf -'],backup);
 const recovered=await start(restored);
 const login=await post(recovered,'/auth/login',{email,password});
 assert.equal(login.ok,true);
 assert(Number.isInteger(user.user.id));
 const after=run(['exec',name,'sh','-c','find /data -maxdepth 1 -type f ! -name "console.db*" -exec sha256sum {} + | sort']).toString();
 assert.equal(after,before);
 run(['exec',name,'/app/soroticket-cloud','healthcheck']);
 console.log(JSON.stringify({passed:true,checks:['read-only non-root runtime','console and API same origin','persistent signup','backup to fresh volume','login after restore','key files unchanged','readiness'],backup_sha256:createHash('sha256').update(backup).digest('hex')},null,2));
}finally{
 for(const args of [['rm','-f',name],['volume','rm',volume,restored]])spawnSync(docker,args,{stdio:'ignore'});
}
