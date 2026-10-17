// Gränssnittet: filter, lista, dialoger och events.
import { VERSION } from './version.js';
import { t, lang, setLang, monthName, fmtDate, applyStatic } from './i18n.js';
import * as store from './store.js';
import {
  doy, span, monthSpan, overlaps, startDate, endDate, isoDate, toMD, validISO,
  doneSet, progress, isDone, overdueYear, matches, esc, uid, randomColor, isoWeek, inYear, NTHS, dueReminders,
} from './model.js';
import { renderWheel } from './wheel.js';
import { exampleWheels, isPristineExample, isUnusedDefault } from './example.js';

const $ = id => document.getElementById(id);
const NOW_YEAR = new Date().getFullYear();

let shown = [];         // visade hjul (ett eller flera, ritas i samma hjul)
let year = NOW_YEAR;    // visat år (styr bockar och idag-linje)
let month = null;       // vald månad 0–11, null = hela året
let focus = null;       // klickad uppgift (id)
let query = '';
let status = 'all';     // all | open | done
let unitFilter = null;  // null = alla, annars Set med enhets-id
let editing = null;     // id för uppgift i dialogen, null = ny
let layout = 'merged';  // merged = ett gemensamt hjul, split = hjulen sida vid sida

const persist = () => { try { shown.forEach(store.save); } catch { notify(t('saveFailed')); } };

// Bekräftelse och meddelanden i sidan (inte confirm/alert, som blockeras i inbäddade vyer).
function ask(text) {
  const d = $('dlg-confirm');
  $('confirm-text').textContent = text;
  d.returnValue = '';
  d.showModal();
  return new Promise(r => d.addEventListener('close', () => r(d.returnValue === 'yes'), { once: true }));
}

