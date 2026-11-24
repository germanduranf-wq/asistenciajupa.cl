import React,{useState} from 'react';
import {canArchiveActivity} from './access.mjs';
import {archiveActivity} from './api.mjs';
export function ArchiveActivityButton({profile,data,visit,onSaved}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!canArchiveActivity(profile,data,visit))return null;
 return <><button className="button secondary" disabled={busy} onClick={async()=>{
  if(!window.confirm('¿Eliminar esta actividad? Dejará de aparecer en el calendario y las estadísticas. Se conservarán las asistencias y responsabilidades; el administrador podrá restaurarla.'))return;
  setBusy(true);setError('');try{await archiveActivity(visit);await onSaved('Actividad eliminada');}catch(e){setError(e.message);}finally{setBusy(false);}
 }}>{busy?'Eliminando…':'Eliminar actividad'}</button>{error&&<p className="form-error" role="alert">{error}</p>}</>;
}
