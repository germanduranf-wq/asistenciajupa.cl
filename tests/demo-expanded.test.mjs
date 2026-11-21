import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo} from '../src/demo.mjs';
const d=createDemo('2026-11-21');
test('demo: 144 fichas ficticias completas, clases válidas y dos grupos',()=>{
 assert.equal(d.people.length,144);
 for(const p of d.people){assert.ok(d.classes.find(c=>c.id===p.class_id&&c.kind!=='Local'));for(const k of ['phone','contact_email','emergency_contact_name','emergency_phone','full_address','observations','birth_date'])assert.ok(p[k]);}
 for(const c of d.classes.filter(c=>c.kind!=='Local'))assert.equal(d.people.filter(p=>p.class_id===c.id).length,18);
});
test('demo: historial extenso sin referencias rotas ni marcas futuras o duplicadas',()=>{
 const visits=new Map(d.visits.map(v=>[v.id,v]));const keys=new Set();
 for(const a of d.attendance){assert.ok(visits.has(a.visit_id));assert.ok(d.people.some(p=>p.id===a.person_id));assert.ok(visits.get(a.visit_id).date<='2026-11-21');const key=a.visit_id+':'+a.person_id;assert.ok(!keys.has(key));keys.add(key);}
 assert.ok(d.visits.some(v=>v.date<'2026-01-01'));assert.ok(d.visits.some(v=>v.date>'2026-11-21'));
 assert.ok(JSON.stringify(d).length<4500000,'Respeta el presupuesto de almacenamiento local');
});
test('demo: ausencias y regresos verificables para cada clase y coro',()=>{
 for(let c=0;c<8;c++)for(const type of ['escuela_dominical','ensayo_coro','visita']){
 const dates=p=>d.attendance.filter(a=>a.person_id===p.id).map(a=>d.visits.find(v=>v.id===a.visit_id)).filter(v=>v.activity_type===type).map(v=>v.date).sort();
 for(const scenario of [1,2,3]){const p=d.people.find(p=>p.class_id===`c${c}`&&p.demo_case===scenario);const marks=dates(p);assert.ok(marks.length);const gap=(Date.parse('2026-11-21')-Date.parse(marks.at(-1)))/86400000;assert.ok(gap>=[28,49,98][scenario-1]);}
 const p=d.people.find(p=>p.class_id===`c${c}`&&p.demo_case===4);const marks=dates(p);assert.ok(marks.some((date,i)=>i&&(Date.parse(date)-Date.parse(marks[i-1]))/86400000>60));
 }
});