let toastTimer;
function notify(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
// Uppgifter och enheter från alla visade hjul. Enhets-id är slumpade och därmed unika mellan hjul.
const multi = () => shown.length > 1;
const allTasks = () => shown.flatMap(w => w.tasks);
const findTask = id => allTasks().find(x => x.id === id);
const ownerOf = x => shown.find(w => w.tasks.includes(x));
const unitWheel = id => shown.find(w => Object.hasOwn(w.units, id));
const unitOf = id => unitWheel(id)?.units[id] ?? null;
const allUnits = () => shown.flatMap(w => Object.entries(w.units));
const unitLabel = id => (multi() ? `${unitOf(id).name || '—'} · ${unitWheel(id).name || '—'}` : unitOf(id).name || '—');
const color = x => unitOf(x.units[0])?.color ?? '#6b7280';
const unitNames = x => x.units.map(u => unitOf(u).name).join(', ');
const inUnits = x => !unitFilter || x.units.some(u => unitFilter.has(u));
const statusOk = (x, y) => status === 'all' || (status === 'done') === isDone(x, y);
const searchOk = x => !query || matches(x, query);
const fmtRange = (x, y) => `${fmtDate(startDate(x, y))} – ${fmtDate(endDate(x, y))}`;
// Start/slut för visat år (uppgifter och perioder med veckoregel flyttar sig mellan åren).
const at = x => inYear(x, year);
const byStart = (a, b) => doy(at(a).start) - doy(at(b).start);

// Lediga perioder som gäller visat år, och veckor/datum för visning.
const periodsFor = y => shown.flatMap(w => w.periods).filter(p => p.year === null || p.year === y).sort(byStart);
const weeks = (p, y) => {
  const a = isoWeek(startDate(p, y)), b = isoWeek(endDate(p, y));
  return a === b ? t('week', a) : t('weeks', a, b);
};
const periodOwner = p => shown.find(w => w.periods.includes(p));
const periodTip = (p, y) =>
  `${p.name || t('period')} · ${weeks(p, y)} · ${fmtRange(p, y)}${multi() ? ` · ${periodOwner(p).name}` : ''}`;
const clashes = x => periodsFor(year).filter(p => overlaps(span(at(x)), span(at(p))));

// ---- Rendering ---------------------------------------------------------------

function render() {
  const base = allTasks().filter(inUnits);
  // Försenat visas bara när innevarande år visas: id → år för den olösta förekomsten.
  const late = new Map(year === NOW_YEAR ? base.map(x => [x.id, overdueYear(x)]).filter(([, y]) => y !== null) : []);
  renderWheels();
  renderChips();
  renderStatus();
  renderWheelView(base, late);
  renderPanel(base, late);
  renderFooter();
}

function renderChips() {
  const all = !unitFilter;
  const count = id => {
    const ts = allTasks().filter(x => x.units.includes(id));
    return `${ts.filter(x => isDone(x, year)).length}/${ts.length}`;
  };
  $('chips').innerHTML =
    `<span class="label">${esc(t('units'))}:</span>
     <button class="chip${all ? ' on' : ''}" data-unit="*" aria-pressed="${all}">${esc(t('all'))}</button>` +
    allUnits().map(([id, u]) => {
      const on = !all && unitFilter.has(id);
      return `<button class="chip${on ? ' on' : ''}" data-unit="${esc(id)}" data-drop-unit="${esc(id)}" aria-pressed="${on}"
        ${multi() ? `title="${esc(unitWheel(id).name)}"` : ''}>
        <i class="dot" style="background:${u.color}"></i>${esc(u.name || '—')} <small>${count(id)}</small></button>`;
    }).join('') +
    `<button class="chip ghost" data-action="add-unit">+ ${esc(t('newUnitName'))}</button>
     <button class="chip ghost" data-action="units">✎ ${esc(t('manageUnits'))}</button>`;
}

function renderStatus() {
  $('status').innerHTML = ['all', 'open', 'done'].map(s =>
    `<button data-status="${s}" class="${s === status ? 'on' : ''}" aria-pressed="${s === status}">${esc(t(s))}</button>`).join('');
}

// Samlat: ett hjul med allt. Sida vid sida: ett hjul per visat årshjul (samma filter, månad och år).
function renderWheelView(base, late) {
  const split = layout === 'split' && multi();
  const area = $('wheel-area');
  $('main').classList.toggle('split', split);
  const parts = split ? shown.map(w => [w, base.filter(x => w.tasks.includes(x))]) : [[null, base]];
  area.innerHTML = split
    ? `<div class="wheel-grid">${shown.map(w => `<figure><figcaption>${esc(w.name || '—')}</figcaption>
        <svg class="wheel" role="group" aria-label="${esc(w.name || '—')}"></svg></figure>`).join('')}</div>`
    : `<svg id="wheel" class="wheel" role="group" aria-label="${esc(t('appName'))}"></svg>`;
  const svgs = [...area.querySelectorAll('svg')];
  const views = parts.map(([w, tasks]) => wheelView(tasks, late, periodsFor(year).filter(p => !w || periodOwner(p) === w)));
  // Samma skala på alla hjul: rita igen med största radien.
  const minR = Math.max(...views.map((v, i) => renderWheel(svgs[i], v)));
  if (split) views.forEach((v, i) => renderWheel(svgs[i], { ...v, minR }));
}

function wheelView(base, late, periods) {
  return {
    periods: periods.map(p => ({ id: p.id, start: at(p).start, end: at(p).end, tip: periodTip(p, year) })),
    tasks: base.map(x => ({
      id: x.id, title: x.title, start: at(x).start, end: at(x).end, color: color(x), late: late.has(x.id),
      dim: !statusOk(x, year) || !searchOk(x) || (focus !== null && focus !== x.id),
      tip: `${x.title} (${fmtRange(x, year)})${x.units.length ? ' · ' + unitNames(x) : ''}${multi() ? ` · ${ownerOf(x).name}` : ''}`,
    })),
    year,
    todayDoy: year === NOW_YEAR ? doy(toMD(isoDate(new Date()))) : null,
    month,
    months: Array.from({ length: 12 }, (_, i) => {
      const [from, to] = monthSpan(i);
      return { short: monthName(i, 'short'), long: monthName(i), from, to };
    }),
    pct: base.length ? Math.round((100 * base.reduce((s, x) => s + progress(x, year), 0)) / base.length) : 0,
    lateCount: base.filter(x => late.has(x.id)).length,
    t,
  };
}

function card(x, y, isLate, from) {
  const done = doneSet(x, y);
  const items = x.items.length ? x.items : [t('markDone')];
  const badge = isLate
    ? `<span class="tag late-tag">${esc(t('lateBadge', fmtDate(startDate(x, y), { month: 'short', year: 'numeric' })))}</span>` : '';
  const tags = x.units.map(u => `<span class="tag">${esc(unitOf(u).name)}</span>`).join('') +
    clashes(x).map(p => `<span class="tag period-tag" title="${esc(t('clash'))}">${esc(p.name || t('period'))}</span>`).join('');
  return `<article class="todo${isLate ? ' late' : ''}" style="--c:${color(x)}" draggable="true"
      data-id="${esc(x.id)}" data-from="${esc(from)}">
    <div class="todo-head"><button class="link" data-edit="${esc(x.id)}">${esc(x.title)}</button>
      <span class="todo-dates">${esc(fmtRange(x, y))}</span>
      <button class="more" data-menu="task" data-id="${esc(x.id)}" data-from="${esc(from)}"
        aria-haspopup="menu" aria-label="${esc(t('taskMenu'))}" title="${esc(t('taskMenu'))}">⋯</button></div>
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
  // [uppgift, år, försenad]: försenade förekomster först (oavsett månad), sedan valt år/månad.
  const entries = [
    ...(status === 'done' ? [] : base.filter(x => late.has(x.id) && visible(x)).sort(byStart).map(x => [x, late.get(x.id), true])),
    ...base.filter(x => visible(x) && statusOk(x, year) && late.get(x.id) !== year &&
      (!mSpan || focus !== null || overlaps(span(at(x)), mSpan))).sort(byStart).map(x => [x, year, false]),
  ];
  const focused = findTask(focus);
  const title = focused ? focused.title : query ? t('searchResults')
    : `${month === null ? t('wholeYear') : monthName(month)} ${year}`;
  const filtered = month !== null || focus !== null || query;

  let h = `<div class="panel-head"><div><h2>${esc(title)}</h2>
    <div class="sub">${esc(t('nTasks', entries.length))}</div></div>
    ${filtered ? `<button data-action="reset">${esc(t('showWholeYear'))}</button>` : ''}</div>`;
  const ps = periodsFor(year).filter(p => !mSpan || overlaps(span(at(p)), mSpan));
  if (ps.length) h += `<div class="periods" aria-label="${esc(t('periods'))}">${ps.map(p =>
    `<button class="period-chip" data-period="${esc(p.id)}" title="${esc(t('editPeriod'))}"><i></i>
      <b>${esc(p.name || t('period'))}</b> <span>${esc(weeks(p, year))} · ${esc(fmtRange(p, year))}</span></button>`).join('')}</div>`;
  // Per hjul: en grupp per enhet (även tomma, så att man kan släppa uppgifter där) + "Utan enhet" om det behövs.
  let nGroups = 0;
  for (const w of shown) {
    const mine = entries.filter(([x]) => w.tasks.includes(x));
    const groups = Object.keys(w.units).filter(u => !unitFilter || unitFilter.has(u));
    // "Utan enhet" när det finns sådana uppgifter, eller när hjulet saknar enheter (så att det syns och tar emot uppgifter).
    if (mine.some(([x]) => !x.units.length) || (!unitFilter && !Object.keys(w.units).length)) groups.push('');
    nGroups += groups.length;
    if (multi() && groups.length) h += `<div class="wheel-head"><h3>${esc(w.name || '—')}</h3><small>${mine.length}</small>
      <button class="more" data-menu="wheel" data-id="${esc(w.id)}" aria-haspopup="menu"
        aria-label="${esc(t('wheelMenu'))}" title="${esc(t('wheelMenu'))}">⋯</button></div>`;
    h += renderGroups(mine, groups, w);
  }
  if (!nGroups) h += `<p class="empty">${esc(t('nothing'))}</p>`;
  $('panel').innerHTML = h;
}

function renderGroups(entries, groups, w) {
  let h = '';
  for (const g of groups) {
    const es = entries.filter(([x]) => (g ? x.units.includes(g) : !x.units.length));
    const nLate = es.filter(e => e[2]).length;
    h += `<section class="group" ${g ? `data-drop-unit="${esc(g)}"` : `data-drop-wheel="${esc(w.id)}"`}>
      <div class="group-head"><i class="dot" style="background:${g ? unitOf(g).color : 'var(--muted)'}"></i>
        <span class="group-name">${esc(g ? unitOf(g).name || '—' : t('noUnit'))}</span>
        <small>${es.length}</small>${nLate ? `<small class="late-count">${esc(t('nLate', nLate))}</small>` : ''}
        ${g ? `<button class="more" data-menu="unit" data-id="${esc(g)}" aria-haspopup="menu"
          aria-label="${esc(t('unitMenu'))}" title="${esc(t('unitMenu'))}">⋯</button>` : ''}</div>
      ${es.map(([x, y, isLate]) => card(x, y, isLate, g)).join('') || `<p class="drop-hint">${esc(t('dropHere'))}</p>`}
    </section>`;
  }
  return h;
}

function renderFooter() {
  // Äldsta exporten bland visade hjul styr påminnelsen.
  const ts = Math.min(...shown.map(w => Number(store.pref(`exported:${w.id}`)) || 0));
  $('version').textContent = `v${VERSION}`;
  $('backup').textContent = ts ? t('exported', fmtDate(new Date(ts), { dateStyle: 'medium' })) : t('neverExported');
  $('backup').classList.toggle('warn', allTasks().length > 0 && Date.now() - ts > 30 * 864e5);
}

// Hjulchips: klick visar/döljer hjulet i vyn, dubbelklick visar bara det hjulet.
// Alla hjul [id, namn], sorterade – även visade hjul som inte kunde sparas.
function wheelNames() {
  const names = new Map(store.list().map(w => [w.id, w.name]));
  shown.forEach(w => names.set(w.id, w.name));
  return [...names].sort((a, b) => a[1].localeCompare(b[1]));
}

function renderWheels() {
  const on = new Set(shown.map(w => w.id));
  $('wheels').innerHTML = `<span class="label">${esc(t('wheels'))}:</span>` +
    wheelNames().map(([id, name]) =>
      `<span class="wchip"><button class="chip${on.has(id) ? ' on' : ''}" data-wheel="${esc(id)}" aria-pressed="${on.has(id)}"
        title="${esc(t('wheelToggle'))}">${esc(name || '—')}</button><button class="more" data-menu="wheel" data-id="${esc(id)}"
        aria-haspopup="menu" aria-label="${esc(t('wheelMenu'))}" title="${esc(t('wheelMenu'))}">⋯</button></span>`).join('') +
    `<button class="chip ghost" data-action="new-wheel">${esc(t('newWheel'))}</button>
     <button class="chip ghost" data-action="from-code">${esc(t('fromCode'))}</button>` +
    (multi() ? `<span class="seg layout" role="group" aria-label="${esc(t('layout'))}">${['merged', 'split'].map(l =>
      `<button data-layout="${l}" class="${l === layout ? 'on' : ''}" aria-pressed="${l === layout}"
        title="${esc(t(l + 'Hint'))}">${esc(t(l))}</button>`).join('')}</span>` : '');
}

// Visa dessa hjul (behåller redan inlästa objekt). Filter nollställs eftersom enheterna ändras.
function show(ids) {
  const keep = new Map(shown.map(w => [w.id, w]));
  shown = [...new Set(ids)].map(id => keep.get(id) ?? store.load(id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  store.pref('shown', shown.map(w => w.id).join(','));
  month = focus = unitFilter = null;
  query = $('search').value = '';
  render();
}
const shownIds = () => shown.map(w => w.id);

// Efter omritning: sätt tangentbordsfokus tillbaka på motsvarande element.
const refocus = (root, sel) => root.querySelector(sel)?.focus();
const dataSel = el => Object.entries(el.dataset).map(([k, v]) =>
  `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(v)}"]`).join('');

// ---- Hjul och lista ----------------------------------------------------------

function wheelAction(el) {
  const m = el.closest('[data-month]'), x = el.closest('[data-task]'), s = el.closest('[data-step]');
  const per = el.closest('[data-period]');
  if (per) return openPeriod(per.dataset.period);
  if (m) { month = month === +m.dataset.month ? null : +m.dataset.month; focus = null; }
  else if (x) focus = focus === x.dataset.task ? null : x.dataset.task;
  else if (s) year += +s.dataset.step;
  else return;
  render();
}
$('wheel-area').addEventListener('click', e => wheelAction(e.target));
$('wheel-area').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  const sel = dataSel(e.target);
  wheelAction(e.target);
  if (sel) refocus($('wheel-area'), sel);
});

