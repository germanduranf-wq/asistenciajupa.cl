import {TABLES,FIELDS,encode,decode} from './schema.mjs';
const column=s=>typeof s==='string'?s.replace(/\b[a-z_]+\b/g,k=>FIELDS[k]||k):s;
// Única frontera de compatibilidad; los datos persistidos usan el esquema español.
export function database(client){
 const wrap=q=>new Proxy(q,{get(target,key){
  if(key==='then')return (yes,no)=>target.then(r=>({...r,data:decode(r.data)})).then(yes,no);
  const fn=target[key];if(typeof fn!=='function')return fn;
  return (...args)=>{
   if(['insert','update','upsert'].includes(key))args[0]=Array.isArray(args[0])?args[0].map(encode):encode(args[0]);
   else if(['select','order','eq','neq','in','is','gte','lte','lt','gt','contains'].includes(key))args[0]=column(args[0]);
   return wrap(fn.apply(target,args));
  };
 }});
 return {from:t=>wrap(client.from(TABLES[t]||t)),rpc:async(name,args)=>{const r=await client.rpc('v3_'+name,args);return {...r,data:decode(r.data)};}};
}
