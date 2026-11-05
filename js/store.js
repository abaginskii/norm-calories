/* Хранилище состояния: профиль, цели, дни, продукты.
   Всё лежит в localStorage — данные не покидают устройство. */

const KEY = 'norm.state.v1';

export const MEALS = [
  { id: 'breakfast', name: 'Завтрак', icon: 'sunrise' },
  { id: 'lunch', name: 'Обед', icon: 'sun' },
  { id: 'dinner', name: 'Ужин', icon: 'moon' },
  { id: 'snack', name: 'Перекус', icon: 'apple' },
];

export const ACTIVITY = [
  { id: 1.2, name: 'Сидячий', hint: 'офис, мало движения' },
  { id: 1.375, name: 'Слабый', hint: '1–2 тренировки в неделю' },
  { id: 1.55, name: 'Средний', hint: '3–4 тренировки в неделю' },
  { id: 1.725, name: 'Высокий', hint: '5–6 тренировок в неделю' },
  { id: 1.9, name: 'Очень высокий', hint: 'физическая работа + спорт' },
];

function blankState() {
  return {
    version: 1,
    profile: null,
    targets: null,
    days: {},
    customFoods: [],
    recents: [],
    favorites: [],
    settings: { theme: 'auto', browserMode: false },
    ai: { key: '', model: 'gemini-2.5-flash', proxy: '' },
    barcodeCache: {},
    pendingLogs: [],
  };
}

function normalize(raw) {
  const base = blankState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    days: raw.days && typeof raw.days === 'object' ? raw.days : {},
    customFoods: Array.isArray(raw.customFoods) ? raw.customFoods : [],
    recents: Array.isArray(raw.recents) ? raw.recents : [],
    favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
    settings: { ...base.settings, ...(raw.settings || {}) },
    ai: { ...base.ai, ...(raw.ai || {}) },
    barcodeCache: raw.barcodeCache && typeof raw.barcodeCache === 'object' ? raw.barcodeCache : {},
    pendingLogs: Array.isArray(raw.pendingLogs) ? raw.pendingLogs : [],
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('Не удалось прочитать данные, начинаем заново', err);
    return blankState();
  }
}

export const state = read();

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Не удалось сохранить данные', err);
    return false;
  }
}

/** Изменение состояния + сохранение + оповещение подписчиков. */
export function update(mutator) {
  mutator(state);
  const ok = persist();
  emit();
  return ok;
}

export function replaceState(next) {
  const clean = normalize(next);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, clean);
  persist();
  emit();
}

export function resetState() {
  const fresh = blankState();
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
  persist();
  emit();
}

/* ---------- Даты ---------- */

export function mealForNow() {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'dinner';
  return 'snack';
}

