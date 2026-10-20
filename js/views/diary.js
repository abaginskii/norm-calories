import { state, MEALS, todayISO, dayEntries, dayTotals, formatFullDate, mealForNow, removeEntry, parseISO, queueTextMeal, dequeueTextMeal } from '../store.js';
import { icon, esc, fmt, fmt1, toast, openSheet, qs } from '../ui.js';
import { openFoodPicker, openEntryEditor, openProductEditor } from './picker.js';
import { openScanner } from '../scan.js';
import { openAIEstimate, openAISettings, logTextMeal, hasKey } from '../ai.js';

let iso = todayISO();
let draft = '';
let pending = false;
let draining = false;
export function getIso() { return iso; }
export function focusComposer() { document.querySelector('[data-composer-input]')?.focus(); }
export function header() { return null; }

async function drainQueue() {
  if (draining || !navigator.onLine || !hasKey() || !state.pendingLogs.length) return;
  draining = true;
  try {
    for (const item of [...state.pendingLogs]) {
      if (!navigator.onLine) break;
      try {
        await logTextMeal(item);
        dequeueTextMeal(item.id);
        toast('Запись из офлайн-очереди добавлена');
      } catch (err) { break; }
    }
  } finally { draining = false; }
}
window.addEventListener('online', drainQueue);

function dateLabel() {
  const d = parseISO(iso);
  return `${d.getDate()} ${new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(d)}`;
}

function openDate(root) {
  const sheet = openSheet({
    title: 'Выбрать день', subtitle: formatFullDate(iso),
    body: `<label class="field"><span class="field__label">Дата</span><input class="input" type="date" data-date value="${iso}"></label>`,
    footer: '<button class="btn btn--primary btn--block" type="button" data-select>Показать день</button>',
  });
  qs('[data-select]', sheet.footer).addEventListener('click', () => {
    const value = qs('[data-date]', sheet.body).value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    iso = value; sheet.close(); render(root);
  });
}

function feedItem(entry) {
  const meal = MEALS.find((m) => m.id === entry.meal) || MEALS[3];
  const factor = (Number(entry.grams) || 0) / 100;
  const kcal = Math.round((entry.per.kcal || 0) * factor);
  const time = Number.isFinite(Number(entry.createdAt)) ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(entry.createdAt)) : '—';
  const fiber = entry.per.fiber == null ? '' : ` · Клетчатка ${fmt1(entry.per.fiber * factor)} г`;
  return `<div class="norm-feed-row" data-row="${entry.id}">
    <button class="norm-feed-main" type="button" data-entry="${entry.id}">
      <span class="norm-feed-left"><span class="norm-feed-icon">${icon(meal.icon)}</span><small>${time}</small></span>
      <span class="norm-feed-copy"><span class="norm-feed-title"><span class="norm-kcal ${kcal > 400 ? 'norm-kcal--warm' : ''}">${icon('flame')} ${fmt(kcal)} ккал</span> ${esc(entry.name)}</span>
      <span class="norm-feed-detail">${fmt(entry.grams)} г · Б ${fmt1((entry.per.protein || 0) * factor)} · У ${fmt1((entry.per.carb || 0) * factor)} · Ж ${fmt1((entry.per.fat || 0) * factor)}${fiber}</span></span>
    </button><button class="norm-feed-delete" type="button" data-delete="${entry.id}" aria-label="Удалить ${esc(entry.name)}">${icon('trash')}</button></div>`;
}

