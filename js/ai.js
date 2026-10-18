/* AI-помощник на Gemini: оценка блюда по фото или описанию и подсказки по БЖУ.
   Ключ хранится только в localStorage пользователя и уходит напрямую в Google. */

import {
  state, addEntries, dayTotals, todayISO, setAI, MEALS,
} from './store.js';
import { computeTargets } from './calc.js';
import {
  openSheet, icon, esc, fmt, fmt1, toast, qs, qsa,
} from './ui.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

const ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          fat: { type: 'number' },
          carb: { type: 'number' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'fat', 'carb'],
      },
    },
    note: { type: 'string' },
  },
  required: ['items', 'note'],
};

const HINT_SCHEMA = {
  type: 'object',
  properties: {
    advice: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          fat: { type: 'number' },
          carb: { type: 'number' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'fat', 'carb'],
      },
    },
  },
  required: ['advice', 'options'],
};

const PHOTO_PROMPT = [
  'Ты — опытный нутрициолог. На фотографии приём пищи.',
  'Определи все блюда и продукты, оцени вес каждой порции в граммах и посчитай КБЖУ.',
  'Важно: kcal/protein/fat/carb относятся к указанной порции grams, а не к 100 г.',
  'Если продукт упакован и данные видны на упаковке, используй их.',
  'Если на фото нет еды, верни пустой items и объясни причину в note.',
  'Названия пиши по-русски, кратко. note — одно короткое предложение с оговоркой про точность.',
].join(' ');

const TEXT_PROMPT = [
  'Ты — опытный нутрициолог. Пользователь описал, что съел.',
  'Оцени вес каждой позиции в граммах и посчитай КБЖУ для этой порции.',
  'Важно: kcal/protein/fat/carb относятся к указанной порции grams, а не к 100 г.',
  'Если вес не указан, бери типичную порцию. Названия — по-русски, кратко.',
  'note — одно короткое предложение с оговоркой про точность.',
].join(' ');

export class AIError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export function hasKey() {
  return Boolean(state.ai && state.ai.key);
}

function modelName() {
  return (state.ai && state.ai.model) || DEFAULT_MODEL;
}

function extractJson(text) {
  const clean = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AIError('parse', 'Пустой ответ модели');
  return JSON.parse(clean.slice(start, end + 1));
}

function mapHttpError(status, payload) {
  const message = payload && payload.error && payload.error.message ? payload.error.message : '';
  if (status === 400 && /api key not valid/i.test(message)) {
    return new AIError('key', 'Ключ не подошёл. Проверьте его в профиле.');
  }
  if (status === 401 || (status === 403 && /api key/i.test(message))) {
    return new AIError('key', 'Ключ отклонён. Проверьте его и ограничения проекта.');
  }
  if (status === 429) {
    return new AIError('quota', 'Лимит запросов исчерпан. Попробуйте позже.');
  }
  if (status === 404) {
    return new AIError('model', 'Модель недоступна. Укажите другую в настройках AI.');
  }
  if (status >= 500) {
    return new AIError('server', 'Gemini временно недоступен. Попробуйте ещё раз.');
  }
  return new AIError('http', message || `Ошибка Gemini (${status})`);
}

