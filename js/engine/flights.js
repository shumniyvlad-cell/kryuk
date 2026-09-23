// Перелёты: перебор связок, варианты оформления билетов, расписание.

import { haversineKm, HOUR, MIN } from './geo.js';
import { flightFare, throughFactor, competitiveness, departureHours } from './pricing.js';

const BAG_FEE = 2500;

function frequency(edge, ctx) {
  if (edge.freq) return edge.freq;
  const a = ctx.airports.get(edge.from);
  const b = ctx.airports.get(edge.to);
  const domestic = ctx.cities.get(a.city).country === ctx.cities.get(b.city).country;
  const hub = Math.max(a.hub, b.hub);
  if (domestic && hub >= 3) return 3;
  if (domestic && hub >= 2) return 2;
  if (!domestic && a.hub >= 2 && b.hub >= 2) return 2;
  return 1;
}

// Все связки ≤ maxFlights перелётов из набора аэропортов вылета в набор прилёта.
// Отсекаем: возврат в уже посещённый город, аэропорты, из которых до цели
// не долететь за оставшиеся плечи, и явные крюки длиннее 2,3 прямых расстояний.
export function enumeratePaths(fromSet, toSet, ctx, { maxFlights = 3 } = {}) {
  const { graph, airports, cities } = ctx;
  const reach = [new Set(toSet)];
  for (let k = 1; k <= maxFlights; k++) {
    const next = new Set(reach[k - 1]);
    for (const node of reach[k - 1]) for (const e of graph.inn.get(node) || []) next.add(e.from);
    reach.push(next);
  }
  const pos = (iata) => cities.get(airports.get(iata).city);
  const paths = [];
  for (const start of fromSet) {
    if (toSet.has(start) || !reach[maxFlights].has(start)) continue;
    const direct = Math.min(...[...toSet].map((t) => haversineKm(pos(start), pos(t))));
    // Два плеча — можно и через далёкий хаб, три плеча — только без больших крюков.
    const limits = [0, direct * 3, direct * 2.3 + 800, direct * 1.7 + 500];
    const visited = new Set([airports.get(start).city]);
    const legs = [];
    const dfs = (node, dist) => {
      if (legs.length && toSet.has(node)) {
        paths.push(legs.slice());
        return;
      }
      if (legs.length >= maxFlights) return;
      const remaining = maxFlights - legs.length - 1;
      for (const e of graph.out.get(node) || []) {
        const cityTo = airports.get(e.to).city;
        if (visited.has(cityTo)) continue;
        if (!reach[remaining].has(e.to)) continue;
        const d = dist + haversineKm(pos(e.from), pos(e.to));
        if (d > limits[Math.min(3, legs.length + 1 + (toSet.has(e.to) ? 0 : 1))]) continue;
        visited.add(cityTo);
        legs.push(e);
        dfs(e.to, d);
        legs.pop();
        visited.delete(cityTo);
      }
    };
    dfs(start, 0);
  }
  return paths;
}

function isLcc(carrier, ctx) {
  return !!(ctx.carriers[carrier] && ctx.carriers[carrier].lcc);
}

