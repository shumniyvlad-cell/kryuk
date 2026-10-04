// Наземная часть: какие аэропорты в радиусе и как до них добраться.

import { roadKm, haversineKm } from './geo.js';

export const MODE_LABEL = {
  train: 'поезд',
  bus: 'автобус',
  car: 'авто',
  plane: 'самолёт',
  local: 'трансфер',
};

// Попутка / своя машина / такси на дальнее расстояние — считается по километражу.
function carOption(km) {
  const hours = km / 80 + 0.25 + Math.floor(km / 300) * 0.4;
  const price = Math.max(600, Math.round((km * 3.4) / 50) * 50);
  return {
    mode: 'car',
    hours: Math.round(hours * 10) / 10,
    price,
    comfort: 3,
    night: false,
    label: 'попутка или своя машина',
    km: Math.round(km),
  };
}

// Из центра города до аэропорта: аэроэкспресс, такси, автобус.
export function localTransfer(airport) {
  const km = airport.kmFromCity || 15;
  return {
    mode: 'local',
    hours: Math.round((0.35 + km / 45) * 10) / 10,
    price: Math.round((350 + km * 22) / 50) * 50,
    comfort: 4,
    night: false,
    label: airport.hub >= 2 ? 'аэроэкспресс или такси' : 'такси или автобус',
    km,
  };
}

// Варианты наземного плеча между двумя городами: рёбра из базы плюс машина.
// Границу пересекаем только поездами и автобусами из базы — машину через неё не считаем.
export function groundOptions(city, other, ctx, modes, { maxCarKm = 700 } = {}) {
  const km = roadKm(city, other);
  const options = [];
  for (const g of ctx.ground.get(city.id) || []) {
    if (g.to !== other.id || !modes[g.mode]) continue;
    options.push({
      mode: g.mode,
      hours: g.hours,
      price: g.price,
      comfort: g.comfort,
      night: !!g.night,
      label: g.label || (g.mode === 'train' ? (g.night ? 'ночной поезд' : 'поезд') : 'автобус'),
      perDay: g.perDay,
      km: Math.round(km),
    });
  }
  if (modes.car && other.country === city.country && km <= maxCarKm) options.push(carOption(km));
  return options;
}

// Все аэропорты в радиусе (по прямой — радиус и есть круг на карте)
// с вариантами наземного плеча для каждого. Прямой поезд или автобус из базы
// считаем и чуть дальше радиуса: ночной поезд в Москву — обычное дело.
export function reachableAirports(cityId, ctx, opts) {
  const city = ctx.cities.get(cityId);
  const { radiusKm = 500, modes = { train: true, bus: true, car: true }, extendByEdges = true } = opts;
  const result = [];
  for (const airport of ctx.airports.values()) {
    const aCity = ctx.cities.get(airport.city);
    if (!aCity) continue;
    if (aCity.id === cityId) {
      result.push({ airport, city: aCity, ground: null, km: 0 });
      continue;
    }
    const straight = haversineKm(city, aCity);
    if (straight > radiusKm * (extendByEdges ? 1.5 : 1)) continue;
    for (const ground of groundOptions(city, aCity, ctx, modes)) {
      if (straight > radiusKm && ground.mode === 'car') continue;
      result.push({ airport, city: aCity, ground, km: ground.km });
    }
  }
  return result;
}

// Когда в радиусе пусто: ближайшие аэропорты, до которых вообще можно доехать.
export function nearestReachable(cityId, ctx, opts, limit = 2) {
  const city = ctx.cities.get(cityId);
  const modes = opts.modes || { train: true, bus: true, car: true };
  const found = [];
  for (const airport of ctx.airports.values()) {
    const aCity = ctx.cities.get(airport.city);
    if (!aCity || aCity.id === cityId) continue;
    const options = groundOptions(city, aCity, ctx, modes, { maxCarKm: 1000 });
    if (!options.length) continue;
    found.push({ airport, city: aCity, options, straight: haversineKm(city, aCity) });
  }
  found.sort((a, b) => a.straight - b.straight);
  const picked = found.slice(0, limit);
  return {
    list: picked.flatMap((f) => f.options.map((ground) => ({ airport: f.airport, city: f.city, ground, km: ground.km }))),
    cities: picked.map((f) => ({ name: f.city.name, km: Math.round(f.straight) })),
  };
}

// Ближайший аэропорт к городу — то, откуда «обычный агрегатор» начнёт поиск.
export function nearestAirport(cityId, ctx) {
  const city = ctx.cities.get(cityId);
  const own = ctx.airportsByCity.get(cityId);
  if (own && own.length) return own[0];
  let best = null;
  let bestKm = Infinity;
  for (const a of ctx.airports.values()) {
    const c = ctx.cities.get(a.city);
    if (!c || c.country !== city.country) continue;
    const km = haversineKm(city, c);
    if (km < bestKm) {
      bestKm = km;
      best = a;
    }
  }
  return best;
}
