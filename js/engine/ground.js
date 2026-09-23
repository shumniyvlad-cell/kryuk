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

// Все аэропорты, до которых от города можно доехать в пределах радиуса,
// с вариантами наземного плеча для каждого.
export function reachableAirports(cityId, ctx, opts) {
  const city = ctx.cities.get(cityId);
  const { radiusKm = 500, modes = { train: true, bus: true, car: true } } = opts;
  const result = [];
  for (const airport of ctx.airports.values()) {
    const aCity = ctx.cities.get(airport.city);
    if (!aCity) continue;
    if (aCity.id === cityId) {
      result.push({ airport, city: aCity, ground: null, km: 0 });
      continue;
    }
    const km = roadKm(city, aCity);
    if (km > radiusKm) continue;
    // Наземка только внутри одной страны — границу на поезде до аэропорта не моделируем.
    if (aCity.country !== city.country) continue;
    const options = [];
    for (const g of ctx.ground.get(cityId) || []) {
      if (g.to !== aCity.id) continue;
      if (!modes[g.mode]) continue;
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
    if (modes.car && km <= 700) options.push(carOption(km));
    for (const ground of options) result.push({ airport, city: aCity, ground, km: Math.round(km) });
  }
  return result;
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
