import { runUpdate } from './updater';
runUpdate(process.argv[2], process.argv.includes('--approve')).catch(()=>{
  console.error('Update refused/failed. Inspect operator configuration and maintenance state. No automatic rollback.');process.exitCode=1;
});
