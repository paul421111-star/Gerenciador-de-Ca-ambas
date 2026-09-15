import {resolve} from 'node:path';import {loadEnv} from './env.mjs';import {ask,askPassword} from './prompt.mjs';
import {openDatabase,row,databasePath} from '../src/server/db.ts';import {seed} from '../src/server/seed.ts';
let db;
try{
 loadEnv(true);const demo=process.argv.includes('--demo');
 const path=demo?resolve('./data/demo.sqlite'):databasePath();
 console.log(`\nJR Caçambas | ${demo?'BASE DEMONSTRATIVA SEPARADA':'INICIALIZAÇÃO OPERACIONAL'}\nBanco: ${path}\n`);
 db=openDatabase(path);
 if(row(db,'SELECT id FROM users LIMIT 1')){console.log('Base já inicializada. Nenhum registro foi modificado.');}
 else{
  const email=process.env.JR_ADMIN_EMAIL||await ask('E-mail do administrador');
  const name=process.env.JR_ADMIN_NAME||await ask('Nome do administrador','Administrador JR');
  const password=process.env.JR_ADMIN_PASSWORD||await askPassword();
  if(!process.env.JR_ADMIN_PASSWORD){const confirmation=await askPassword('Repita a senha');if(password!==confirmation)throw new Error('As senhas não conferem. Execute novamente.');}
  seed(db,{email,name,password,demo});console.log('70 caçambas e 2 caminhões cadastrados. Administrador criado.');
 }
 console.log(demo?'\nAbra a demonstração com: npm run dev:demo\nNão use esta base na operação real.':'\nPróximo passo: npm run dev\nAcesse http://localhost:3000 e entre com o e-mail e a senha que você definiu.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{db?.close();}
