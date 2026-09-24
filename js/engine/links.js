// Ссылки на покупку: считаем мы, покупает человек там, где привык.
// Форматы — те, что сами сайты используют в адресной строке, без слагов и сокращённых дат.

export function aviasalesLink(fromIata, toIata, dateISO) {
  const q = new URLSearchParams({
    origin_iata: fromIata,
    destination_iata: toIata,
    depart_date: dateISO,
    adults: '1',
    children: '0',
    infants: '0',
    trip_class: '0',
    with_request: 'true',
  });
  return `https://www.aviasales.ru/search?${q}`;
}

export function yandexTravelLink(fromCity, toCity, dateISO, mode) {
  const kind = mode === 'bus' ? 'bus' : 'train';
  const q = new URLSearchParams({ fromName: fromCity.name, toName: toCity.name, when: dateISO });
  return `https://rasp.yandex.ru/search/${kind}/?${q}`;
}

export function yandexMapsRoute(a, b) {
  return `https://yandex.ru/maps/?rtext=${a.lat},${a.lon}~${b.lat},${b.lon}&rtt=auto`;
}
