import {
  state, MEALS, todayISO, addDays, getDay, dayTotals, mealTotals,
  formatDayTitle, formatDaySub, streak,
} from '../store.js';
import { computeTargets, ratio } from '../calc.js';
import { icon, esc, fmt, calorieRing } from '../ui.js';
import { openFoodPicker, openEntryEditor, openQuickAdd } from './picker.js';

let iso = todayISO();

function targetsFor() {
  return state.targets || computeTargets(state.profile || {});
}

function macroRow(cls, name, value, target) {
  const percent = Math.round(ratio(value, target) * 100);
  return `
    <div class="macro macro--${cls}">
      <div class="macro__top">
        <span class="macro__name">${name}</span>
        <span class="macro__nums"><b>${Math.round(value)}</b> / ${Math.round(target)} г</span>
      </div>
      <div class="macro__bar">
        <div class="macro__fill" style="width:${percent}%"></div>
      </div>
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
        <span class="meal__kcal">${list.length ? `${fmt(Math.round(totals.kcal))} ккал` : ''}</span>
        <button class="meal__add" type="button" data-add="${meal.id}" aria-label="Добавить в «${meal.name}»">${icon('plus')}</button>
      </div>
      ${list.length
        ? `<div class="meal__list">${list.map(entryHtml).join('')}</div>`
        : '<div class="meal__empty">Пока пусто</div>'}
    </section>`;
}

export function header() {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.style.gap = '10px';
  const days = streak();
  wrap.innerHTML = `
    <span class="brand-mark">${icon('leaf')}</span>
    <span class="grow">
      <span class="topbar__title" style="display:block">Норма</span>
      <span class="topbar__sub">дневник калорий</span>
    </span>
    ${days > 1 ? `<button class="badge" type="button" data-streak style="border:none;cursor:pointer">${icon('flame')} ${days} дн.</button>` : ''}
    <button class="topbar__action" type="button" data-add-food>${icon('plus')} Еда</button>`;

  wrap.querySelector('[data-add-food]').addEventListener('click', () => {
    openFoodPicker({ iso });
  });
  const streakBadge = wrap.querySelector('[data-streak]');
  if (streakBadge) streakBadge.addEventListener('click', () => { location.hash = '#/progress'; });
  return wrap;
}

export function render(root) {
  const profile = state.profile || {};
  const targets = targetsFor();
  const totals = dayTotals(iso);
  const over = totals.kcal > targets.kcal;
  const remaining = Math.round(targets.kcal - totals.kcal);

  const today = todayISO();
  const isToday = iso === today;

  root.innerHTML = `
    <div class="day-nav">
      <button class="icon-btn" type="button" data-prev aria-label="Предыдущий день">${icon('chevronLeft')}</button>
      <button class="day-nav__label" type="button" data-today title="${isToday ? '' : 'Вернуться к сегодня'}" style="border:none;background:none;cursor:${isToday ? 'default' : 'pointer'}">
        ${esc(formatDayTitle(iso))}<span>${esc(formatDaySub(iso))}</span>
      </button>
      <button class="icon-btn" type="button" data-next aria-label="Следующий день">${icon('chevronRight')}</button>
    </div>

    <section class="card ring-card">
      ${calorieRing({ consumed: totals.kcal, target: targets.kcal, over })}
      <div class="macros">
        ${macroRow('protein', 'Белки', totals.protein, targets.protein)}
        ${macroRow('fat', 'Жиры', totals.fat, targets.fat)}
        ${macroRow('carb', 'Углеводы', totals.carb, targets.carb)}
      </div>
      <div class="ring-foot">
        <span>${over
          ? `<b class="text-danger">${fmt(Math.round(totals.kcal - targets.kcal))} ккал</b> сверх нормы`
          : `Осталось <b>${fmt(Math.max(0, remaining))} ккал</b>`}</span>
        <span class="muted tiny">${profile.goal === 'lose' ? 'цель — похудение' : profile.goal === 'gain' ? 'цель — набор' : 'цель — поддержание'}</span>
      </div>
    </section>

    ${!isToday ? '<div class="center mb-8"><button class="link-btn" type="button" data-today-link>К сегодняшнему дню</button></div>' : ''}

    ${MEALS.map(mealHtml).join('')}

    <button class="btn btn--block" type="button" data-quick>${icon('flame')} Быстрое добавление</button>
    <p class="tiny muted center mt-16">Данные хранятся только на этом устройстве</p>
  `;

  root.querySelector('[data-prev]').addEventListener('click', () => {
    iso = addDays(iso, -1);
    render(root);
  });
  root.querySelector('[data-next]').addEventListener('click', () => {
    iso = addDays(iso, 1);
    render(root);
  });
  const goToday = () => {
    if (iso === today) return;
    iso = today;
    render(root);
  };
  root.querySelector('[data-today]').addEventListener('click', goToday);
  const todayLink = root.querySelector('[data-today-link]');
  if (todayLink) todayLink.addEventListener('click', goToday);

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
      if (!entry) return;
      openEntryEditor({ iso, entry });
    });
  });

  root.querySelector('[data-quick]').addEventListener('click', () => {
    openQuickAdd({ iso });
  });
}
