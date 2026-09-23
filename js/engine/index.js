// Точка входа движка: planRoutes(params) → сценарии, кандидаты, календарь, статистика.

import { getContext } from './context.js';
import { reachableAirports, localTransfer, nearestAirport, MODE_LABEL } from './ground.js';
import { enumeratePaths, ticketVariants, schedule } from './flights.js';
import { comfortScore, riskLevel } from './score.js';
import { pickScenarios, paretoFront } from './scenarios.js';
import { aviasalesLink, yandexTravelLink, yandexMapsRoute } from './links.js';
import { HOUR } from './geo.js';

export { getContext, MODE_LABEL };

export const DEFAULTS = {
  origin: 'EKB',
  destination: 'TYO',
  date: '2026-10-10',
  flex: 2,
  radiusKm: 500,
  modes: { train: true, bus: true, car: true },
  hourValue: 1500,
  allowSelfTransfer: true,
  allowHiddenCity: true,
  bags: false,
};

function addDays(dateISO, n) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function isoLocal(ms, tz) {
  const d = new Date(ms + tz * HOUR);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function buildCandidate({ dep, arr, path, v, sched, dateISO, ctx, origin, dest }) {
  const legs = [];
  const firstCity = ctx.cityOfAirport(path[0].from);
  const firstIntl = firstCity.country !== ctx.cityOfAirport(path[0].to).country;
  const buffer = firstIntl ? 2 : 1.5;
  const firstDep = sched.legs[0].dep;
  const atAirport = firstDep - buffer * HOUR;
  const local = localTransfer(dep.airport);
  const leaveCity = atAirport - local.hours * HOUR;

  const groundLegs = [];
  if (dep.ground) {
    const g = dep.ground;
    const leg = {
      kind: 'ground',
      mode: g.mode,
      from: origin,
      to: dep.city,
      dep: leaveCity - g.hours * HOUR,
      arr: leaveCity,
      hours: g.hours,
      price: g.price,
      label: g.label,
      night: g.night,
      km: g.km,
      tz: origin.tz,
      link:
        g.mode === 'car'
          ? yandexMapsRoute(origin, dep.city)
          : yandexTravelLink(origin, dep.city, isoLocal(leaveCity - g.hours * HOUR, origin.tz), g.mode),
    };
    legs.push(leg);
    groundLegs.push(leg);
  }
  legs.push({
    kind: 'ground',
    mode: 'local',
    from: dep.city,
    to: dep.airport,
    dep: leaveCity,
    arr: atAirport,
    hours: local.hours,
    price: local.price,
    label: local.label,
    tz: dep.city.tz,
  });
  legs.push({ kind: 'airport', airport: dep.airport, dep: atAirport, arr: firstDep, hours: buffer, tz: dep.city.tz });

  const ticketOf = new Map();
  v.tickets.forEach((t, i) => t.legs.forEach((e) => ticketOf.set(e, i)));

  sched.legs.forEach((s, i) => {
    const from = ctx.airports.get(s.edge.from);
    const to = ctx.airports.get(s.edge.to);
    if (i > 0) {
      legs.push({
        kind: 'layover',
        airport: from,
        city: ctx.cities.get(from.city),
        dep: sched.legs[i - 1].arr,
        arr: s.dep,
        hours: s.layoverBefore,
        selfTransfer: v.type === 'separate' && ticketOf.get(s.edge) !== ticketOf.get(sched.legs[i - 1].edge),
        tz: ctx.tzOfAirport(from.iata),
      });
    }
    legs.push({
      kind: 'flight',
      mode: 'plane',
      edge: s.edge,
      from,
      to,
      fromCity: ctx.cities.get(from.city),
      toCity: ctx.cities.get(to.city),
      dep: s.dep,
      arr: s.arr,
      hours: s.edge.hours,
      carrier: s.edge.carrier,
      carrierName: ctx.carriers[s.edge.carrier]?.name || s.edge.carrier,
      ticket: ticketOf.get(s.edge),
      tzFrom: ctx.tzOfAirport(from.iata),
      tzTo: ctx.tzOfAirport(to.iata),
    });
  });

  const lastArr = sched.legs[sched.legs.length - 1].arr;
  const localArr = localTransfer(arr.airport);
  const exitHours = 0.5 + localArr.hours;
  legs.push({
    kind: 'ground',
    mode: 'local',
    from: arr.airport,
    to: arr.city,
    dep: lastArr,
    arr: lastArr + exitHours * HOUR,
    hours: exitHours,
    price: localArr.price,
    label: 'выход и ' + localArr.label,
    tz: arr.city.tz,
  });
  let finalArr = lastArr + exitHours * HOUR;
  if (arr.ground) {
    const g = arr.ground;
    const leg = {
      kind: 'ground',
      mode: g.mode,
      from: arr.city,
      to: dest,
      dep: finalArr,
      arr: finalArr + g.hours * HOUR,
      hours: g.hours,
      price: g.price,
      label: g.label,
      night: g.night,
      km: g.km,
      tz: arr.city.tz,
      link:
        g.mode === 'car'
          ? yandexMapsRoute(arr.city, dest)
          : yandexTravelLink(arr.city, dest, isoLocal(finalArr, arr.city.tz), g.mode),
    };
    legs.push(leg);
    groundLegs.push(leg);
    finalArr = leg.arr;
  }

  const flags = [...v.flags];
  if (dep.city.id !== origin.id || arr.city.id !== dest.id) flags.push('neighbor-airport');
  if (sched.maxLayover > 8) flags.push('long-layover');
  if (groundLegs.some((g) => g.night)) flags.push('night-train');

  const groundPrice = legs.filter((l) => l.kind === 'ground').reduce((s, l) => s + l.price, 0);
  const price = groundPrice + v.price;
  const hours = Math.round(((finalArr - legs[0].dep) / HOUR) * 10) / 10;

  const tickets = v.tickets.map((t, i) => {
    const first = t.legs[0];
    const last = t.legs[t.legs.length - 1];
    const depMs = sched.legs.find((s) => s.edge === first).dep;
    return {
      index: i,
      carrier: t.carrier,
      name: ctx.carriers[t.carrier]?.name || t.carrier,
      price: t.price,
      lcc: t.lcc,
      from: first.from,
      to: t.ghost ? t.ghost.to : last.to,
      exitAt: t.ghost ? last.to : null,
      link: aviasalesLink(first.from, t.ghost ? t.ghost.to : last.to, isoLocal(depMs, ctx.tzOfAirport(first.from))),
    };
  });

  // Цепочка для заголовка: Екатеринбург → поезд → Челябинск → самолёт → Стамбул → самолёт → Токио
  const chain = [{ type: 'city', name: origin.name, id: origin.id }];
  for (const l of legs) {
    if (l.kind === 'ground' && l.mode !== 'local') {
      chain.push({ type: 'mode', mode: l.mode });
      chain.push({ type: 'city', name: l.to.name, id: l.to.id });
    } else if (l.kind === 'flight') {
      chain.push({ type: 'mode', mode: 'plane', carrier: l.carrier });
      chain.push({ type: 'city', name: l.toCity.name, id: l.toCity.id, iata: l.to.iata });
    }
  }
  const chainKey = chain.map((c) => (c.type === 'city' ? c.id : c.mode)).join('>');
  const flightCount = sched.legs.length;
  const base = {
    id: `${dep.airport.iata}|${dep.ground?.mode || ''}|${path.map((e) => e.carrier + e.from + e.to).join('-')}|${arr.ground?.mode || ''}|${v.type}`,
    date: dateISO,
    legs,
    price,
    hours,
    flags,
    groundLegs,
    flightCount,
    tickets,
    ticketsPrice: v.price,
    flightHours: Math.round(((lastArr - firstDep) / HOUR) * 10) / 10,
    depAirport: dep.airport.iata,
    arrAirport: arr.airport.iata,
    depCity: dep.city,
    arrCity: arr.city,
    variant: v.type,
    ghost: v.ghost ? { to: ctx.airports.get(v.ghost.to), city: ctx.cityOfAirport(v.ghost.to) } : null,
    chain,
    chainKey,
    transfers: flightCount - 1 + groundLegs.length,
    start: legs[0].dep,
    end: finalArr,
  };
  base.comfort = comfortScore(base);
  base.risk = riskLevel(flags);
  return base;
}

export function planRoutes(input = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const p = { ...DEFAULTS, ...input, modes: { ...DEFAULTS.modes, ...(input.modes || {}) } };
  const ctx = getContext();
  const origin = ctx.cities.get(p.origin);
  const dest = ctx.cities.get(p.destination);
  if (!origin || !dest) return empty(p, 'Такого города в базе нет.');
  if (origin.id === dest.id) return empty(p, 'Выберите два разных города.');

  const depOpts = reachableAirports(p.origin, ctx, p);
  const arrOpts = reachableAirports(p.destination, ctx, { radiusKm: Math.min(p.radiusKm, 300), modes: p.modes });
  const fromSet = new Set(depOpts.map((o) => o.airport.iata));
  const toSet = new Set(arrOpts.map((o) => o.airport.iata));
  if (!fromSet.size) return empty(p, `Если вы в ${origin.loc}, в радиусе ${p.radiusKm} км нет ни одного аэропорта — увеличьте радиус.`);
  if (!toSet.size) return empty(p, `В ${dest.loc} и вокруг нет аэропортов в этой базе.`);

  const paths = enumeratePaths(fromSet, toSet, ctx, { maxFlights: 3 });
  const byKey = new Map();
  for (const path of paths) {
    const k = path[0].from + '>' + path[path.length - 1].to;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(path);
  }

  const dates = [];
  for (let d = -p.flex; d <= p.flex; d++) dates.push(addDays(p.date, d));
  const raw = [];
  let combos = 0;
  for (const dateISO of dates) {
    for (const dep of depOpts) {
      for (const arr of arrOpts) {
        const list = byKey.get(dep.airport.iata + '>' + arr.airport.iata);
        if (!list) continue;
        for (const path of list) {
          for (const v of ticketVariants(path, dateISO, ctx, p, toSet)) {
            combos++;
            const sched = schedule(path, dateISO, ctx, { selfTransfer: v.type === 'separate' });
            if (!sched) continue;
            raw.push(buildCandidate({ dep, arr, path, v, sched, dateISO, ctx, origin, dest }));
          }
        }
      }
    }
  }

  // Календарь: минимальная цена на каждую дату окна.
  const calendar = dates.map((date) => {
    const day = raw.filter((c) => c.date === date);
    const best = day.sort((a, b) => a.price - b.price)[0];
    return { date, price: best ? best.price : null, hours: best ? best.hours : null };
  });

  // Один и тот же маршрут в разные даты — одна карточка с лучшей ценой.
  const best = new Map();
  for (const c of raw) {
    const prev = best.get(c.id);
    if (!prev) {
      c.byDate = { [c.date]: c.price };
      best.set(c.id, c);
    } else {
      prev.byDate[c.date] = c.price;
      if (c.price < prev.price || (c.price === prev.price && c.hours < prev.hours)) {
        c.byDate = prev.byDate;
        best.set(c.id, c);
      }
    }
  }
  const candidates = [...best.values()];

  // «Как у обычного агрегатора»: самый дешёвый единый билет из ближайшего аэропорта на точную дату.
  const nearest = nearestAirport(p.origin, ctx);
  const plain = raw.filter(
    (c) => nearest && c.depAirport === nearest.iata && c.variant === 'single' && c.arrCity.id === dest.id,
  );
  const exact = plain.filter((c) => c.date === p.date);
  const b = (exact.length ? exact : plain).sort((a, b) => a.ticketsPrice - b.ticketsPrice)[0];
  const baseline = b
    ? { price: b.ticketsPrice, hours: b.flightHours, airport: nearest, chain: b.chain, route: b, date: b.date }
    : null;

  const scenarios = pickScenarios(candidates, p);
  const front = new Set(paretoFront(candidates).map((c) => c.id));
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  return {
    params: p,
    origin,
    dest,
    scenarios,
    candidates,
    front,
    baseline,
    calendar,
    depOptions: depOpts,
    error: scenarios.length ? null : `${origin.name} → ${dest.name}: маршрутов не нашлось — попробуйте другой радиус или даты.`,
    stats: {
      airports: fromSet.size,
      depOptions: depOpts.length,
      paths: paths.length,
      combos,
      candidates: candidates.length,
      dates: dates.length,
      ms,
    },
  };
}

function empty(p, error) {
  return { params: p, scenarios: [], candidates: [], front: new Set(), baseline: null, calendar: [], depOptions: [], error, stats: {} };
}
