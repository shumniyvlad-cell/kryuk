// Ссылки на покупку: считаем мы, покупает человек там, где привык.

export function aviasalesLink(fromIata, toIata, dateISO) {
  const [, m, d] = dateISO.split('-');
  return `https://www.aviasales.ru/search/${fromIata}${d}${m}${toIata}1`;
}

export function yandexTravelLink(fromCity, toCity, dateISO, mode) {
  const section = mode === 'bus' ? 'buses' : 'trains';
  return `https://travel.yandex.ru/${section}/${fromCity.slug}--${toCity.slug}/?when=${dateISO}`;
}

export function yandexMapsRoute(a, b) {
  return `https://yandex.ru/maps/?rtext=${a.lat},${a.lon}~${b.lat},${b.lon}&rtt=auto`;
}
