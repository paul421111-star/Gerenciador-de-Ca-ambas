import {spawn} from 'node:child_process';import {resolve} from 'node:path';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','0.0.0.0'],{stdio:'inherit',env:{...process.env,DATABASE_PATH:resolve('data/demo.sqlite')}});
child.on('exit',code=>process.exit(code??1));child.on('error',error=>{console.error(error.message);process.exit(1);});
