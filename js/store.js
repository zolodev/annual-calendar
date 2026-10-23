// Lagring i localStorage + validering av data (vid inläsning och import).
// Litet gränssnitt (list/load/save/remove) så att det kan bytas mot en server senare.
import { validMD, validRule, randomColor, uid, startDate, endDate, isoDate } from './model.js';

export const FORMAT = 1; // dataformatets version – höj och migrera i sanitize() vid ändrad struktur

const P = 'arshjul:';
const KEY = id => `${P}wheel:${id}`;
const ID = /^(?!__proto__$)[\w-]{1,64}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const YEAR = /^\d{4}$/;
const DATE = /^\d{4}-\d\d-\d\d$/;

const str = v => (typeof v === 'string' ? v : '');
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = v => (Array.isArray(v) ? v : []);

// Valfria fält på uppgifter och perioder (saknas i äldre data = ingen veckoregel, ingen påminnelse):
// rule = veckoregel (start/end finns kvar som datum för ett år, så att äldre versioner kan läsa hjulet),
// remind = påminnelse antal dagar före start (0 = samma dag).
function when(x) {
  const out = {};
  if (validRule(x.rule)) out.rule = { month: x.rule.month, nth: x.rule.nth, weeks: x.rule.weeks };
  if (Number.isInteger(x.remind) && x.remind >= 0 && x.remind <= 365) out.remind = x.remind;
  return out;
}

// Bygger ett rent hjul av okänd indata. Okända fält kastas. Kastar Error om formatet är fel.
export function sanitize(raw) {
  raw = obj(raw);
  if (!Number.isInteger(raw.format) || raw.format < 1 || raw.format > FORMAT) throw new Error('format');
  const units = {};
  for (const [k, u] of Object.entries(obj(raw.units))) {
    if (!ID.test(k)) continue;
    units[k] = { name: str(u?.name), color: HEX.test(u?.color) ? u.color : randomColor() };
  }
  const tasks = arr(raw.tasks)
    .filter(t => validMD(t?.start) && validMD(t?.end))
    .map(t => ({
      id: ID.test(t.id) ? t.id : uid(),
      title: str(t.title),
      units: [...new Set(arr(t.units).filter(u => Object.hasOwn(units, u)))],
      start: t.start,
      end: t.end,
      note: str(t.note),
      items: arr(t.items).filter(s => typeof s === 'string'),
      done: Object.fromEntries(Object.entries(obj(t.done))
        .filter(([y, v]) => YEAR.test(y) && Array.isArray(v))
        .map(([y, v]) => [y, [...new Set(v.filter(Number.isInteger))]])),
      created: DATE.test(t.created) ? t.created : '1970-01-01',
      notify: t.notify !== false, // notis när försenad (saknas = på)
      ...when(t),
    }));
  // Lediga perioder (semester, lov). year = null: varje år, annars bara det året.
  const periods = arr(raw.periods)
    .filter(p => validMD(p?.start) && validMD(p?.end))
    .map(p => ({
      id: ID.test(p.id) ? p.id : uid(),
      name: str(p.name),
      start: p.start,
      end: p.end,
      year: Number.isInteger(p.year) && p.year >= 1000 && p.year <= 9999 ? p.year : null,
      ...when(p),
    }));
  const w = { format: FORMAT, id: ID.test(raw.id) ? raw.id : uid(), name: str(raw.name), units, tasks, periods };
  if (raw.example === true) w.example = true; // exempelhjul (kan rensas när man skapar ett eget)
  return w;
}

// Nytt hjul. Utan unitName skapas det utan enheter.
export function newWheel(name, unitName) {
  const units = unitName ? { [uid()]: { name: unitName, color: randomColor() } } : {};
  return { format: FORMAT, id: uid(), name, units, tasks: [], periods: [] };
}

export function list() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith(`${P}wheel:`)) continue;
      const w = load(k.slice(P.length + 6));
      if (w) out.push({ id: w.id, name: w.name });
    }
  } catch { /* lagring blockerad */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Data från en nyare version (högre format) eller trasig JSON läses inte – men tas aldrig bort.
export function load(id) {
  try {
    const text = localStorage.getItem(KEY(id)), raw = JSON.parse(text), w = sanitize(raw);
    // Om valideringen tappade något (trasig uppgift, period eller enhet) sparas originalet orört först,
    // så att inget försvinner för gott när hjulet sparas nästa gång.
    const lost = arr(raw.tasks).length !== w.tasks.length || arr(raw.periods).length !== w.periods.length ||
      Object.keys(obj(raw.units)).length !== Object.keys(w.units).length;
    if (lost && localStorage.getItem(`${P}backup:${id}`) === null) localStorage.setItem(`${P}backup:${id}`, text);
    return w;
  } catch { return null; }
}

export const save = w => localStorage.setItem(KEY(w.id), JSON.stringify(w));
export const remove = id => localStorage.removeItem(KEY(id));

// Små inställningar (språk, senaste hjul, senaste export).
export function pref(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(P + k);
    localStorage.setItem(P + k, v);
  } catch { return null; }
}