export function render(root) {
  void drainQueue();
  const total = dayTotals(iso);
  const entries = dayEntries(iso).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const countWord = entries.length % 10 === 1 && entries.length % 100 !== 11 ? 'запись' : entries.length % 10 >= 2 && entries.length % 10 <= 4 && (entries.length % 100 < 12 || entries.length % 100 > 14) ? 'записи' : 'записей';
  root.innerHTML = `<div class="norm-home">
    <header class="norm-header">
      <button class="norm-date" type="button" data-date-open>${esc(dateLabel())}<span>⌄</span></button>
      <span class="norm-header-actions"><button class="norm-icon-button norm-icon-button--green" type="button" data-nutrition aria-label="Нутриенты">${icon('leaf')}</button><button class="norm-icon-button" type="button" data-settings aria-label="Настройки">${icon('settings')}</button></span>
    </header>
    <section class="norm-hero" aria-label="Съеденные калории"><div class="norm-hero-number"><strong>${fmt(Math.round(total.kcal))}</strong><span>/ккал</span></div><p>Съедено за день</p></section>
    <section class="norm-sentence" aria-label="Сводка за день">
      <p><span class="norm-inline-icon">${icon('leaf')}</span> <mark>${fmt(Math.round(total.kcal))} калорий</mark> <span>${entries.length} ${countWord}</span></p>
      <p><button class="norm-text-button norm-blue" type="button" data-nutrition>${fmt1(total.protein)} г белка</button> <span>и</span> <mark>${fmt1(total.carb)} г углеводов</mark></p>
      <p><span>${fmt1(total.fat)} г жиров</span>${total.fiberKnown ? ` <span>· ${fmt1(total.fiber)} г клетчатки</span>` : ''}</p>
    </section>
    <div class="norm-hairline"></div>
    <div class="norm-section-head"><h2>Приёмы пищи</h2><span>${entries.length ? 'Новые сверху' : 'Начните с первой записи'}</span></div>
    <div class="norm-feed">${pending ? `<div class="norm-pending"><span class="norm-feed-icon">${icon('sparkles')}</span><span><b>${esc(draft)}</b><small>Разбираем блюдо…</small></span></div>` : ''}
    ${state.pendingLogs.filter((item) => item.iso === iso).map((item) => `<div class="norm-pending"><span class="norm-feed-icon">${icon('refresh')}</span><span><b>${esc(item.text)}</b><small>В очереди до появления сети</small></span></div>`).join('')}
    ${entries.length ? entries.map(feedItem).join('') : `<div class="norm-empty"><span>${icon('leaf')}</span><h3>Пока ничего не записано</h3><p>Расскажите, что вы съели, или добавьте продукт из базы.</p></div>`}</div>
    <div class="norm-quick-actions"><button type="button" data-food>${icon('plus')} Продукт</button><button type="button" data-scan>${icon('barcode')} Штрихкод</button><button type="button" data-photo>${icon('camera')} Фото</button></div>
    <form class="norm-composer" data-composer><button class="norm-mic" type="button" data-mic aria-label="Диктовка">${icon('text')}</button><input data-composer-input type="text" enterkeyhint="send" autocomplete="off" aria-label="Что вы съели?" placeholder="Что вы съели?" value="${esc(draft)}"><button class="norm-send" type="submit" data-send aria-label="Добавить еду" ${!draft.trim() || pending ? 'disabled' : ''}>↑</button></form>
  </div>`;
  qs('[data-date-open]', root).addEventListener('click', () => openDate(root));
  root.querySelectorAll('[data-nutrition]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/nutrition'; }));
  qs('[data-settings]', root).addEventListener('click', () => { location.hash = '#/profile'; });
  qs('[data-food]', root).addEventListener('click', () => openFoodPicker({ iso, meal: mealForNow() }));
  qs('[data-scan]', root).addEventListener('click', () => openScanner({ iso, meal: mealForNow(), createProduct: (code) => openProductEditor({ barcode: code }) }));
  qs('[data-photo]', root).addEventListener('click', () => openAIEstimate({ iso, meal: mealForNow(), mode: 'photo' }));
  const input = qs('[data-composer-input]', root);
  input.addEventListener('input', () => { draft = input.value; qs('[data-send]', root).disabled = !draft.trim() || pending; });
  qs('[data-mic]', root).addEventListener('click', () => { input.focus(); toast('Для диктовки используйте микрофон на клавиатуре'); });
  qs('[data-composer]', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !draft.trim()) return;
    if (!hasKey()) { openAISettings({ onSaved: () => { focusComposer(); void drainQueue(); } }); return; }
    const submitted = draft.trim();
    const targetIso = iso;
    if (!navigator.onLine) {
      queueTextMeal(targetIso, mealForNow(), submitted);
      draft = '';
      toast('Сохранили в очередь до появления сети');
      render(root);
      return;
    }
    pending = true; render(root);
    try {
      await logTextMeal({ text: submitted, iso: targetIso, meal: mealForNow() });
      if (draft.trim() === submitted) draft = '';
      toast('Блюдо добавлено');
    } catch (err) {
      if (!navigator.onLine && err.kind === 'network') {
        queueTextMeal(targetIso, mealForNow(), submitted);
        draft = '';
        toast('Сохранили в очередь до появления сети');
      } else toast(err.message || 'Не удалось добавить блюдо', 4200);
    }
    finally { pending = false; render(root); }
  });
  root.querySelectorAll('[data-entry]').forEach((b) => b.addEventListener('click', () => {
    const entry = entries.find((e) => e.id === b.dataset.entry);
    if (entry) openEntryEditor({ iso, entry });
  }));
  root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => { removeEntry(iso, b.dataset.delete); toast('Запись удалена'); }));
  root.querySelectorAll('[data-row]').forEach((row) => {
    let startX = 0;
    row.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    row.addEventListener('touchend', (e) => { if (startX - e.changedTouches[0].clientX > 64) row.classList.add('norm-feed-row--revealed'); }, { passive: true });
  });
}
