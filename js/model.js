// Ren logik utan DOM: datum → dag på året, status, försenat, sök, färger.
// Datum lagras som "MM-DD" (årslöst). Vinkel räknas på ett fast 365-dagarsår.

const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function validMD(s) {
  const m = /^(\d\d)-(\d\d)$/.exec(s);
  if (!m) return false;
  const mo = +m[1], d = +m[2];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= (mo === 2 ? 29 : MDAYS[mo - 1]);
}

const parts = md => md.split('-').map(Number);
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Dag på året 0–364. 29 feb räknas som 28 feb.
export function doy(md) {
  const [m, d] = parts(md);
  return CUM[m - 1] + Math.min(d, MDAYS[m - 1]) - 1;
}

// Slut före start = uppgiften går över årsskiftet.
export const wraps = t => t.end < t.start;

// Dagspann [start, slut) – slut kan vara > 365 vid årsskifte.
export function span(t) {
  const s = doy(t.start);
  let e = doy(t.end) + 1;
  if (wraps(t)) e += 365;
  return [s, e];
}

export const monthSpan = m => [CUM[m], m === 11 ? 365 : CUM[m + 1]];

// Överlapp på ett cirkulärt år.
export const overlaps = ([a0, a1], [b0, b1]) => [-365, 0, 365].some(k => a0 < b1 + k && b0 + k < a1);

export function dateOf(md, y) {
  const [m, d] = parts(md);
  return new Date(y, m - 1, m === 2 && d === 29 && !leap(y) ? 28 : d);
}
const md = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Veckoregel { month: 1–12, nth: 1–4 | -1 (sista) | -2 (näst sista), weeks: 1–26 }:
// perioden börjar på månadens n:e måndag och varar hela veckor (måndag–söndag).
// T.ex. sista veckan i oktober = { month: 10, nth: -1, weeks: 1 }.
export const NTHS = [1, 2, 3, 4, -2, -1];
export const validRule = r => !!r && Number.isInteger(r.month) && r.month >= 1 && r.month <= 12 &&
  NTHS.includes(r.nth) && Number.isInteger(r.weeks) && r.weeks >= 1 && r.weeks <= 26;
export function ruleStart(r, y) {
  const first = new Date(y, r.month - 1, 1), days = new Date(y, r.month, 0).getDate();
  const mondays = [];
  for (let d = 1 + ((8 - first.getDay()) % 7); d <= days; d += 7) mondays.push(d);
  return new Date(y, r.month - 1, mondays.at(r.nth > 0 ? r.nth - 1 : r.nth));
}
// Uppgiften/perioden med start och slut (MM-DD) för år y. Utan veckoregel: oförändrad.
export function inYear(t, y) {
  if (!t.rule) return t;
  const s = ruleStart(t.rule, y), e = new Date(s);
  e.setDate(e.getDate() + 7 * t.rule.weeks - 1);
  return { ...t, start: md(s), end: md(e) };
}
export const startDate = (t, y) => dateOf(inYear(t, y).start, y);
export function endDate(t, y) {
  const r = inYear(t, y);
  return dateOf(r.end, wraps(r) ? y + 1 : y);
}

// ISO 8601-veckonummer (måndag först, vecka 1 innehåller årets första torsdag).
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const w1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7);
}

export const isoDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const toMD = iso => iso.slice(5, 10);

// Giltigt datum skrivet exakt som ÅÅÅÅ-MM-DD (2026-02-31 är inte giltigt).
export function validISO(s) {
  if (!/^\d{4}-\d\d-\d\d$/.test(s)) return false;
  const [y, m, d] = parts(s), dt = new Date(y, m - 1, d);
  return y >= 1000 && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Status per år. Uppgift utan punkter har en egen bock (index 0).
export function doneSet(t, y) {
  const n = Math.max(1, t.items.length);
  return new Set((t.done[y] || []).filter(i => i >= 0 && i < n));
}
export const progress = (t, y) => doneSet(t, y).size / Math.max(1, t.items.length);
export const isDone = (t, y) => progress(t, y) >= 1;

// Året för uppgiftens senaste avslutade förekomst om den inte är klar, annars null.
// Förekomster som slutade innan uppgiften skapades räknas inte.
export function overdueYear(t, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [cy, cm, cd] = t.created.split('-').map(Number);
  const created = new Date(cy, cm - 1, cd);
  for (let y = today.getFullYear(); y >= today.getFullYear() - 2; y--) {
    const end = endDate(t, y);
    if (end < today) return end >= created && !isDone(t, y) ? y : null;
  }
  return null;
}

// Påminnelser som gäller idag: från "remind" dagar före start till och med sista dagen,
// för uppgifter (inte klara det året) och perioder (som gäller det året). key är unik per förekomst.
export function dueReminders(ws, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), Y = today.getFullYear(), out = [];
  for (const w of ws) {
    for (const x of [...w.tasks, ...w.periods]) {
      if (!Number.isInteger(x.remind)) continue;
      const task = 'title' in x;
      for (const y of [Y - 1, Y, Y + 1]) {
        if (!task && x.year !== null && x.year !== y) continue;
        const s = startDate(x, y), from = new Date(s);
        from.setDate(from.getDate() - x.remind);
        if (today < from || today > endDate(x, y) || (task && isDone(x, y))) continue;
        out.push({ key: `${w.id}/${x.id}/${y}`, name: task ? x.title : x.name, start: s, days: Math.round((s - today) / 864e5) });
      }
    }
  }
  return out;
}

// Lägg uppgifter i ringar så att de inte krockar. Inget tak på antal ringar.
export function assignLanes(tasks) {
  const lanes = [], lane = new Map();
  [...tasks].sort((a, b) => doy(a.start) - doy(b.start)).forEach(t => {
    const sp = span(t);
    let i = lanes.findIndex(l => !l.some(o => overlaps(o, sp)));
    if (i === -1) i = lanes.push([]) - 1;
    lanes[i].push(sp);
    lane.set(t.id, i);
  });
  return { lane, count: lanes.length };
}

// Sök utan hänsyn till versaler och diakritiska tecken (å/ä/ö matchar a/o).
export const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const matches = (t, q) => norm([t.title, t.note, ...t.items].join(' ')).includes(norm(q));

export const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export const uid = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');

// Slumpad, läsbar färg (hsl h, 65 %, 45 %) som #rrggbb.
export function randomColor() {
  const h = Math.random() * 360, s = 0.65, l = 0.45, a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