$('panel').addEventListener('change', e => {
  const { task, year: y, item } = e.target.dataset;
  if (!task) return;
  const x = findTask(task), set = doneSet(x, y);
  e.target.checked ? set.add(+item) : set.delete(+item);
  if (set.size) x.done[y] = [...set]; else delete x.done[y];
  const sel = dataSel(e.target);
  persist();
  render();
  refocus($('panel'), sel);
});

$('panel').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b?.dataset.cmd || b?.dataset.menu) return;
  if (b?.dataset.period) return openPeriod(b.dataset.period);
  if (b?.dataset.edit) openTask(b.dataset.edit);
  else if (b?.dataset.action === 'reset') { month = focus = null; query = $('search').value = ''; render(); }
});

// ---- Meny per uppgift, enhet och hjul ----------------------------------------------

function openMenu(btn) {
  closeMenu();
  const { menu, id, from = '' } = btn.dataset;
  const items = {
    task: () => [['edit', t('edit')],
      ...allUnits().filter(([u]) => u !== from && !findTask(id).units.includes(u)).map(([u]) => [`move:${u}`, t('moveTo', unitLabel(u))]),
      ['delete', t('delete'), 'danger']],
    unit: () => [['add', t('addTaskHere')], ['units', t('editUnit')], ['delete', t('deleteUnit'), 'danger']],
    wheel: () => [['rename', t('wheelSettings')], ['only', t('showOnly')], ['share', t('share')], ['export', t('export')],
      ['delete', t('deleteWheel'), 'danger']],
  }[menu]();
  const m = Object.assign(document.createElement('div'), { className: 'menu' });
  m.setAttribute('role', 'menu');
  Object.assign(m.dataset, { menu, id, from });
  m.innerHTML = items.map(([cmd, label, cls = '']) =>
    `<button role="menuitem" class="${cls}" data-cmd="${esc(cmd)}">${esc(label)}</button>`).join('');
  btn.after(m);
  btn.setAttribute('aria-expanded', 'true');
  m.querySelector('button').focus();
}

function closeMenu() {
  document.querySelector('.menu')?.remove();
  document.querySelector('[data-menu][aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
}

function runMenu(b) {
  const { menu, id, from } = b.closest('.menu').dataset, cmd = b.dataset.cmd;
  closeMenu();
  if (menu === 'wheel') return wheelCmd(cmd, id);
  if (cmd === 'edit') openTask(id);
  else if (cmd.startsWith('move:')) moveTask(id, from, cmd.slice(5));
  else if (cmd === 'add') openTask(null, id);
  else if (cmd === 'units') openUnits(id);
  else if (menu === 'task') deleteTask(id);
  else deleteUnit(id);
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b?.dataset.cmd && b.closest('.menu')) return runMenu(b);
  if (b?.dataset.menu) return b.getAttribute('aria-expanded') === 'true' ? closeMenu() : openMenu(b);
  if (!e.target.closest('.menu')) closeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !document.querySelector('.menu')) return;
  const btn = document.querySelector('[data-menu][aria-expanded="true"]');
  closeMenu();
  btn?.focus();
});

// ---- Flytta uppgift mellan enheter (dra och släpp, eller via menyn) -------------
// Enhet i ett annat hjul: uppgiften flyttas till det hjulet och får bara den enheten.

function moveTask(id, from, to) {
  const x = findTask(id), src = x && ownerOf(x), dst = unitWheel(to);
  if (!x || !dst || from === to) return;
  if (src === dst) x.units = [...new Set([...x.units.filter(u => u !== from), to])];
  else {
    src.tasks = src.tasks.filter(o => o !== x);
    dst.tasks.push(x);
    x.units = [to];
  }
  persist();
  render();
  notify(t('moved', x.title, unitLabel(to)));
}

// Släpp i "Utan enhet": uppgiften tas bort från enheten den drogs från, eller flyttas till det hjulet utan enhet.
function moveToWheel(id, from, wid) {
  const x = findTask(id), src = x && ownerOf(x), dst = shown.find(w => w.id === wid);
  if (!x || !dst) return;
  if (src === dst) {
    if (!x.units.includes(from)) return;
    x.units = x.units.filter(u => u !== from);
  } else {
    src.tasks = src.tasks.filter(o => o !== x);
    dst.tasks.push(x);
    x.units = [];
  }
  persist();
  render();
  notify(t('moved', x.title, multi() ? `${t('noUnit')} · ${dst.name || '—'}` : t('noUnit')));
}

let dragging = null; // { id, from }
const dropZone = e => dragging && e.target.closest?.('[data-drop-unit], [data-drop-wheel]');
const sameZone = z => (z.dataset.dropUnit !== undefined ? z.dataset.dropUnit === dragging.from
  : dragging.from === '' && ownerOf(findTask(dragging.id))?.id === z.dataset.dropWheel);
const clearDrop = () => document.querySelectorAll('.drop-over').forEach(el => el.classList.remove('drop-over'));

$('panel').addEventListener('dragstart', e => {
  const c = e.target.closest?.('.todo[draggable]');
  if (!c) return;
  dragging = { id: c.dataset.id, from: c.dataset.from };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', c.dataset.id);
  c.classList.add('dragging');
  document.body.classList.add('is-dragging');
});
document.addEventListener('dragover', e => {
  const z = dropZone(e);
  clearDrop();
  if (!z || sameZone(z)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  z.classList.add('drop-over');
});
document.addEventListener('drop', e => {
  const z = dropZone(e);
  if (!z) return;
  e.preventDefault();
  if (z.dataset.dropWheel) moveToWheel(dragging.id, dragging.from, z.dataset.dropWheel);
  else moveTask(dragging.id, dragging.from, z.dataset.dropUnit);
});
document.addEventListener('dragend', () => {
  dragging = null;
  clearDrop();
  document.body.classList.remove('is-dragging');
  document.querySelector('.dragging')?.classList.remove('dragging');
});

// ---- Filter och sök ----------------------------------------------------------

// Klick = visa en enhet, Ctrl/Cmd-klick = lägg till/ta bort fler, "Alla" = nollställ.
$('chips').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.action === 'units') return openUnits();
  if (b.dataset.action === 'add-unit') return addUnit();
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