async function callGemini({ parts, schema, temperature = 0.2, maxTokens = 1024 }) {
  if (!hasKey()) throw new AIError('no-key', 'Сначала добавьте ключ Gemini.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let response;

  try {
    response = await fetch(
      `${ENDPOINT}/${encodeURIComponent(modelName())}:generateContent?key=${encodeURIComponent(state.ai.key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            responseSchema: schema,
            ...(/^gemini-2\.5/.test(modelName()) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal: controller.signal,
      },
    );
  } catch (err) {
    if (err.name === 'AbortError') throw new AIError('timeout', 'Gemini не ответил за минуту. Попробуйте ещё раз.');
    throw new AIError('network', 'Нет соединения с Gemini. Проверьте интернет.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let payload = null;
    try { payload = await response.json(); } catch (err) { /* noop */ }
    throw mapHttpError(response.status, payload);
  }

  const data = await response.json();
  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new AIError('blocked', 'Запрос заблокирован фильтром безопасности. Попробуйте другое фото или описание.');
  }
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content
    && data.candidates[0].content.parts || []).map((p) => p.text || '').join('');
  if (!text.trim()) throw new AIError('empty', 'Модель вернула пустой ответ. Попробуйте ещё раз.');

  return extractJson(text);
}

/* ---------- Ключ ---------- */

export async function verifyKey(key) {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}&pageSize=1`, {
    headers: { Accept: 'application/json' },
  });
  if (res.ok) return { ok: true };
  let payload = null;
  try { payload = await res.json(); } catch (err) { /* noop */ }
  const err = mapHttpError(res.status, payload);
  return { ok: false, message: err.message };
}

function mountKeyForm(sheet, onSaved) {
  sheet.setTitle('AI-помощник', 'Свой ключ Google Gemini');
  const current = (state.ai && state.ai.key) || '';

  sheet.setBody(`
    <div class="ai-key-note">
      ${icon('key')}
      <div>
        <p>Ключ хранится только в этом браузере и отправляется напрямую в Google. В репозитории его нет.</p>
      </div>
    </div>

    <label class="field" style="margin-top:16px">
      <span class="field__label">API-ключ Gemini</span>
      <div class="input-with-action">
        <input class="input" type="password" data-key autocomplete="off" spellcheck="false"
               placeholder="AIza..." value="${esc(current)}">
        <button class="input-action" type="button" data-toggle aria-label="Показать ключ">${icon('edit')}</button>
      </div>
      <span class="field__hint">Получить ключ: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com/app/apikey</a></span>
    </label>

    <label class="field">
      <span class="field__label">Модель</span>
      <input class="input" type="text" data-model value="${esc(modelName())}" placeholder="gemini-2.5-flash" spellcheck="false">
      <span class="field__hint">Обычно подходит gemini-2.5-flash. Если модель недоступна, укажите другую.</span>
    </label>

    <div class="ai-key-status" data-status hidden></div>
  `);

  sheet.setFooter(`
    <div class="btn-row">
      ${current ? '<button class="btn btn--danger" type="button" data-remove aria-label="Удалить ключ">' + icon('trash') + '</button>' : ''}
      <button class="btn" type="button" data-check>Проверить</button>
      <button class="btn btn--primary" type="button" data-save>Сохранить</button>
    </div>
  `);

  const keyInput = qs('[data-key]', sheet.body);
  const modelInput = qs('[data-model]', sheet.body);

  qs('[data-toggle]', sheet.body).addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  const statusNode = qs('[data-status]', sheet.body);
  const setStatus = (text, kind = 'ok') => {
    statusNode.hidden = false;
    statusNode.className = `ai-key-status ai-key-status--${kind}`;
    statusNode.textContent = text;
  };

  qs('[data-save]', sheet.footer).addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (!key) return toast('Вставьте ключ');
    if (key.length < 20) return toast('Ключ слишком короткий');
    setAI({ key, model: modelInput.value.trim() || DEFAULT_MODEL });
    onSaved?.();
  });

  const removeBtn = qs('[data-remove]', sheet.footer);
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      setAI({ key: '' });
      toast('Ключ удалён');
      mountKeyForm(sheet, onSaved);
    });
  }

  qs('[data-check]', sheet.footer).addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) return toast('Вставьте ключ');
    setStatus('Проверяем ключ…', 'pending');
    try {
      const result = await verifyKey(key);
      if (result.ok) setStatus('Ключ работает — можно сохранять.', 'ok');
      else setStatus(result.message, 'error');
    } catch (err) {
      setStatus('Не удалось проверить: нет соединения.', 'error');
    }
  });
}

export function openAISettings({ onSaved = null } = {}) {
  const sheet = openSheet({
    title: 'AI-помощник',
    subtitle: 'Свой ключ Google Gemini',
    body: '',
    footer: '',
  });
  mountKeyForm(sheet, () => {
    sheet.close();
    toast('Ключ сохранён');
    onSaved?.();
  });
  return sheet;
}

/* ---------- Общие элементы результата ---------- */

