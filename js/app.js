// Gränssnittet: filter, lista, dialoger och events.
import { VERSION } from './version.js';
import { t, lang, setLang, monthName, fmtDate, applyStatic } from './i18n.js';
import * as store from './store.js';
import {
  doy, span, monthSpan, overlaps, startDate, endDate, isoDate, toMD,
  doneSet, progress, isDone, overdueYear, matches, esc, uid, randomColor,
} from './model.js';
import { renderWheel } from './wheel.js';

const $ = id => document.getElementById(id);
const NOW_YEAR = new Date().getFullYear();

let wheel;              // aktivt hjul
let year = NOW_YEAR;    // visat år (styr bockar och idag-linje)
let month = null;       // vald månad 0–11, null = hela året
let focus = null;       // klickad uppgift (id)
let query = '';
let status = 'all';     // all | open | done
let unitFilter = null;  // null = alla, annars Set med enhets-id
let editing = null;     // id för uppgift i dialogen, null = ny

const persist = () => { try { store.save(wheel); } catch { alert(t('saveFailed')); } };
const unitOf = id => (Object.hasOwn(wheel.units, id) ? wheel.units[id] : null);
const color = x => unitOf(x.units[0])?.color ?? '#6b7280';
const unitNames = x => x.units.map(u => unitOf(u).name).join(', ');
const inUnits = x => !unitFilter || x.units.some(u => unitFilter.has(u));
const statusOk = (x, y) => status === 'all' || (status === 'done') === isDone(x, y);
const searchOk = x => !query || matches(x, query);
const fmtRange = (x, y) => `${fmtDate(startDate(x, y))} – ${fmtDate(endDate(x, y))}`;
const byStart = (a, b) => doy(a.start) - doy(b.start);

// ---- Rendering ---------------------------------------------------------------

function render() {
  const base = wheel.tasks.filter(inUnits);
  // Försenat visas bara när innevarande år visas: id → år för den olösta förekomsten.
  const late = new Map(year === NOW_YEAR ? base.map(x => [x.id, overdueYear(x)]).filter(([, y]) => y !== null) : []);
  renderChips();
  renderStatus();
  renderWheelView(base, late);
  renderPanel(base, late);
  renderFooter();
}

function renderChips() {
  const all = !unitFilter;
  const count = id => {
    const ts = wheel.tasks.filter(x => x.units.includes(id));
    return `${ts.filter(x => isDone(x, year)).length}/${ts.length}`;
  };
  $('chips').innerHTML =
    `<span class="label">${esc(t('units'))}:</span>
     <button class="chip${all ? ' on' : ''}" data-unit="*" aria-pressed="${all}">${esc(t('all'))}</button>` +
    Object.entries(wheel.units).map(([id, u]) => {
      const on = !all && unitFilter.has(id);
      return `<button class="chip${on ? ' on' : ''}" data-unit="${esc(id)}" aria-pressed="${on}">
        <i class="dot" style="background:${u.color}"></i>${esc(u.name || '—')} <small>${count(id)}</small></button>`;
    }).join('') +
    `<button class="chip ghost" data-action="units">✎ ${esc(t('manageUnits'))}</button>`;
}

function renderStatus() {
  $('status').innerHTML = ['all', 'open', 'done'].map(s =>
    `<button data-status="${s}" class="${s === status ? 'on' : ''}" aria-pressed="${s === status}">${esc(t(s))}</button>`).join('');
}

function renderWheelView(base, late) {
  renderWheel($('wheel'), {
    tasks: base.map(x => ({
      id: x.id, title: x.title, start: x.start, end: x.end, color: color(x), late: late.has(x.id),
      dim: !statusOk(x, year) || !searchOk(x) || (focus !== null && focus !== x.id),
      tip: `${x.title} (${fmtRange(x, year)})${x.units.length ? ' · ' + unitNames(x) : ''}`,
    })),
    year,
    todayDoy: year === NOW_YEAR ? doy(toMD(isoDate(new Date()))) : null,
    month,
    months: Array.from({ length: 12 }, (_, i) => {
      const [from, to] = monthSpan(i);
      return { short: monthName(i, 'short'), long: monthName(i), from, to };
    }),
    pct: base.length ? Math.round((100 * base.reduce((s, x) => s + progress(x, year), 0)) / base.length) : 0,
    lateCount: late.size,
    t,
  });
}

