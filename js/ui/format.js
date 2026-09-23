// Форматирование чисел, времени и русских склонений.

export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const HOUR = 3600 * 1000;

export function rub(n) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function hoursText(h, { short = false } = {}) {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (short) return mm ? `${hh} ч ${mm} мин` : `${hh} ч`;
  if (hh >= 48) {
    const d = Math.floor(hh / 24);
    return `${d} ${plural(d, 'день', 'дня', 'дней')} ${hh % 24} ч`;
  }
  return mm ? `${hh} ч ${String(mm).padStart(2, '0')} мин` : `${hh} ч`;
}

export function hoursShort(h) {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh} ч ${mm} м` : `${hh} ч`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function dateLong(iso) {
  const d = parseISO(iso);
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`;
}

export function dateShort(iso) {
  const d = parseISO(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}, ${WEEKDAYS_SHORT[d.getUTCDay()]}`;
}

export function dateRange(isoA, isoB) {
  const a = parseISO(isoA);
  const b = parseISO(isoB);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS_GEN[a.getUTCMonth()]}`;
  return `${dateLong(isoA)} – ${dateLong(isoB)}`;
}

// Локальное время точки маршрута: ms UTC + часовой пояс города.
export function localParts(ms, tz) {
  const d = new Date(ms + tz * HOUR);
  return {
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    day: `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`,
    weekday: WEEKDAYS_SHORT[d.getUTCDay()],
    iso: toISO(d),
  };
}

export function flexText(n) {
  if (!n) return 'точно в этот день';
  return `± ${n} ${plural(n, 'день', 'дня', 'дней')}`;
}

export function kmText(km) {
  return `${Math.round(km)} км`;
}

export function modesPhrase(modes) {
  const parts = [];
  if (modes.train) parts.push('поездом');
  if (modes.bus) parts.push('автобусом');
  if (modes.car) parts.push('попуткой');
  if (!parts.length) return 'только из своего города';
  if (parts.length === 1) return `только ${parts[0]}`;
  return `${parts.slice(0, -1).join(', ')} или ${parts[parts.length - 1]}`;
}

export function waysWord(n) {
  return plural(n, 'способ', 'способа', 'способов');
}
