import {DatabaseSync} from 'node:sqlite';import {existsSync} from 'node:fs';import {resolve} from 'node:path';import {loadEnv} from './env.mjs';
import {openPostgres,row,usesPostgres} from '../src/server/db.ts';
let db;try{
 loadEnv();
 if(usesPostgres()&&!process.argv[2]){
  db=await openPostgres();
  for(const table of ['containers','trucks','customers','rentals','users'])console.log(table+':',(await row(db,`SELECT COUNT(*) n FROM ${table}`)).n);
  console.log('Leitura no Supabase sem alterar dados.');
 }else{
  const file=resolve(process.argv[2]||process.env.DATABASE_PATH||'./data/jr.sqlite');
  if(!existsSync(file))throw new Error('Arquivo de banco nao encontrado.');
  db=new DatabaseSync(file,{readOnly:true});
  const integrity=db.prepare('PRAGMA integrity_check').get();
  if(integrity.integrity_check!=='ok')throw new Error('Falha de integridade: '+JSON.stringify(integrity));
  const foreign=db.prepare('PRAGMA foreign_key_check').all();
  if(foreign.length)throw new Error('Inconsistencia em chaves estrangeiras.');
  for(const table of ['containers','trucks','customers','rentals','users'])console.log(table+':',db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
  console.log('Integridade e chaves estrangeiras: OK. Leitura sem alterar o banco.');
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(db?.close)await db.close();}
