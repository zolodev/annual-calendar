// Kör: bun test
import { test, expect } from 'bun:test';
import { validISO, isoWeek, doy, span, overlaps, monthSpan, isDone, overdueYear, assignLanes, esc, matches, randomColor, validMD, ruleStart, inYear, startDate, endDate, isoDate, dueReminders } from '../js/model.js';
import { sanitize, toICS, shareCode, parseShareCode, copyWheel } from '../js/store.js';

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

test('notis per uppgift: på om fältet saknas', () => {
  const w = sanitize({ format: 1, tasks: [{ start: '01-01', end: '01-02' }, { start: '01-01', end: '01-02', notify: false }] });
  expect(w.tasks.map(x => x.notify)).toEqual([true, false]);
});

test('iCal: årligen återkommande heldagshändelser', () => {
  const w = sanitize({
    format: 1, name: 'Förvaltning', units: { u: { name: 'IT, drift', color: '#000000' } },
    tasks: [
      { id: 'a', title: 'Budget; runda 1', start: '10-15', end: '11-15', units: ['u'], note: 'Rad 1\nRad 2', items: ['Underlag'] },
      { id: 'b', title: 'Remiss ' + 'å'.repeat(60), start: '12-20', end: '01-10' },
    ],
  });
  const ics = toICS(w, 2026, new Date(Date.UTC(2026, 9, 10, 8, 0, 0)));
  const lines = ics.split('\r\n');
  expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(ics).toContain('DTSTAMP:20261010T080000Z');
  expect(ics).toContain('DTSTART;VALUE=DATE:20261015\r\nDTEND;VALUE=DATE:20261116');
  expect(ics).toContain('DTSTART;VALUE=DATE:20261220\r\nDTEND;VALUE=DATE:20270111'); // över årsskiftet
  expect(ics.match(/RRULE:FREQ=YEARLY/g).length).toBe(2);
  expect(ics).toContain('SUMMARY:Budget\\; runda 1');
  expect(ics).toContain('DESCRIPTION:Rad 1\\nRad 2\\n☐ Underlag');
  expect(ics).toContain('CATEGORIES:IT\\, drift');
  for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
});

test('iCal: flera hjul i samma kalender', () => {
  const a = sanitize({ format: 1, name: 'Jobb', units: { u: { name: 'IT', color: '#000000' } },
    tasks: [{ id: 'a', title: 'Budget', start: '10-15', end: '11-15', units: ['u'] }] });
  const b = sanitize({ format: 1, name: 'Hemma', units: { h: { name: 'Hus', color: '#000000' } },
    tasks: [{ id: 'b', title: 'Däck', start: '10-20', end: '10-25', units: ['h'] }] });
  const ics = toICS([a, b], 2026);
  expect(ics).toContain('X-WR-CALNAME:Jobb\\, Hemma');
  expect(ics.match(/BEGIN:VEVENT/g).length).toBe(2);
  expect(ics).toContain('CATEGORIES:IT');
  expect(ics).toContain('CATEGORIES:Hus'); // enhetens namn hämtas från rätt hjul
});

test('ISO-veckonummer', () => {
  expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
  expect(isoWeek(new Date(2026, 6, 6))).toBe(28);
  expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
  expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  expect(isoWeek(new Date(2024, 11, 30))).toBe(1);
});

test('lediga perioder: varje år eller bara ett år', () => {
  const w = sanitize({ format: 1, periods: [
    { id: 'p1', name: 'Semester', start: '07-06', end: '08-02' },
    { id: 'p2', name: 'Påsklov', start: '04-06', end: '04-10', year: 2026 },
    { id: 'p3', start: '99-01', end: '01-01' },
  ] });
  expect(w.periods.map(p => [p.id, p.year])).toEqual([['p1', null], ['p2', 2026]]);
  expect(sanitize({ format: 1 }).periods).toEqual([]);
});

test('datum som ÅÅÅÅ-MM-DD', () => {
  expect(validISO('2026-03-15')).toBe(true);
  expect(validISO('2028-02-29')).toBe(true);
  for (const bad of ['2026-02-29', '2026-02-31', '2026-13-01', '15/03/2026', '2026-3-15', '20260315', '', '0999-01-01'])
    expect(validISO(bad)).toBe(false);
});

