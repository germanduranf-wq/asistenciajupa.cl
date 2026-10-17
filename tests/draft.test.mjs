import test from 'node:test';import assert from 'node:assert/strict';
import {toggleDraft,effectiveMarks,draftConflicts} from '../src/attendance-draft.mjs';
import {encode,decode} from '../src/schema.mjs';
test('las marcas locales se revierten sin escritura y conservan versión original',()=>{
 const marks=[{person_id:'1',present:true,version:3}];
 const draft=toggleDraft({},marks,'1');assert.equal(draft['1'].present,false);assert.equal(draft['1'].version,3);
 assert.deepEqual(toggleDraft(draft,marks,'1'),{});
 assert.equal(effectiveMarks(marks,draft)[0].present,false);assert.equal(marks[0].present,true);
 assert.equal(draftConflicts([{person_id:'1',present:false,version:4}],draft).length,1);
});
test('adaptador de esquema conserva claves numéricas como identificadores estables de formulario',()=>{
 assert.deepEqual(decode({id:12,iglesia_id:3,nombres:'ANA',cuerpos_ids:[1,2],version:4}),{id:'12',class_id:'3',first_name:'ANA',body_ids:['1','2'],version:4});
 assert.deepEqual(encode({first_name:'ANA',class_id:'3',body_ids:['1']}),{nombres:'ANA',iglesia_id:'3',cuerpos_ids:['1']});
});
