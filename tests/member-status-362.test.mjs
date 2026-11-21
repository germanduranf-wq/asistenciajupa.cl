import test from 'node:test';import assert from 'node:assert/strict';import {setup,as,uid} from './support/database.mjs';import {readFile} from 'node:fs/promises';import {canPerson} from '../src/access.mjs';
test('V3.6.2: clase general administra estado y borrado sin ampliar acceso ni perder historial',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros','202610230002_resumenes_secretaria','202610240001_formato_nombres','202611180001_navegacion_evento_eliminacion','202611180002_locales_sin_juventud','202611200001_contacto_miembros','202611200002_cuentas_asistencia_invitados','202611210001_seguimiento_encuentros_clases','202611210002_estado_miembros_clases']);
 try{
 await db.exec(await readFile(new URL('../supabase/migrations/202611210002_estado_miembros_clases.sql',import.meta.url),'utf8'));
 await db.exec(`insert into miembros(id,nombres,apellidos,iglesia_id,categoria) values(100,'Ana','Ejemplo',1,'Señorita'),(101,'Luis','Ejemplo',2,'Joven'),(102,'Borrar','Ejemplo',1,'Joven');insert into eventos(id,tipo,date,titulo,lugar,direccion,anfitrionas_ids,hora_manana,hora_tarde,punto_predicacion) values(100,'jupa',current_date,'Encuentro','Templo','Calle',ARRAY[1,2],'10:00','18:00','Plaza');`);
 await as(db,4);await db.query('update miembros set activo=false where id=100');assert.equal((await db.query('select activo from miembros where id=100')).rows[0].activo,false);
 await db.query('update miembros set activo=true where id=100');await assert.rejects(db.query('update miembros set iglesia_id=2 where id=100'),/central/);
 await assert.rejects(db.query("select v3_eliminar_miembro(101,'Luis Ejemplo','Ficha duplicada')"),/permiso/);
 await assert.rejects(db.query("select v3_eliminar_miembro(102,'Nombre Errado','Ficha duplicada')"),/nombre completo/);
 await db.query("select v3_eliminar_miembro(102,'Borrar Ejemplo','Ficha duplicada')");
 await db.query("select v36_guardar_clase(100,1,'punto',ARRAY[100]::bigint[],0)");
 await assert.rejects(db.query("select v3_eliminar_miembro(100,'Ana Ejemplo','Ya no participa')"),/historial/);
 await db.query('update miembros set activo=false where id=100');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from miembros_eliminados where miembro_id=102 and eliminado_por=$1',[uid(4)])).rows[0].n,1);
 assert.deepEqual((await db.query('select participantes_ids from registros_encuentro_clases')).rows[0].participantes_ids,[100]);
 await db.query('update usuarios set solo_asistencia=true where id=$1',[uid(4)]);await as(db,4);
 await assert.rejects(db.query("select v3_eliminar_miembro(100,'Ana Ejemplo','No corresponde')"),/permiso/);
 await db.query('update miembros set activo=true where id=100');await db.exec('reset role');assert.equal((await db.query('select activo from miembros where id=100')).rows[0].activo,false);
 }finally{await db.close()}
});
test('Interfaz: estado y borrado solo en clase propia, nunca cuenta limitada',()=>{
 const p={id:'u',role:'clase',active:true,class_id:'1'};for(const action of ['retire','delete','reactivate']){assert.equal(canPerson(p,{class_id:'1'},action),true);assert.equal(canPerson(p,{class_id:'2'},action),false);assert.equal(canPerson({...p,attendance_only:true},{class_id:'1'},action),false)}
});

