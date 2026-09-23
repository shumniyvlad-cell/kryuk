// Список сценариев и подробный разбор выбранного маршрута.

import { FLAG_INFO } from '../engine/score.js';
import { rub, hoursText, hoursShort, localParts, plural } from './format.js';
import { icon, modeTag, MODE_WORD } from './icons.js';

const FLAG_RISK = { 'self-transfer': 1, 'hidden-city': 2 };

export function chainHtml(chain, { withIcons = true } = {}) {
  return chain
    .map((p) => {
      if (p.type === 'city') return `<span class="chain-city">${p.name}</span>`;
      return `<span class="chain-sep">→</span>${withIcons ? modeTag(p.mode) : MODE_WORD[p.mode]}<span class="chain-sep">→</span>`;
    })
    .join('');
}

function flagsHtml(flags) {
  return flags
    .filter((f) => FLAG_INFO[f])
    .map((f) => `<span class="flag risk-${FLAG_RISK[f] || 0}" title="${FLAG_INFO[f].text}">${FLAG_INFO[f].title}</span>`)
    .join('');
}

function diffRub(a, b) {
  return rub(Math.abs(a - b));
}

// Одно предложение о том, что человек выигрывает и чем платит.
export function whyText(s, result) {
  const r = s.route;
  const byKey = Object.fromEntries(result.scenarios.flatMap((x) => x.tags.map((t) => [t, x.route])));
  const fastest = byKey.fastest;
  const cheapest = byKey.cheapest;
  const optimal = byKey.optimal;
  const costs = [];
  if (r.flags.includes('night-train')) costs.push('ночь в поезде');
  if (r.flags.includes('long-layover')) costs.push('длинная стыковка');
  if (r.flags.includes('self-transfer')) costs.push('раздельные билеты');
  if (r.flags.includes('hidden-city')) costs.push('hidden-city');
  const transfers = r.flightCount - 1;
  if (transfers >= 2) costs.push(`${transfers} пересадки`);
  const pay = costs.length ? `, платите: ${costs.join(', ')}` : '';

  switch (s.key) {
    case 'fastest':
      return cheapest && cheapest !== r
        ? `Быстрее всех, зато на ${diffRub(r.price, cheapest.price)} дороже самого дешёвого.`
        : 'Быстрее всех и при этом дешевле не найти.';
    case 'cheapest':
      return fastest && fastest !== r
        ? `На ${diffRub(fastest.price, r.price)} дешевле самого быстрого, но дольше на ${hoursShort(r.hours - fastest.hours)}${pay}.`
        : `Дешевле не найти${pay}.`;
    case 'optimal':
      return fastest && fastest !== r
        ? `Лучший баланс: на ${diffRub(fastest.price, r.price)} дешевле быстрого и всего на ${hoursShort(r.hours - fastest.hours)} дольше${pay}.`
        : `Лучший баланс цены и времени${pay}.`;
    case 'comfort':
      return `Меньше всего пересадок и ночёвок в дороге${cheapest && cheapest !== r ? `; дороже самого дешёвого на ${diffRub(r.price, cheapest.price)}` : ''}.`;
    case 'smart':
      return optimal
        ? `Ещё ${hoursShort(r.hours - optimal.hours)} к оптимальному — и минус ${diffRub(optimal.price, r.price)}${pay}.`
        : `Небольшой крюк ради заметной экономии${pay}.`;
    case 'hack': {
      const clean = result.candidates.filter((c) => !c.flags.includes('self-transfer') && !c.flags.includes('hidden-city')).sort((a, b) => a.price - b.price)[0];
      return clean
        ? `Экономия ${diffRub(clean.price, r.price)} к обычному билету, но риски стыковки на вас${pay}.`
        : `Нестандартная покупка билетов${pay}.`;
    }
    default: {
      const ref = optimal || fastest;
      const hubs = r.chain.filter((p) => p.type === 'city' && p.iata).slice(0, -1).map((p) => p.name);
      const strategy = [];
      if (r.flags.includes('neighbor-airport') && r.depCity.id !== result.origin.id) strategy.push(`вылет из ${r.depCity.name} (${r.depAirport})`);
      if (r.flags.includes('neighbor-airport') && r.arrCity.id !== result.dest.id) strategy.push(`прилёт в ${r.arrCity.name} (${r.arrAirport})`);
      if (hubs.length) strategy.push(`через ${hubs.join(' и ')}`);
      if (s.kind === 'purchase') strategy.push(r.variant === 'separate' ? 'раздельные билеты' : r.variant === 'hidden' ? 'hidden-city' : 'единый билет');
      const head = strategy.length ? cap(strategy.join(', ')) : 'Другой способ';
      if (!ref || ref === r) return `${head}${pay}.`;
      const dp = r.price - ref.price;
      const dh = r.hours - ref.hours;
      const money = dp === 0 ? 'та же цена' : dp < 0 ? `на ${rub(-dp)} дешевле` : `на ${rub(dp)} дороже`;
      const time = Math.abs(dh) < 0.25 ? 'столько же по времени' : dh < 0 ? `быстрее на ${hoursShort(-dh)}` : `дольше на ${hoursShort(dh)}`;
      const tail = s.key === 'backup' ? ' Пригодится, если цены поменяются.' : '';
      return `${head}: ${money} и ${time}, чем оптимальный${pay}.${tail}`;
    }
  }
}

