// Комфорт, риск и флаги маршрута.

export const FLAG_INFO = {
  'neighbor-airport': { title: 'соседний аэропорт', text: 'Вылет не из своего города — сначала наземное плечо.' },
  'self-transfer': { title: 'раздельные билеты', text: 'Стыковку никто не гарантирует: при опоздании второй билет сгорает. Багаж получать и сдавать заново.' },
  'hidden-city': { title: 'hidden-city', text: 'Билет куплен до более дальнего города, выходите на пересадке. Только в один конец, без сдаваемого багажа; авиакомпании такое не любят.' },
  'long-layover': { title: 'длинная стыковка', text: 'Больше 8 часов между рейсами — можно выйти в город или поспать в отеле.' },
  'night-train': { title: 'ночной поезд', text: 'Ночь в пути, зато не теряете день.' },
  lcc: { title: 'лоукостер', text: 'Багаж и выбор места за отдельные деньги.' },
  overnight: { title: 'ночь в пути', text: 'Часть дороги приходится на ночь.' },
};

export function comfortScore(c) {
  let s = 100;
  s -= 12 * Math.max(0, c.flightCount - 1);
  for (const g of c.groundLegs) {
    if (g.mode === 'train') s -= g.night ? 14 : 8;
    else if (g.mode === 'bus') s -= 12;
    else if (g.mode === 'car') s -= 6;
  }
  if (c.flags.includes('self-transfer')) s -= 15;
  if (c.flags.includes('hidden-city')) s -= 10;
  if (c.flags.includes('long-layover')) s -= 10;
  if (c.flags.includes('lcc')) s -= 5;
  s -= Math.max(0, c.hours - 12) * 0.4;
  return Math.round(Math.max(0, Math.min(100, s)));
}

export function riskLevel(flags) {
  if (flags.includes('hidden-city')) return 2;
  if (flags.includes('self-transfer')) return 1;
  return 0;
}