function clampNum(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item) => {
      const grams = Math.round(clampNum(item.grams, 5, 2000));
      return {
        name: String(item.name || 'Блюдо').trim().slice(0, 90),
        grams,
        kcal: Math.round(clampNum(item.kcal, 0, 5000)),
        protein: Math.round(clampNum(item.protein, 0, 500)),
        fat: Math.round(clampNum(item.fat, 0, 500)),
        carb: Math.round(clampNum(item.carb, 0, 800)),
      };
    })
    .filter((item) => item.kcal > 0 && item.name);
}

function resultList(items) {
  return items.map((item) => `
    <div class="ai-item">
      <div class="ai-item__body">
        <div class="ai-item__name">${esc(item.name)}</div>
        <div class="ai-item__meta">${fmt(item.grams)} г · Б ${fmt(item.protein)} · Ж ${fmt(item.fat)} · У ${fmt(item.carb)}</div>
      </div>
      <div class="ai-item__kcal">${fmt(item.kcal)}<span>ккал</span></div>
    </div>`).join('');
}

function totals(items) {
  return items.reduce((acc, item) => ({
    kcal: acc.kcal + item.kcal,
    protein: acc.protein + item.protein,
    fat: acc.fat + item.fat,
    carb: acc.carb + item.carb,
  }), { kcal: 0, protein: 0, fat: 0, carb: 0 });
}

function addItemsToDiary(iso, meal, items) {
  const foods = items.map((item) => {
    const factor = 100 / item.grams;
    return {
      name: item.name,
      grams: item.grams,
      kcal: item.kcal * factor,
      protein: item.protein * factor,
      fat: item.fat * factor,
      carb: item.carb * factor,
    };
  });
  addEntries(iso, meal, foods);
}

function mealChips(current) {
  return `
    <div class="field mt-16">
      <span class="field__label">Приём пищи</span>
      <div class="segmented" data-meals>
        ${MEALS.map((m) => `<button class="segmented__btn ${m.id === current ? 'segmented__btn--active' : ''}" type="button" data-meal="${m.id}">${m.name}</button>`).join('')}
      </div>
    </div>`;
}

/* ---------- Оценка блюда ---------- */