export function renderScenarios(listEl, result, activeId, onPick) {
  const meta = result.scenarios;
  listEl.innerHTML = meta
    .map((s, i) => {
      const r = s.route;
      const also = s.tags.slice(1).map((t) => meta.find((x) => x.key === t)?.title || SHORT[t]).filter(Boolean);
      return `<li class="scen${r.id === activeId ? ' is-active' : ''}" data-id="${r.id}" tabindex="0" role="button" aria-pressed="${r.id === activeId}">
        <div class="scen-title"><span class="idx">${i + 1}</span><b>${s.title}</b>${also.length ? `<span class="also">также ${also.map((a) => a.toLowerCase()).join(', ')}</span>` : ''}</div>
        <div class="scen-nums">${rub(r.price)}<small>${hoursText(r.hours, { short: true })}</small></div>
        <div class="scen-chain">${chainHtml(r.chain)}</div>
        <div class="scen-why">${whyText(s, result)}</div>
        <div class="scen-flags">${flagsHtml(r.flags)}</div>
      </li>`;
    })
    .join('');
  listEl.querySelectorAll('.scen').forEach((el) => {
    el.addEventListener('click', () => onPick(el.dataset.id));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick(el.dataset.id);
      }
    });
  });
}

const SHORT = { fastest: 'Самый быстрый', optimal: 'Оптимальный', cheapest: 'Самый дешёвый', comfort: 'Самый комфортный', smart: 'Крюк ради экономии', hack: 'Хитрый' };

function timeCell(ms, tz) {
  const p = localParts(ms, tz);
  return `<div class="tl-time"><b>${p.time}</b>${p.day}</div>`;
}

function row(ms, tz, railCls, body, { first = false, last = false, quiet = false } = {}) {
  return `${timeCell(ms, tz)}<div class="tl-rail ${railCls}${first ? ' is-first' : ''}${last ? ' is-last' : ''}"><span class="dot"></span></div><div class="tl-body${quiet ? ' quiet' : ''}">${body}</div>`;
}

