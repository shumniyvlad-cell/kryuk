// Крюк: состояние, URL, запуск поиска и связка интерфейса.

import { planRoutes, DEFAULTS, getContext } from './engine/index.js';
import { createQuery } from './ui/query.js';
import { renderScenarios, renderDetail } from './ui/results.js';
import { createMap } from './ui/map.js';
import { renderPareto, renderCalendar } from './ui/charts.js';
import { rub, hoursText, dateRange, dateLong, waysWord, plural } from './ui/format.js';

const params = new URLSearchParams(location.search);
const MOTION = params.get('motion') === '1' || (params.get('motion') !== '0' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
document.documentElement.dataset.motion = MOTION ? 'on' : 'off';

const state = readState();
let result = null;
let activeId = null;

const els = {
  go: document.getElementById('go'),
  scan: document.getElementById('scan'),
  results: document.getElementById('results'),
  count: document.getElementById('res-count'),
  word: document.getElementById('res-word'),
  sub: document.getElementById('res-sub'),
  baseline: document.getElementById('res-baseline'),
  list: document.getElementById('scen-list'),
  detail: document.getElementById('detail-body'),
  map: document.getElementById('map'),
  legend: document.getElementById('map-legend'),
  pareto: document.getElementById('pareto'),
  tip: document.getElementById('pareto-tip'),
  calendar: document.getElementById('calendar'),
  footStats: document.getElementById('foot-stats'),
  optSelf: document.getElementById('opt-self'),
  optHidden: document.getElementById('opt-hidden'),
  optBags: document.getElementById('opt-bags'),
};

const map = createMap(els.map, els.legend);
const query = createQuery({ state, onChange: syncUrl });

els.optSelf.checked = state.allowSelfTransfer;
els.optHidden.checked = state.allowHiddenCity;
els.optBags.checked = state.bags;
els.optSelf.addEventListener('change', () => ((state.allowSelfTransfer = els.optSelf.checked), syncUrl()));
els.optHidden.addEventListener('change', () => ((state.allowHiddenCity = els.optHidden.checked), syncUrl()));
els.optBags.addEventListener('change', () => ((state.bags = els.optBags.checked), syncUrl()));

els.go.addEventListener('click', () => run({ scroll: true }));

{
  const ctx = getContext();
  const flights = [...ctx.graph.out.values()].reduce((s, l) => s + l.length, 0);
  els.footStats.textContent = `${ctx.cities.size} ${plural(ctx.cities.size, 'город', 'города', 'городов')}, ${ctx.airports.size} ${plural(ctx.airports.size, 'аэропорт', 'аэропорта', 'аэропортов')}, ${flights} ${plural(flights, 'авиамаршрут', 'авиамаршрута', 'авиамаршрутов')}`;
}

if (params.has('from')) run({ scroll: params.has('pick') });

function readState() {
  const s = { ...DEFAULTS, modes: { ...DEFAULTS.modes } };
  if (params.get('from')) s.origin = params.get('from');
  if (params.get('to')) s.destination = params.get('to');
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '')) s.date = params.get('date');
  if (params.has('flex')) s.flex = clamp(Number(params.get('flex')), 0, 3);
  if (params.has('r')) s.radiusKm = clamp(Number(params.get('r')), 0, 900);
  if (params.has('hv')) s.hourValue = clamp(Number(params.get('hv')), 0, 10000);
  if (params.has('modes')) {
    const set = new Set(params.get('modes').split(',').filter(Boolean));
    s.modes = { train: set.has('train'), bus: set.has('bus'), car: set.has('car') };
  }
  if (params.has('st')) s.allowSelfTransfer = params.get('st') === '1';
  if (params.has('hc')) s.allowHiddenCity = params.get('hc') === '1';
  if (params.has('bags')) s.bags = params.get('bags') === '1';
  const ctx = getContext();
  if (!ctx.cities.has(s.origin)) s.origin = DEFAULTS.origin;
  if (!ctx.cities.has(s.destination)) s.destination = DEFAULTS.destination;
  return s;
}

function clamp(v, a, b) {
  return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a;
}

function buildUrl(pickKey) {
  const q = new URLSearchParams();
  q.set('from', state.origin);
  q.set('to', state.destination);
  q.set('date', state.date);
  q.set('flex', state.flex);
  q.set('r', state.radiusKm);
  q.set('hv', state.hourValue);
  q.set('modes', Object.keys(state.modes).filter((k) => state.modes[k]).join(','));
  q.set('st', state.allowSelfTransfer ? 1 : 0);
  q.set('hc', state.allowHiddenCity ? 1 : 0);
  q.set('bags', state.bags ? 1 : 0);
  if (pickKey) q.set('pick', pickKey);
  if (params.get('motion')) q.set('motion', params.get('motion'));
  return `${location.pathname}?${q}`;
}

