// Kör: bun test
import { test, expect } from 'bun:test';
import { doy, span, overlaps, monthSpan, isDone, overdueYear, assignLanes, esc, matches, randomColor, validMD } from '../js/model.js';
import { sanitize } from '../js/store.js';

const task = o => ({ id: 'a', title: 'T', units: [], start: '10-01', end: '10-31', note: '', items: [], done: {}, created: '2020-01-01', ...o });

test('dag på året', () => {
  expect(doy('01-01')).toBe(0);
  expect(doy('12-31')).toBe(364);
  expect(doy('02-29')).toBe(doy('02-28'));
  expect(validMD('02-29')).toBe(true);
  expect(validMD('02-30')).toBe(false);
  expect(validMD('13-01')).toBe(false);
});

test('uppgift över årsskiftet syns i januari', () => {
  const t = task({ start: '12-01', end: '01-20' });
  expect(span(t)).toEqual([334, 385]);
  expect(overlaps(span(t), monthSpan(0))).toBe(true);
  expect(overlaps(span(t), monthSpan(6))).toBe(false);
});

test('klar: alla punkter, eller egen bock utan punkter', () => {
  expect(isDone(task({ items: ['a', 'b'], done: { 2026: [0] } }), 2026)).toBe(false);
  expect(isDone(task({ items: ['a', 'b'], done: { 2026: [0, 1] } }), 2026)).toBe(true);
  expect(isDone(task({ done: { 2026: [0] } }), 2026)).toBe(true);
  expect(isDone(task({ done: { 2025: [0] } }), 2026)).toBe(false);
});

test('december 2025 ej klar → försenad i januari 2026', () => {
  const t = task({ start: '12-01', end: '12-15' });
  expect(overdueYear(t, new Date(2026, 0, 10))).toBe(2025);
  t.done[2025] = [0];
  expect(overdueYear(t, new Date(2026, 0, 10))).toBe(null);
});

test('pågående uppgift över årsskiftet är inte försenad', () => {
  const t = task({ start: '12-01', end: '01-20' });
  expect(overdueYear(t, new Date(2026, 0, 10))).toBe(2024); // förekomsten 2024-12 → 2025-01 är olöst
  t.done[2024] = [0];
  expect(overdueYear(t, new Date(2026, 0, 10))).toBe(null); // 2025-12 → 2026-01 pågår
  expect(overdueYear(t, new Date(2026, 0, 21))).toBe(2025);
});

test('nyskapad uppgift blir inte försenad för passerade datum', () => {
  const t = task({ start: '01-01', end: '01-31', created: '2026-10-06' });
  expect(overdueYear(t, new Date(2026, 9, 6))).toBe(null);
  expect(overdueYear(t, new Date(2027, 1, 1))).toBe(2027);
});

test('lanes utan tak, cirkulärt', () => {
  const ts = Array.from({ length: 50 }, (_, i) => task({ id: 'x' + i }));
  expect(assignLanes(ts).count).toBe(50);
  const { lane } = assignLanes([task({ id: 'a', start: '12-01', end: '01-20' }), task({ id: 'b', start: '01-10', end: '01-12' })]);
  expect(lane.get('a')).not.toBe(lane.get('b'));
});

test('esc och sök', () => {
  expect(esc('<img src=x onerror="a">')).not.toMatch(/[<>"]/);
  expect(matches(task({ title: 'Säkerhetsgenomgång' }), 'sakerhet')).toBe(true);
  expect(matches(task({ items: ['Byt lösenord'] }), 'LOSEN')).toBe(true);
});

test('slumpad färg är giltig hex', () => {
  for (let i = 0; i < 100; i++) expect(randomColor()).toMatch(/^#[0-9a-f]{6}$/);
});

test('sanitize: fel format avvisas, farliga värden rensas', () => {
  expect(() => sanitize({ format: 99 })).toThrow();
  expect(() => sanitize(null)).toThrow();
  const w = sanitize({
    format: 1, id: 'w1', name: 'N', evil: 1,
    units: { u1: { name: 'IT', color: 'red;background:url(x)' }, __proto__x: {}, 'bad id"': { name: 'x' } },
    tasks: [
      { id: 't1', title: '<b>', start: '10-01', end: '10-31', units: ['u1', 'nope', 'constructor'], items: ['a', 3], done: { 2026: [0, 'x'], abc: [1] } },
      { id: 't2', start: '13-01', end: '10-31' },
    ],
  });
  expect(w.evil).toBeUndefined();
  expect(Object.keys(w.units)).toEqual(['u1', '__proto__x']);
  expect(w.units.u1.color).toMatch(/^#[0-9a-f]{6}$/);
  expect(w.tasks.length).toBe(1);
  expect(w.tasks[0].units).toEqual(['u1']);
  expect(w.tasks[0].items).toEqual(['a']);
  expect(w.tasks[0].done).toEqual({ 2026: [0] });
  expect(w.tasks[0].title).toBe('<b>'); // lagras som text, escapas vid rendering
});