function card(x, y, isLate) {
  const done = doneSet(x, y);
  const items = x.items.length ? x.items : [t('markDone')];
  const badge = isLate
    ? `<span class="tag late-tag">${esc(t('lateBadge', fmtDate(startDate(x, y), { month: 'short', year: 'numeric' })))}</span>` : '';
  const tags = x.units.map(u => `<span class="tag">${esc(unitOf(u).name)}</span>`).join('');
  return `<article class="todo${isLate ? ' late' : ''}" style="--c:${color(x)}">
    <div class="todo-head"><button class="link" data-edit="${esc(x.id)}">${esc(x.title)}</button>
      <span class="todo-dates">${esc(fmtRange(x, y))}</span></div>
    ${badge || tags ? `<div class="tags">${badge}${tags}</div>` : ''}
    <div class="bar"><i style="width:${progress(x, y) * 100}%"></i></div>
    ${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}
    ${items.map((text, i) => `<label class="${done.has(i) ? 'done' : ''}"><input type="checkbox" data-task="${esc(x.id)}"
      data-year="${y}" data-item="${i}"${done.has(i) ? ' checked' : ''}><span>${esc(text)}</span></label>`).join('')}
  </article>`;
}

function renderPanel(base, late) {
  const mSpan = month === null ? null : monthSpan(month);
  const visible = x => searchOk(x) && (focus === null || focus === x.id);
  const lateList = status === 'done' ? [] : base.filter(x => late.has(x.id) && visible(x)).sort(byStart);
  const list = base.filter(x => visible(x) && statusOk(x, year) && late.get(x.id) !== year &&
    (!mSpan || focus !== null || overlaps(span(x), mSpan))).sort(byStart);
  const focused = wheel.tasks.find(x => x.id === focus);
  const title = focused ? focused.title : query ? t('searchResults')
    : `${month === null ? t('wholeYear') : monthName(month)} ${year}`;
  const filtered = month !== null || focus !== null || query;

  let h = `<div class="panel-head"><div><h2>${esc(title)}</h2>
    <div class="sub">${esc(t('nTasks', list.length + lateList.length))}</div></div>
    ${filtered ? `<button data-action="reset">${esc(t('showWholeYear'))}</button>` : ''}</div>`;
  if (lateList.length) h += `<h3 class="late-h">${esc(t('late'))}</h3>` + lateList.map(x => card(x, late.get(x.id), true)).join('');
  if (lateList.length && list.length) h += `<h3>${esc(month === null ? t('wholeYear') : monthName(month))}</h3>`;
  h += list.map(x => card(x, year, false)).join('');
  if (!list.length && !lateList.length) h += `<p class="empty">${esc(t('nothing'))}</p>`;
  $('panel').innerHTML = h;
}

function renderFooter() {
  const ts = Number(store.pref(`exported:${wheel.id}`)) || 0;
  $('version').textContent = `v${VERSION}`;
  $('backup').textContent = ts ? t('exported', fmtDate(new Date(ts), { dateStyle: 'medium' })) : t('neverExported');
  $('backup').classList.toggle('warn', wheel.tasks.length > 0 && Date.now() - ts > 30 * 864e5);
}

function renderWheelSelect() {
  $('wheel-select').innerHTML = store.list()
    .map(w => `<option value="${esc(w.id)}"${w.id === wheel.id ? ' selected' : ''}>${esc(w.name || '—')}</option>`).join('') +
    `<option value="__new">${esc(t('newWheel'))}</option>`;
}

function openWheel(w) {
  wheel = w;
  store.pref('last', w.id);
  month = focus = unitFilter = null;
  query = $('search').value = '';
  renderWheelSelect();
  render();
}

// Efter omritning: sätt tangentbordsfokus tillbaka på motsvarande element.
const refocus = (root, sel) => root.querySelector(sel)?.focus();
const dataSel = el => Object.entries(el.dataset).map(([k, v]) =>
  `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(v)}"]`).join('');

// ---- Hjul och lista ----------------------------------------------------------

function wheelAction(el) {
  const m = el.closest('[data-month]'), x = el.closest('[data-task]'), s = el.closest('[data-step]');
  if (m) { month = month === +m.dataset.month ? null : +m.dataset.month; focus = null; }
  else if (x) focus = focus === x.dataset.task ? null : x.dataset.task;
  else if (s) year += +s.dataset.step;
  else return;
  render();
}
$('wheel').addEventListener('click', e => wheelAction(e.target));
$('wheel').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  const sel = dataSel(e.target);
  wheelAction(e.target);
  if (sel) refocus($('wheel'), sel);
});

