// Индексы по данным: города, аэропорты, наземные рёбра, граф перелётов.

import { CITIES } from '../data/cities.js';
import { AIRPORTS } from '../data/airports.js';
import { GROUND } from '../data/ground.js';
import { FLIGHTS, CARRIERS } from '../data/flights.js';

let cached = null;

export function getContext() {
  if (cached) return cached;
  const cities = new Map(CITIES.map((c) => [c.id, c]));
  const airports = new Map(AIRPORTS.map((a) => [a.iata, a]));
  const airportsByCity = new Map();
  for (const a of AIRPORTS) {
    if (!airportsByCity.has(a.city)) airportsByCity.set(a.city, []);
    airportsByCity.get(a.city).push(a);
  }
  const ground = new Map();
  const addGround = (cityId, edge) => {
    if (!ground.has(cityId)) ground.set(cityId, []);
    ground.get(cityId).push(edge);
  };
  for (const g of GROUND) {
    addGround(g.from, { ...g, from: g.from, to: g.to });
    addGround(g.to, { ...g, from: g.to, to: g.from });
  }
  const out = new Map();
  const inn = new Map();
  const addEdge = (e) => {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inn.has(e.to)) inn.set(e.to, []);
    out.get(e.from).push(e);
    inn.get(e.to).push(e);
  };
  for (const f of FLIGHTS) {
    const { both, ...rest } = f;
    addEdge({ ...rest });
    if (both) addEdge({ ...rest, from: f.to, to: f.from });
  }
  cached = {
    cities,
    airports,
    airportsByCity,
    ground,
    graph: { out, inn },
    carriers: CARRIERS,
    cityOfAirport: (iata) => cities.get(airports.get(iata).city),
    tzOfAirport: (iata) => cities.get(airports.get(iata).city).tz,
  };
  return cached;
}
