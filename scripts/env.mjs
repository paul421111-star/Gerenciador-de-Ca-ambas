import {existsSync,copyFileSync} from 'node:fs';
export function loadEnv(create=false){
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major<22||(major===22&&minor<16))throw new Error('Utilize Node.js 22.16 ou superior.');
 if(create&&!existsSync('.env')&&existsSync('.env.example'))copyFileSync('.env.example','.env');
 if(existsSync('.env'))process.loadEnvFile('.env');
}
