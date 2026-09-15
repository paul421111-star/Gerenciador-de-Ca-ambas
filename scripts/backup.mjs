import {mkdirSync,chmodSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
import {loadEnv} from './env.mjs';import {openDatabase,databasePath,row} from '../src/server/db.ts';
let db;try{loadEnv();const dir=resolve(process.env.BACKUP_DIR||'./backups');mkdirSync(dir,{recursive:true});
 if(!existsSync(databasePath()))throw new Error('Banco nao encontrado. Execute a configuracao inicial antes do backup.');
 const target=resolve(dir,`jr-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);db=openDatabase(databasePath());if(!row(db,'SELECT COUNT(*) n FROM users').n)throw new Error('Banco ainda nao inicializado.');
 // VACUUM INTO produces a consistent single-file copy, including committed WAL content.
 db.prepare('VACUUM INTO ?').run(target);try{chmodSync(target,0o600);}catch{}
 const copy=openDatabase(target);try{if(row(copy,'PRAGMA integrity_check').integrity_check!=='ok')throw new Error('Backup falhou na verificação de integridade.');}finally{copy.close();}
 console.log('Backup consistente criado:',target);console.log('Copie este arquivo para outro equipamento com acesso restrito.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{db?.close();}
