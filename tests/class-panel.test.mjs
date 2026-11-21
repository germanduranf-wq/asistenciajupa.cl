import test from 'node:test';import assert from 'node:assert/strict';import {setup,as,uid} from './support/database.mjs';import {readFile} from 'node:fs/promises';
test('V3.6: registros separados, permisos de clase, cuenta limitada, plazo y concurrencia',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros','202610230002_resumenes_secretaria','202611180001_navegacion_evento_eliminacion','202611180002_locales_sin_juventud','202611200001_contacto_miembros','202611200002_cuentas_asistencia_invitados','202611210001_seguimiento_encuentros_clases']);
 try{
 await db.exec(await readFile(new URL('../supabase/migrations/202611210001_seguimiento_encuentros_clases.sql',import.meta.url),'utf8'));
 await db.exec(`insert into miembros(id,nombres,apellidos,iglesia_id,categoria) values(100,'Ana','Ejemplo',1,'Señorita'),(101,'Luis','Ejemplo',2,'Joven'); insert into eventos(id,tipo,date,titulo,lugar,direccion,anfitrionas_ids,hora_manana,hora_tarde,punto_predicacion) values(100,'jupa',current_date,'Encuentro','Templo','Calle',ARRAY[1,2],'10:00','18:00','Plaza');`);
 await as(db,4);
 let panel=(await db.query('select v36_clase_panel(1) p')).rows[0].p;assert.equal(panel.people.length,1);assert.equal(panel.events.length,1);assert.equal(panel.registers.length,0);
 await assert.rejects(db.query('select v36_clase_panel(2)'),/propia clase/);
 await assert.rejects(db.query("select v36_guardar_clase(100,1,'punto',ARRAY[101]::bigint[],0)"),/Solo participantes/);
 await db.query("select v36_guardar_clase(100,1,'punto',ARRAY[100]::bigint[],0)");
 await assert.rejects(db.query("select v36_guardar_clase(100,1,'punto',ARRAY[100]::bigint[],0)"),/modificó/);
 await db.query("select v36_guardar_clase(100,1,'tarde',ARRAY[]::bigint[],0)");
 panel=(await db.query('select v36_clase_panel(1) p')).rows[0].p;assert.equal(panel.registers.length,2);assert.equal(panel.registers.find(r=>r.moment==='tarde').ids.length,0);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from asistencias')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from resumenes_servicios')).rows[0].n,0);
 await db.query('update usuarios set solo_asistencia=true where id=$1',[uid(4)]);
 await as(db,4);assert.deepEqual((await db.query('select v36_clase_panel(1) p')).rows[0].p.history,[]);
 await db.query("select v36_guardar_clase(100,1,'punto',ARRAY[]::bigint[],1)");
 await assert.rejects(db.query('select * from registros_encuentro_clases'),/permission denied/);
 await as(db,5);assert.equal((await db.query('select v36_clase_panel(2) p')).rows[0].p.registers.length,0);
 await assert.rejects(db.query("select v36_guardar_clase(100,1,'punto',ARRAY[]::bigint[],2)"),/Sin permiso/);
 await db.exec('reset role');await db.exec("update eventos set date=current_date-22 where id=100");await as(db,4);
 await assert.rejects(db.query("select v36_guardar_clase(100,1,'punto',ARRAY[]::bigint[],2)"),/plazo/);
 }finally{await db.close()}
});
