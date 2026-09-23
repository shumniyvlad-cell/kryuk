// Отбор сценариев из множества найденных маршрутов.

export const SCENARIO_META = {
  fastest: { title: 'Самый быстрый', short: 'быстрый' },
  optimal: { title: 'Оптимальный', short: 'оптимум' },
  cheapest: { title: 'Самый дешёвый', short: 'дешёвый' },
  comfort: { title: 'Самый комфортный', short: 'комфорт' },
  smart: { title: 'Крюк ради экономии', short: 'крюк' },
  hack: { title: 'Хитрый', short: 'хак' },
  more: { title: 'Ещё вариант', short: 'ещё' },
  airport: { title: 'Другой аэропорт', short: 'аэропорт' },
  hub: { title: 'Через другой хаб', short: 'хаб' },
  purchase: { title: 'Другая покупка билетов', short: 'покупка' },
  ground: { title: 'Другой транспорт до аэропорта', short: 'транспорт' },
  backup: { title: 'Запасной вариант', short: 'запасной' },
};

const ORDER = ['fastest', 'optimal', 'cheapest', 'comfort', 'smart', 'hack'];

// Строгий Парето-фронт по цене и времени.
export function paretoFront(cands) {
  const sorted = [...cands].sort((a, b) => a.price - b.price || a.hours - b.hours || b.comfort - a.comfort);
  const front = [];
  let bestHours = Infinity;
  for (const c of sorted) {
    if (c.hours < bestHours) {
      front.push(c);
      bestHours = c.hours;
    }
  }
  return front;
}

// «Осмысленный» фронт: выкидываем маршруты, которые выигрывают у более
// быстрого/дешёвого/безопасного соседа лишь символически.
export function meaningfulFront(cands) {
  const dominated = (c, f) =>
    f !== c &&
    ((f.hours <= c.hours - 1 && f.price <= c.price * 1.03) ||
      (f.price <= c.price * 1.05 && f.hours <= c.hours * 0.65) ||
      (f.price <= c.price - Math.max(1500, c.price * 0.04) && f.hours <= c.hours + 0.75) ||
      (f.risk < c.risk && f.price <= c.price * 1.04 && f.hours <= c.hours + 1) ||
      (f.comfort >= c.comfort + 15 && f.price <= c.price * 1.03 && f.hours <= c.hours + 1));
  const front = paretoFront(cands);
  const pool = cands.filter((c) => !front.some((f) => dominated(c, f)));
  return pool.length ? pool : front;
}

const byPrice = (a, b) => a.price - b.price || a.risk - b.risk || a.hours - b.hours;
// Время сравниваем с шагом в полчаса: при равенстве предпочитаем без риска и дешевле.
const byHours = (a, b) => Math.round(a.hours * 2) - Math.round(b.hours * 2) || a.risk - b.risk || a.price - b.price;

const flightKey = (c) => c.chain.filter((p) => p.type === 'city' && p.iata).map((p) => p.iata).join('>');
const groundKey = (c) => c.chain.filter((p) => p.type === 'mode').map((p) => p.mode).join('>');

export function pickScenarios(cands, params, limit = 7) {
  if (!cands.length) return [];
  const hourValue = params.hourValue ?? 1500;
  // Риск стоит денег: раздельные билеты и hidden-city не должны побеждать «по умолчанию».
  const score = (c) => c.price * (1 + 0.08 * c.risk) + hourValue * c.hours;
  const pool = meaningfulFront(cands);
  const picks = {};

  picks.fastest = [...pool].sort(byHours)[0];
  picks.cheapest = [...pool].sort(byPrice)[0];
  picks.optimal = [...pool].sort((a, b) => score(a) - score(b))[0];

  const comfortPool = cands.filter(
    (c) => c.hours <= picks.fastest.hours * 1.5 && c.price <= picks.cheapest.price * 1.6 && c.risk === 0,
  );
  picks.comfort = (comfortPool.length ? comfortPool : pool).sort(
    (a, b) => b.comfort - a.comfort || score(a) - score(b),
  )[0];

  const opt = picks.optimal;
  const smartPool = pool.filter(
    (c) => c.price <= opt.price * 0.9 && c.hours > opt.hours && c.hours - opt.hours <= 6,
  );
  const gain = (c) => (opt.price - c.price) / (c.hours - opt.hours + 0.5);
  picks.smart = smartPool.sort((a, b) => gain(b) - gain(a))[0];

  const isHack = (c) => c.risk > 0;
  const cleanCheapest = pool.filter((c) => !isHack(c)).sort(byPrice)[0];
  const hackPool = pool.filter((c) => isHack(c) && (!cleanCheapest || c.price <= cleanCheapest.price * 0.93));
  picks.hack = hackPool.sort(byPrice)[0];

  const scenarios = [];
  const used = new Map();
  for (const key of ORDER) {
    const c = picks[key];
    if (!c) continue;
    if (used.has(c.id)) {
      used.get(c.id).tags.push(key);
      continue;
    }
    const s = { key, ...SCENARIO_META[key], route: c, tags: [key] };
    used.set(c.id, s);
    scenarios.push(s);
  }

  // Добиваем до лимита разными стратегиями: другой аэропорт, другой хаб,
  // другой способ покупки, другой наземный транспорт. Источники — по убыванию
  // строгости: осмысленный фронт, строгий фронт, затем разумная окрестность.
  const airportsKey = (c) => `${c.depAirport}>${c.arrAirport}`;
  const passes = [
    ['airport', (c) => !scenarios.some((s) => airportsKey(s.route) === airportsKey(c))],
    ['hub', (c) => !scenarios.some((s) => flightKey(s.route) === flightKey(c))],
    ['purchase', (c) => !scenarios.some((s) => flightKey(s.route) === flightKey(c) && s.route.variant === c.variant)],
    ['ground', (c) => !scenarios.some((s) => flightKey(s.route) === flightKey(c) && groundKey(s.route) === groundKey(c))],
  ];
  // Проигрывает уже выбранному по цене, времени и риску сразу — годится только как запасной.
  const dominatedByChosen = (c) =>
    scenarios.some((s) => s.route.price <= c.price && s.route.hours <= c.hours + 0.5 && s.route.risk <= c.risk);
  const fastest = picks.fastest;
  const cheapest = picks.cheapest;
  const box = (c) =>
    c.price <= cheapest.price * 1.35 && c.hours <= Math.max(fastest.hours * 1.8, fastest.hours + 6);
  const sources = [pool, paretoFront(cands), cands.filter((c) => c.risk === 0 && box(c)), cands.filter(box)];
  for (const source of sources) {
    const rest = source.filter((c) => !used.has(c.id)).sort((a, b) => score(a) - score(b));
    for (const [kind, pass] of passes) {
      for (const c of rest) {
        if (scenarios.length >= limit) break;
        if (used.has(c.id) || !pass(c)) continue;
        const key = dominatedByChosen(c) ? 'backup' : kind;
        scenarios.push({ key, ...SCENARIO_META[key], kind, route: c, tags: [key] });
        used.set(c.id, true);
      }
    }
    if (scenarios.length >= Math.min(limit, 5)) break;
  }
  return scenarios;
}