test('delningskod + kopia: nya id, utan bockar', async () => {
  const w = sanitize({
    format: 1, id: 'orig', name: 'Förvaltning', units: { u: { name: 'IT', color: '#112233' } },
    tasks: [{ id: 't1', title: 'Budget <b>', start: '10-15', end: '11-15', units: ['u'], items: ['A'], done: { 2025: [0] }, created: '2020-01-01' }],
    periods: [{ id: 'p1', name: 'Jullov', start: '12-21', end: '01-06', year: null }],
  });
  const code = await shareCode(w);
  expect(code).toMatch(/^ARSHJUL1\.[A-Za-z0-9_-]+$/);
  const got = await parseShareCode(`Hej! Här är koden:\n${code}\n`, '2026-10-14');
  expect(got.tasks[0].done).toEqual({});
  const c = copyWheel(got);
  expect(c.id).not.toBe('orig');
  expect(c.name).toBe('Förvaltning');
  const [uid2] = Object.keys(c.units);
  expect(uid2).not.toBe('u');
  expect(c.units[uid2]).toEqual({ name: 'IT', color: '#112233' });
  expect(c.tasks[0]).toMatchObject({ title: 'Budget <b>', units: [uid2], done: {}, created: '2026-10-14', items: ['A'] });
  expect(c.tasks[0].id).not.toBe('t1');
  expect(c.periods[0]).toMatchObject({ name: 'Jullov', start: '12-21', year: null });
  expect(w.tasks[0].done).toEqual({ 2025: [0] }); // originalet orört
  // länkform och felaktiga koder
  expect((await parseShareCode(`https://x.se/#import=${code}`, '2026-10-14')).name).toBe('Förvaltning');
  await expect(parseShareCode('ARSHJUL1.inte-giltig', '2026-10-14')).rejects.toThrow();
  await expect(parseShareCode('hej', '2026-10-14')).rejects.toThrow();
});

test('kopia som skriver över behåller målets id', () => {
  const w = sanitize({ format: 1, id: 'a', name: 'A', units: { u: { name: 'IT', color: '#000000' } },
    tasks: [{ id: 't', title: 'X', start: '01-01', end: '01-02', units: ['u'], done: { 2026: [0] } }] });
  const c = copyWheel(w, 'mal');
  expect(c.id).toBe('mal');
  expect(c.tasks[0].done).toEqual({ 2026: [0] }); // filimport behåller bockar
  expect(Object.keys(c.units)[0]).not.toBe('u');
  expect(c.tasks[0].units).toEqual(Object.keys(c.units));
});

test('exempelhjulen är giltiga i båda språken', async () => {
  const { exampleWheels } = await import('../js/example.js');
  for (const lang of ['sv', 'en']) {
    const ws = exampleWheels(lang, new Date(2026, 9, 14));
    for (const w of ws) {
      const s = sanitize(w);
      expect(s.example).toBe(true);
      expect(s.tasks.length).toBe(w.tasks.length);
      expect(s.tasks.every(x => x.units.length > 0)).toBe(true);
      expect(copyWheel(s).example).toBeUndefined();
    }
    expect(ws[0].tasks.some(x => overdueYear(x, new Date(2026, 9, 14)) === 2025)).toBe(true); // visar försenat
  }
});

