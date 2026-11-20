import { receipt } from '../../src/lib/security/ledger';
import { postgres } from '../../src/lib/security/postgres';
void (async () => {
  try { await receipt(process.argv[2], { siteKey: 'fixture-site', action: 'contact', host: 'example.com' }); console.log('accepted'); }
  catch { console.log('rejected'); }
  finally { await postgres().end(); }
})();