// Hjulväljare i dialogerna – visas bara när flera hjul visas.
function fillWheelPick(sel, w) {
  sel.innerHTML = shown.map(o => `<option value="${esc(o.id)}"${o === w ? ' selected' : ''}>${esc(o.name || '—')}</option>`).join('');
  sel.closest('label').hidden = !multi();
}
const pickedWheel = sel => shown.find(w => w.id === sel.value) ?? shown[0];

// Grupper per visat hjul. Kryssas grupper (eller hjulet) i flera hjul hamnar uppgiften i vart och ett
// som en egen kopia med egen status – inte en länk.
function renderTaskUnits(wsel, usel) {
  const boxes = w => Object.entries(w.units).map(([id, u]) =>
    `<label class="check"><input type="checkbox" name="unit" value="${esc(id)}" data-wheel="${esc(w.id)}"${usel.has(id) ? ' checked' : ''}>
      <i class="dot" style="background:${u.color}"></i>${esc(u.name || '—')}</label>`).join('');
  $('task-units').innerHTML = multi()
    ? shown.map(w => `<div class="pick-wheel"><label class="check wheel-check"><input type="checkbox" name="twheel"
        value="${esc(w.id)}"${wsel.has(w.id) ? ' checked' : ''}><b>${esc(w.name || '—')}</b></label>
        <div class="checks">${boxes(w)}</div></div>`).join('')
    : `<div class="checks">${boxes(shown[0]) || `<span class="muted">${esc(t('noUnits'))}</span>`}</div>`;
  $('task-units-hint').hidden = !multi();
}

// Grupp ikryssad → dess hjul ikryssat. Hjul urkryssat → dess grupper urkryssade.
$('task-units').addEventListener('change', e => {
  const c = e.target;
  form.querySelectorAll('[name=twheel]').forEach(b => b.setCustomValidity(''));
  const box = c.name === 'unit' && c.checked && form.querySelector(`[name=twheel][value="${CSS.escape(c.dataset.wheel)}"]`);
  if (box) box.checked = true;
  if (c.name === 'twheel' && !c.checked) form.querySelectorAll(`[name=unit][data-wheel="${CSS.escape(c.value)}"]`).forEach(u => { u.checked = false; });
});

