import { today, addDays, CATEGORIES } from './domain.mjs';
export function createDemo() {
  const classes = ['Templo matriz', 'San Carlos', 'Caro Urzúa', 'Creta Norte', 'Local de ejemplo A', 'Local de ejemplo B'].map((name, i) => ({
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
  return {
    classes,
    people,
    visits,
    attendance,
    responsibilities,
    profiles: [{
      id: 'demo-admin',
      name: 'Administrador de prueba',
      email: 'admin@ejemplo.cl',
      role: 'admin',
      active: true
    }, {
      id: 'demo-member',
      name: 'Encargado de prueba',
      email: 'encargado@ejemplo.cl',
      role: 'encargado',
      active: true
    }],
    audit: []
  };
}