export const parseImport = text => sanitize(JSON.parse(text));

// Inklistrad text: en delningskod (ARSHJUL1.…) eller innehållet i en exporterad fil (JSON).
// Telefoner byter ibland " mot “ ” när man klistrar via anteckningar – prova då med raka citattecken.
export async function parseText(text, today) {
  if (/ARSHJUL1\./.test(text)) return parseShareCode(text, today);
  try { return parseImport(text); } catch (e) {
    if (!/[“”„″]/.test(text)) throw e;
    return parseImport(text.replace(/[“”„″]/g, '"'));
  }
}

// ---- Delningskod: hjulet som komprimerad text (deflate + base64url), ingen server behövs.
// Koden saknar bockar och "skapad" sätts till idag (inget blir försenat direkt hos mottagaren).

const SHARE = 'ARSHJUL1.';
const MAX_CODE = 2_000_000, MAX_JSON = 10_000_000;

const squeeze = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

function b64u(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function shareCode(w) {
  const data = { ...w, tasks: w.tasks.map(x => ({ ...x, done: {} })) };
  return SHARE + b64u(await squeeze(enc.encode(JSON.stringify(data)), new CompressionStream('deflate-raw')));
}

// Tar koden ensam eller inklistrad i en länk/text. Kastar Error om den inte går att läsa.
export async function parseShareCode(text, today) {
  const m = /ARSHJUL1\.([A-Za-z0-9_-]+)/.exec(String(text).replace(/\s+/g, ''));
  if (!m || m[1].length > MAX_CODE) throw new Error('code');
  const json = new TextDecoder().decode(await squeeze(unb64u(m[1]), new DecompressionStream('deflate-raw')));
  if (json.length > MAX_JSON) throw new Error('size');
  const w = sanitize(JSON.parse(json));
  return { ...w, tasks: w.tasks.map(x => ({ ...x, done: {}, created: today })) };
}

// Kopia med nya id för hjul, enheter, uppgifter och perioder – krockar aldrig med originalet eller
// en tidigare kopia. id anges när kopian ska ersätta ett befintligt hjul ("skriv över").
export function copyWheel(w, id = uid()) {
  const ids = Object.fromEntries(Object.keys(w.units).map(u => [u, uid()]));
  const { example, ...rest } = w; // en kopia är aldrig ett exempel
  return {
    ...rest,
    id,
    units: Object.fromEntries(Object.entries(w.units).map(([u, v]) => [ids[u], v])),
    tasks: w.tasks.map(x => ({ ...x, id: uid(), units: x.units.map(u => ids[u]) })),
    periods: w.periods.map(p => ({ ...p, id: uid() })),
  };
}

const baseName = w => `minplan-${w.name.replace(/[^\p{L}\p{N}]+/gu, '-') || w.id}`;

export const exportText = w => JSON.stringify(w, null, 2);
export function exportFile(w) {
  return { name: `${baseName(w)}.json`, blob: new Blob([exportText(w)], { type: 'application/json' }) };
}

// ---- iCal (RFC 5545): varje uppgift = heldagshändelse som återkommer årligen, påminnelse kl. 9 på startdagen
// (eller remind dagar före). Veckoregel blir t.ex. BYMONTH=10;BYDAY=-1MO (sista måndagen i oktober).

const icsText = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[;,]/g, c => '\\' + c);
const icsDate = d => isoDate(d).replace(/-/g, '');
const enc = new TextEncoder();

// Rader längre än 75 byte viks; fortsättningsrader börjar med mellanslag.
function fold(line) {
  const out = [];
  let cur = '', n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > 73) { out.push(cur); cur = ''; n = 0; }
    cur += ch;
    n += b;
  }
  return [...out, cur].join('\r\n ');
}

// Tar ett hjul eller en lista av hjul (alla hamnar i samma kalender).
export function toICS(ws, year, now = new Date()) {
  ws = [].concat(ws);
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Arshjul//Arshjul//SV', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsText(ws.map(w => w.name).join(', '))}`];
  for (const w of ws) for (const x of w.tasks) {
    const end = endDate(x, year);
    end.setDate(end.getDate() + 1); // DTEND är exklusivt för heldagshändelser
    const desc = [x.note, ...x.items.map(i => `☐ ${i}`)].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${x.id}@arshjul`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(startDate(x, year))}`, `DTEND;VALUE=DATE:${icsDate(end)}`,
      `RRULE:FREQ=YEARLY${x.rule ? `;BYMONTH=${x.rule.month};BYDAY=${x.rule.nth}MO` : ''}`, `SUMMARY:${icsText(x.title)}`);
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    if (x.units.length) lines.push(`CATEGORIES:${x.units.map(u => icsText(w.units[u].name)).join(',')}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(x.title)}`, `TRIGGER:${x.remind ? `-PT${x.remind * 24 - 9}H` : 'PT9H'}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export const exportICS = (ws, year) => ({
  name: `${[].concat(ws).length === 1 ? baseName([].concat(ws)[0]) : 'minplan'}.ics`,
  blob: new Blob([toICS(ws, year)], { type: 'text/calendar' }),
});
