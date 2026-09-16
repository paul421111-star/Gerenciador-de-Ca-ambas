import {loadEnv} from './env.mjs';import {ask,askPassword} from './prompt.mjs';import {openDatabase,openPostgres,databasePath,row,tx,usesPostgres} from '../src/server/db.ts';import {hashPassword} from '../src/server/auth.ts';import {randomUUID} from 'node:crypto';
let db;try{
 loadEnv();
 db=usesPostgres()?await openPostgres():openDatabase(databasePath());
 const email=(process.env.JR_ADMIN_EMAIL||await ask('E-mail da conta a recuperar')).toLowerCase();
 const user=await row(db,'SELECT id FROM users WHERE email=?',email);
 if(!user)throw new Error('Conta não encontrada.');
 const password=process.env.JR_ADMIN_PASSWORD||await askPassword('Nova senha (mínimo 12 caracteres)');
 const hash=hashPassword(password);
 await tx(db,async()=>{
  await db.run('UPDATE users SET passwordHash=? WHERE id=?',hash,user.id);
  await db.run('DELETE FROM sessions WHERE userId=?',user.id);
  await db.run('INSERT INTO audit(id,actorId,action,entityId,detail,createdAt) VALUES(?,?,?,?,?,?)',randomUUID(),user.id,'cli_password_reset',user.id,'Senha redefinida pelo operador com acesso ao servidor. Sessões revogadas.',new Date().toISOString());
 });
 console.log('Senha atualizada. As sessões antigas foram encerradas.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db?.close();}
