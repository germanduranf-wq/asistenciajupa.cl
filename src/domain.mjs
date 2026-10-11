export const CATEGORIES = ['Joven', 'Señorita', 'Encargado de jóvenes', 'Encargada de señoritas', 'Ayudante de jóvenes', 'Ayudante de señoritas'];
export const ROLES = ['Predicación', 'Coordinación', 'Dirección del coro'];
export const OUTCOMES = ['Pendiente', 'Cumplió', 'Se excusó', 'No asistió', 'Asistió sin realizar la función'];
export const normalize = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
export const upper = (s = '') => s.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-CL');
export const groupOf = category => [1, 3, 5].includes(CATEGORIES.indexOf(category)) ? 'Señoritas' : 'Jóvenes';
export const fullName = p => `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
export function today(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}-${p.find(x => x.type === 'day').value}`;
}
export function addDays(day, count) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export const canEdit = (visit, role, now = today()) => role === 'admin' || visit.date <= now && now <= addDays(visit.date, 21);
export const dateLabel = (day, options = {}) => new Date(`${day}T12:00:00`).toLocaleDateString('es-CL', {
  day: 'numeric',
  month: 'long',
  ...options
});
export function validRut(rut) {
  const r = normalize(rut).replace(/[.\s-]/g, '');
  if (!/^\d{7,8}[\dK]$/.test(r)) return false;
  let sum = 0,
    mul = 2;
  for (const c of r.slice(0, -1).split('').reverse()) {
    sum += Number(c) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const dv = 11 - sum % 11;
  return r.at(-1) === (dv === 11 ? '0' : dv === 10 ? 'K' : String(dv));
}
export const cleanRut = r => normalize(r).replace(/[.\s-]/g, '');
export function distance(a, b) {
  const row = Array.from({
    length: b.length + 1
  }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}
export const possibleDuplicates = (people, p) => {
  const name = normalize(fullName(p));
  if (name.length < 5) return [];
  return people.filter(x => x.id !== p.id && (p.rut && cleanRut(x.rut) === cleanRut(p.rut) || distance(normalize(fullName(x)), name) <= Math.max(1, Math.floor(name.length * .12))));
};
export function statistics(data, filters) {
  const visits = data.visits.filter(v => v.date >= filters.from && v.date <= filters.to && (!filters.group || v.group === filters.group));
  const ids = new Set(visits.map(v => v.id));
  const rows = data.attendance.filter(a => a.present && ids.has(a.visit_id) && (!filters.class_id || a.class_id === filters.class_id) && (!filters.category || a.category === filters.category));
  const peopleCount = new Map(),
    classCount = new Map(data.classes.map(c => [c.id, 0])),
    monthCount = new Map();
  for (const a of rows) {
    peopleCount.set(a.person_id, (peopleCount.get(a.person_id) || 0) + 1);
    classCount.set(a.class_id, (classCount.get(a.class_id) || 0) + 1);
    const month = visits.find(v => v.id === a.visit_id).date.slice(0, 7);
    monthCount.set(month, (monthCount.get(month) || 0) + 1);
  }
  const history = data.attendance.filter(a => a.present && (!filters.class_id || a.class_id === filters.class_id) && (!filters.category || a.category === filters.category)).map(a => ({
    ...a,
    visit: data.visits.find(v => v.id === a.visit_id)
  })).filter(a => a.visit && a.visit.date <= filters.to && (!filters.group || a.visit.group === filters.group));
  const days = Number(filters.days) || 42;
  const inactive = [],
    returned = [];
  for (const p of data.people.filter(p => p.active)) {
    const dates = [...new Set(history.filter(a => a.person_id === p.id).map(a => a.visit.date))].sort();
    if (!dates.length) continue;
    const last = dates.at(-1);
    if (last < addDays(filters.to, -days)) inactive.push({
      ...p,
      last
    });
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] >= filters.from && dates[i] > addDays(dates[i - 1], days)) {
        returned.push({
          ...p,
          last: dates[i]
        });
        break;
      }
    }
  }
  return {
    visits,
    rows,
    total: rows.length,
    unique: peopleCount.size,
    people: [...peopleCount].map(([id, count]) => ({
      ...data.people.find(p => p.id === id),
      count
    })).sort((a, b) => b.count - a.count),
    classes: [...classCount].filter(([id]) => !filters.class_id || id === filters.class_id).map(([id, count]) => ({
      ...data.classes.find(c => c.id === id),
      count
    })).sort((a, b) => b.count - a.count),
    months: [...monthCount].sort((a, b) => a[0].localeCompare(b[0])),
    inactive,
    returned
  };
}
