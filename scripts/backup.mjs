import {mkdirSync,chmodSync,existsSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import {loadEnv} from './env.mjs';import {openDatabase,openPostgres,databasePath,row,rows,usesPostgres} from '../src/server/db.ts';
const TABLES=['migrations','drivers','users','sessions','loginAttempts','customers','customerSites','containers','trucks','rentals','jobs','rentalEvents','payments','maintenance','audit','settings','commandReceipts','rentalSignatures'];
let db;try{
 loadEnv();const dir=resolve(process.env.BACKUP_DIR||'./backups');mkdirSync(dir,{recursive:true});
 if(usesPostgres()){
  db=await openPostgres();
  if(!(await row(db,'SELECT COUNT(*) n FROM users'))?.n)throw new Error('Banco ainda nao inicializado.');
  const dump={};
  for(const table of TABLES)dump[table]=await rows(db,`SELECT * FROM ${table}`);
  const target=resolve(dir,`jr-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  writeFileSync(target,JSON.stringify(dump,null,2));
  try{chmodSync(target,0o600);}catch{}
  console.log('Backup JSON do Supabase criado:',target);
 }else{
  if(!existsSync(databasePath()))throw new Error('Banco nao encontrado. Execute a configuracao inicial antes do backup.');
  const target=resolve(dir,`jr-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
  db=openDatabase(databasePath());
  if(!(await row(db,'SELECT COUNT(*) n FROM users'))?.n)throw new Error('Banco ainda nao inicializado.');
  db.prepare('VACUUM INTO ?').run(target);try{chmodSync(target,0o600);}catch{}
  const copy=openDatabase(target);try{if((await row(copy,'PRAGMA integrity_check')).integrity_check!=='ok')throw new Error('Backup falhou na verificação de integridade.');}finally{copy.close();}
  console.log('Backup consistente criado:',target);
 }
 console.log('Copie este arquivo para outro equipamento com acesso restrito.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db?.close();}