// Как можно купить эту связку: единым билетом, раздельными билетами,
// и — если выгодно — билетом «дальше» с выходом в нужном городе (hidden-city).
export function ticketVariants(path, dateISO, ctx, opts, toSet) {
  const fares = path.map((e) => flightFare(e, dateISO));
  const sum = fares.reduce((a, b) => a + b, 0);
  const carriers = new Set(path.map((e) => e.carrier));
  const variants = [];
  const bagFee = (carrier) => (opts.bags && isLcc(carrier, ctx) ? BAG_FEE : 0);

  if (carriers.size === 1) {
    const carrier = path[0].carrier;
    const lcc = isLcc(carrier, ctx);
    const factor = lcc ? Math.min(1, throughFactor(path.length) + 0.1) : throughFactor(path.length);
    const price = Math.round((sum * factor) / 100) * 100 + bagFee(carrier);
    variants.push({
      type: 'single',
      price,
      tickets: [{ legs: path, carrier, price, lcc }],
      flags: lcc ? ['lcc'] : [],
    });

    if (opts.allowHiddenCity && !opts.bags && !lcc) {
      const last = path[path.length - 1].to;
      const pathCities = new Set(path.map((e) => ctx.airports.get(e.to).city));
      pathCities.add(ctx.airports.get(path[0].from).city);
      let best = null;
      for (const e of ctx.graph.out.get(last) || []) {
        if (e.carrier !== carrier) continue;
        const cityTo = ctx.airports.get(e.to).city;
        if (pathCities.has(cityTo) || toSet.has(e.to)) continue;
        const comp = competitiveness(e.to, ctx.graph);
        const ext = (sum + flightFare(e, dateISO)) * throughFactor(path.length + 1) * (1 - 0.35 * comp);
        if (!best || ext < best.price) best = { price: Math.round(ext / 100) * 100, ghost: e };
      }
      if (best && best.price < price * 0.92) {
        variants.push({
          type: 'hidden',
          price: best.price,
          tickets: [{ legs: path, carrier, price: best.price, lcc: false, ghost: best.ghost }],
          flags: ['hidden-city'],
          ghost: best.ghost,
        });
      }
    }
  } else if (opts.allowSelfTransfer) {
    // Соседние плечи одной авиакомпании объединяем в один билет, остальное — раздельно.
    const tickets = [];
    for (let i = 0; i < path.length; i++) {
      const e = path[i];
      const prev = tickets[tickets.length - 1];
      if (prev && prev.carrier === e.carrier) {
        prev.legs.push(e);
        prev.raw += fares[i];
      } else {
        tickets.push({ legs: [e], carrier: e.carrier, raw: fares[i], lcc: isLcc(e.carrier, ctx) });
      }
    }
    let price = 0;
    for (const t of tickets) {
      const factor = t.lcc ? 1 : throughFactor(t.legs.length);
      t.price = Math.round((t.raw * factor) / 100) * 100 + bagFee(t.carrier);
      delete t.raw;
      price += t.price;
    }
    const flags = ['self-transfer'];
    if (tickets.some((t) => t.lcc)) flags.push('lcc');
    variants.push({ type: 'separate', price, tickets, flags });
  }
  return variants;
}

function localToUTC(dateISO, hour, tz) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + (hour - tz) * HOUR;
}

function localDateISO(ms, tz) {
  const d = new Date(ms + tz * HOUR);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDays(dateISO, n) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function operates(edge, dateISO) {
  const dow = new Date(dateISO + 'T00:00:00Z').getUTCDay();
  return !edge.days || edge.days.includes(dow);
}

// Ближайший вылет рейса не раньше момента notBefore (UTC ms).
function nextDeparture(edge, notBefore, ctx) {
  const tz = ctx.tzOfAirport(edge.from);
  const hours = departureHours(edge, frequency(edge, ctx));
  let day = localDateISO(notBefore, tz);
  for (let i = 0; i < 4; i++) {
    if (operates(edge, day)) {
      for (const h of hours) {
        const t = localToUTC(day, h, tz);
        if (t >= notBefore) return t;
      }
    }
    day = addDays(day, 1);
  }
  return null;
}

// Расписание связки на дату: выбираем вылет первого рейса так, чтобы
// суммарное время в пути было минимальным; стыковки — ближайшие возможные.
export function schedule(path, dateISO, ctx, { selfTransfer = false } = {}) {
  const first = path[0];
  if (!operates(first, dateISO)) return null;
  const tz0 = ctx.tzOfAirport(first.from);
  let best = null;
  for (const h of departureHours(first, frequency(first, ctx))) {
    const legs = [];
    let dep = localToUTC(dateISO, h, tz0);
    let ok = true;
    let maxLayover = 0;
    for (let i = 0; i < path.length; i++) {
      const e = path[i];
      if (i > 0) {
        const airport = ctx.airports.get(e.from);
        const mct = selfTransfer ? Math.max(150, airport.mct + 60) : airport.mct;
        const prevArr = legs[i - 1].arr;
        const t = nextDeparture(e, prevArr + mct * MIN, ctx);
        if (t === null || t - prevArr > 26 * HOUR) {
          ok = false;
          break;
        }
        maxLayover = Math.max(maxLayover, (t - prevArr) / HOUR);
        dep = t;
      }
      const arr = dep + e.hours * HOUR;
      legs.push({ edge: e, dep, arr, layoverBefore: i > 0 ? (dep - legs[i - 1].arr) / HOUR : 0 });
    }
    if (!ok) continue;
    const total = legs[legs.length - 1].arr - legs[0].dep;
    if (!best || total < best.total) best = { legs, total, maxLayover };
  }
  return best;
}