function syncUrl() {
  const active = result && result.scenarios.find((s) => s.route.id === activeId);
  history.replaceState(null, '', buildUrl(active ? active.key : null));
}

async function run({ scroll = false } = {}) {
  query.close();
  els.go.disabled = true;
  els.scan.innerHTML = '';
  result = planRoutes(state);
  const { origin, dest, stats } = result;

  if (result.error) {
    await logLines([`<strong>${result.error}</strong>`]);
    els.go.disabled = false;
    return;
  }

  const codes = [...new Set(result.depOptions.map((o) => o.airport.iata))];
  await logLines([
    `Аэропорты в радиусе ${state.radiusKm} км, если вы в ${origin.loc}: <strong>${codes.join(', ')}</strong>, наземных плеч — ${result.depOptions.length}`,
    `Связок до ${dest.acc}: <strong>${stats.paths}</strong>, с датами и способами покупки — ${stats.combos.toLocaleString('ru-RU')}`,
    `После отсева: <strong>${stats.candidates}</strong> реальных маршрутов, отобрано ${result.scenarios.length} за ${stats.ms} мс`,
  ]);

  els.go.disabled = false;
  showResults(scroll);
}

function showResults(scroll) {
  const { scenarios } = result;
  const pick = params.get('pick');
  const initial = scenarios.find((s) => s.key === pick) || scenarios[0];
  els.count.textContent = scenarios.length;
  els.word.textContent = waysWord(scenarios.length);
  const dates = result.calendar.map((d) => d.date);
  els.sub.textContent = `${result.origin.name} → ${result.dest.name}, ${dates.length > 1 ? dateRange(dates[0], dates[dates.length - 1]) : dateLong(state.date)}`;

  const b = result.baseline;
  const cheapest = [...scenarios].sort((x, y) => x.route.price - y.route.price)[0].route;
  if (b) {
    const saving = b.price - cheapest.price;
    els.baseline.innerHTML = `Обычный агрегатор покажет вылет из ${b.airport.name} (${b.airport.iata}): <strong>от ${rub(b.price)} и ${hoursText(b.hours, { short: true })}</strong> без дороги до аэропорта.${saving > 0 ? ` У нас дешевле на <strong>${rub(saving)}</strong> — за счёт того, что он не ищет.` : ' Ниже — всё, что он не покажет.'}`;
  } else {
    els.baseline.innerHTML = `Прямых вариантов из своего аэропорта в этой базе нет — весь путь строится через соседние города.`;
  }

  els.results.hidden = false;
  els.results.classList.add('is-in');
  select(initial.route.id, { animate: true, first: true });
  if (scroll) els.results.scrollIntoView({ behavior: MOTION ? 'smooth' : 'auto', block: 'start' });
}

function select(id, { animate = false, first = false } = {}) {
  const scenario = result.scenarios.find((s) => s.route.id === id);
  if (!scenario) return;
  activeId = id;
  renderScenarios(els.list, result, activeId, (pickId) => select(pickId, { animate: MOTION }));
  renderDetail(els.detail, result, scenario, { onShare: share });
  const others = result.scenarios.filter((s) => s.route.id !== id).map((s) => s.route);
  map.render(scenario.route, others, { animate: animate && MOTION });
  renderPareto(els.pareto, els.tip, result, activeId, (pickId) => select(pickId, { animate: MOTION }));
  renderCalendar(els.calendar, result, scenario.route.date);
  syncUrl();
  if (!first && window.matchMedia('(max-width: 1080px)').matches) {
    document.getElementById('detail').scrollIntoView({ behavior: MOTION ? 'smooth' : 'auto', block: 'start' });
  }
}

async function share(btn) {
  const url = `${location.origin}${buildUrl(result.scenarios.find((s) => s.route.id === activeId)?.key)}`;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Ссылка скопирована';
  } catch {
    btn.textContent = url;
  }
  setTimeout(() => (btn.textContent = 'Скопировать ссылку на маршрут'), 2200);
}

function logLines(lines) {
  return new Promise((resolve) => {
    els.scan.innerHTML = lines.map((l) => `<li>${l}</li>`).join('');
    const items = [...els.scan.children];
    if (!MOTION) {
      items.forEach((li) => li.classList.add('is-in'));
      resolve();
      return;
    }
    items.forEach((li, i) => setTimeout(() => li.classList.add('is-in'), 120 + i * 380));
    setTimeout(resolve, 120 + items.length * 380 + 200);
  });
}
