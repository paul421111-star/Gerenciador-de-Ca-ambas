// Only the isolated test directory is reset. Never the operational database.
import {mkdirSync,rmSync} from 'node:fs';import {resolve} from 'node:path';
import {openDatabase} from '../src/server/db.ts';import {seed} from '../src/server/seed.ts';
process.env.JR_FORCE_SQLITE='1';
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_DIRECT;
const dir=resolve('.test-data');mkdirSync(dir,{recursive:true});
for(const suffix of ['','-wal','-shm'])rmSync(resolve(dir,'e2e.sqlite'+suffix),{force:true});
const password=process.env.JR_ADMIN_PASSWORD;if(!password)throw new Error('JR_ADMIN_PASSWORD is required for isolated E2E setup.');
const db=openDatabase(resolve(dir,'e2e.sqlite'));try{await seed(db,{email:'e2e@example.test',password,name:'Teste E2E'});}finally{db.close();}
console.log('Isolated E2E database ready.');