export function isoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return isoDate(new Date());
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso, delta) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function daysBetween(a, b) {
  const ms = parseISO(b) - parseISO(a);
  return Math.round(ms / 86400000);
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function formatFullDate(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDayTitle(iso) {
  const today = todayISO();
  if (iso === today) return 'Сегодня';
  if (iso === addDays(today, -1)) return 'Вчера';
  if (iso === addDays(today, 1)) return 'Завтра';
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function formatDaySub(iso) {
  const d = parseISO(iso);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${WEEKDAYS[d.getDay()]}${year}`;
}

export function weekdayShort(iso) {
  return WEEKDAYS_SHORT[parseISO(iso).getDay()];
}

export function weekdayIndex(iso) {
  return parseISO(iso).getDay();
}

/* ---------- Дни и приёмы пищи ---------- */

export function ensureDay(iso) {
  let day = state.days[iso];
  if (!day) {
    day = state.days[iso] = { meals: {}, weight: null, note: '' };
  }
  if (!day.meals) day.meals = {};
  for (const meal of MEALS) {
    if (!Array.isArray(day.meals[meal.id])) day.meals[meal.id] = [];
  }
  return day;
}

export function getDay(iso) {
  return state.days[iso] || null;
}

export function dayEntries(iso) {
  const day = getDay(iso);
  if (!day) return [];
  return MEALS.flatMap((m) => day.meals[m.id] || []);
}

export function dayTotals(iso) {
  const totals = { kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, fiberKnown: false };
  for (const entry of dayEntries(iso)) {
    const grams = Number(entry.grams) || 0;
    const factor = grams / 100;
    totals.kcal += (entry.per.kcal || 0) * factor;
    totals.protein += (entry.per.protein || 0) * factor;
    totals.fat += (entry.per.fat || 0) * factor;
    totals.carb += (entry.per.carb || 0) * factor;
    if (Number.isFinite(Number(entry.per.fiber)) && entry.per.fiber !== null && entry.per.fiber !== undefined) {
      totals.fiber += Number(entry.per.fiber) * factor;
      totals.fiberKnown = true;
    }
  }
  return totals;
}

export function mealTotals(iso, mealId) {
  const totals = { kcal: 0, protein: 0, fat: 0, carb: 0 };
  const day = getDay(iso);
  for (const entry of (day && day.meals[mealId]) || []) {
    const factor = (Number(entry.grams) || 0) / 100;
    totals.kcal += (entry.per.kcal || 0) * factor;
    totals.protein += (entry.per.protein || 0) * factor;
    totals.fat += (entry.per.fat || 0) * factor;
    totals.carb += (entry.per.carb || 0) * factor;
  }
  return totals;
}

export function addEntry(iso, mealId, food, grams) {
  const entry = {
    id: uid(),
    foodId: food.id || null,
    name: food.name,
    per: { kcal: food.kcal, protein: food.protein, fat: food.fat, carb: food.carb, fiber: food.fiber ?? null },
    grams: Math.max(1, Math.round(Number(grams) || 0)),
    meal: mealId,
    createdAt: Date.now(),
  };
  update((s) => {
    const day = s.days[iso] || (s.days[iso] = { meals: {} });
    if (!day.meals) day.meals = {};
    if (!Array.isArray(day.meals[mealId])) day.meals[mealId] = [];
    day.meals[mealId].push(entry);
    if (food.id) {
      s.recents = [food.id, ...s.recents.filter((id) => id !== food.id)].slice(0, 24);
    }
  });
  return entry;
}

export function addEntries(iso, mealId, foods) {
  if (!foods.length) return [];
  const created = foods.map((food) => ({
    id: uid(),
    foodId: food.id || null,
    name: food.name,
    per: { kcal: food.kcal, protein: food.protein, fat: food.fat, carb: food.carb, fiber: food.fiber ?? null },
    grams: Math.max(1, Math.round(Number(food.grams) || 0)),
    meal: mealId,
    createdAt: Date.now(),
  }));
  update((s) => {
    const day = s.days[iso] || (s.days[iso] = { meals: {} });
    if (!day.meals) day.meals = {};
    if (!Array.isArray(day.meals[mealId])) day.meals[mealId] = [];
    day.meals[mealId].push(...created);
  });
  return created;
}

export function updateEntry(iso, entryId, patch) {
  update((s) => {
    const day = s.days[iso];
    if (!day || !day.meals) return;
    for (const mealId of Object.keys(day.meals)) {
      const list = day.meals[mealId];
      const index = list.findIndex((e) => e.id === entryId);
      if (index >= 0) {
        const entry = { ...list[index], ...patch };
        if (patch.meal && patch.meal !== mealId) {
          list.splice(index, 1);
          if (!Array.isArray(day.meals[patch.meal])) day.meals[patch.meal] = [];
          day.meals[patch.meal].push(entry);
        } else {
          list[index] = entry;
        }
        return;
      }
    }
  });
}

export function removeEntry(iso, entryId) {
  update((s) => {
    const day = s.days[iso];
    if (!day || !day.meals) return;
    for (const mealId of Object.keys(day.meals)) {
      day.meals[mealId] = day.meals[mealId].filter((e) => e.id !== entryId);
    }
  });
}

export function queueTextMeal(iso, meal, text) {
  const item = { id: uid(), iso, meal, text: String(text).trim() };
  update((s) => { s.pendingLogs.push(item); });
  return item;
}

export function dequeueTextMeal(id) {
  update((s) => { s.pendingLogs = s.pendingLogs.filter((item) => item.id !== id); });
}

export function setWeight(iso, weight) {
  update((s) => {
    const day = s.days[iso] || (s.days[iso] = { meals: {} });
    day.weight = weight ? Number(weight) : null;
  });
}

export function lastWeight() {
  const dates = Object.keys(state.days).sort().reverse();
  for (const iso of dates) {
    const w = state.days[iso].weight;
    if (w) return { date: iso, weight: w };
  }
  return null;
}

export function loggedDates(limit = 365) {
  const dates = Object.keys(state.days).filter((iso) => {
    const day = state.days[iso];
    return day && Object.values(day.meals || {}).some((list) => list && list.length);
  });
  return dates.sort().slice(-limit);
}

export function streak() {
  let count = 0;
  let cursor = todayISO();
  const has = (iso) => {
    const day = state.days[iso];
    return Boolean(day && Object.values(day.meals || {}).some((l) => l && l.length));
  };
  if (!has(cursor)) cursor = addDays(cursor, -1);
  while (has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/* ---------- Продукты ---------- */

export function customFood(food) {
  const item = {
    id: `c_${uid()}`,
    name: String(food.name).trim(),
    barcode: food.barcode || null,
    brand: food.brand || '',
    cat: 'Мои',
    kcal: round1(food.kcal),
    protein: round1(food.protein),
    fat: round1(food.fat),
    carb: round1(food.carb),
    fiber: food.fiber == null ? null : round1(food.fiber),
    custom: true,
  };
  update((s) => { s.customFoods.unshift(item); });
  return item;
}

export function updateCustomFood(id, patch) {
  update((s) => {
    const idx = s.customFoods.findIndex((f) => f.id === id);
    if (idx >= 0) s.customFoods[idx] = { ...s.customFoods[idx], ...patch };
  });
}

export function deleteCustomFood(id) {
  update((s) => {
    s.customFoods = s.customFoods.filter((f) => f.id !== id);
    s.favorites = s.favorites.filter((fid) => fid !== id);
    s.recents = s.recents.filter((fid) => fid !== id);
  });
}

/* ---------- AI и штрихкоды ---------- */

export function setAI(patch) {
  update((s) => {
    s.ai = { ...s.ai, ...patch };
  });
}

export function cacheBarcode(product) {
  update((s) => {
    if (!s.barcodeCache) s.barcodeCache = {};
    s.barcodeCache[product.barcode] = product;
    const keys = Object.keys(s.barcodeCache);
    if (keys.length > 60) delete s.barcodeCache[keys[0]];
  });
}

export function cachedBarcode(code) {
  return (state.barcodeCache && state.barcodeCache[code]) || null;
}

export function exportPayload() {
  const { ai, ...rest } = state;
  return { ...rest, ai: { key: '', proxy: '', model: (ai && ai.model) || 'gemini-2.5-flash' } };
}

export function toggleFavorite(foodId) {
  update((s) => {
    s.favorites = s.favorites.includes(foodId)
      ? s.favorites.filter((id) => id !== foodId)
      : [...s.favorites, foodId];
  });
}

export function isFavorite(foodId) {
  return state.favorites.includes(foodId);
}

/* ---------- Утилиты ---------- */

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

export function formatNumber(n, digits = 0) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n) || 0);
}
