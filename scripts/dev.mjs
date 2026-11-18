import {spawn} from 'node:child_process';
const api=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','watch','server/index.ts'],{stdio:'inherit'});
const web=spawn(process.execPath,['node_modules/vite/bin/vite.js',...process.argv.slice(2)],{stdio:'inherit'});
function stop(){api.kill();web.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
api.on('exit',code=>{web.kill();process.exit(code??0);});web.on('exit',code=>{api.kill();process.exit(code??0);});
