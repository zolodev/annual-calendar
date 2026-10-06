// SVG-hjulet: data → SVG. Ingen logik utöver "dag på året → vinkel".
import { span, assignLanes, esc } from './model.js';

const R_M0 = 70, R_M1 = 120, R_L0 = 128, LANE = 22, TAU = 2 * Math.PI;
const ang = d => (d / 365) * TAU - Math.PI / 2; // 1 jan = överst
const pt = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
const clamp = (a0, a1) => Math.min(a1, a0 + TAU - 1e-4); // helt varv kan inte ritas som en båge

function sector(r0, r1, a0, a1) {
  a1 = clamp(a0, a1);
  const L = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(r1, a0)}A${r1} ${r1} 0 ${L} 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 ${L} 0 ${pt(r0, a0)}Z`;
}

// Båge för textPath. I nedre halvan ritas den baklänges så att texten inte blir upp-och-ned.
function textArc(r, a0, a1) {
  a1 = clamp(a0, a1);
  const L = a1 - a0 > Math.PI ? 1 : 0;
  return Math.sin((a0 + a1) / 2) > 0
    ? `M${pt(r, a1)}A${r} ${r} 0 ${L} 0 ${pt(r, a0)}`
    : `M${pt(r, a0)}A${r} ${r} 0 ${L} 1 ${pt(r, a1)}`;
}

// view: { tasks: [{ id, title, start, end, color, dim, late, tip }], year, todayDoy (null = inte i år),
//         month (vald månad eller null), months: [{ short, long, from, to }], pct, lateCount, t }
export function renderWheel(svg, v) {
  const { lane, count } = assignLanes(v.tasks);
  const outer = R_L0 + count * LANE;
  const R = Math.max(220, outer + 12);
  svg.setAttribute('viewBox', `${-R} ${-R} ${2 * R} ${2 * R}`);
  let defs = '', h = '';

  v.months.forEach((m, i) => {
    const a0 = ang(m.from), a1 = ang(m.to), [x, y] = pt((R_M0 + R_M1) / 2, (a0 + a1) / 2).split(' ');
    h += `<path class="month${i === v.month ? ' sel' : ''}" d="${sector(R_M0, R_M1, a0, a1)}" data-month="${i}"
            tabindex="0" role="button" aria-label="${esc(m.long)}"><title>${esc(m.long)}</title></path>
          <text class="month-label" x="${x}" y="${y}">${esc(m.short)}</text>`;
  });

  v.tasks.forEach(task => {
    const [s, e] = span(task), r0 = R_L0 + lane.get(task.id) * LANE, r1 = r0 + LANE - 2, mid = (r0 + r1) / 2;
    const a0 = ang(s), a1 = ang(e), cls = `task${task.dim ? ' dim' : ''}${task.late ? ' late' : ''}`;
    h += `<path class="${cls}" d="${sector(r0, r1, a0, a1)}" fill="${task.color}" data-task="${esc(task.id)}"
            tabindex="0" role="button" aria-label="${esc(task.tip)}"><title>${esc(task.tip)}</title></path>`;
    if ((a1 - a0) * mid > task.title.length * 6.2 + 8) {
      defs += `<path id="lp-${esc(task.id)}" d="${textArc(mid, a0, a1)}"/>`;
      h += `<text class="task-label${task.dim ? ' dim' : ''}"><textPath href="#lp-${esc(task.id)}" startOffset="50%">${esc(task.title)}</textPath></text>`;
    }
  });

  if (v.todayDoy !== null) {
    const a = ang(v.todayDoy + 0.5), [x1, y1] = pt(R_M0, a).split(' '), [x2, y2] = pt(Math.max(outer, R_M1 + 6), a).split(' ');
    h += `<line class="today" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }

  h += `<text class="nav" x="-46" y="-2" data-step="-1" tabindex="0" role="button" aria-label="${esc(v.t('prevYear'))}">‹</text>
        <text class="center-year" y="-2">${v.year}</text>
        <text class="nav" x="46" y="-2" data-step="1" tabindex="0" role="button" aria-label="${esc(v.t('nextYear'))}">›</text>
        <text class="center-sub" y="15">${esc(v.t('pctDone', v.pct))}</text>`;
  if (v.lateCount) h += `<text class="center-late" y="29">${esc(v.t('nLate', v.lateCount))}</text>`;

  svg.innerHTML = `<defs>${defs}</defs>${h}`;
}
