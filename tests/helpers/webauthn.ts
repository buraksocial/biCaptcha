import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
export function authenticator() {
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}), jwk=pair.publicKey.export({format:'jwk'}), credential=randomBytes(32);
  const cose=isoCBOR.encode(new Map<number,number|Uint8Array>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]));
  const id=credential.toString('base64url');
  function authData(rp:string,flags:number,counter:number, registration=false) {
    const n=Buffer.alloc(4);n.writeUInt32BE(counter);const len=Buffer.alloc(2);len.writeUInt16BE(credential.length);
    return Buffer.concat([createHash('sha256').update(rp).digest(),Buffer.from([flags]),n,...(registration?[Buffer.alloc(16),len,credential,Buffer.from(cose)]:[])]);
  }
  return {
    register(challenge:string,origin='https://dashboard.example.com',rp='dashboard.example.com',flags=0x45):RegistrationResponseJSON {
      const data=Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin,crossOrigin:false}));
      const att=isoCBOR.encode(new Map<string,unknown>([['fmt','none'],['attStmt',new Map()],['authData',authData(rp,flags,0,true)]]) as Parameters<typeof isoCBOR.encode>[0]);
      return {id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:data.toString('base64url'),attestationObject:Buffer.from(att).toString('base64url')}};
    },
    authenticate(challenge:string,origin='https://dashboard.example.com',rp='dashboard.example.com',flags=5,counter=1):AuthenticationResponseJSON {
      const data=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false})),auth=authData(rp,flags,counter);
      const signature=sign('sha256',Buffer.concat([auth,createHash('sha256').update(data).digest()]),pair.privateKey);
      return {id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:data.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:signature.toString('base64url'),userHandle:Buffer.from('u').toString('base64url')}};
    }
  };
}