export function renderDetail(el, result, scenario, { onShare } = {}) {
  const r = scenario.route;
  const origin = result.origin;
  const dest = result.dest;
  const start = localParts(r.start, origin.tz);
  const end = localParts(r.end, dest.tz);
  const rows = [];
  const legs = r.legs;
  legs.forEach((leg, i) => {
    const first = i === 0;
    if (leg.kind === 'ground' && leg.mode !== 'local') {
      const title = `${icon(leg.mode)}${cap(MODE_WORD[leg.mode])} ${leg.from.name} → ${leg.to.name}`;
      const meta = [leg.label, hoursText(leg.hours, { short: true }), rub(leg.price), leg.km ? `${leg.km} км` : null].filter(Boolean).join(', ');
      const link = leg.link ? ` <a href="${leg.link}" target="_blank" rel="noopener">${leg.mode === 'car' ? 'маршрут на карте' : 'расписание и билеты'}</a>` : '';
      rows.push(row(leg.dep, leg.tz, `m-${leg.mode}`, `<div class="tl-title m-${leg.mode}">${title}</div><div class="tl-meta">${meta}.${link}</div>`, { first }));
    } else if (leg.kind === 'ground' && leg.mode === 'local') {
      const toAirport = leg.to && leg.to.iata;
      const text = toAirport
        ? `До аэропорта ${leg.to.name}: ${leg.label}, ${hoursText(leg.hours, { short: true })}, ${rub(leg.price)}`
        : `${cap(leg.label)}, ${hoursText(leg.hours, { short: true })}, ${rub(leg.price)}`;
      rows.push(row(leg.dep, leg.tz, 'm-local', `<div class="tl-title">${text}</div>`, { first, quiet: true }));
    } else if (leg.kind === 'airport') {
      rows.push(row(leg.dep, leg.tz, 'm-local', `<div class="tl-title">В аэропорту за ${hoursText(leg.hours, { short: true })}: регистрация и досмотр</div>`, { quiet: true }));
    } else if (leg.kind === 'flight') {
      const arr = localParts(leg.arr, leg.tzTo);
      const ticketNo = r.tickets.length > 1 ? `, билет ${leg.ticket + 1}` : '';
      const dayShift = arr.iso !== localParts(leg.dep, leg.tzFrom).iso ? ` (${arr.day})` : '';
      rows.push(
        row(
          leg.dep,
          leg.tzFrom,
          'm-plane',
          `<div class="tl-title m-plane">${icon('plane')}Самолёт ${leg.from.iata} → ${leg.to.iata}, ${leg.carrierName}</div><div class="tl-meta">${leg.fromCity.name} → ${leg.toCity.name}, ${hoursText(leg.hours, { short: true })}, прилёт ${arr.time}${dayShift} по местному${ticketNo}.</div>`,
          { first },
        ),
      );
    } else if (leg.kind === 'layover') {
      const notes = [];
      if (leg.selfTransfer) notes.push('раздельные билеты: получить багаж и зарегистрироваться заново');
      if (leg.hours > 8) notes.push('можно выйти в город');
      rows.push(row(leg.dep, leg.tz, 'm-local', `<div class="tl-title">${icon('wait')}Пересадка в ${leg.city.loc}: ${hoursText(leg.hours, { short: true })}${notes.length ? `. ${cap(notes.join('; '))}` : ''}</div>`, { quiet: true }));
    }
  });
  rows.push(row(r.end, dest.tz, 'm-local is-last', `<div class="tl-title">Вы в ${dest.loc}</div>`, { last: true }));

  const groundPrice = legs.filter((l) => l.kind === 'ground').reduce((s, l) => s + l.price, 0);
  const tickets = r.tickets
    .map((t) => {
      const ghost = t.exitAt ? `<div class="ticket-route">Билет оформлен до ${r.ghost.city.name} (${t.to}), выходите в ${r.arrCity.loc} на пересадке. Только в один конец, багаж не сдавать.</div>` : `<div class="ticket-route">${t.from} → ${t.to}${t.lcc ? ', лоукостер: багаж отдельно' : ''}</div>`;
      return `<div class="ticket${t.exitAt ? ' ghost-note' : ''}">
        <div><div class="ticket-name">${t.name}</div>${ghost}</div>
        <div class="ticket-price">${rub(t.price)}</div>
        <a class="ticket-link" href="${t.link}" target="_blank" rel="noopener">Найти на Aviasales ${icon('out')}</a>
      </div>`;
    })
    .join('');

  const know = r.flags
    .filter((f) => FLAG_INFO[f])
    .map((f) => `<li><b>${cap(FLAG_INFO[f].title)}.</b> ${FLAG_INFO[f].text}</li>`)
    .join('');

  el.innerHTML = `
    <div class="detail-head">
      <div>
        <h3 class="detail-title">${chainHtml(r.chain)}</h3>
        <p class="detail-when">Выезд ${start.day}, ${start.weekday}, ${start.time}. В ${dest.loc} ${end.day}, ${end.weekday}, ${end.time} по местному времени. ${r.transfers} ${plural(r.transfers, 'пересадка', 'пересадки', 'пересадок')}, комфорт ${r.comfort} из 100.</p>
        <button type="button" class="share" id="share">Скопировать ссылку на маршрут</button>
      </div>
      <div class="detail-nums">${rub(r.price)}<small>${hoursText(r.hours)} от двери</small></div>
    </div>
    <div class="timeline">${rows.join('')}</div>
    <div class="tickets">
      <h4>Билеты</h4>
      ${tickets}
      <p class="sum">Итого: авиабилеты ${rub(r.ticketsPrice)} + наземная часть ${rub(groundPrice)} = ${rub(r.price)}.</p>
    </div>
    ${know ? `<div class="know"><h4>Что важно знать</h4><ul>${know}</ul></div>` : ''}
  `;
  el.querySelector('#share').addEventListener('click', (e) => onShare && onShare(e.currentTarget));
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
