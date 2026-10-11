import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, usernameEmail } from '../src/username.mjs';
test('usuario normalizado e identidad determinista, sin aceptar correos ni caracteres ambiguos', () => {
  assert.equal(normalizeUsername(' German.Duran '), 'german.duran');
  assert.equal(usernameEmail(' German.Duran '), 'german.duran@usuarios.jupa.invalid');
  for (const value of ['', 'ab', 'a'.repeat(41), 'germán', 'a b', 'a@b.cl', '.admin', null]) {
    assert.throws(() => normalizeUsername(value));
  }
});
