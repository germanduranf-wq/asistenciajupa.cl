import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {homeData,homeClass,youthLabel} from '../src/home-data.mjs';
import {setup,as} from './support/database.mjs';
test('Inicio: ámbito, fechas pendientes, cumpleaños y nombre de la clase',()=>{
 const data={classes:[{id:'1',name:'San Carlos',kind:'Clase'},{id:'2',name:'Templo Matriz',kind:'Templo matriz'}],activity_modules:[{code:'visita',enabled:true},{code:'escuela_dominical',enabled:true}],people:[{id:'a',active:true,class_id:'1',birth_date:'2000-12-03'},{id:'b',active:true,class_id:'2',birth_date:'1990-11-20'}],visits:[{id:'old',date:'2026-11-01',activity_type:'visita'},{id:'new',date:'2026-11-27',activity_type:'visita'},{id:'sc',date:'2026-11-22',activity_type:'escuela_dominical',class_id:'1'},{id:'tm',date:'2026-11-22',activity_type:'escuela_dominical',class_id:'2'}],responsibilities:[{id:'r1',person_id:'a',visit_id:'old'},{id:'r2',person_id:'a',visit_id:'new'},{id:'r3',person_id:'b',visit_id:'new'}]};
 const p={role:'admin',active:true};const h=homeData(data,p,'1','2026-11-18');assert.deepEqual(h.responsibilities.map(r=>r.id),['r2']);assert.deepEqual(h.birthdays.map(p=>p.id),['a']);assert.ok(!h.upcoming.some(v=>['old','tm'].includes(v.id)));assert.equal(homeClass({role:'jefatura'},data),'2');assert.equal(youthLabel({class_id:'1'},data),'Juventud de la clase San Carlos');
});
test('Locales: rechazo de nuevas membresías, visitas permitidas y domingos excluidos',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros','202610230002_resumenes_secretaria','202610240001_formato_nombres']);
 try{await db.exec(await readFile(new URL('../supabase/migrations/202611180002_locales_sin_juventud.sql',import.meta.url),'utf8'));await db.exec("update public.iglesias set tipo='Local' where id=3;update public.modulos set habilitado=true");await as(db,1);
 await assert.rejects(()=>db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria) values('Prueba','Local',3,'Joven')"),/destinos/);
 await assert.rejects(()=>db.query("insert into public.miembros(nombres,apellidos,iglesia_id,otra_iglesia_id,categoria) values('Prueba','Local',1,3,'Joven')"),/destinos/);
 await db.exec("select public.v3_ensure_sundays(current_date,current_date+7)");assert.equal((await db.query("select count(*)::int n from public.actividades where iglesia_id=3")).rows[0].n,0);
 await db.query("select public.v3_save_visit($1,'{}')",[JSON.stringify({date:'2026-11-27',class_id:3,group:'Jóvenes',activity_type:'visita'})]);
 }finally{await db.close();}
});