function openTask(id, unit = null) {
  const x = findTask(id);
  editing = x ? id : null;
  let s = new Date(), e = new Date();
  if (x) { s = startDate(x, year); e = endDate(x, year); }
  else if (month !== null) { s = new Date(year, month, 1); e = new Date(year, month + 1, 0); }
  else e.setDate(e.getDate() + 7);
  $('task-heading').textContent = t(x ? 'editTask' : 'newTask');
  field('title').value = x?.title ?? '';
  fillWhen(form, x, s, e);
  field('note').value = x?.note ?? '';
  field('items').value = x ? x.items.join('\n') : '';
  field('notify').checked = x ? x.notify : true;
  const w = x ? ownerOf(x) : unitWheel(unit ?? [...(unitFilter ?? [])][0]) ?? shown[0];
  const ids = Object.keys(w.units);
  const sel = new Set(x ? x.units : unit ? [unit] : unitFilter ? [...unitFilter] : ids.length === 1 ? ids : []);
  renderTaskUnits(new Set([w.id, ...[...sel].map(u => unitWheel(u)?.id)]), sel);
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

form.addEventListener('submit', e => {
  e.preventDefault();
  const when = readWhen(form);
  if (!when) return;
  const picked = new Set([...form.querySelectorAll('[name=twheel]:checked')].map(c => c.value));
  const targets = multi() ? shown.filter(w => picked.has(w.id)) : [shown[0]];
  if (!targets.length) {
    const b = form.querySelector('[name=twheel]');
    b.setCustomValidity(t('pickWheel'));
    return b.reportValidity();
  }
  const unitsIn = w => [...form.querySelectorAll('[name=unit]:checked')].filter(c => c.dataset.wheel === w.id).map(c => c.value);
  const items = field('items').value.split('\n').map(s => s.trim()).filter(Boolean);
  const today = isoDate(new Date());
  let x = findTask(editing), main;
  if (x) {
    remapDone(x, items);
    const o = ownerOf(x);
    main = targets.includes(o) ? o : targets[0];
    if (main !== o) { o.tasks = o.tasks.filter(t => t !== x); main.tasks.push(x); }
  } else (main = targets[0]).tasks.push(x = { id: uid(), done: {}, created: today });
  Object.assign(x, {
    title: field('title').value.trim(), note: field('note').value.trim(), items,
    notify: field('notify').checked, units: unitsIn(main),
  });
  applyWhen(x, when);
  const copies = targets.filter(w => w !== main);
  for (const w of copies) {
    w.tasks.push({ ...x, id: uid(), done: {}, created: today, items: [...x.items], units: unitsIn(w), ...(x.rule && { rule: { ...x.rule } }) });
  }
  persist();
  $('dlg-task').close();
  render();
  if (copies.length) notify(t('addedToWheels', x.title, targets.length));
});

async function deleteTask(id) {
  const x = findTask(id), w = ownerOf(x);
  if (!await ask(t('confirmDeleteTask', x.title))) return false;
  w.tasks = w.tasks.filter(o => o !== x);
  if (focus === x.id) focus = null;
  persist();
  render();
  return true;
}

$('task-delete').addEventListener('click', async () => {
  if (await deleteTask(editing)) $('dlg-task').close();
});


// ---- Datumfält ---------------------------------------------------------------------
// Alltid ÅÅÅÅ-MM-DD oavsett webbläsarens språk (type="date" visar lokalt format, t.ex. 10/14/2026).
// Kalenderknappen öppnar webbläsarens datumväljare via en dold date-input.

document.querySelectorAll('input.date').forEach(text => {
  const box = Object.assign(document.createElement('span'), { className: 'date-field' });
  const pick = Object.assign(document.createElement('input'), { type: 'date', className: 'picker', tabIndex: -1 });
  pick.setAttribute('aria-hidden', 'true');
  const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'pick', textContent: '📅' });
  btn.dataset.i18nTitle = 'pickDate';
  btn.hidden = typeof pick.showPicker !== 'function';
  text.replaceWith(box);
  box.append(text, btn, pick);
  btn.addEventListener('click', () => {
    pick.value = validISO(text.value) ? text.value : '';
    try { pick.showPicker(); } catch { text.focus(); }
  });
  pick.addEventListener('change', () => {
    if (!pick.value) return;
    text.value = pick.value;
    text.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // 20260315 → 2026-03-15
  text.addEventListener('blur', () => {
    const m = /^(\d{4})-?(\d\d)-?(\d\d)$/.exec(text.value.trim());
    if (m && text.value !== `${m[1]}-${m[2]}-${m[3]}`) {
      text.value = `${m[1]}-${m[2]}-${m[3]}`;
      text.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
});

// ---- När: fasta datum eller veckoregel, plus påminnelse (uppgifter och perioder) ---------

const NTH_KEY = { 1: 'nth1', 2: 'nth2', 3: 'nth3', 4: 'nth4', '-2': 'nthM2', '-1': 'nthM1' };
const usesRule = f => f.elements.repeat.value === 'weeks';
const formRule = f => ({
  month: Number(f.elements.rmonth.value), nth: Number(f.elements.nth.value),
  weeks: Math.min(26, Math.max(1, Math.round(Number(f.elements.rweeks.value) || 1))),
});

function fillWhen(f, x, s, e) {
  const el = n => f.elements[n];
  el('nth').innerHTML = NTHS.map(n => `<option value="${n}">${esc(t(NTH_KEY[n]))}</option>`).join('');
  el('rmonth').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${esc(monthName(i))}</option>`).join('');
  const r = x?.rule ?? { month: s.getMonth() + 1, nth: -1, weeks: 1 };
  el('repeat').value = x?.rule ? 'weeks' : 'date';
  el('nth').value = String(r.nth);
  el('rmonth').value = String(r.month);
  el('rweeks').value = String(r.weeks);
  el('start').value = isoDate(s);
  el('end').value = isoDate(e);
  el('start').setCustomValidity('');
  el('end').setCustomValidity('');
  el('remind').checked = Number.isInteger(x?.remind);
  el('remindDays').value = String(x?.remind ?? 7);
  syncWhen(f);
}

// Visa rätt fält och en förhandsvisning: veckoregeln för i år och nästa år, annars veckonummer.
function syncWhen(f) {
  const el = n => f.elements[n], rule = usesRule(f);
  f.querySelector('.when-date').hidden = rule;
  f.querySelector('.when-rule').hidden = !rule;
  el('start').required = el('end').required = !rule;
  el('remindDays').disabled = !el('remind').checked;
  const range = (x, y) => `${isoDate(startDate(x, y))} – ${isoDate(endDate(x, y))} (${weeks(x, y)})`;
  let hint = '';
  if (rule) {
    const x = { rule: formRule(f) };
    hint = [year, year + 1].map(y => `${y}: ${range(x, y)}`).join(' · ');
  } else {
    const s = el('start').value, e = el('end').value;
    if (validISO(s) && validISO(e) && e >= s) hint = `${weeks({ start: toMD(s), end: toMD(e) }, Number(s.slice(0, 4)))} · `;
    hint += t('wrapHint');
  }
  f.querySelector('.when-hint').textContent = hint;
}

// { start, end, rule } från formuläret, eller null (felet visas i fältet).
// Med veckoregel sparas även start/slut för visat år, så att äldre versioner kan visa uppgiften.
function readWhen(f) {
  const el = n => f.elements[n];
  const remind = el('remind').checked ? Math.min(365, Math.max(0, Math.round(Number(el('remindDays').value) || 0))) : undefined;
  if (usesRule(f)) {
    const rule = formRule(f), r = inYear({ rule }, year);
    return { start: r.start, end: r.end, rule, remind, year };
  }
  if (!checkDates(f)) return null;
  const s = el('start').value, en = el('end').value, days = (new Date(en) - new Date(s)) / 864e5;
  if (!(days >= 0 && days < 366 && (days === 0 || toMD(s) !== toMD(en)))) {
    el('end').setCustomValidity(t('badRange'));
    el('end').reportValidity();
    return null;
  }
  return { start: toMD(s), end: toMD(en), remind, year: Number(s.slice(0, 4)) };
}
function applyWhen(x, { start, end, rule, remind }) {
  Object.assign(x, { start, end });
  if (rule) x.rule = rule; else delete x.rule;
  if (remind !== undefined) x.remind = remind; else delete x.remind;
}

for (const f of [form, $('form-period')]) {
  f.addEventListener('input', e => {
    if (e.target.name === 'start' || e.target.name === 'end') e.target.setCustomValidity('');
    syncWhen(f);
  });
  f.addEventListener('change', e => {
    syncWhen(f);
    // Påminnelse ikryssad: be om lov att visa notiser direkt (kräver ett klick).
    if (e.target.name === 'remind' && e.target.checked && canNotify && !notifyOn()) toggleNotify();
  });
}

// Felaktigt datum: markera fältet med ett begripligt meddelande.
function checkDates(f) {
  for (const n of ['start', 'end']) {
    if (validISO(f.elements[n].value)) continue;
    f.elements[n].setCustomValidity(t('badDate'));
    f.elements[n].reportValidity();
    return false;
  }
  return true;
}

// ---- Lediga perioder (semester, lov) ---------------------------------------------

const pform = $('form-period'), pfield = n => pform.elements[n];
let editingPeriod = null;

function openPeriod(id) {
  const p = shown.flatMap(w => w.periods).find(p => p.id === id);
  editingPeriod = p ? id : null;
  fillWheelPick(pfield('wheel'), p ? periodOwner(p) : shown[0]);
  let s, e;
  if (p) { s = startDate(p, p.year ?? year); e = endDate(p, p.year ?? year); }
  else if (month !== null) { s = new Date(year, month, 1); e = new Date(year, month + 1, 0); }
  else { s = new Date(); e = new Date(); e.setDate(e.getDate() + 6); }
  $('period-heading').textContent = t(p ? 'editPeriod' : 'newPeriod');
  pfield('name').value = p?.name ?? '';
  fillWhen(pform, p, s, e);
  pfield('recurring').checked = p ? p.year === null : true;
  $('period-delete').hidden = !p;
  $('dlg-period').showModal();
}

pform.addEventListener('submit', e => {
  e.preventDefault();
  const when = readWhen(pform);
  if (!when) return;
  const w = pickedWheel(pfield('wheel'));
  let p = shown.flatMap(w => w.periods).find(p => p.id === editingPeriod);
  if (p && periodOwner(p) !== w) { const o = periodOwner(p); o.periods = o.periods.filter(q => q !== p); w.periods.push(p); }
  if (!p) w.periods.push(p = { id: uid() });
  Object.assign(p, { name: pfield('name').value.trim(), year: pfield('recurring').checked ? null : when.year });
  applyWhen(p, when);
  persist();
  $('dlg-period').close();
  render();
});

$('period-delete').addEventListener('click', async () => {
  const p = shown.flatMap(w => w.periods).find(p => p.id === editingPeriod), w = periodOwner(p);
  if (!await ask(t('confirmDeletePeriod', p.name || t('period')))) return;
  w.periods = w.periods.filter(o => o !== p);
  persist();
  $('dlg-period').close();
  render();
});

// ---- Enheter -----------------------------------------------------------------

const unitCount = id => allTasks().filter(x => x.units.includes(id)).length;

// En sektion per visat hjul, var och en med egen "+ Ny enhet".
function renderUnitList() {
  $('unit-list').innerHTML = shown.map(w => `<section class="unit-wheel">
    ${multi() ? `<h3>${esc(w.name || '—')}</h3>` : ''}
    ${Object.entries(w.units).map(([id, u]) =>
    `<div class="unit-row" data-id="${esc(id)}">
      <input type="color" name="color" value="${u.color}" aria-label="${esc(t('color'))}">
      <input name="name" value="${esc(u.name)}" aria-label="${esc(t('unitName'))}">
      <small class="muted unit-count">${esc(t('nTasks', unitCount(id)))}</small>
      <button type="button" class="danger" data-del aria-label="${esc(t('delete'))}" title="${esc(t('delete'))}">✕</button>
    </div>`).join('') || `<p class="muted">${esc(t('noUnits'))}</p>`}
    <button type="button" data-add-unit="${esc(w.id)}">${esc(t('newUnit'))}</button></section>`).join('');
}

// Öppna enhetsdialogen, ev. med fokus på en viss enhet.
function openUnits(focusId) {
  renderUnitList();
  if (!$('dlg-units').open) $('dlg-units').showModal();
  if (focusId) $('unit-list').querySelector(`[data-id="${CSS.escape(focusId)}"] [name=name]`)?.select();
}

// Dubbelklick på en enhetschip öppnar den för redigering.
$('chips').addEventListener('dblclick', e => {
  const id = e.target.closest('[data-unit]')?.dataset.unit;
  if (id && id !== '*') openUnits(id);
});

$('unit-list').addEventListener('input', e => {
  const u = unitOf(e.target.closest('[data-id]').dataset.id);
  u[e.target.name] = e.target.value;
  persist();
  render();
});

async function deleteUnit(id) {
  const w = unitWheel(id);
  if (!await ask(t('confirmDeleteUnit', w.units[id].name, unitCount(id)))) return;
  delete w.units[id];
  w.tasks.forEach(x => { x.units = x.units.filter(u => u !== id); });
  unitFilter = null;
  persist();
  render();
}

$('unit-list').addEventListener('click', async e => {
  const add = e.target.closest('[data-add-unit]');
  if (add) return addUnit(add.dataset.addUnit);
  if (!e.target.closest('[data-del]')) return;
  await deleteUnit(e.target.closest('[data-id]').dataset.id);
  renderUnitList();
});

// Med flera hjul och inget angivet öppnas bara dialogen, där varje hjul har sin egen knapp.
function addUnit(wid) {
  const w = shown.find(w => w.id === wid) ?? (multi() ? null : shown[0]);
  if (!$('dlg-units').open) openUnits();
  if (!w) return;
  const id = uid();
  w.units[id] = { name: t('newUnitName'), color: randomColor() };
  persist();
  renderUnitList();
  render();
  $('unit-list').querySelector(`[data-id="${id}"] [name=name]`).select();
}


// ---- Flytande +-knapp: fäller ut en meny (ny uppgift, ny uppgift per enhet, ny enhet) ----

// Plustecken som SVG så att det hamnar exakt i mitten (textens + sitter olika högt beroende på typsnitt).
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>';

const fabOpen = () => $('fab-btn').getAttribute('aria-expanded') === 'true';

function toggleFab(open = !fabOpen()) {
  if (open) {
    // Uppifrån och ned: ny enhet, enheterna, ny uppgift (närmast knappen). --i styr fördröjningen nerifrån.
    const items = [
      ['unit', '', t('newUnitName'), 'var(--muted)'],
      ['period', '', t('newPeriod'), 'var(--period)'],
      ...allUnits().map(([id, u]) => ['task', id, unitLabel(id), u.color]),
      ['task', '', t('newTask'), 'var(--accent)'],
    ];
    $('fab-menu').innerHTML = items.map(([kind, id, label, c], i) =>
      `<button class="fab-item${kind === 'unit' ? ' ghost' : ''}" role="menuitem" data-fab="${kind}" data-id="${esc(id)}"
        style="--i:${items.length - 1 - i};--c:${c}"><span class="fab-label">${esc(label)}</span>
        <span class="fab-mini" aria-hidden="true">${{ unit: '◎', period: '☼' }[kind] ?? PLUS}</span></button>`).join('');
  }
  $('fab-btn').setAttribute('aria-expanded', open);
  $('fab-menu').classList.toggle('open', open);
  $('fab').classList.toggle('open', open);
  $('fab-menu').inert = !open;
  if (open) $('fab-menu').lastElementChild.focus();
}

$('fab-btn').addEventListener('click', () => toggleFab());
$('fab-menu').addEventListener('click', e => {
  const b = e.target.closest('[data-fab]');
  if (!b) return;
  toggleFab(false);
  if (b.dataset.fab === 'unit') addUnit();
  else if (b.dataset.fab === 'period') openPeriod(null);
  else openTask(null, b.dataset.id || null);
});
// Klick utanför menyn – även på den mörka bakgrunden (som hör till #fab) – stänger den.
document.addEventListener('click', e => { if (fabOpen() && (!e.target.closest('#fab') || e.target.id === 'fab')) toggleFab(false); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fabOpen()) { toggleFab(false); $('fab-btn').focus(); }
});

// ---- Flera flikar: läs in hjul som ändrats i en annan flik, så att en gammal kopia här aldrig
// skriver över nyare uppgifter där.
window.addEventListener('storage', e => {
  if (!e.key?.startsWith('arshjul:wheel:')) return;
  const id = e.key.slice(14), i = shown.findIndex(w => w.id === id);
  if (i < 0) return render();
  const w = store.load(id);
  if (w) shown[i] = w; else shown.splice(i, 1);
  if (!shown.length) return start();
  render();
});

// ---- Hjul: visa/dölj, nytt, byt namn, exportera, ta bort -------------------------

$('wheels').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.dataset.menu) return;
  if (b.dataset.action === 'new-wheel') return newWheel();
  if (b.dataset.action === 'from-code') return openCode();
  if (b.dataset.layout) {
    layout = b.dataset.layout;
    store.pref('layout', layout);
    render();
    return refocus($('wheels'), `[data-layout="${layout}"]`);
  }
  const id = b.dataset.wheel, ids = shownIds();
  if (!id) return;
  if (!ids.includes(id)) show([...ids, id]);
  else if (ids.length > 1) show(ids.filter(i => i !== id)); // minst ett hjul visas alltid
});
$('wheels').addEventListener('dblclick', e => {
  const id = e.target.closest('[data-wheel]')?.dataset.wheel;
  if (id) show([id]);
});

// Nytt hjul: tomt eller en kopia av exemplet, och möjlighet att ta bort exempelhjulen först.
const nform = $('form-new');
const savedWheels = () => store.list().map(w => store.load(w.id)).filter(Boolean);
const examples = () => [...new Map([...savedWheels(), ...shown].filter(w => w.example).map(w => [w.id, w])).values()];
// Bara oförändrade exempel får tas bort; ändrade behålls (användarens uppgifter tas aldrig bort).
// Både versionen i minnet och den sparade (kan ha ändrats i en annan flik) måste vara oförändrade.
const pristine = w => isPristineExample(w) && [store.load(w.id)].every(o => !o || isPristineExample(o));
const removableExamples = () => examples().filter(pristine);

function newWheel() {
  const ex = removableExamples(), kept = examples().filter(w => !pristine(w));
  nform.elements.name.value = '';
  nform.elements.name.placeholder = t('defaultWheel');
  nform.querySelector('[name=from][value=empty]').checked = true;
  nform.elements.clear.checked = true;
  $('clear-box').hidden = !ex.length;
  $('clear-text').textContent = t('clearExamples', ex.map(w => w.name).join(', '));
  $('clear-kept').hidden = !kept.length;
  $('clear-kept').textContent = t('examplesKept', kept.map(w => w.name).join(', '));
  $('dlg-new').showModal();
}

nform.addEventListener('submit', e => {
  e.preventDefault();
  const name = nform.elements.name.value.trim() || t('defaultWheel');
  const fromExample = nform.querySelector('[name=from]:checked').value === 'example';
  const today = isoDate(new Date());
  let w;
  if (fromExample) {
    const ex = store.copyWheel(exampleWheels(lang)[0]);
    w = { ...ex, name, tasks: ex.tasks.map(x => ({ ...x, done: {}, created: today })) };
  } else w = store.newWheel(name);
  if (!$('clear-box').hidden && nform.elements.clear.checked) {
    const gone = new Set(removableExamples().map(o => o.id));
    gone.forEach(store.remove);
    shown = shown.filter(o => !gone.has(o.id));
  }
  // Ändrade exempelhjul är nu användarens egna.
  examples().filter(o => !pristine(o)).forEach(o => {
    const cur = store.load(o.id) ?? o; // spara aldrig över nyare data från en annan flik
    delete cur.example;
    try { store.save(cur); } catch { /* sparas nästa gång */ }
    const i = shown.findIndex(v => v.id === cur.id);
    if (i >= 0) shown[i] = cur;
  });
  try { store.save(w); } catch { notify(t('saveFailed')); }
  $('dlg-new').close();
  shown.push(w);
  show(shownIds());
  if ($('dlg-settings').open) fillSettings();
});

let editingWheel = null;
function openWheelDialog(w) {
  editingWheel = w;
  $('form-wheel').elements.name.value = w.name;
  $('dlg-wheel').showModal();
  $('form-wheel').elements.name.select();
}

function wheelCmd(cmd, id) {
  const w = shown.find(w => w.id === id) ?? store.load(id);
  if (!w) return;
  if (cmd === 'rename') openWheelDialog(w);
  else if (cmd === 'only') show([id]);
  else if (cmd === 'export') exportWheels([w]);
  else if (cmd === 'share') openShare(w);
  else deleteWheel(w);
}

$('form-wheel').addEventListener('submit', e => {
  e.preventDefault();
  editingWheel.name = e.target.elements.name.value.trim();
  try { store.save(editingWheel); } catch { notify(t('saveFailed')); }
  $('dlg-wheel').close();
  render();
});

async function deleteWheel(w) {
  if (!await ask(t('confirmDeleteWheel', w.name))) return false;
  store.remove(w.id);
  shown = shown.filter(o => o.id !== w.id);
  if (shown.length) show(shownIds()); else start();
  return true;
}

$('wheel-delete').addEventListener('click', async () => {
  $('dlg-wheel').close();
  await deleteWheel(editingWheel);
});

document.addEventListener('click', e => { if (e.target.closest('[data-close]')) e.target.closest('dialog').close(); });

// ---- Export / import ---------------------------------------------------------

function download({ name, blob }) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// En fil per hjul (importeras ett i taget).
function exportWheels(ws) {
  ws.forEach(w => {
    download(store.exportFile(w));
    store.pref(`exported:${w.id}`, Date.now());
  });
  renderFooter();
}

$('btn-export').addEventListener('click', () => exportWheels(shown));

// Alla visade hjul i en och samma kalenderfil.
$('btn-ics').addEventListener('click', () => download(store.exportICS(shown, NOW_YEAR)));

$('file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let w;
  try { w = store.parseImport(await file.text()); } catch { return notify(t('importFailed')); }
  openImport(w);
});

// ---- Importera (fil eller kod): lägg till som eget hjul (standard) eller skriv över ett befintligt.

const iform = $('form-import');
let pending = null; // inläst hjul som väntar på val
const importMode = () => iform.querySelector('[name=mode]:checked').value;

function openImport(w) {
  pending = w;
  $('import-summary').textContent =
    t('importSummary', w.name || '—', w.tasks.length, Object.keys(w.units).length, w.periods.length);
  // Samma hjul som exporterades förut (samma id) förväljs som mål vid överskrivning.
  iform.elements.target.innerHTML = wheelNames().map(([id, name]) =>
    `<option value="${esc(id)}"${id === w.id ? ' selected' : ''}>${esc(name || '—')}</option>`).join('');
  iform.querySelector('[name=mode][value=add]').checked = true;
  iform.elements.target.disabled = true;
  $('dlg-import').showModal();
}

iform.addEventListener('change', e => {
  if (e.target.name === 'mode') iform.elements.target.disabled = importMode() !== 'replace';
});

iform.addEventListener('submit', async e => {
  e.preventDefault();
  const replace = importMode() === 'replace', target = iform.elements.target.value;
  const name = wheelNames().find(([id]) => id === target)?.[1];
  if (replace && !await ask(t('confirmOverwrite', name || '—'))) return;
  // Alltid nya id inuti, så att enheter och uppgifter aldrig krockar med andra hjul.
  const w = store.copyWheel(pending, replace ? target : undefined);
  try { store.save(w); } catch { return notify(t('saveFailed')); }
  $('dlg-import').close();
  shown = shown.filter(o => o.id !== w.id); // överskrivet hjul läses in på nytt
  show([...shownIds(), w.id]);
  if ($('dlg-settings').open) fillSettings();
  notify(t(replace ? 'replaced' : 'added', replace ? name : w.name));
});

// ---- Dela med kod ----------------------------------------------------------------

// Länk fungerar bara när appen körs på en egen adress (inte inbäddad, t.ex. i en förhandsvisning).
const ownPage = () => { try { return window.top === window && location.protocol.startsWith('http'); } catch { return false; } };

async function openShare(w) {
  try { $('share-code').value = await store.shareCode(w); } catch { return notify(t('copyFailed')); }
  $('share-link').hidden = !ownPage();
  $('dlg-share').showModal();
  $('share-code').select();
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); notify(t('copied')); }
  catch {
    $('share-code').select();
    notify(document.execCommand?.('copy') ? t('copied') : t('copyFailed'));
  }
}
$('share-copy').addEventListener('click', () => copy($('share-code').value));
$('share-link').addEventListener('click', () =>
  copy(`${location.origin}${location.pathname}#import=${$('share-code').value}`));

function openCode(text = '') {
  $('form-code').elements.code.value = text;
  $('dlg-code').showModal();
}
$('set-code').addEventListener('click', () => openCode());

$('form-code').addEventListener('submit', async e => {
  e.preventDefault();
  let w;
  try { w = await store.parseShareCode(e.target.elements.code.value, isoDate(new Date())); } catch { return notify(t('badCode')); }
  $('dlg-code').close();
  openImport(w);
});

// Delad länk (…#import=ARSHJUL1.…): öppna dialogen med koden ifylld och rensa adressen.
function importFromHash() {
  if (!location.hash.startsWith('#import=')) return;
  const code = decodeURIComponent(location.hash.slice(8));
  history.replaceState(null, '', location.pathname + location.search);
  openCode(code);
}

// ---- Notiser om försenade uppgifter ---------------------------------------------
// Visas när appen öppnas (högst en gång per dag) för uppgifter med "Notis när den är försenad".
// Kräver ingen server; notiser när appen är stängd skulle kräva Web Push.

const canNotify = 'Notification' in window;
const notifyOn = () => canNotify && Notification.permission === 'granted' && store.pref('notify') === 'on';

function applyNotifyBtn() {
  const b = $('btn-notify');
  b.hidden = !canNotify;
  b.textContent = notifyOn() ? '🔔' : '🔕';
  b.title = t(notifyOn() ? 'notifyOn' : 'notifyOff');
  b.setAttribute('aria-label', b.title);
}

async function showNote(title, lines, tag) {
  const opts = { body: lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n…' : ''), icon: 'icon.svg', tag };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch { notify(title); }
}

// Alla sparade hjul, inte bara de som visas.
const savedAll = () => { const ws = store.list().map(w => store.load(w.id)).filter(Boolean); return ws.length ? ws : shown; };

async function notifyLate() {
  const today = isoDate(new Date());
  if (!notifyOn() || store.pref('notified') === today) return;
  const late = savedAll().flatMap(w => w.tasks).filter(x => x.notify && overdueYear(x) !== null).map(x => x.title);
  if (!late.length) return;
  store.pref('notified', today);
  showNote(`${t('appName')}: ${t('nLate', late.length)}`, late, 'arshjul-late');
}

// Påminnelser ("Påminn mig N dagar före start"): en gång per förekomst. Sparade nycklar rensas
// när förekomsten är över, så listan växer inte.
async function notifyReminders() {
  if (!notifyOn()) return;
  const due = dueReminders(savedAll());
  const sent = new Set((store.pref('reminded') ?? '').split(',').filter(Boolean));
  const fresh = due.filter(r => !sent.has(r.key));
  store.pref('reminded', due.map(r => r.key).join(','));
  if (!fresh.length) return;
  const line = r => t(r.days > 0 ? 'startsIn' : r.days === 0 ? 'startsToday' : 'ongoing', r.name || t('period'), r.days, isoDate(r.start));
  showNote(fresh.length === 1 ? `${t('appName')}: ${line(fresh[0])}` : `${t('appName')}: ${t('nReminders', fresh.length)}`,
    fresh.map(line), 'arshjul-remind');
}
const notifyAll = () => { notifyReminders(); notifyLate(); };
// Appen kan ligga öppen länge (t.ex. som app på hemskärmen): kolla igen när den visas och varje timme.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') notifyAll(); });
setInterval(notifyAll, 36e5);

async function toggleNotify() {
  if (notifyOn()) store.pref('notify', 'off');
  else if (await Notification.requestPermission().catch(() => 'denied') === 'granted') {
    store.pref('notify', 'on');
    store.pref('notified', '');
    notifyAll();
  } else notify(t('notifyBlocked'));
  applyNotifyBtn();
}
$('btn-notify').addEventListener('click', toggleNotify);

// ---- Inställningar (globala, sparas i webbläsaren) ----------------------------------

const WIDTHS = { normal: '1200px', wide: '1600px', full: 'none' };
const COLS = { wheel: ['1.4fr', '1fr'], even: ['1fr', '1fr'], list: ['1fr', '1.4fr'] };
const view = { fs: 100, width: 'normal', cols: 'even' };

function loadView() {
  const fs = Number(store.pref('fs'));
  view.fs = fs >= 90 && fs <= 160 ? fs : 100;
  view.width = Object.hasOwn(WIDTHS, store.pref('width')) ? store.pref('width') : 'normal';
  view.cols = Object.hasOwn(COLS, store.pref('cols')) ? store.pref('cols') : 'even';
}

function applyView() {
  const r = document.documentElement.style;
  r.setProperty('--fs', view.fs / 100);
  r.setProperty('--page-max', WIDTHS[view.width]);
  r.setProperty('--c1', COLS[view.cols][0]);
  r.setProperty('--c2', COLS[view.cols][1]);
}

const sform = $('form-settings'), sfield = n => sform.elements[n];

function fillSettings() {
  sfield('fs').value = view.fs;
  $('fs-out').textContent = `${view.fs} %`;
  sfield('width').value = view.width;
  sfield('cols').value = view.cols;
  sfield('theme').value = theme;
  sfield('lang').value = lang;
  sfield('layout').value = layout;
  sfield('layout').closest('label').hidden = !multi();
  const on = new Set(shownIds());
  $('set-wheels').innerHTML = wheelNames().map(([id, name]) =>
    `<label class="check"><input type="checkbox" name="wheel" value="${esc(id)}"${on.has(id) ? ' checked' : ''}>${esc(name || '—')}</label>`).join('');
  $('set-notify-box').hidden = !canNotify;
  sfield('notify').checked = notifyOn();
}

$('btn-settings').addEventListener('click', () => { fillSettings(); $('dlg-settings').showModal(); });
$('set-units').addEventListener('click', () => openUnits());
$('dlg-units').addEventListener('close', () => { if ($('dlg-settings').open) fillSettings(); });

// Ändringar gäller direkt.
async function changeSetting(e) {
  const { name, value } = e.target;
  if (name in view) {
    view[name] = name === 'fs' ? Number(value) : value;
    store.pref(name, value);
    applyView();
  } else if (name === 'theme') {
    theme = value;
    store.pref('theme', theme);
    applyTheme();
  } else if (name === 'lang') {
    setLang(value);
    store.pref('lang', lang);
    applyLang();
    render();
  } else if (name === 'layout') {
    layout = value;
    store.pref('layout', layout);
    render();
  } else if (name === 'wheel') {
    const ids = [...sform.querySelectorAll('[name=wheel]:checked')].map(c => c.value);
    if (ids.length) show(ids); // minst ett hjul visas alltid
  } else if (name === 'notify') await toggleNotify();
  else return;
  fillSettings();
}
sform.addEventListener('input', e => { if (e.target.type === 'range') changeSetting(e); });
sform.addEventListener('change', changeSetting);
sform.addEventListener('submit', e => e.preventDefault());

// ---- Språk och start ---------------------------------------------------------

// Tema: auto (följer systemet) → ljust → mörkt.
const THEMES = { auto: '◐', light: '☀', dark: '☾' };
let theme = 'auto';
function applyTheme() {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  $('btn-theme').textContent = THEMES[theme];
  $('btn-theme').title = t('theme' + theme[0].toUpperCase() + theme.slice(1));
  $('btn-theme').setAttribute('aria-label', $('btn-theme').title);
}
$('btn-theme').addEventListener('click', () => {
  const keys = Object.keys(THEMES);
  theme = keys[(keys.indexOf(theme) + 1) % keys.length];
  store.pref('theme', theme);
  applyTheme();
});

function applyLang() {
  applyStatic();
  applyTheme();
  applyNotifyBtn();
  $('btn-lang').textContent = t('otherLang');
  document.title = t('appName');
}

$('btn-lang').addEventListener('click', () => {
  setLang(t('otherLangCode'));
  store.pref('lang', lang);
  applyLang();
  render();
});

// Exempeldata som standard tills användaren har egna uppgifter. Körs en gång (pref 'examples').
// Bakåtkompatibelt: inga hjul, uppgifter eller inställningar tas bort. Ett oanvänt standardhjul från
// äldre versioner (inga uppgifter, bara enheten "Jag"/"Me") blir ett tomt exempelhjul – det kan sedan
// tas bort med "Ta bort exempelhjulen" när man skapar ett eget hjul.
function addExamples() {
  if (store.pref('examples')) return [];
  const saved = savedWheels();
  for (const w of saved.filter(isUnusedDefault)) {
    w.units = {};
    w.example = true;
    try { store.save(w); } catch { /* lagring blockerad */ }
  }
  const hasOwn = saved.some(w => !w.example && (w.tasks.length || w.periods.length));
  const ex = exampleWheels(lang).map(store.sanitize).filter(w => !saved.some(o => o.id === w.id));
  if (hasOwn || saved.some(w => w.id === 'exempel')) ex.length = 0;
  try { ex.forEach(store.save); store.pref('examples', 'added'); } catch { /* lagring blockerad: kör i minnet */ }
  return ex;
}

// Visa samma hjul som förra gången (äldre versioner sparade bara ett: 'last'), annars det första.
function start() {
  const ex = addExamples();
  const ids = store.list().map(w => w.id);
  // Nya exempelhjul visas; tidigare visade hjul behålls (utom ett tomt standardhjul som blivit exempel).
  const before = (store.pref('shown') || store.pref('last') || '').split(',').filter(id => ids.includes(id))
    .filter(id => !ex.length || !store.load(id)?.example);
  const want = [...before, ...ex.map(w => w.id)];
  shown = [];
  if (ids.length) return show(want.length ? want : ids.slice(0, 1));
  if (ex.length) { shown = ex; return show(ex.map(w => w.id)); } // lagring blockerad: exemplet i minnet
  // Alla hjul borttagna: ett tomt hjul.
  const w = store.newWheel(t('defaultWheel'));
  try { store.save(w); } catch { /* kör i minnet */ }
  shown = [w];
  show([w.id]);
}

theme = Object.hasOwn(THEMES, store.pref('theme')) ? store.pref('theme') : 'auto';
layout = store.pref('layout') === 'split' ? 'split' : 'merged';
loadView();
applyView();
setLang(store.pref('lang') || (navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en'));
applyLang();
start();
importFromHash();
notifyAll();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch(() => {});
