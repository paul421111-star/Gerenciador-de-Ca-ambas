import {createInterface} from 'node:readline/promises';
export async function ask(label,fallback=''){
 if(!process.stdin.isTTY)return fallback;
 const rl=createInterface({input:process.stdin,output:process.stdout});try{return (await rl.question(`${label}${fallback?` [${fallback}]`:''}: `)).trim()||fallback;}finally{rl.close();}
}
export async function askPassword(label='Senha (mínimo 12 caracteres)'){
 if(!process.stdin.isTTY)throw new Error('Sem terminal interativo. Informe JR_ADMIN_PASSWORD como variável de ambiente temporária.');
 process.stdout.write(label+': ');process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
 return new Promise((resolve,reject)=>{let value='';const done=()=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};const onData=(data)=>{for(const c of data){if(c==='\x03'){done();reject(new Error('Operação cancelada.'));return;}if(c==='\r'||c==='\n'){done();resolve(value);return;}if(c==='\x7f'||c==='\b'){if(value.length){value=value.slice(0,-1);process.stdout.write('\b \b');}}else if(c>=' '&&value.length<128){value+=c;process.stdout.write('*');}}};process.stdin.on('data',onData);});
}