export function openAIEstimate({ iso = todayISO(), meal = 'breakfast', onDone = null } = {}) {
  let mode = 'photo';
  let photoData = null;
  let photoUrl = '';
  let note = '';
  let text = '';
  let currentMeal = meal;

  const sheet = openSheet({
    title: 'AI-оценка',
    subtitle: 'Фото или описание — посчитаем КБЖУ',
    body: '',
    footer: '',
  });

  function renderForm() {
    sheet.setTitle('AI-оценка', 'Фото или описание — посчитаем КБЖУ');
    sheet.setBody(`
      <div class="segmented mb-8" data-mode>
        <button class="segmented__btn ${mode === 'photo' ? 'segmented__btn--active' : ''}" type="button" data-value="photo">${icon('camera')} Фото</button>
        <button class="segmented__btn ${mode === 'text' ? 'segmented__btn--active' : ''}" type="button" data-value="text">${icon('text')} Текст</button>
      </div>

      ${mode === 'photo' ? `
        <input type="file" accept="image/*" data-file hidden>
        <button class="ai-photo ${photoUrl ? 'ai-photo--filled' : ''}" type="button" data-pick>
          ${photoUrl
            ? `<img src="${photoUrl}" alt="Фото блюда">`
            : `<span class="ai-photo__icon">${icon('camera')}</span>
               <span class="ai-photo__title">Сфотографировать блюдо</span>
               <span class="ai-photo__hint">или выбрать из галереи</span>`}
        </button>
        ${photoUrl ? '<button class="link-btn" type="button" data-repick>Выбрать другое фото</button>' : ''}
      ` : `
        <label class="field">
          <span class="field__label">Что вы съели?</span>
          <textarea class="input textarea" rows="4" data-text placeholder="Например: тарелка борща, два куска хлеба и стакан компота" data-autofocus>${esc(text)}</textarea>
        </label>
        <div class="chips" data-examples>
          <button class="chip" type="button" data-example="Тарелка борща и два куска хлеба">Борщ и хлеб</button>
          <button class="chip" type="button" data-example="Куриная грудка 200 г, гречка 150 г, салат из огурцов">Грудка с гречкой</button>
          <button class="chip" type="button" data-example="Два кофе с молоком и круассан">Кофе и круассан</button>
        </div>
      `}

      <label class="field mt-16">
        <span class="field__label">Уточнение (необязательно)</span>
        <input class="input" type="text" data-note value="${esc(note)}" placeholder="Например, половина порции, без майонеза">
      </label>

      <p class="tiny muted">Оценка приблизительная: AI не знает точный состав и вес. Фото уходит в Google Gemini.</p>
    `);

    sheet.setFooter(`<button class="btn btn--primary btn--block" type="button" data-estimate>Оценить</button>`);

    qsa('[data-mode] [data-value]', sheet.body).forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.value;
        renderForm();
      });
    });

    const fileInput = qs('[data-file]', sheet.body);
    const pickBtn = qs('[data-pick]', sheet.body);
    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          photoData = await prepareImage(file);
          if (photoUrl) URL.revokeObjectURL(photoUrl);
          photoUrl = URL.createObjectURL(file);
          renderForm();
        } catch (err) {
          console.warn(err);
          toast('Не удалось открыть фото');
        }
      });
    }

    const repick = qs('[data-repick]', sheet.body);
    if (repick) repick.addEventListener('click', () => fileInput && fileInput.click());

    qsa('[data-example]', sheet.body).forEach((btn) => {
      btn.addEventListener('click', () => {
        const area = qs('[data-text]', sheet.body);
        area.value = btn.dataset.example;
        text = area.value;
        area.focus();
      });
    });

    const textArea = qs('[data-text]', sheet.body);
    if (textArea) {
      textArea.addEventListener('input', () => { text = textArea.value; });
    }
    const noteInput = qs('[data-note]', sheet.body);
    if (noteInput) noteInput.addEventListener('input', () => { note = noteInput.value; });

    qs('[data-estimate]', sheet.footer).addEventListener('click', () => {
      if (mode === 'photo' && !photoData) return toast('Сначала выберите фото');
      if (mode === 'text' && !text.trim()) return toast('Опишите, что съели');
      runEstimate();
    });
  }

  function renderLoading() {
    sheet.setBody(`
      <div class="ai-loading">
        <span class="spinner"></span>
        <p class="small">${mode === 'photo' ? 'Смотрим на фото и считаем КБЖУ…' : 'Считаем КБЖУ по описанию…'}</p>
        <p class="tiny muted">Обычно занимает 3–10 секунд</p>
      </div>`);
    sheet.setFooter('');
  }

  function renderError(message) {
    sheet.setBody(`
      <div class="empty">
        <div class="empty__icon">${icon('info')}</div>
        <div class="empty__title">Не получилось</div>
        <div class="empty__text">${esc(message)}</div>
      </div>`);
    sheet.setFooter(`
      <div class="btn-row">
        <button class="btn" type="button" data-back>Изменить</button>
        <button class="btn btn--primary" type="button" data-retry>Повторить</button>
      </div>`);
    qs('[data-back]', sheet.footer).addEventListener('click', renderForm);
    qs('[data-retry]', sheet.footer).addEventListener('click', runEstimate);
  }

  function renderResult(result) {
    const items = normalizeItems(result.items);
    if (!items.length) {
      renderError(result.note || 'Не удалось распознать еду. Попробуйте другое фото или опишите словами.');
      return;
    }
    const sum = totals(items);

    sheet.setTitle('Оценка готова', `${items.length} ${items.length === 1 ? 'позиция' : 'позиции'} · ${fmt(sum.kcal)} ккал`);
    sheet.setBody(`
      <div class="ai-result-head">
        <div class="ai-ring">
          <b>${fmt(sum.kcal)}</b>
          <span>ккал</span>
        </div>
        <div class="ai-macros">
          <span>Б <b>${fmt(sum.protein)}</b> г</span>
          <span>Ж <b>${fmt(sum.fat)}</b> г</span>
          <span>У <b>${fmt(sum.carb)}</b> г</span>
        </div>
      </div>

      <div class="ai-items">${resultList(items)}</div>

      ${result.note ? `<p class="ai-note">${icon('info')} ${esc(result.note)}</p>` : ''}

      ${mealChips(currentMeal)}

      <p class="tiny muted mt-16">Проверьте порции: AI ошибается на сложных блюдах. Можно поправить граммы после добавления.</p>
    `);

    qsa('[data-meal]', sheet.body).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentMeal = btn.dataset.meal;
        qsa('[data-meal]', sheet.body).forEach((b) => b.classList.remove('segmented__btn--active'));
        btn.classList.add('segmented__btn--active');
      });
    });

    sheet.setFooter(`
      <div class="btn-row">
        <button class="btn" type="button" data-back>Заново</button>
        <button class="btn btn--primary" type="button" data-add>Добавить</button>
      </div>`);

    qs('[data-back]', sheet.footer).addEventListener('click', renderForm);
    qs('[data-add]', sheet.footer).addEventListener('click', () => {
      addItemsToDiary(iso, currentMeal, items);
      sheet.close();
      toast(`Добавлено: ${items.length} ${items.length === 1 ? 'блюдо' : 'блюда'}`);
      onDone?.();
    });
  }

  async function runEstimate() {
    renderLoading();
    try {
      const parts = [];
      if (mode === 'photo' && photoData) {
        parts.push({ inline_data: { mime_type: photoData.mime, data: photoData.base64 } });
      }
      const prompt = mode === 'photo'
        ? PHOTO_PROMPT
        : `${TEXT_PROMPT}\n\nОписание пользователя: """${text.trim()}"""`;
      parts.push({ text: note.trim() ? `${prompt}\n\nУточнение пользователя: ${note.trim()}` : prompt });

      const result = await callGemini({ parts, schema: ITEMS_SCHEMA, maxTokens: 1200 });
      renderResult(result);
    } catch (err) {
      console.warn(err);
      renderError(err instanceof AIError ? err.message : 'Ошибка AI. Попробуйте ещё раз.');
    }
  }

  if (!hasKey()) {
    mountKeyForm(sheet, () => renderForm());
  } else {
    renderForm();
  }

  return sheet;
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch (err) { /* пробуем через Image */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    image.src = url;
  });
}

