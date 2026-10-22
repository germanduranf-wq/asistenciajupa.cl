import test from 'node:test';
import assert from 'node:assert/strict';

test('cartas con conexión real: solicitud individual, mensual y error del servidor',async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 const requests=[];
 const letters=[{folio:'AJ 01',name:'PERSONA DE PRUEBA',visit_id:42,role:'Coordinación'}];
 let fail=false,api;
 globalThis.window={JUPA_CONFIG:{supabaseUrl:'https://jupa-test.invalid',supabaseAnonKey:'test-public-key'}};
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  assert.equal(url,'https://jupa-test.invalid/rest/v1/rpc/v3_emitir_cartas','La prueba solo permite esta solicitud simulada.');
  requests.push(JSON.parse(init.body));
  return new Response(JSON.stringify(fail?{message:'Sin acceso a cartas.',code:'42501'}:letters),{status:fail?403:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  api=await import('../src/api.mjs');
  assert.equal(api.isDemo(),false);
  assert.equal((await api.issueLetters('42'))[0].folio,'AJ 01');
  assert.equal((await api.issueLetters(null,'2026-10'))[0].folio,'AJ 01');
  assert.deepEqual(requests,[{p_visita:'42',p_mes:null},{p_visita:null,p_mes:'2026-10-01'}]);
  fail=true;
  await assert.rejects(()=>api.issueLetters('42'),/Sin acceso a cartas/);
 }finally{
  api?.supabase.auth.stopAutoRefresh();
  globalThis.fetch=previousFetch;
  if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
 }
});
