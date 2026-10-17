import React,{useState} from 'react';
import {fullName,normalize} from './domain.mjs';
export function PersonPicker({people,value,onChange,label='Seleccionar participante'}){
 const [query,setQuery]=useState('');
 const selected=people.find(p=>p.id===value);
 const matches=people.filter(p=>normalize(fullName(p)).includes(normalize(query)));
 const options=people.filter(p=>p.id===value||matches.includes(p)).sort((a,b)=>fullName(a).localeCompare(fullName(b)));
 return <div className="person-picker"><input type="search" aria-label={'Buscar: '+label} placeholder="Buscar nombre o apellido…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={label} value={value||''} onChange={e=>onChange(e.target.value)}><option value="">Por definir</option>{options.map(p=><option key={p.id} value={p.id}>{fullName(p)}</option>)}</select>{query&&<small>{matches.length} coincidencias{selected?' · Seleccionado: '+fullName(selected):''}</small>}</div>;
}
