import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validRut, canEdit, today, statistics, possibleDuplicates, addDays } from '../src/domain.mjs';
test('búsqueda normaliza tildes y espacios y detecta nombres similares sin fusionarlos', () => {
  assert.equal(normalize('  Germán   Durán '), 'GERMAN DURAN');
  const people = [{
    id: '1',
    first_name: 'GERMÁN',
    last_name: 'DURÁN'
  }];
  assert.equal(possibleDuplicates(people, {
    first_name: 'Jerman',
    last_name: 'Duran'
  }).length, 1);
  assert.equal(people.length, 1);
});
test('RUT con dígito verificador válido y normalización', () => {
  assert.equal(validRut('12.345.678-5'), true);
  assert.equal(validRut('12.345.678-4'), false);
  assert.equal(validRut('12'), false);
});
test('plazo de edición incluye el día 21 y bloquea futuras visitas de encargados', () => {
  const v = {
    date: '2026-09-19'
  };
  assert.equal(canEdit(v, 'encargado', '2026-10-10'), true);
  assert.equal(canEdit(v, 'encargado', '2026-10-11'), false);
  assert.equal(canEdit(v, 'admin', '2030-01-01'), true);
  assert.equal(canEdit({
    date: '2026-10-11'
  }, 'encargado', '2026-10-10'), false);
});
test('fecha civil de Santiago y suma de días a través de mes', () => {
  assert.equal(today(new Date('2026-10-11T01:00:00Z')), '2026-10-10');
  assert.equal(addDays('2026-09-30', 21), '2026-10-21');
});
test('estadísticas diferencian personas únicas y participaciones; preservan clase histórica', () => {
  const data = {
    classes: [{
      id: 'a',
      name: 'A'
    }, {
      id: 'b',
      name: 'B'
    }],
    people: [{
      id: 'p',
      active: true,
      class_id: 'b'
    }],
    visits: [{
      id: 'v1',
      date: '2026-10-02',
      group: 'Jóvenes'
    }, {
      id: 'v2',
      date: '2026-10-09',
      group: 'Jóvenes'
    }],
    attendance: [{
      visit_id: 'v1',
      person_id: 'p',
      class_id: 'a',
      category: 'Joven',
      present: true
    }, {
      visit_id: 'v2',
      person_id: 'p',
      class_id: 'b',
      category: 'Joven',
      present: true
    }]
  };
  const s = statistics(data, {
    from: '2026-10-01',
    to: '2026-10-10'
  });
  assert.equal(s.total, 2);
  assert.equal(s.unique, 1);
  assert.equal(s.classes.find(c => c.id === 'a').count, 1);
  const filtered = statistics(data, {
    from: '2026-10-01',
    to: '2026-10-10',
    class_id: 'a'
  });
  assert.equal(filtered.total, 1);
});
