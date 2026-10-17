import { today, addDays, CATEGORIES } from './domain.mjs';
export function createDemo() {
  const classes = ['Templo matriz', 'San Carlos', 'Carol Urzúa', 'Creta Norte', 'Las Brisas', 'San Guillermo'].map((name, i) => ({
    id: `c${i}`,
    name,
    kind: i === 0 ? 'Templo matriz' : i > 3 ? 'Local' : 'Clase',
    active: true
  }));
  const names = [['Germán', 'Durán'], ['Matías', 'Fuentes'], ['Benjamín', 'Soto'], ['Nicolás', 'Rojas'], ['Daniel', 'Muñoz'], ['Felipe', 'Vargas'], ['Samuel', 'Díaz'], ['Tomás', 'Vera'], ['Joaquín', 'Castro'], ['David', 'Molina'], ['Lucas', 'Pérez'], ['Esteban', 'Leiva'], ['Javiera', 'Torres'], ['Catalina', 'Silva'], ['Antonia', 'Reyes'], ['Valentina', 'Lagos'], ['Isidora', 'Morales'], ['Camila', 'Araya'], ['Fernanda', 'Vidal'], ['Daniela', 'Pinto'], ['Constanza', 'Tapia'], ['Belén', 'Bravo'], ['Sofía', 'Salas'], ['Francisca', 'Núñez']];
  const people = names.map(([first_name, last_name], i) => ({
    id: `p${i}`,
    first_name: first_name.toUpperCase(),
    last_name: last_name.toUpperCase(),
    class_id: `c${i % 6}`,
    category: CATEGORIES[i < 12 ? i === 0 ? 2 : i === 1 ? 4 : 0 : i === 12 ? 3 : i === 13 ? 5 : 1],
    rut: '',
    photo_path: null,
    active: true,
    created_at: new Date().toISOString()
  }));
  const t = today();
  const dow = new Date(`${t}T12:00:00Z`).getUTCDay();
  const friday = addDays(t, -((dow + 2) % 7));
  const visits = [];
  for (let w = 7; w >= 0; w--) {
    visits.push({
      id: `v${w}j`,
      date: addDays(friday, -w * 7),
      class_id: `c${(w + 2) % 6}`,
      group: 'Jóvenes',
      notes: '',
      version: 1
    });
    if (w % 2 === 0) visits.push({
      id: `v${w}s`,
      date: addDays(friday, -w * 7),
      class_id: `c${(w + 3) % 6}`,
      group: 'Señoritas',
      notes: '',
      version: 1
    });
  }
  visits.push({
    id: 'nextj',
    date: addDays(friday, 7),
    class_id: 'c1',
    group: 'Jóvenes',
    notes: '',
    version: 1
  }, {
    id: 'nexts',
    date: addDays(friday, 14),
    class_id: 'c3',
    group: 'Señoritas',
    notes: '',
    version: 1
  });
  const attendance = [];
  for (const v of visits.filter(v => v.date <= t)) {
    for (const [i, p] of people.entries()) {
      if (i < 12 === (v.group === 'Jóvenes') && (i + Number(v.id[1] || 0)) % 4 !== 0) attendance.push({
        visit_id: v.id,
        person_id: p.id,
        present: true,
        class_id: p.class_id,
        category: p.category,
        version: 1,
        updated_at: new Date().toISOString()
      });
    }
  }
  const responsibilities = visits.filter(v => v.date >= friday).flatMap(v => ['Predicación', 'Coordinación', 'Dirección del coro'].map((role, i) => ({
    id: `${v.id}-${i}`,
    visit_id: v.id,
    role,
    person_id: `p${(v.group === 'Jóvenes' ? 0 : 12) + i}`,
    actual_person_id: null,
    outcome: 'Pendiente',
    note: '',
    version: 1
  })));
  const data = {
    activity_modules: Object.entries({visita:'Visitas',reunion_encargados:'Reuniones de encargados JUPA',devocional:'Devocionales JUPA',escuela_dominical:'Escuela dominical',servicio_domingo:'Servicio del domingo',reunion_mensual:'Reunión mensual'}).map(([code,name])=>({code,name,enabled:true})),
    bodies: ['Comunicaciones JUPA','Audio JUPA','Enfermería JUPA','Secretaría JUPA','Coro JUPA'].map((name,i)=>({id:'body'+i,name,active:true})), bulletin_events: [], bulletin_highlights: [],
    account_permissions: ['visita','reunion_encargados','escuela_dominical','servicio_domingo','reunion_mensual','devocional'].map((module,i)=>({id:'perm'+i,profile_id:'demo-member',module,class_id:null,can_view:true,can_manage:true,can_export:true})),
    classes,
    people,
    visits,
    attendance,
    responsibilities,
    profiles: [{
      id: 'demo-admin',
      name: 'Administrador de prueba',
      username: 'admin',
      role: 'admin',
      active: true
    }, {
      id: 'demo-member',
      name: 'Encargado de prueba',
      username: 'encargado',
      role: 'encargado',
      active: true
    }],
    audit: []
  };
  for(const [i,p] of data.people.entries())p.body_ids=i%3===0?['body4','body0']:i%3===1?['body4']:[];
  for(const [code,name] of [['ensayo_coro','Ensayos Coro JUPA'],['evento_coro','Coro en evento JUPA']]){
   data.activity_modules.push({code,name,enabled:true});data.account_permissions.push({id:'perm-'+code,profile_id:'demo-member',module:code,class_id:null,can_view:true,can_manage:true,can_export:true});
  }
  for(const p of data.account_permissions)p.can_schedule=p.module==='visita';
  // Historial reproducible: ausencia prolongada, regreso reciente y participantes sin marcas.
  for(let offset=84;offset>=0;offset-=7){
   for(const type of ['ensayo_coro','reunion_encargados','devocional','escuela_dominical','servicio_domingo','reunion_mensual']){
    if(['ensayo_coro','reunion_encargados','devocional','reunion_mensual'].includes(type)&&offset%28!==0&&!(type==='ensayo_coro'&&offset%28===14))continue;
    const v={id:'demo-'+type+'-'+offset,date:addDays(t,-offset),class_id:'c1',group:'Todos',activity_type:type,status:'held',notes:'Ejemplo ficticio',version:1};data.visits.push(v);
    for(const [i,p]of data.people.entries()){
     if(type==='ensayo_coro'&&!p.body_ids.includes('body4'))continue;
     if(['escuela_dominical','servicio_domingo','reunion_mensual'].includes(type)&&p.class_id!=='c1')continue;
     if(type==='reunion_encargados'&&!/Encargad|Ayudante/.test(p.category))continue;
     if(i===0&&offset<49||i===3&&offset>0&&offset<70||i===4||(i+offset)%5===0)continue;
     data.attendance.push({visit_id:v.id,person_id:p.id,present:true,class_id:p.class_id,category:p.category,version:1});
    }
   }
  }
  data.visits.push({id:'demo-evento',date:t,class_id:'c0',group:'Todos',activity_type:'evento_coro',status:'pending',version:1,notes:'Participación del coro en el encuentro mensual JUPA',evento_id:'demo-publico'});
  data.bulletin_events.push({id:'demo-publico',kind:'jupa',date:t,title:'Encuentro mensual JUPA',host_ids:['c0','c1'],venue:'Templo Matriz',address:'Dirección ficticia de ejemplo',maps_url:'',preaching_place:'Plaza de ejemplo',morning_time:'10:00',evening_time:'18:00',published:true,version:1});
  data.bulletin_highlights.push({id:'aviso-demo',month:t.slice(0,7)+'-01',message:'Datos de demostración: acompáñanos en las actividades del mes.',published:true,version:1});
  return data;
}