test('bara oförändrade exempel får rensas; oanvänt standardhjul känns igen', async () => {
  const { exampleWheels, isPristineExample, isUnusedDefault } = await import('../js/example.js');
  const [ex] = exampleWheels('sv').map(sanitize);
  expect(isPristineExample(ex)).toBe(true);
  const ticked = { ...ex, tasks: ex.tasks.map(x => ({ ...x, done: { 2030: [0] } })) };
  expect(isPristineExample(ticked)).toBe(true); // bockar räknas inte som ändring
  expect(isPristineExample({ ...ex, tasks: [...ex.tasks, { ...ex.tasks[0], id: 'egen' }] })).toBe(false); // egen uppgift
  expect(isPristineExample({ ...ex, tasks: ex.tasks.map((x, i) => (i ? x : { ...x, title: 'Ändrad' })) })).toBe(false);
  expect(isPristineExample({ ...ex, periods: [...ex.periods, { id: 'x', name: 'Påsklov', start: '04-01', end: '04-05', year: null }] })).toBe(false);
  expect(isPristineExample({ ...ex, example: undefined })).toBe(false);
  expect(isPristineExample({ id: 'std', example: true, tasks: [], periods: [] })).toBe(true); // tomt (f.d. standardhjul)

  const std = { name: 'My annual wheel', units: { a: { name: 'Me', color: '#000000' } }, tasks: [], periods: [] };
  expect(isUnusedDefault(std)).toBe(true);
  expect(isUnusedDefault({ ...std, tasks: [{}] })).toBe(false);
  expect(isUnusedDefault({ ...std, name: 'Jobbet' })).toBe(false);
  expect(isUnusedDefault({ ...std, units: { ...std.units, b: { name: 'IT', color: '#000000' } } })).toBe(false);
  expect(isUnusedDefault({ ...std, units: { a: { name: 'Kalle', color: '#000000' } } })).toBe(false);
});

test('bakåtkompatibelt: trasig post sparas undan, nyare format läses inte men tas inte bort', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k), key: i => [...mem.keys()][i], get length() { return mem.size; },
  };
  const { load, list } = await import('../js/store.js');
  const raw = JSON.stringify({ format: 1, id: 'a', name: 'A', units: {}, tasks: [
    { id: 't1', title: 'Ok', start: '01-01', end: '01-02' }, { id: 't2', title: 'Trasig', start: '13-40', end: '01-02' }] });
  mem.set('arshjul:wheel:a', raw);
  expect(load('a').tasks.length).toBe(1);
  expect(mem.get('arshjul:backup:a')).toBe(raw); // originalet med den trasiga uppgiften finns kvar
  mem.set('arshjul:wheel:b', JSON.stringify({ format: 99, id: 'b', name: 'Ny', units: {}, tasks: [] }));
  expect(load('b')).toBe(null);
  expect(list().map(w => w.id)).toEqual(['a']);
  expect(mem.has('arshjul:wheel:b')).toBe(true); // inte borttaget
  delete globalThis.localStorage;
});

test('veckoregel: sista veckan i oktober, två sista i december + två första i januari', () => {
  const black = { rule: { month: 10, nth: -1, weeks: 1 } };
  expect(isoDate(startDate(black, 2026))).toBe('2026-10-26'); // måndag
  expect(isoDate(endDate(black, 2026))).toBe('2026-11-01');   // söndag
  expect(isoDate(startDate(black, 2027))).toBe('2027-10-25');
  const jul = { rule: { month: 12, nth: -2, weeks: 4 } };
  expect(isoDate(startDate(jul, 2026))).toBe('2026-12-21');
  expect(isoDate(endDate(jul, 2026))).toBe('2027-01-17');     // över årsskiftet
  expect(inYear(jul, 2026)).toMatchObject({ start: '12-21', end: '01-17' });
  expect(isoDate(ruleStart({ month: 2, nth: 1, weeks: 1 }, 2027))).toBe('2027-02-01');
  expect(isoDate(ruleStart({ month: 9, nth: 4, weeks: 1 }, 2026))).toBe('2026-09-28');
  // Försenad räknas på årets datum.
  const t = task({ ...black, start: '10-26', end: '11-01', created: '2020-01-01' });
  expect(overdueYear(t, new Date(2026, 10, 2))).toBe(2026);
  expect(overdueYear(t, new Date(2026, 10, 1))).toBe(2025);
});

