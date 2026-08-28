const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, describe, compare } = require('../../src/services/flows/conditions');

const lead = { stage: 'proposal', score: 72, value: 60000, services: ['FCL', 'Aduanas'], country: 'México', tags: ['vip'], email: 'a@b.com' };

test('sin reglas siempre se cumple', () => {
  assert.equal(evaluate({ op: 'and', rules: [] }, lead), true);
  assert.equal(evaluate(null, lead), true);
});

test('AND exige todas las reglas', () => {
  const c = { op: 'and', rules: [{ field: 'score', cmp: 'gte', value: 70 }, { field: 'stage', cmp: 'eq', value: 'proposal' }] };
  assert.equal(evaluate(c, lead), true);
  assert.equal(evaluate(c, { ...lead, score: 10 }), false);
});

test('OR basta con una', () => {
  const c = { op: 'or', rules: [{ field: 'score', cmp: 'gte', value: 90 }, { field: 'value', cmp: 'gt', value: 50000 }] };
  assert.equal(evaluate(c, lead), true);
});

test('listas: contains, in, eq sobre arrays', () => {
  assert.equal(evaluate({ rules: [{ field: 'services', cmp: 'contains', value: 'fcl' }] }, lead), true);
  assert.equal(evaluate({ rules: [{ field: 'tags', cmp: 'eq', value: 'VIP' }] }, lead), true);
  assert.equal(evaluate({ rules: [{ field: 'stage', cmp: 'in', value: ['new', 'proposal'] }] }, lead), true);
  assert.equal(evaluate({ rules: [{ field: 'stage', cmp: 'nin', value: ['new', 'proposal'] }] }, lead), false);
});

test('booleanos derivados y contexto', () => {
  assert.equal(evaluate({ rules: [{ field: 'hasEmail', cmp: 'eq', value: true }] }, lead), true);
  assert.equal(evaluate({ rules: [{ field: 'hasWhatsapp', cmp: 'eq', value: true }] }, lead), false);
  assert.equal(evaluate({ rules: [{ field: 'hasReplied', cmp: 'eq', value: 'true' }] }, lead, { hasReplied: true }), true);
  assert.equal(evaluate({ rules: [{ field: 'aiResult', cmp: 'eq', value: 'interesado' }] }, lead, { lastAiResult: { category: 'interesado' } }), true);
});

test('campo desconocido no se cumple', () => {
  assert.equal(evaluate({ rules: [{ field: 'nope', cmp: 'eq', value: 1 }] }, lead), false);
});

test('exists / not_exists', () => {
  assert.equal(compare('', 'exists'), false);
  assert.equal(compare([], 'exists'), false);
  assert.equal(compare('x', 'not_exists'), false);
});

test('describe es legible', () => {
  assert.equal(describe({ op: 'or', rules: [{ field: 'score', cmp: 'gte', value: 50 }, { field: 'hasEmail', cmp: 'exists' }] }), 'Score IA ≥ 50 o Tiene correo existe');
  assert.equal(describe({ rules: [] }), 'Siempre');
});