$('panel').addEventListener('change', e => {
  const { task, year: y, item } = e.target.dataset;
  if (!task) return;
  const x = wheel.tasks.find(x => x.id === task), set = doneSet(x, y);
  e.target.checked ? set.add(+item) : set.delete(+item);
  if (set.size) x.done[y] = [...set]; else delete x.done[y];
  const sel = dataSel(e.target);
  persist();
  render();
  refocus($('panel'), sel);
});

$('panel').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b?.dataset.edit) openTask(b.dataset.edit);
  else if (b?.dataset.action === 'reset') { month = focus = null; query = $('search').value = ''; render(); }
});

// ---- Filter och sök ----------------------------------------------------------

// Klick = visa en enhet, Ctrl/Cmd-klick = lägg till/ta bort fler, "Alla" = nollställ.
$('chips').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.action === 'units') return openUnits();
  const id = b.dataset.unit;
  if (id === '*') unitFilter = null;
  else if (e.ctrlKey || e.metaKey) {
    unitFilter ??= new Set();
    unitFilter.has(id) ? unitFilter.delete(id) : unitFilter.add(id);
    if (!unitFilter.size) unitFilter = null;
  } else unitFilter = new Set([id]);
  focus = null;
  render();
});

$('status').addEventListener('click', e => {
  const s = e.target.closest('[data-status]')?.dataset.status;
  if (s) { status = s; render(); refocus($('status'), `[data-status="${s}"]`); }
});

$('search').addEventListener('input', e => { query = e.target.value.trim(); focus = null; render(); });

// ---- Uppgiftsdialog ----------------------------------------------------------

const form = $('form-task'), field = n => form.elements[n];

function openTask(id) {
  const x = wheel.tasks.find(x => x.id === id);
  editing = x ? id : null;
  let s = new Date(), e = new Date();
  if (x) { s = startDate(x, year); e = endDate(x, year); }
  else if (month !== null) { s = new Date(year, month, 1); e = new Date(year, month + 1, 0); }
  else e.setDate(e.getDate() + 7);
  $('task-heading').textContent = t(x ? 'editTask' : 'newTask');
  field('title').value = x?.title ?? '';
  field('start').value = isoDate(s);
  field('end').value = isoDate(e);
  field('end').setCustomValidity('');
  field('note').value = x?.note ?? '';
  field('items').value = x ? x.items.join('\n') : '';
  const ids = Object.keys(wheel.units);
  const sel = new Set(x ? x.units : unitFilter ? [...unitFilter] : ids.length === 1 ? ids : []);
  $('task-units').innerHTML = Object.entries(wheel.units).map(([id, u]) =>
    `<label class="check"><input type="checkbox" name="unit" value="${esc(id)}"${sel.has(id) ? ' checked' : ''}>
      <i class="dot" style="background:${u.color}"></i>${esc(u.name || '—')}</label>`).join('') ||
    `<span class="muted">${esc(t('noUnits'))}</span>`;
  $('task-delete').hidden = !x;
  $('dlg-task').showModal();
}

// Checklistan ändrad: behåll bockar på punkter med samma text. År som var helt klara förblir klara.
function remapDone(x, items) {
  if (items.join('\n') === x.items.join('\n')) return;
  for (const y of Object.keys(x.done)) {
    const texts = new Set([...doneSet(x, y)].map(i => x.items[i]));
    const next = isDone(x, y)
      ? Array.from({ length: Math.max(1, items.length) }, (_, i) => i)
      : items.flatMap((s, i) => (texts.has(s) ? [i] : []));
    if (next.length) x.done[y] = next; else delete x.done[y];
  }
}

field('end').addEventListener('input', () => field('end').setCustomValidity(''));

form.addEventListener('submit', e => {
  e.preventDefault();
  const s = field('start').value, en = field('end').value, days = (new Date(en) - new Date(s)) / 864e5;
  if (!(days >= 0 && days < 366 && (days === 0 || toMD(s) !== toMD(en)))) {
    field('end').setCustomValidity(t('badRange'));
    return field('end').reportValidity();
  }
  const items = field('items').value.split('\n').map(s => s.trim()).filter(Boolean);
  let x = wheel.tasks.find(x => x.id === editing);
  if (x) remapDone(x, items);
  else wheel.tasks.push(x = { id: uid(), done: {}, created: isoDate(new Date()) });
  Object.assign(x, {
    title: field('title').value.trim(), start: toMD(s), end: toMD(en), note: field('note').value.trim(), items,
    units: [...form.querySelectorAll('[name=unit]:checked')].map(c => c.value),
  });
  persist();
  $('dlg-task').close();
  render();
});

