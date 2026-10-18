import {
  state, MEALS, addEntry, updateEntry, removeEntry, customFood, updateCustomFood,
  deleteCustomFood, toggleFavorite, isFavorite, formatFullDate,
} from '../store.js';
import { FOODS, foodById, searchFoods, CATEGORIES } from '../foods.js';
import { openSheet, icon, fmt, fmt1, esc, toast, qs, qsa, confirmAction } from '../ui.js';

const TABS = [
  { id: 'recent', name: 'Недавние' },
  { id: 'favorite', name: 'Избранное' },
  { id: 'all', name: 'Все' },
  { id: 'mine', name: 'Мои' },
];

function lookupFood(id) {
  return state.customFoods.find((f) => f.id === id) || foodById(id) || null;
}

function mealName(id) {
  return (MEALS.find((m) => m.id === id) || MEALS[0]).name;
}

function mealIdForNow() {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'dinner';
  return 'snack';
}

function allFoods() {
  return [...state.customFoods, ...FOODS];
}

function amountPreview(food, grams) {
  const factor = grams / 100;
  return {
    kcal: food.kcal * factor,
    protein: food.protein * factor,
    fat: food.fat * factor,
    carb: food.carb * factor,
  };
}

function foodRow(food) {
  return `
    <button class="food-row ${food.custom ? 'food-row--custom' : ''}" type="button" data-food="${food.id}">
      <span class="food-row__body">
        <span class="food-row__name">${esc(food.name)}</span>
        <span class="food-row__meta">Б ${fmt1(food.protein)} · Ж ${fmt1(food.fat)} · У ${fmt1(food.carb)}</span>
      </span>
      <span class="food-row__kcal">${Math.round(food.kcal)}<span>ккал / 100 г</span></span>
    </button>`;
}

function previewHtml(food, grams) {
  const p = amountPreview(food, grams);
  return `
    <div class="preview">
      <div class="preview__cell"><div class="preview__val">${Math.round(p.kcal)}</div><div class="preview__key">ккал</div></div>
      <div class="preview__cell"><div class="preview__val">${fmt1(p.protein)}</div><div class="preview__key">белки</div></div>
      <div class="preview__cell"><div class="preview__val">${fmt1(p.fat)}</div><div class="preview__key">жиры</div></div>
      <div class="preview__cell"><div class="preview__val">${fmt1(p.carb)}</div><div class="preview__key">углев.</div></div>
    </div>`;
}

/* ---------- Выбор продукта ---------- */

