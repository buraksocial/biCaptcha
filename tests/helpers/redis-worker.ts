import { createClient } from 'redis';
import { RedisState } from '../../src/lib/security/redis-state';
void (async()=>{
  const client=createClient({socket:{path:process.argv[2],reconnectStrategy:false},disableOfflineQueue:true});client.on('error',()=>{});
  try {await client.connect();console.log(await new RedisState(client,'process-race').consume('nonce','v')?'accepted':'rejected');}
  finally {if(client.isOpen)await client.quit();}
})();
