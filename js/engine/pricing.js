// Модель цен и расписаний. Данных о реальных тарифах в браузере нет,
// поэтому цены считаются от базового тарифа маршрута с детерминированным
// разбросом по дате: та же дата → та же цена.

import { hashStr, rand01, noise } from './geo.js';

// Воскресенье … суббота. Вторник/среда дешевле, пятница/воскресенье дороже.
const DOW = [1.08, 1.02, 0.94, 0.93, 0.97, 1.1, 1.0];

// Скидка сквозного тарифа: билет A→H→B у одной авиакомпании дешевле суммы двух.
const THROUGH = { 1: 1, 2: 0.85, 3: 0.78, 4: 0.74 };

export function dayOfWeek(dateISO) {
  return new Date(dateISO + 'T00:00:00Z').getUTCDay();
}

export function flightFare(edge, dateISO) {
  const dow = DOW[dayOfWeek(dateISO)];
  const n = noise(`fare|${edge.from}|${edge.to}|${edge.carrier}|${dateISO}`, 0.82, 1.28);
  return Math.round((edge.base * dow * n) / 100) * 100;
}

export function throughFactor(legs) {
  return THROUGH[Math.min(legs, 4)];
}

// Насколько конкурентен рынок в аэропорту прилёта: чем больше разных
// авиакомпаний туда летает, тем сильнее давят цены на сквозные тарифы.
export function competitiveness(iata, graph) {
  const carriers = new Set((graph.inn.get(iata) || []).map((e) => e.carrier));
  return Math.min(1, Math.max(0, (carriers.size - 1) / 5));
}

// Часы вылета (местное время) для рейса. Один рейс в день, у частых
// направлений — несколько.
export function departureHours(edge, freq) {
  const first = 6 + Math.floor(rand01(hashStr(`dep|${edge.from}|${edge.to}|${edge.carrier}`)) * 16);
  if (freq <= 1) return [first];
  const step = Math.floor(16 / freq);
  const out = [];
  for (let i = 0; i < freq; i++) out.push(6 + ((first - 6 + i * step) % 17));
  return out.sort((a, b) => a - b);
}
