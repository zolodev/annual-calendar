// Lagring i localStorage + validering av data (vid inläsning och import).
// Litet gränssnitt (list/load/save/remove) så att det kan bytas mot en server senare.
import { validMD, randomColor, uid } from './model.js';

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
    }));
  return { format: FORMAT, id: ID.test(raw.id) ? raw.id : uid(), name: str(raw.name), units, tasks };
}

export function newWheel(name, unitName) {
  return { format: FORMAT, id: uid(), name, units: { [uid()]: { name: unitName, color: randomColor() } }, tasks: [] };
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

export function load(id) {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY(id)))); } catch { return null; }
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

export function exportFile(w) {
  const name = `arshjul-${w.name.replace(/[^\p{L}\p{N}]+/gu, '-') || w.id}.json`;
  return { name, blob: new Blob([JSON.stringify(w, null, 2)], { type: 'application/json' }) };
}