export function openFoodPicker({ iso, meal = mealIdForNow(), onDone = null, startFood = null }) {
  let tab = state.recents.length ? 'recent' : 'all';
  let category = 'Все';
  let query = '';
  let currentMeal = meal;

  const sheet = openSheet({
    title: 'Добавить еду',
    subtitle: formatFullDate(iso),
    body: '',
    footer: `<button class="btn btn--ghost btn--block" type="button" data-create>${icon('plus')} Свой продукт</button>`,
  });

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="search">${icon('search')}<input class="input" type="search" placeholder="Найти продукт" data-search autocomplete="off"></div>
    <div class="chips" data-tabs></div>
    <div class="chips mt-8" data-cats hidden></div>
    <div class="food-list" data-list></div>`;
  sheet.setBody(body);

  const searchInput = qs('[data-search]', body);
  const tabsNode = qs('[data-tabs]', body);
  const catsNode = qs('[data-cats]', body);
  const listNode = qs('[data-list]', body);

  function currentList() {
    let list;
    if (tab === 'recent') {
      list = state.recents.map(lookupFood).filter(Boolean);
    } else if (tab === 'favorite') {
      list = state.favorites.map(lookupFood).filter(Boolean);
    } else if (tab === 'mine') {
      list = state.customFoods.slice();
    } else {
      list = allFoods();
    }
    if (tab === 'all' && category !== 'Все') {
      list = list.filter((f) => f.cat === category);
    }
    return searchFoods(list, query);
  }

  function renderTabs() {
    tabsNode.innerHTML = TABS.map((t) => `
      <button class="chip ${tab === t.id ? 'chip--active' : ''}" type="button" data-tab="${t.id}">${t.name}</button>`).join('');
    qsa('[data-tab]', tabsNode).forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        query = '';
        searchInput.value = '';
        renderTabs();
        renderCats();
        renderList();
      });
    });
  }

  function renderCats() {
    if (tab !== 'all') {
      catsNode.hidden = true;
      return;
    }
    catsNode.hidden = false;
    catsNode.innerHTML = ['Все', ...CATEGORIES].map((cat) => `
      <button class="chip ${category === cat ? 'chip--active' : ''}" type="button" data-cat="${esc(cat)}">${esc(cat)}</button>`).join('');
    qsa('[data-cat]', catsNode).forEach((btn) => {
      btn.addEventListener('click', () => {
        category = btn.dataset.cat;
        renderCats();
        renderList();
      });
    });
  }

  function renderList() {
    const list = currentList();
    if (!list.length) {
      listNode.innerHTML = `
        <div class="empty">
          <div class="empty__icon">${icon('search')}</div>
          <div class="empty__title">${tab === 'recent' ? 'Пока пусто' : 'Ничего не нашлось'}</div>
          <div class="empty__text">${tab === 'recent'
            ? 'Добавленные продукты появятся здесь — выбирать станет быстрее.'
            : 'Попробуйте другое слово или создайте свой продукт.'}</div>
        </div>`;
      return;
    }
    listNode.innerHTML = list.map(foodRow).join('');
    qsa('[data-food]', listNode).forEach((btn) => {
      btn.addEventListener('click', () => {
        const food = list.find((f) => f.id === btn.dataset.food) || lookupFood(btn.dataset.food);
        if (food) showAmount(food);
      });
    });
  }

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    // Поиск идёт по всей базе, а не только по выбранной вкладке.
    if (query.trim() && tab !== 'all') {
      tab = 'all';
      category = 'Все';
      renderTabs();
      renderCats();
    }
    renderList();
  });

  qs('[data-create]', sheet.footer).addEventListener('click', () => {
    openProductEditor({
      onSaved: (food) => {
        showAmount(food);
      },
    });
  });

  function showAmount(food) {
    sheet.setTitle(food.name, `на 100 г — ${Math.round(food.kcal)} ккал`);
    let grams = 100;

    sheet.setBody(`
      <div class="amount-row">
        <div class="stepper">
          <button class="stepper__btn" type="button" data-minus aria-label="Меньше">−</button>
          <input class="stepper__input" type="number" inputmode="numeric" min="1" max="3000" value="${grams}" data-grams aria-label="Граммы">
          <button class="stepper__btn" type="button" data-plus aria-label="Больше">+</button>
        </div>
      </div>
      <div class="amount-unit">граммов</div>

      <div class="chips mt-16" data-quick style="justify-content:center">
        ${[50, 100, 150, 200, 250].map((g) => `<button class="chip ${g === grams ? 'chip--active' : ''}" type="button" data-g="${g}">${g} г</button>`).join('')}
      </div>

      <div data-preview>${previewHtml(food, grams)}</div>

      <div class="field mt-16">
        <span class="field__label">Приём пищи</span>
        <div class="segmented" data-meals>
          ${MEALS.map((m) => `<button class="segmented__btn ${m.id === currentMeal ? 'segmented__btn--active' : ''}" type="button" data-meal="${m.id}">${m.name}</button>`).join('')}
        </div>
      </div>

      <div class="row mt-16">
        <button class="chip ${isFavorite(food.id) ? 'chip--active' : ''}" type="button" data-fav>${icon('star')} ${isFavorite(food.id) ? 'В избранном' : 'В избранное'}</button>
      </div>`);

    sheet.setFooter(`
      <div class="btn-row">
        <button class="btn" type="button" data-back>К списку</button>
        <button class="btn btn--primary" type="button" data-add>Добавить</button>
      </div>`);

    const bodyNode = sheet.body;
    const gramsInput = qs('[data-grams]', bodyNode);
    const previewNode = qs('[data-preview]', bodyNode);
    const addBtn = qs('[data-add]', sheet.footer);

    const sync = () => {
      const value = Math.min(3000, Math.max(1, Math.round(Number(gramsInput.value) || 0)));
      previewNode.innerHTML = previewHtml(food, value);
      const p = amountPreview(food, value);
      addBtn.textContent = `Добавить · ${Math.round(p.kcal)} ккал`;
      qsa('[data-g]', bodyNode).forEach((chip) => {
        chip.classList.toggle('chip--active', Number(chip.dataset.g) === value);
      });
    };

    gramsInput.addEventListener('input', sync);
    gramsInput.addEventListener('blur', () => {
      gramsInput.value = String(Math.min(3000, Math.max(1, Math.round(Number(gramsInput.value) || 1))));
      sync();
    });

    qs('[data-minus]', bodyNode).addEventListener('click', () => {
      gramsInput.value = String(Math.max(1, (Number(gramsInput.value) || 0) - 10));
      sync();
    });
    qs('[data-plus]', bodyNode).addEventListener('click', () => {
      gramsInput.value = String(Math.min(3000, (Number(gramsInput.value) || 0) + 10));
      sync();
    });

    qsa('[data-g]', bodyNode).forEach((chip) => {
      chip.addEventListener('click', () => {
        gramsInput.value = chip.dataset.g;
        sync();
      });
    });

    qsa('[data-meal]', bodyNode).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentMeal = btn.dataset.meal;
        qsa('[data-meal]', bodyNode).forEach((b) => b.classList.remove('segmented__btn--active'));
        btn.classList.add('segmented__btn--active');
      });
    });

    qs('[data-fav]', bodyNode).addEventListener('click', () => {
      toggleFavorite(food.id);
      const nowFav = isFavorite(food.id);
      qs('[data-fav]', bodyNode).classList.toggle('chip--active', nowFav);
      qs('[data-fav]', bodyNode).innerHTML = `${icon('star')} ${nowFav ? 'В избранном' : 'В избранное'}`;
    });

    qs('[data-back]', sheet.footer).addEventListener('click', () => {
      sheet.setTitle('Добавить еду', formatFullDate(iso));
      sheet.setBody(body);
      sheet.setFooter(`<button class="btn btn--ghost btn--block" type="button" data-create>${icon('plus')} Свой продукт</button>`);
      wireCreate();
      renderTabs();
      renderCats();
      renderList();
    });

    addBtn.addEventListener('click', () => {
      const gramsValue = Math.min(3000, Math.max(1, Math.round(Number(gramsInput.value) || 0)));
      addEntry(iso, currentMeal, food, gramsValue);
      sheet.close();
      toast(`Добавлено: ${food.name}`);
      onDone?.();
    });

    sync();
  }

  function wireCreate() {
    qs('[data-create]', sheet.footer).addEventListener('click', () => {
      openProductEditor({ onSaved: (food) => showAmount(food) });
    });
  }

  renderTabs();
  renderCats();
  renderList();

  if (startFood) showAmount(startFood);
  return sheet;
}

/* ---------- Быстрое добавление калорий ---------- */

export function openQuickAdd({ iso, meal = mealIdForNow(), onDone = null }) {
  let currentMeal = meal;
  const sheet = openSheet({
    title: 'Быстрое добавление',
    subtitle: 'Когда продукта нет в базе',
    body: `
      <label class="field">
        <span class="field__label">Название</span>
        <input class="input" data-name placeholder="Например, обед в кафе" autocomplete="off">
      </label>
      <label class="field">
        <span class="field__label">Калории, ккал</span>
        <input class="input" data-kcal type="number" inputmode="numeric" min="1" max="5000" placeholder="450" data-autofocus>
      </label>
      <div class="form-grid">
        <label class="field"><span class="field__label">Белки, г</span><input class="input" data-protein type="number" inputmode="decimal" min="0" placeholder="0"></label>
        <label class="field"><span class="field__label">Жиры, г</span><input class="input" data-fat type="number" inputmode="decimal" min="0" placeholder="0"></label>
      </div>
      <label class="field"><span class="field__label">Углеводы, г</span><input class="input" data-carb type="number" inputmode="decimal" min="0" placeholder="0"></label>
      <div class="field">
        <span class="field__label">Приём пищи</span>
        <div class="segmented" data-meals>
          ${MEALS.map((m) => `<button class="segmented__btn ${m.id === currentMeal ? 'segmented__btn--active' : ''}" type="button" data-meal="${m.id}">${m.name}</button>`).join('')}
        </div>
      </div>`,
    footer: '<button class="btn btn--primary btn--block" type="button" data-add>Добавить</button>',
  });

  qsa('[data-meal]', sheet.body).forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMeal = btn.dataset.meal;
      qsa('[data-meal]', sheet.body).forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
    });
  });

  qs('[data-add]', sheet.footer).addEventListener('click', () => {
    const kcal = Math.round(Number(qs('[data-kcal]', sheet.body).value) || 0);
    if (kcal <= 0) return toast('Укажите калории');
    const name = qs('[data-name]', sheet.body).value.trim() || 'Быстрое добавление';
    const food = {
      id: null,
      name,
      kcal,
      protein: Number(qs('[data-protein]', sheet.body).value) || 0,
      fat: Number(qs('[data-fat]', sheet.body).value) || 0,
      carb: Number(qs('[data-carb]', sheet.body).value) || 0,
    };
    addEntry(iso, currentMeal, food, 100);
    sheet.close();
    toast('Добавлено');
    onDone?.();
  });
}

/* ---------- Редактирование записи ---------- */

export function openEntryEditor({ iso, entry, onDone = null }) {
  let grams = Number(entry.grams) || 100;
  let currentMeal = entry.meal || 'breakfast';
  const food = { name: entry.name, kcal: entry.per.kcal, protein: entry.per.protein, fat: entry.per.fat, carb: entry.per.carb };

  const sheet = openSheet({
    title: entry.name,
    subtitle: `на 100 г — ${Math.round(entry.per.kcal)} ккал`,
    body: `
      <div class="amount-row">
        <div class="stepper">
          <button class="stepper__btn" type="button" data-minus aria-label="Меньше">−</button>
          <input class="stepper__input" type="number" inputmode="numeric" min="1" max="3000" value="${grams}" data-grams aria-label="Граммы">
          <button class="stepper__btn" type="button" data-plus aria-label="Больше">+</button>
        </div>
      </div>
      <div class="amount-unit">граммов</div>
      <div data-preview>${previewHtml(food, grams)}</div>
      <div class="field mt-16">
        <span class="field__label">Приём пищи</span>
        <div class="segmented" data-meals>
          ${MEALS.map((m) => `<button class="segmented__btn ${m.id === currentMeal ? 'segmented__btn--active' : ''}" type="button" data-meal="${m.id}">${m.name}</button>`).join('')}
        </div>
      </div>`,
    footer: `
      <div class="btn-row">
        <button class="btn btn--danger" type="button" data-del>${icon('trash')}</button>
        <button class="btn btn--primary" type="button" data-save>Сохранить</button>
      </div>`,
  });

  const gramsInput = qs('[data-grams]', sheet.body);
  const previewNode = qs('[data-preview]', sheet.body);
  const sync = () => {
    grams = Math.min(3000, Math.max(1, Math.round(Number(gramsInput.value) || 1)));
    previewNode.innerHTML = previewHtml(food, grams);
  };
  gramsInput.addEventListener('input', sync);
  qs('[data-minus]', sheet.body).addEventListener('click', () => { gramsInput.value = String(Math.max(1, grams - 10)); sync(); });
  qs('[data-plus]', sheet.body).addEventListener('click', () => { gramsInput.value = String(Math.min(3000, grams + 10)); sync(); });

  qsa('[data-meal]', sheet.body).forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMeal = btn.dataset.meal;
      qsa('[data-meal]', sheet.body).forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
    });
  });

  qs('[data-save]', sheet.footer).addEventListener('click', () => {
    updateEntry(iso, entry.id, { grams, meal: currentMeal });
    sheet.close();
    toast('Сохранено');
    onDone?.();
  });

  qs('[data-del]', sheet.footer).addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Удалить запись?',
      text: `«${entry.name}» исчезнет из дневника за этот день.`,
      confirmText: 'Удалить',
    });
    if (!ok) return;
    removeEntry(iso, entry.id);
    sheet.close();
    toast('Удалено');
    onDone?.();
  });

  sync();
  return sheet;
}

/* ---------- Свой продукт ---------- */

export function openProductEditor({ food = null, onSaved = null, onDeleted = null } = {}) {
  const editing = Boolean(food);
  const initial = food || { name: '', kcal: '', protein: '', fat: '', carb: '' };

  const sheet = openSheet({
    title: editing ? 'Изменить продукт' : 'Свой продукт',
    subtitle: 'Значения на 100 г',
    body: `
      <label class="field">
        <span class="field__label">Название</span>
        <input class="input" data-name value="${esc(initial.name)}" placeholder="Например, творожная запеканка" autocomplete="off" data-autofocus>
      </label>
      <div class="form-grid">
        <label class="field"><span class="field__label">Калории</span><input class="input" data-kcal type="number" inputmode="numeric" min="0" value="${initial.kcal}" placeholder="0"></label>
        <label class="field"><span class="field__label">Белки, г</span><input class="input" data-protein type="number" inputmode="decimal" min="0" value="${initial.protein}" placeholder="0"></label>
      </div>
      <div class="form-grid">
        <label class="field"><span class="field__label">Жиры, г</span><input class="input" data-fat type="number" inputmode="decimal" min="0" value="${initial.fat}" placeholder="0"></label>
        <label class="field"><span class="field__label">Углеводы, г</span><input class="input" data-carb type="number" inputmode="decimal" min="0" value="${initial.carb}" placeholder="0"></label>
      </div>
      <p class="field__hint">Продукт сохранится только на этом устройстве.</p>`,
    footer: `
      <div class="btn-row">
        ${editing ? '<button class="btn btn--danger" type="button" data-del aria-label="Удалить">' + icon('trash') + '</button>' : ''}
        <button class="btn btn--primary" type="button" data-save>${editing ? 'Сохранить' : 'Добавить продукт'}</button>
      </div>`,
  });

  qs('[data-save]', sheet.footer).addEventListener('click', () => {
    const name = qs('[data-name]', sheet.body).value.trim();
    const kcal = Number(qs('[data-kcal]', sheet.body).value) || 0;
    if (!name) return toast('Введите название');
    if (kcal <= 0) return toast('Укажите калорийность');
    const payload = {
      name,
      kcal,
      protein: Number(qs('[data-protein]', sheet.body).value) || 0,
      fat: Number(qs('[data-fat]', sheet.body).value) || 0,
      carb: Number(qs('[data-carb]', sheet.body).value) || 0,
      cat: 'Мои',
      custom: true,
    };
    let result;
    if (editing) {
      updateCustomFood(food.id, payload);
      result = { ...food, ...payload };
      toast('Продукт обновлён');
    } else {
      result = customFood(payload);
      toast('Продукт добавлен');
    }
    sheet.close();
    onSaved?.(result);
  });

  const delBtn = qs('[data-del]', sheet.footer);
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: 'Удалить продукт?',
        text: `«${food.name}» пропадёт из списка «Мои». Записи в дневнике останутся.`,
      });
      if (!ok) return;
      deleteCustomFood(food.id);
      sheet.close();
      toast('Продукт удалён');
      onDeleted?.(food);
    });
  }

  return sheet;
}
