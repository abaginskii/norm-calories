import {
  state, MEALS, todayISO, addDays, getDay, dayTotals, mealTotals,
  formatDayTitle, formatDaySub, streak, mealForNow, isoDate, parseISO,
} from '../store.js';
import { computeTargets, ratio } from '../calc.js';
import { icon, esc, fmt } from '../ui.js';
import { openFoodPicker, openEntryEditor, openProductEditor } from './picker.js';
import { openScanner } from '../scan.js';
import { openAIEstimate, openAIHint } from '../ai.js';

let iso = todayISO();

export function getIso() {
  return iso;
}

function targetsFor() {
  return state.targets || computeTargets(state.profile || {});
}

function mondayOf(value) {
  const date = parseISO(value);
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return isoDate(date);
}

function weekdayShort(date) {
  return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][date.getDay()];
}

function weekStrip() {
  const start = mondayOf(iso);
  const today = todayISO();
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const dayIso = addDays(start, offset);
    const date = parseISO(dayIso);
    const active = dayIso === iso;
    const isToday = dayIso === today;
    return `
      <button class="week-day ${active ? 'week-day--active' : ''} ${isToday ? 'week-day--today' : ''}" type="button" data-day="${dayIso}">
        <span>${weekdayShort(date)}</span>
        <b>${date.getDate()}</b>
      </button>`;
  }).join('');
}

function macroChip(label, value, target) {
  const percent = target ? Math.round((value / target) * 100) : 0;
  return `
    <div class="hero__macro">
      <b>${percent}%</b>
      <span>${label}</span>
      <small>${Math.round(value)} / ${Math.round(target)} г</small>
    </div>`;
}

function entryHtml(entry) {
  const factor = (Number(entry.grams) || 0) / 100;
  return `
    <button class="entry" type="button" data-entry="${entry.id}">
      <span class="entry__main">
        <span class="entry__name">${esc(entry.name)}</span>
        <span class="entry__meta">${fmt(entry.grams)} г · Б ${Math.round(entry.per.protein * factor)} · Ж ${Math.round(entry.per.fat * factor)} · У ${Math.round(entry.per.carb * factor)}</span>
      </span>
      <span class="entry__kcal">${Math.round(entry.per.kcal * factor)}<small> ккал</small></span>
    </button>`;
}

function mealHtml(meal) {
  const day = getDay(iso);
  const list = (day && day.meals && day.meals[meal.id]) || [];
  const totals = mealTotals(iso, meal.id);
  return `
    <section class="meal">
      <div class="meal__head">
        <span class="meal__icon">${icon(meal.icon)}</span>
        <span class="meal__title">${meal.name}</span>
        <span class="meal__kcal">${list.length ? `${fmt(Math.round(totals.kcal))} ккал` : '—'}</span>
        <button class="meal__add" type="button" data-add="${meal.id}" aria-label="Добавить в «${meal.name}»">${icon('plus')}</button>
      </div>
      ${list.length
        ? `<div class="meal__list">${list.map(entryHtml).join('')}</div>`
        : '<div class="meal__empty">Пока пусто</div>'}
    </section>`;
}

/** На дневнике своя шапка, общий топбар не нужен. */
export function header() {
  return null;
}

export function render(root) {
  const profile = state.profile || {};
  const targets = targetsFor();
  const totals = dayTotals(iso);
  const left = targets.kcal - totals.kcal;
  const over = left < 0;
  const isToday = iso === todayISO();
  const days = streak();
  const initial = (profile.name || '').trim().charAt(0).toUpperCase();
  const subtitle = isToday ? `сегодня, ${formatDaySub(iso)}` : `${formatDayTitle(iso).toLowerCase()}, ${formatDaySub(iso)}`;

  root.innerHTML = `
    <div class="home-head">
      <button class="avatar-btn" type="button" data-profile aria-label="Профиль">
        ${initial ? esc(initial) : icon('profile')}
      </button>
      <div class="home-head__title">
        <b>Дневник</b>
        <span>${esc(subtitle)}</span>
      </div>
      ${days > 0
        ? `<button class="streak-pill" type="button" data-streak aria-label="Серия ${days} дней">${icon('flame')} ${days}</button>`
        : '<span class="home-head__spacer"></span>'}
    </div>

    <section class="hero ${over ? 'hero--over' : ''}">
      <div class="weekstrip">${weekStrip()}</div>

      <div class="hero__main">
        <button class="hero__nav" type="button" data-prev aria-label="Предыдущий день">${icon('chevronLeft')}</button>
        <div class="hero__numbers">
          <div class="hero__num">${fmt(Math.abs(Math.round(left)))}</div>
          <div class="hero__caption">${over ? 'ккал сверх нормы' : 'ккал осталось'}</div>
        </div>
        <button class="hero__nav" type="button" data-next aria-label="Следующий день">${icon('chevronRight')}</button>
      </div>

      <div class="hero__bar"><i style="width:${Math.min(100, Math.round(ratio(totals.kcal, targets.kcal) * 100))}%"></i></div>
      <div class="hero__sum">съедено <b>${fmt(Math.round(totals.kcal))}</b> из <b>${fmt(targets.kcal)}</b> ккал</div>

      <div class="hero__macros">
        ${macroChip('белки', totals.protein, targets.protein)}
        ${macroChip('жиры', totals.fat, targets.fat)}
        ${macroChip('углеводы', totals.carb, targets.carb)}
      </div>
    </section>

    <div class="quick-pills">
      <button class="quick-pill" type="button" data-scan>${icon('barcode')} Сканер</button>
      <button class="quick-pill" type="button" data-ai>${icon('sparkles')} AI-оценка</button>
      <button class="quick-pill" type="button" data-hint>${icon('flame')} Что добрать</button>
    </div>

    <div class="section-head">
      <h2>Приёмы пищи</h2>
      <span>${fmt(Math.round(totals.kcal))} ккал</span>
    </div>

    ${MEALS.map(mealHtml).join('')}

    <p class="tiny muted center mt-16">Данные хранятся только на этом устройстве</p>
  `;

  root.querySelector('[data-profile]').addEventListener('click', () => { location.hash = '#/profile'; });
  const streakBtn = root.querySelector('[data-streak]');
  if (streakBtn) streakBtn.addEventListener('click', () => { location.hash = '#/progress'; });

  root.querySelectorAll('[data-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      iso = btn.dataset.day;
      render(root);
    });
  });

  root.querySelector('[data-prev]').addEventListener('click', () => {
    iso = addDays(iso, -1);
    render(root);
  });
  root.querySelector('[data-next]').addEventListener('click', () => {
    iso = addDays(iso, 1);
    render(root);
  });

  root.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openFoodPicker({ iso, meal: btn.dataset.add });
    });
  });

  root.querySelectorAll('[data-entry]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = getDay(iso);
      if (!day) return;
      const entry = Object.values(day.meals).flat().find((e) => e.id === btn.dataset.entry);
      if (entry) openEntryEditor({ iso, entry });
    });
  });

  root.querySelector('[data-scan]').addEventListener('click', () => {
    openScanner({
      iso,
      meal: mealForNow(),
      createProduct: (code) => openProductEditor({ barcode: code }),
    });
  });
  root.querySelector('[data-ai]').addEventListener('click', () => {
    openAIEstimate({ iso, meal: mealForNow() });
  });
  root.querySelector('[data-hint]').addEventListener('click', () => {
    openAIHint({ iso });
  });
}