$('task-delete').addEventListener('click', () => {
  const x = wheel.tasks.find(x => x.id === editing);
  if (!confirm(t('confirmDeleteTask', x.title))) return;
  wheel.tasks = wheel.tasks.filter(o => o !== x);
  if (focus === x.id) focus = null;
  persist();
  $('dlg-task').close();
  render();
});

$('btn-add').addEventListener('click', () => openTask(null));

// ---- Enheter -----------------------------------------------------------------

function renderUnitList() {
  $('unit-list').innerHTML = Object.entries(wheel.units).map(([id, u]) =>
    `<div class="unit-row" data-id="${esc(id)}">
      <input type="color" name="color" value="${u.color}" aria-label="${esc(t('color'))}">
      <input name="name" value="${esc(u.name)}" aria-label="${esc(t('unitName'))}">
      <button type="button" class="danger" data-del aria-label="${esc(t('delete'))}" title="${esc(t('delete'))}">✕</button>
    </div>`).join('') || `<p class="muted">${esc(t('noUnits'))}</p>`;
}

function openUnits() { renderUnitList(); $('dlg-units').showModal(); }

$('unit-list').addEventListener('input', e => {
  const u = wheel.units[e.target.closest('[data-id]').dataset.id];
  u[e.target.name] = e.target.value;
  persist();
  render();
});

$('unit-list').addEventListener('click', e => {
  if (!e.target.closest('[data-del]')) return;
  const id = e.target.closest('[data-id]').dataset.id;
  if (!confirm(t('confirmDeleteUnit', wheel.units[id].name))) return;
  delete wheel.units[id];
  wheel.tasks.forEach(x => { x.units = x.units.filter(u => u !== id); });
  unitFilter = null;
  persist();
  renderUnitList();
  render();
});

$('unit-add').addEventListener('click', () => {
  const id = uid();
  wheel.units[id] = { name: t('newUnitName'), color: randomColor() };
  persist();
  renderUnitList();
  render();
  $('unit-list').querySelector(`[data-id="${id}"] [name=name]`).select();
});

// ---- Hjul: välj, nytt, byt namn, ta bort -------------------------------------

function openWheelDialog() {
  $('form-wheel').elements.name.value = wheel.name;
  $('dlg-wheel').showModal();
  $('form-wheel').elements.name.select();
}

$('wheel-select').addEventListener('change', e => {
  if (e.target.value !== '__new') return openWheel(store.load(e.target.value) ?? wheel);
  const w = store.newWheel(t('defaultWheel'), t('defaultUnit'));
  try { store.save(w); } catch { alert(t('saveFailed')); }
  openWheel(w);
  openWheelDialog();
});

$('btn-wheel').addEventListener('click', openWheelDialog);

$('form-wheel').addEventListener('submit', e => {
  e.preventDefault();
  wheel.name = e.target.elements.name.value.trim();
  persist();
  $('dlg-wheel').close();
  renderWheelSelect();
});

$('wheel-delete').addEventListener('click', () => {
  if (!confirm(t('confirmDeleteWheel', wheel.name))) return;
  store.remove(wheel.id);
  $('dlg-wheel').close();
  start();
});

document.addEventListener('click', e => { if (e.target.closest('[data-close]')) e.target.closest('dialog').close(); });

// ---- Export / import ---------------------------------------------------------

$('btn-export').addEventListener('click', () => {
  const { name, blob } = store.exportFile(wheel);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  store.pref(`exported:${wheel.id}`, Date.now());
  renderFooter();
});

$('file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let w;
  try { w = store.parseImport(await file.text()); } catch { return alert(t('importFailed')); }
  if (store.load(w.id) && !confirm(t('confirmReplace', w.name))) return;
  try { store.save(w); } catch { return alert(t('saveFailed')); }
  openWheel(w);
});

// ---- Språk och start ---------------------------------------------------------

function applyLang() {
  applyStatic();
  $('btn-lang').textContent = t('otherLang');
  document.title = t('appName');
}

$('btn-lang').addEventListener('click', () => {
  setLang(t('otherLangCode'));
  store.pref('lang', lang);
  applyLang();
  renderWheelSelect();
  render();
});

// Öppna senaste hjulet, eller skapa ett första om inget finns.
function start() {
  const wheels = store.list(), last = store.pref('last');
  const id = wheels.some(w => w.id === last) ? last : wheels[0]?.id;
  let w = id && store.load(id);
  if (!w) {
    w = store.newWheel(t('defaultWheel'), t('defaultUnit'));
    try { store.save(w); } catch { /* lagring blockerad: kör i minnet */ }
  }
  openWheel(w);
}

setLang(store.pref('lang') || (navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en'));
applyLang();
start();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch(() => {});
