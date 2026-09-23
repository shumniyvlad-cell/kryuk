// Форма-предложение: каждый слот открывает поповер с выбором.

import { CITIES } from '../data/cities.js';
import { AIRPORTS } from '../data/airports.js';
import { rub, dateLong, flexText, kmText, modesPhrase } from './format.js';
import { icon } from './icons.js';

const airportByCity = new Map(AIRPORTS.map((a) => [a.city, a]));
const cityById = new Map(CITIES.map((c) => [c.id, c]));

export function createQuery({ state, onChange }) {
  const pop = document.getElementById('popover');
  const wrap = document.querySelector('.ask-wrap');
  const slots = new Map([...document.querySelectorAll('.slot')].map((el) => [el.dataset.slot, el]));
  let open = null;

  function renderLabels() {
    const o = cityById.get(state.origin);
    const d = cityById.get(state.destination);
    slots.get('origin').textContent = o ? o.loc : '…';
    slots.get('destination').textContent = d ? d.acc : '…';
    slots.get('date').textContent = dateLong(state.date);
    slots.get('flex').textContent = flexText(state.flex);
    slots.get('radius').textContent = kmText(state.radiusKm);
    slots.get('modes').textContent = modesPhrase(state.modes);
    slots.get('hourValue').textContent = rub(state.hourValue);
  }

  function place(slotEl) {
    const r = slotEl.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    pop.hidden = false;
    let left = r.left - w.left;
    const maxLeft = w.width - pop.offsetWidth;
    left = Math.max(0, Math.min(left, maxLeft));
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom - w.top + 12}px`;
  }

  function close() {
    if (!open) return;
    slots.get(open).classList.remove('is-open');
    open = null;
    pop.hidden = true;
    pop.innerHTML = '';
  }

  function openSlot(name) {
    if (open === name) return close();
    close();
    open = name;
    const el = slots.get(name);
    el.classList.add('is-open');
    pop.innerHTML = BUILDERS[name](state);
    wire(name);
    place(el);
    const first = pop.querySelector('input, button');
    if (first && first.type === 'search') first.focus({ preventScroll: true });
  }

  function commit() {
    renderLabels();
    onChange();
    if (open) place(slots.get(open));
  }

  function wire(name) {
    if (name === 'origin' || name === 'destination') {
      const search = pop.querySelector('.pop-search');
      const list = pop.querySelector('.pop-list');
      const draw = (q) => {
        list.innerHTML = cityList(state, name, q);
      };
      search.addEventListener('input', () => draw(search.value));
      list.addEventListener('click', (e) => {
        const item = e.target.closest('.pop-item');
        if (!item) return;
        state[name] = item.dataset.id;
        if (state.origin === state.destination) {
          const other = name === 'origin' ? 'destination' : 'origin';
          state[other] = CITIES.find((c) => c.id !== state[name] && (other === 'destination' ? c.country !== 'RU' : c.country === 'RU')).id;
        }
        commit();
        close();
        slots.get(name).focus({ preventScroll: true });
      });
      const cur = list.querySelector('.is-current');
      if (cur) cur.scrollIntoView({ block: 'center' });
    }
    if (name === 'date') {
      const input = pop.querySelector('input[type=date]');
      input.addEventListener('change', () => {
        if (input.value) {
          state.date = input.value;
          commit();
        }
      });
    }
    pop.querySelectorAll('[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [key, delta, min, max] = btn.dataset.step.split(',');
        const d = Number(delta);
        state[key] = Math.min(Number(max), Math.max(Number(min), state[key] + d));
        pop.querySelector(`output[data-for=${key}]`).textContent = FORMAT[key](state[key]);
        commit();
      });
    });
    pop.querySelectorAll('input[data-mode]').forEach((cb) => {
      cb.addEventListener('change', () => {
        state.modes[cb.dataset.mode] = cb.checked;
        commit();
      });
    });
  }

  slots.forEach((el, name) => el.addEventListener('click', () => openSlot(name)));
  document.addEventListener('pointerdown', (e) => {
    if (!open) return;
    if (pop.contains(e.target) || e.target.closest('.slot')) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('resize', () => open && place(slots.get(open)));

  renderLabels();
  return { renderLabels, close };
}

const FORMAT = {
  flex: flexText,
  radiusKm: kmText,
  hourValue: rub,
};

function stepper(key, step, min, max, value) {
  return `<span class="stepper">
    <button type="button" data-step="${key},${-step},${min},${max}" aria-label="Меньше">−</button>
    <output data-for="${key}">${FORMAT[key](value)}</output>
    <button type="button" data-step="${key},${step},${min},${max}" aria-label="Больше">+</button>
  </span>`;
}

function cityList(state, which, q = '') {
  const needle = q.trim().toLowerCase();
  const match = (c) => !needle || c.name.toLowerCase().includes(needle) || c.slug.includes(needle);
  const ru = CITIES.filter((c) => c.country === 'RU' && match(c)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const world = CITIES.filter((c) => c.country !== 'RU' && match(c)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const item = (c) => {
    const a = airportByCity.get(c.id);
    const note = a ? a.iata : 'без аэропорта';
    const cur = state[which] === c.id ? ' is-current' : '';
    return `<button type="button" class="pop-item${cur}" data-id="${c.id}"><span>${c.name}</span><small>${note}</small></button>`;
  };
  const groups = which === 'origin' ? [['Россия', ru], ['Другие страны', world]] : [['Другие страны', world], ['Россия', ru]];
  return groups
    .filter(([, list]) => list.length)
    .map(([title, list]) => `<div class="pop-group">${title}</div>${list.map(item).join('')}`)
    .join('') || `<div class="pop-group">Ничего не нашлось</div>`;
}

const BUILDERS = {
  origin: (s) => `<div class="pop-title">Где вы сейчас</div>
    <input class="pop-search" type="search" placeholder="Город" autocomplete="off">
    <div class="pop-list">${cityList(s, 'origin')}</div>
    <p class="pop-hint">Города без аэропорта тоже подходят: до самолёта довезём поездом или попуткой.</p>`,
  destination: (s) => `<div class="pop-title">Куда нужно</div>
    <input class="pop-search" type="search" placeholder="Город" autocomplete="off">
    <div class="pop-list">${cityList(s, 'destination')}</div>`,
  date: (s) => `<div class="pop-title">Дата вылета</div>
    <input class="pop-input" type="date" value="${s.date}" min="2026-09-25" max="2027-06-30">
    <p class="pop-hint">Цены зависят от дня недели: вторник и среда обычно дешевле пятницы и воскресенья.</p>`,
  flex: (s) => `<div class="pop-title">Гибкость даты</div>
    <div class="pop-row"><span>Сдвиг</span>${stepper('flex', 1, 0, 3, s.flex)}</div>
    <p class="pop-hint">Смотрим все дни в окне и показываем, где дешевле.</p>`,
  radius: (s) => `<div class="pop-title">Радиус до аэропорта вылета</div>
    <div class="pop-row"><span>Радиус</span>${stepper('radiusKm', 100, 0, 900, s.radiusKm)}</div>
    <p class="pop-hint">0 км — только свой аэропорт. 500 км — примерно ночь в поезде или пять часов за рулём.</p>`,
  modes: (s) => `<div class="pop-title">Чем добираться до аэропорта</div>
    <div class="pop-chips">
      <label class="chip-toggle"><input type="checkbox" data-mode="train" ${s.modes.train ? 'checked' : ''}>${icon('train')}Поезд</label>
      <label class="chip-toggle"><input type="checkbox" data-mode="bus" ${s.modes.bus ? 'checked' : ''}>${icon('bus')}Автобус</label>
      <label class="chip-toggle"><input type="checkbox" data-mode="car" ${s.modes.car ? 'checked' : ''}>${icon('car')}Попутка или своя машина</label>
    </div>`,
  hourValue: (s) => `<div class="pop-title">Сколько стоит ваш час</div>
    <div class="pop-row"><span>За час</span>${stepper('hourValue', 250, 0, 10000, s.hourValue)}</div>
    <p class="pop-hint">Так выбираем «оптимальный» вариант: цена билета плюс часы в пути, переведённые в деньги.</p>`,
};
