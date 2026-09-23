// Диаграмма «цена против времени» и календарь цен.

import { rub, hoursShort, dateShort } from './format.js';

function niceTicks(min, max, count) {
  const span = max - min;
  const rough = span / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.map((s) => s * pow).find((s) => span / s <= count) || 10 * pow;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

function quantile(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function renderPareto(svg, tip, result, activeId, onPick) {
  const cands = result.candidates;
  const scen = result.scenarios;
  if (!cands.length) {
    svg.innerHTML = '';
    return;
  }
  const rect = svg.parentElement.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width));
  const h = Math.round(Math.min(440, Math.max(280, w * 0.58)));
  const m = { l: 68, r: 24, t: 18, b: 40 };
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('height', h);

  const prices = cands.map((c) => c.price);
  const hours = cands.map((c) => c.hours);
  const scenMaxP = Math.max(...scen.map((s) => s.route.price));
  const scenMaxH = Math.max(...scen.map((s) => s.route.hours));
  const minP = Math.min(...prices) * 0.92;
  const maxP = Math.max(scenMaxP * 1.08, quantile(prices, 0.9));
  const minH = Math.min(...hours) * 0.9;
  const maxH = Math.max(scenMaxH * 1.06, quantile(hours, 0.9));

  const sx = (v) => m.l + ((v - minH) / (maxH - minH)) * (w - m.l - m.r);
  const sy = (v) => h - m.b - ((v - minP) / (maxP - minP)) * (h - m.t - m.b);
  const inside = (c) => c.hours <= maxH && c.price <= maxP;

  const parts = [];
  for (const t of niceTicks(minP, maxP, 5)) {
    const y = sy(t).toFixed(1);
    parts.push(`<line class="p-grid" x1="${m.l}" x2="${w - m.r}" y1="${y}" y2="${y}"/>`);
    parts.push(`<text class="p-axis" x="${m.l - 10}" y="${y}" dy="4" text-anchor="end">${Math.round(t / 1000)}</text>`);
  }
  for (const t of niceTicks(minH, maxH, 6)) {
    const x = sx(t).toFixed(1);
    parts.push(`<line class="p-grid" x1="${x}" x2="${x}" y1="${m.t}" y2="${h - m.b}"/>`);
    parts.push(`<text class="p-axis" x="${x}" y="${h - m.b + 18}" text-anchor="middle">${Math.round(t)} ч</text>`);
  }
  parts.push(`<text class="p-axis" x="${w - m.r}" y="${h - 6}" text-anchor="end">время в пути</text>`);
  parts.push(`<text class="p-axis" x="${m.l}" y="${m.t - 6}">цена, тыс. ₽</text>`);

  const scenIds = new Set(scen.map((s) => s.route.id));
  cands.forEach((c, i) => {
    if (scenIds.has(c.id) || !inside(c)) return;
    parts.push(`<circle class="p-dot" cx="${sx(c.hours).toFixed(1)}" cy="${sy(c.price).toFixed(1)}" r="3.5" data-i="${i}"/>`);
  });

  const labels = [];
  scen.forEach((s, i) => {
    const c = s.route;
    const x = sx(c.hours);
    const y = sy(c.price);
    const active = c.id === activeId ? ' is-active' : '';
    parts.push(`<circle class="p-scen${active}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" data-id="${c.id}"/>`);
    labels.push(`<text class="p-label" x="${(x + 10).toFixed(1)}" y="${(y - 8).toFixed(1)}">${i + 1}</text>`);
    parts.push(`<circle class="p-hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" data-id="${c.id}" data-i="${cands.indexOf(c)}"/>`);
  });
  svg.innerHTML = parts.join('') + labels.join('');

  const show = (i, x, y) => {
    const c = cands[i];
    if (!c) return;
    const chain = c.chain.map((p) => (p.type === 'city' ? p.name : '')).filter(Boolean).join(' → ');
    tip.innerHTML = `<b>${rub(c.price)}, ${hoursShort(c.hours)}</b><br>${chain}`;
    tip.hidden = false;
    tip.style.left = `${(x / w) * 100}%`;
    tip.style.top = `${(y / h) * 100}%`;
  };
  svg.onpointermove = (e) => {
    const t = e.target;
    if (t.matches('.p-dot, .p-hit')) show(Number(t.dataset.i), Number(t.getAttribute('cx')), Number(t.getAttribute('cy')));
    else tip.hidden = true;
  };
  svg.onpointerleave = () => (tip.hidden = true);
  svg.onclick = (e) => {
    const t = e.target.closest('[data-id]');
    if (t) onPick(t.dataset.id);
  };
}

export function renderCalendar(el, result, pickedDate) {
  const days = result.calendar.filter((d) => d.price != null);
  if (!days.length) {
    el.innerHTML = '<p class="hint">Для этого окна дат ничего не нашлось.</p>';
    return;
  }
  const min = Math.min(...days.map((d) => d.price));
  const max = Math.max(...days.map((d) => d.price));
  el.innerHTML = result.calendar
    .map((d) => {
      if (d.price == null) return `<div class="cal-day"><div class="cal-bar"></div><div class="cal-price">—</div><div class="cal-date">${dateShort(d.date)}</div></div>`;
      const share = max === min ? 1 : 0.35 + (0.65 * (d.price - min)) / (max - min);
      const cls = ['cal-day', d.date === pickedDate ? 'is-picked' : '', d.price === min ? 'is-best' : ''].join(' ');
      return `<div class="${cls}"><div class="cal-bar"><i style="height:${Math.round(share * 100)}%"></i></div><div class="cal-price">${rub(d.price)}</div><div class="cal-date">${dateShort(d.date)}</div></div>`;
    })
    .join('');
}
