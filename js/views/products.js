import { state, todayISO, formatNumber } from '../store.js';
import { FOODS, CATEGORIES, searchFoods } from '../foods.js';
import { icon, esc, fmt, fmt1, qs, qsa } from '../ui.js';
import { openFoodPicker, openProductEditor } from './picker.js';

const local = { query: '', cat: 'Все' };

function rowHtml(food) {
  return `
    <div class="row-wrap">
      <button class="food-row ${food.custom ? 'food-row--custom' : ''}" type="button" data-food="${food.id}" style="padding-right:44px">
        <span class="food-row__body">
          <span class="food-row__name">${esc(food.name)}</span>
          <span class="food-row__meta">Б ${fmt1(food.protein)} · Ж ${fmt1(food.fat)} · У ${fmt1(food.carb)}</span>
        </span>
        <span class="food-row__kcal">${Math.round(food.kcal)}<span>ккал / 100 г</span></span>
      </button>
      ${food.custom ? `<button class="row-action" type="button" data-edit="${food.id}" aria-label="Изменить продукт">${icon('edit')}</button>` : ''}
    </div>`;
}

export function header() {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.style.gap = '10px';
  wrap.innerHTML = `
    <span class="grow">
      <span class="topbar__title" style="display:block">Продукты</span>
      <span class="topbar__sub">база и свои продукты</span>
    </span>
    <button class="topbar__action" type="button" data-create>${icon('plus')} Свой</button>`;
  wrap.querySelector('[data-create]').addEventListener('click', () => {
    openProductEditor({});
  });
  return wrap;
}

export function render(root) {
  const all = [...state.customFoods, ...FOODS];
  const cats = ['Все', ...CATEGORIES, ...(state.customFoods.length ? ['Мои'] : [])];

  root.innerHTML = `
    <div class="search">
      ${icon('search')}
      <input class="input" type="search" placeholder="Найти продукт" data-search value="${esc(local.query)}" autocomplete="off">
    </div>
    <div class="chips" data-cats>
      ${cats.map((cat) => `<button class="chip ${cat === local.cat ? 'chip--active' : ''}" type="button" data-cat="${esc(cat)}">${esc(cat)}</button>`).join('')}
    </div>
    <div class="food-list card" style="padding:0;margin-top:12px" data-list></div>
    <p class="tiny muted center mt-16">${formatNumber(FOODS.length)} продуктов в базе · значения на 100 г</p>`;

  const search = qs('[data-search]', root);
  const list = qs('[data-list]', root);

  function paintList() {
    let items = all;
    if (local.cat === 'Мои') items = state.customFoods;
    else if (local.cat !== 'Все') items = items.filter((f) => f.cat === local.cat);
    items = searchFoods(items, local.query);

    if (!items.length) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty__icon">${icon('search')}</div>
          <div class="empty__title">Ничего не нашлось</div>
          <div class="empty__text">Попробуйте другое название или добавьте свой продукт.</div>
        </div>`;
      return;
    }
    list.innerHTML = items.map(rowHtml).join('');
    qsa('[data-food]', list).forEach((btn) => {
      btn.addEventListener('click', () => {
        const food = items.find((f) => f.id === btn.dataset.food);
        if (food) openFoodPicker({ iso: todayISO(), startFood: food });
      });
    });
    qsa('[data-edit]', list).forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const food = state.customFoods.find((f) => f.id === btn.dataset.edit);
        if (food) openProductEditor({ food });
      });
    });
  }

  search.addEventListener('input', () => {
    local.query = search.value;
    paintList();
  });

  qsa('[data-cat]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      local.cat = btn.dataset.cat;
      qsa('[data-cat]', root).forEach((b) => b.classList.toggle('chip--active', b.dataset.cat === local.cat));
      paintList();
    });
  });

  paintList();
}
