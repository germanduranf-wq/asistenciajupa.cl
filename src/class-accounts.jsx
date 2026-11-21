import React,{useState} from 'react';
import {Field,Button} from './ui.jsx';
import {generatePassword} from './access.mjs';
import * as api from './api.mjs';

export function ClassAccountsAdmin({data,onSaved}){
 const [password,setPassword]=useState(generatePassword),[busy,setBusy]=useState(false),[rows,setRows]=useState([]),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const classes=data.classes.filter(c=>c.active&&c.kind!=='Local');
 const run=async e=>{
  e.preventDefault();
  if(!window.confirm(`Crear las cuentas faltantes de ${classes.length} clases y Templo Matriz, conservando las existentes. ¿Continuar?`))return;
  setBusy(true);setRows([]);setError('');
  try{
   for(const c of classes){
    setProgress(c.name);
    try{const answer=await api.manageUser({action:'provision_class_accounts',class_id:c.id,password});if(!answer?.accounts)throw Error('Actualiza la función super-responder a V3.5.');setRows(old=>old.concat(answer.accounts.map(r=>({...r,className:c.name}))));}
    catch(err){setRows(old=>old.concat({className:c.name,status:'error',message:err.message}));}
   }
   await onSaved('Proceso de cuentas finalizado. Revisa el resultado de cada clase.');
  }catch(err){setError(err.message);}finally{setBusy(false);setProgress('');}
 };
 return <section className="panel settings-panel"><h2>Cuentas de las clases</h2><p>Crea las cuentas que faltan: <b>clase.jupa</b> para gestión y <b>clase.asistencia</b> solo para registrar. Incluye Templo Matriz y excluye los locales.</p><p>Las cuentas existentes conservan su usuario, permisos y contraseña. Las nuevas deberán cambiar su clave al primer ingreso. Los módulos deben estar habilitados en Actividades y permisos.</p><form onSubmit={run}><Field label="Contraseña temporal para las cuentas nuevas"><input type="text" required minLength={12} maxLength={128} autoComplete="off" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></Field><button type="button" className="text-button" disabled={busy} onClick={()=>setPassword(generatePassword())}>Generar otra contraseña</button><p className="hint">Copia la clave antes de salir y entrégala de forma privada. No se guardará visible. Puedes volver a ejecutar el proceso para completar cuentas faltantes.</p><Button className="button primary" type="submit" busy={busy} disabled={api.isDemo()}>Crear cuentas faltantes</Button></form>{busy&&<p role="status">Procesando {progress}… Mantén esta pantalla abierta.</p>}{error&&<p role="alert" className="form-error">{error}</p>}{rows.length>0&&<div className="table-scroll"><table><thead><tr><th>Clase</th><th>Usuario</th><th>Resultado</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.className}</td><td>{r.username||'—'}</td><td>{r.status==='created'?'Creada · clave temporal':r.status==='existing'?`Existente · sin cambios${r.active?'':' (inactiva)'}`:r.message}</td></tr>)}</tbody></table></div>}</section>;
}