test('veckoregel och påminnelse: sparas, valideras, äldre data oförändrad, iCal', () => {
  const raw = { format: 1, id: 'w', name: 'W', units: {},
    tasks: [task({ id: 'a', rule: { month: 10, nth: -1, weeks: 1 }, remind: 7 }),
      task({ id: 'b', rule: { month: 13, nth: 9, weeks: 0 }, remind: -1 }), task({ id: 'c' })],
    periods: [{ id: 'p', name: 'Jul', start: '12-21', end: '01-17', year: null, rule: { month: 12, nth: -2, weeks: 4 }, remind: 0 }] };
  const w = sanitize(raw);
  expect(w.tasks[0]).toMatchObject({ rule: { month: 10, nth: -1, weeks: 1 }, remind: 7 });
  expect('rule' in w.tasks[1] || 'remind' in w.tasks[1]).toBe(false); // ogiltigt kastas, uppgiften finns kvar
  expect(Object.keys(w.tasks[2])).toEqual(Object.keys(sanitize({ ...raw, tasks: [task({ id: 'c' })] }).tasks[0]));
  expect('rule' in w.tasks[2]).toBe(false);
  expect(w.periods[0]).toMatchObject({ rule: { month: 12, nth: -2, weeks: 4 }, remind: 0 });
  const ics = toICS(w, 2026, new Date(Date.UTC(2026, 0, 1)));
  expect(ics).toContain('DTSTART;VALUE=DATE:20261026');
  expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1MO');
  expect(ics).toContain('TRIGGER:-PT159H');                  // 7 dagar före, kl. 9
  expect(ics.split('TRIGGER:PT9H').length - 1).toBe(2);       // utan påminnelse: som förut
});

test('påminnelser: från N dagar före till slutet, inte klara, en nyckel per förekomst', () => {
  const w = { id: 'w', tasks: [
    task({ id: 'a', start: '10-26', end: '11-01', remind: 7 }),
    task({ id: 'b', start: '10-26', end: '11-01', remind: 7, done: { 2026: [0] } }),
    task({ id: 'c', start: '10-26', end: '11-01' }),
  ], periods: [
    { id: 'p', name: 'Jul', start: '12-21', end: '01-17', year: null, rule: { month: 12, nth: -2, weeks: 4 }, remind: 0 },
    { id: 'q', name: 'Bara 2025', start: '10-20', end: '11-05', year: 2025, remind: 30 },
  ] };
  const on = d => dueReminders([w], d).map(r => `${r.key}:${r.days}`);
  expect(on(new Date(2026, 9, 18))).toEqual([]);
  expect(on(new Date(2026, 9, 19))).toEqual(['w/a/2026:7']);
  expect(on(new Date(2026, 10, 1))).toEqual(['w/a/2026:-6']);
  expect(on(new Date(2026, 10, 2))).toEqual([]);
  expect(on(new Date(2026, 11, 21))).toEqual(['w/p/2026:0']);
  expect(on(new Date(2027, 0, 10))).toEqual(['w/p/2026:-20']); // pågår över årsskiftet
});

test('import från inklistrad text: JSON, JSON med krokiga citattecken, delningskod', async () => {
  const { parseText } = await import('../js/store.js');
  const w = { format: 1, id: 'w', name: 'Hem', units: {}, tasks: [task({ done: { 2026: [0] } })], periods: [] };
  const json = JSON.stringify(w, null, 2);
  expect((await parseText(json, '2026-10-18')).tasks[0].done).toEqual({ 2026: [0] }); // som fil: bockar följer med
  expect((await parseText(json.replace(/"/g, (_, i) => (i % 2 ? '”' : '“')), '2026-10-18')).name).toBe('Hem');
  const code = await shareCode(w);
  expect((await parseText(`Här: ${code}`, '2026-10-18')).tasks[0].created).toBe('2026-10-18');
  await expect(parseText('hej', '2026-10-18')).rejects.toThrow();
});

test('exporterad text går att klistra in och ger samma hjul', async () => {
  const { parseText, exportText } = await import('../js/store.js');
  const w = sanitize({ format: 1, id: 'w', name: 'Hem', units: { u: { name: 'Bil', color: '#123456' } },
    tasks: [task({ units: ['u'], done: { 2026: [0] }, rule: { month: 10, nth: -1, weeks: 1 }, remind: 3 })], periods: [] });
  expect(await parseText(exportText(w), '2026-10-24')).toEqual(w);
});
