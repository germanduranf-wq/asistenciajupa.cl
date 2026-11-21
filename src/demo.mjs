import { today, addDays, CATEGORIES, groupOf } from './domain.mjs';

// Exclusivamente datos locales de demostración; no se escriben en Supabase.
export function createDemo(referenceDate = today()) {
  const t = referenceDate;
  const classes = ['Templo matriz','San Carlos','Carol Urzúa','Creta Norte','Las Brisas','San Guillermo','Casas Viejas','San Ramón','Local Los Lirios','Local Concha y Toro'].map((name,i)=>({id:`c${i}`,name,kind:i===0?'Templo matriz':i>=8?'Local':'Clase',active:true,address:`Calle Ficticia ${100+i}`,commune:'Puente Alto',maps_url:''}));
  const bodies = ['Comunicaciones JUPA','Audio JUPA','Enfermería JUPA','Secretaría JUPA','Coro JUPA'].map((name,i)=>({id:`body${i}`,name,active:true}));
  const male=['Martín','Benjamín','Tomás','Lucas','Nicolás','Daniel','Felipe','Samuel','Joaquín'];
  const female=['Catalina','Javiera','Antonia','Valentina','Camila','Daniela','Sofía','Francisca','Isidora'];
  const surnames=['Ejemplo Rojas','Ejemplo Silva','Ejemplo Torres','Ejemplo Lagos','Ejemplo Castro','Ejemplo Soto','Ejemplo Vera','Ejemplo Díaz'];
  const cases=['Participación frecuente','Ausencia mayor a 21 días','Ausencia mayor a 42 días','Ausencia mayor a 90 días','Regresó después de más de 60 días','Sin asistencia registrada','Participación intermitente','Mayor participación reciente','Ficha inactiva con historial'];
  const people=Array.from({length:144},(_,i)=>{
    const c=Math.floor(i/18),slot=i%18,woman=slot>=9,scenario=slot%9;
    return {id:`p${i}`,first_name:(woman?female:male)[scenario],last_name:surnames[c],class_id:`c${c}`,secondary_class_id:scenario===6?`c${(c+1)%8}`:null,
      category:CATEGORIES[scenario===0?(woman?3:2):scenario===4?(woman?5:4):scenario===7?(woman?7:6):woman?1:0],
      body_ids:[...new Set([...(scenario!==5?['body4']:[]),...(scenario%2===0?[`body${(c+scenario)%4}`]:[])])],
      birth_date:`${Number(t.slice(0,4))-20-(i%29)}-${String(i%12+1).padStart(2,'0')}-${String(i%27+1).padStart(2,'0')}`,
      rut:'',photo_path:null,active:scenario!==8,created_at:addDays(t,-570)+'T12:00:00Z',
      phone:`+56 0 0000 ${String(i).padStart(4,'0')}`,contact_email:`participante${i+1}@example.invalid`,
      emergency_contact_name:`Contacto Ficticio ${i+1}`,emergency_phone:`+56 0 0001 ${String(i).padStart(4,'0')}`,
      full_address:`Pasaje de Demostración ${100+i}, Casa ${i%10+1}, Puente Alto (dirección ficticia)`,
      observations:`DATOS FICTICIOS. ${cases[scenario]}. Contactos de ejemplo no utilizables.`,demo_case:scenario};
  });
  const moduleNames={visita:'Visitas',reunion_encargados:'Reuniones de encargados JUPA',devocional:'Devocionales JUPA',servicio_jupa:'Servicio JUPA de la tarde',escuela_dominical:'Escuela dominical',servicio_domingo:'Servicio del domingo',reunion_mensual:'Reunión mensual',ensayo_coro:'Ensayos Coro JUPA',evento_coro:'Coro en evento JUPA'};
  const data={classes,bodies,people,visits:[],attendance:[],responsibilities:[],bulletin_events:[],bulletin_highlights:[],service_summaries:[],audit:[],
    activity_modules:Object.entries(moduleNames).map(([code,name])=>({code,name,enabled:true})),
    account_permissions:Object.keys(moduleNames).map((module,i)=>({id:`perm${i}`,profile_id:'demo-member',module,class_id:null,can_view:true,can_manage:true,can_export:true,can_schedule:true})),
    profiles:[{id:'demo-admin',name:'Administrador de prueba',username:'admin',role:'admin',active:true},{id:'demo-member',name:'Cuenta de prueba',username:'encargado',role:'encargado',active:true}]};
  const start=new Date(`${t}T12:00:00Z`); start.setUTCMonth(start.getUTCMonth()-18,1);
  const startDate=start.toISOString().slice(0,10);
  const shouldAttend=(p,date,sequence)=>{
    const days=Math.round((Date.parse(t)-Date.parse(date))/86400000),s=p.demo_case;
    if(s===5||s===1&&days<28||s===2&&days<49||s===3&&days<98||s===4&&days>21&&days<98||s===8&&days<120)return false;
    if([1,2,3,4].includes(s))return true;
    return (sequence+Number(p.id.slice(1))*3)%10 < (s===6?4:s===7?(days<90?9:3):8);
  };
  function activity(type,date,classId='c0',group='Todos',eventId=null){
    const index=data.visits.length;
    const v={id:`v${index}`,date,class_id:classId,group,activity_type:type,status:date<=t?'held':'pending',scheduled_time:type==='escuela_dominical'?'10:00':type==='devocional'?'10:30':'18:00',notes:'Actividad ficticia de demostración',version:1,...(eventId?{evento_id:eventId}:{})};
    data.visits.push(v);
    const local=['escuela_dominical','servicio_domingo','reunion_mensual'].includes(type);
    const eligible=people.filter(p=>(!local||p.class_id===classId)&&(type!=='visita'||groupOf(p.category)===group)&&(!['ensayo_coro','evento_coro'].includes(type)||p.body_ids.includes('body4'))&&(type!=='reunion_encargados'||/Encargad|Ayudante/.test(p.category)));
    if(date<=t)for(const p of eligible)if(shouldAttend(p,date,index))data.attendance.push({visit_id:v.id,person_id:p.id,present:true,class_id:p.class_id,category:p.category,version:1});
    if(type==='visita')for(const [j,role] of ['Predicación','Coordinación','Dirección del coro'].entries()){
      const candidates=eligible.filter(p=>p.active);const p=candidates[(index+j)%candidates.length];
      data.responsibilities.push({id:`r${index}-${j}`,visit_id:v.id,role,person_id:p.id,actual_person_id:date<=t?p.id:null,outcome:date<=t?'Cumplió':'Pendiente',note:'Asignación ficticia',version:1});
    }
    return v;
  }
  for(let date=startDate;date<=addDays(t,35);date=addDays(date,1)){
    const d=new Date(`${date}T12:00:00Z`),day=d.getUTCDate(),weekDay=d.getUTCDay();
    if(weekDay===5){activity('visita',date,`c${Math.floor(day/7)%8}`,'Jóvenes');activity('visita',date,`c${(Math.floor(day/7)+3)%8}`,'Señoritas');}
    if(weekDay===0)for(let c=0;c<8;c++){activity('escuela_dominical',date,`c${c}`);activity('servicio_domingo',date,`c${c}`);}
    if(day===10)for(let c=0;c<8;c++)activity('reunion_mensual',date,`c${c}`);
    if(day===8||day===22)activity('ensayo_coro',date);
    if(day===8)activity('reunion_encargados',date);
    if(day===24){
      const id=`evento-${date}`,host_ids=['c0',`c${d.getUTCMonth()%7+1}`];
      data.bulletin_events.push({id,kind:'jupa',date,title:'Encuentro mensual JUPA · Demostración',host_ids,venue:'Templo Matriz',address:'Calle Ficticia 100',morning_time:'10:30',evening_time:'18:00',preaching_place:'Plaza de Demostración',published:true,version:1});
      activity('devocional',date,'c0','Todos',id);activity('servicio_jupa',date,'c0','Todos',id);activity('evento_coro',date,'c0','Todos',id);
    }
  }
  data.bulletin_highlights.push({id:'aviso-demo',month:t.slice(0,7)+'-01',message:'Explora 144 participantes ficticios y 18 meses de actividades. Prueba los filtros de clase, jóvenes y señoritas, semestre y seguimiento de 21/42 días. Ningún contacto corresponde a una persona real.',published:true,version:1});
  return data;
}