async function prepareImage(file) {
  const bitmap = await loadBitmap(file);
  const maxSide = 1100;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', base64: dataUrl.split(',')[1] };
}

/* ---------- Подсказка по остатку дня ---------- */

export function openAIHint({ iso = todayISO(), onDone = null } = {}) {
  const targets = state.targets || computeTargets(state.profile || {});
  const totals = dayTotals(iso);
  const left = {
    kcal: Math.max(0, Math.round(targets.kcal - totals.kcal)),
    protein: Math.max(0, Math.round(targets.protein - totals.protein)),
    fat: Math.max(0, Math.round(targets.fat - totals.fat)),
    carb: Math.max(0, Math.round(targets.carb - totals.carb)),
  };

  const sheet = openSheet({
    title: 'Что добрать?',
    subtitle: 'Совет по остатку дня',
    body: '',
    footer: '',
  });

  function renderPrompt() {
    sheet.setBody(`
      <div class="ai-left">
        <div class="ai-left__cell"><b>${fmt(left.kcal)}</b><span>ккал осталось</span></div>
        <div class="ai-left__cell"><b>${fmt(left.protein)}</b><span>белка</span></div>
        <div class="ai-left__cell"><b>${fmt(left.fat)}</b><span>жиров</span></div>
        <div class="ai-left__cell"><b>${fmt(left.carb)}</b><span>углеводов</span></div>
      </div>
      <p class="small muted mt-16">AI предложит, что съесть, чтобы закрыть норму без перебора.</p>
      <p class="tiny muted">Съедено сегодня: ${fmt(Math.round(totals.kcal))} из ${fmt(targets.kcal)} ккал.</p>
    `);
    sheet.setFooter('<button class="btn btn--primary btn--block" type="button" data-ask>Подсказать</button>');
    qs('[data-ask]', sheet.footer).addEventListener('click', ask);
  }

  async function ask() {
    if (!hasKey()) {
      mountKeyForm(sheet, () => ask());
      return;
    }

    sheet.setBody(`
      <div class="ai-loading">
        <span class="spinner"></span>
        <p class="small">Думаем, что предложить…</p>
      </div>`);
    sheet.setFooter('');

    const profile = state.profile || {};
    const promt = [
      'Ты — нутрициолог. Помоги пользователю добрать норму до конца дня.',
      `Цель: ${profile.goal === 'lose' ? 'похудение' : profile.goal === 'gain' ? 'набор массы' : 'поддержание веса'}.`,
      `Дневная норма: ${targets.kcal} ккал, белки ${targets.protein} г, жиры ${targets.fat} г, углеводы ${targets.carb} г.`,
      `Уже съедено: ${Math.round(totals.kcal)} ккал, белки ${Math.round(totals.protein)} г, жиры ${Math.round(totals.fat)} г, углеводы ${Math.round(totals.carb)} г.`,
      `Осталось: ${left.kcal} ккал, белки ${left.protein} г, жиры ${left.fat} г, углеводы ${left.carb} г.`,
      'Предложи ровно 3 простых варианта (продукты или блюда), которые помогут добрать белок и калории.',
      'Для каждого укажи название по-русски, вес порции в граммах и КБЖУ этой порции.',
      'advice — 1–2 коротких предложения по-русски о том, на что обратить внимание.',
    ].join(' ');

    try {
      const result = await callGemini({
        parts: [{ text: promt }],
        schema: HINT_SCHEMA,
        temperature: 0.4,
        maxTokens: 900,
      });
      renderHint(result);
    } catch (err) {
      console.warn(err);
      sheet.setBody(`
        <div class="empty">
          <div class="empty__icon">${icon('info')}</div>
          <div class="empty__title">Не получилось</div>
          <div class="empty__text">${esc(err instanceof AIError ? err.message : 'Ошибка AI')}</div>
        </div>`);
      sheet.setFooter(`
        <div class="btn-row">
          <button class="btn" type="button" data-back>Назад</button>
          <button class="btn btn--primary" type="button" data-retry>Повторить</button>
        </div>`);
      qs('[data-back]', sheet.footer).addEventListener('click', renderPrompt);
      qs('[data-retry]', sheet.footer).addEventListener('click', ask);
    }
  }

  function renderHint(result) {
    const options = normalizeItems(result.options);
    sheet.setTitle('Что добрать', 'Пара идей на остаток дня');
    sheet.setBody(`
      <p class="ai-advice">${esc(result.advice || '')}</p>
      <div class="ai-items">
        ${options.map((item, index) => `
          <div class="ai-item">
            <div class="ai-item__body">
              <div class="ai-item__name">${esc(item.name)}</div>
              <div class="ai-item__meta">${fmt(item.grams)} г · Б ${fmt(item.protein)} · Ж ${fmt(item.fat)} · У ${fmt(item.carb)}</div>
            </div>
            <div class="ai-item__kcal">${fmt(item.kcal)}<span>ккал</span></div>
            <button class="ai-item__add" type="button" data-option="${index}" aria-label="Добавить">${icon('plus')}</button>
          </div>`).join('')}
      </div>
      <p class="tiny muted mt-16">Варианты приблизительные, проверьте порции.</p>
    `);
    sheet.setFooter('<button class="btn btn--block" type="button" data-back>Заново</button>');

    qsa('[data-option]', sheet.body).forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = options[Number(btn.dataset.option)];
        if (!item) return;
        addItemsToDiary(iso, 'snack', [item]);
        toast(`Добавлено: ${item.name}`);
        btn.disabled = true;
        btn.classList.add('ai-item__add--done');
        onDone?.();
      });
    });
    qs('[data-back]', sheet.footer).addEventListener('click', renderPrompt);
  }

  renderPrompt();
  return sheet;
}
