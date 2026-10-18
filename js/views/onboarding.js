import { update, state } from '../store.js';
import { computeTargets } from '../calc.js';
import { FOODS } from '../foods.js';
import { icon, fmt, toast, qs } from '../ui.js';

let step = 0;
let draft = null;

const PRODUCT_COUNT = FOODS.length;

function defaults() {
  return {
    name: '',
    sex: 'female',
    age: 30,
    height: 168,
    weight: 65,
    activity: 1.375,
    goal: 'lose',
    rate: 0.5,
    targetWeight: null,
  };
}

function makeDraft() {
  const p = state.profile || {};
  return {
    ...defaults(),
    sex: p.sex || 'female',
    name: p.name || '',
    age: p.age || 30,
    height: p.height || 168,
    weight: p.weight || 65,
    activity: p.activity || 1.375,
    goal: p.goal || 'lose',
    rate: p.rate || 0.5,
  };
}

const GOALS = [
  { id: 'lose', name: 'Похудеть', emoji: '↘' },
  { id: 'maintain', name: 'Держать вес', emoji: '→' },
  { id: 'gain', name: 'Набрать', emoji: '↗' },
];

const ACTIVITIES = [
  { value: 1.2, label: 'Сидячий образ жизни, мало движения' },
  { value: 1.375, label: '1–2 тренировки в неделю' },
  { value: 1.55, label: '3–4 тренировки в неделю' },
  { value: 1.725, label: '5–6 тренировок в неделю' },
  { value: 1.9, label: 'Физическая работа или спорт каждый день' },
];

function shell(container, { content, footer, showBack }) {
  const dots = [0, 1, 2, 3].map((i) => `<span class="onb__dot ${i <= step ? 'onb__dot--on' : ''}"></span>`).join('');

  container.innerHTML = `
    <div class="onb">
      <div class="onb__top">
        <div class="onb__brand">
          <span class="onb__logo">${icon('leaf')}</span>
          Норма
        </div>
        <div class="onb__dots" aria-label="Шаг ${step + 1} из 4">${dots}</div>
      </div>
      <div class="onb__step">${content}</div>
      <div class="onb__foot">
        ${footer}
        ${showBack ? '<button class="btn btn--ghost btn--block mt-8" data-back type="button">Назад</button>' : ''}
      </div>
    </div>`;

  const back = qs('[data-back]', container);
  if (back) {
    back.addEventListener('click', () => {
      step = Math.max(0, step - 1);
      paint(container);
    });
  }
}

function stepIntro(container) {
  shell(container, {
    showBack: false,
    content: `
      <div class="hero-ring">
        <div class="ring" style="width:180px;height:180px">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="onb-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#4ade80"/>
                <stop offset="100%" stop-color="#0f9d58"/>
              </linearGradient>
            </defs>
            <circle class="ring__track" cx="60" cy="60" r="50"/>
            <circle cx="60" cy="60" r="50" pathLength="100" fill="none" stroke="url(#onb-grad)"
                    stroke-width="11" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="22"/>
          </svg>
          <div class="ring__center">
            <div class="ring__num">1 800<small> ккал</small></div>
            <div class="ring__caption">ваша норма на день</div>
          </div>
        </div>
      </div>
      <h1>Калории под контролем</h1>
      <p class="onb__lead">Посчитаем вашу норму калорий и БЖУ, а дневник покажет, сколько вы уже съели и сколько осталось.</p>
      <div class="card card--flat" style="padding:14px">
        <div class="list-row" style="cursor:default">
          <div class="list-row__icon">${icon('flame')}</div>
          <div class="list-row__body">
            <div class="list-row__title">Норма по формуле</div>
            <div class="list-row__sub">с учётом пола, возраста, веса и активности</div>
          </div>
        </div>
        <div class="list-row" style="cursor:default">
          <div class="list-row__icon">${icon('products')}</div>
          <div class="list-row__body">
            <div class="list-row__title">${PRODUCT_COUNT} продуктов</div>
            <div class="list-row__sub">в базе на 100 г, плюс свои продукты</div>
          </div>
        </div>
        <div class="list-row" style="cursor:default">
          <div class="list-row__icon">${icon('download')}</div>
          <div class="list-row__body">
            <div class="list-row__title">Работает офлайн</div>
            <div class="list-row__sub">данные хранятся только на вашем телефоне</div>
          </div>
        </div>
      </div>`,
    footer: '<button class="btn btn--primary btn--block" data-next type="button">Начать</button>',
  });

  qs('[data-next]', container).addEventListener('click', () => {
    step = 1;
    paint(container);
  });
}

function stepBody(container) {
  const p = draft;
  shell(container, {
    showBack: true,
    content: `
      <h1>Пара слов о вас</h1>
      <p class="onb__lead">Нужны для расчёта базового обмена веществ.</p>
      <div class="field">
        <span class="field__label">Пол</span>
        <div class="segmented" data-sex>
          <button class="segmented__btn ${p.sex === 'female' ? 'segmented__btn--active' : ''}" data-value="female" type="button">Женский</button>
          <button class="segmented__btn ${p.sex === 'male' ? 'segmented__btn--active' : ''}" data-value="male" type="button">Мужской</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Возраст, лет</span>
          <input class="input" type="number" inputmode="numeric" min="14" max="100" step="1" value="${p.age}" data-field="age">
        </label>
        <label class="field">
          <span class="field__label">Рост, см</span>
          <input class="input" type="number" inputmode="numeric" min="120" max="230" step="1" value="${p.height}" data-field="height">
        </label>
      </div>
      <label class="field">
        <span class="field__label">Вес, кг</span>
        <input class="input" type="number" inputmode="decimal" min="35" max="250" step="0.1" value="${p.weight}" data-field="weight">
        <span class="field__hint">Можно обновлять вес в профиле — норма пересчитается.</span>
      </label>`,
    footer: '<button class="btn btn--primary btn--block" data-next type="button">Дальше</button>',
  });

  container.querySelectorAll('[data-sex] [data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.sex = btn.dataset.value;
      container.querySelectorAll('[data-sex] .segmented__btn').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
    });
  });

  container.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      draft[input.dataset.field] = Number(input.value);
    });
  });

  qs('[data-next]', container).addEventListener('click', () => {
    if (!(draft.age >= 14 && draft.age <= 100)) return toast('Укажите возраст от 14 до 100 лет');
    if (!(draft.height >= 120 && draft.height <= 230)) return toast('Укажите рост от 120 до 230 см');
    if (!(draft.weight >= 35 && draft.weight <= 250)) return toast('Укажите вес от 35 до 250 кг');
    step = 2;
    paint(container);
  });
}

function stepGoal(container) {
  const p = draft;
  const showRate = p.goal !== 'maintain';

  shell(container, {
    showBack: true,
    content: `
      <h1>Какая цель?</h1>
      <p class="onb__lead">От цели зависит дефицит или профицит калорий.</p>
      <div class="field">
        <div class="segmented" data-goal>
          ${GOALS.map((g) => `<button class="segmented__btn ${p.goal === g.id ? 'segmented__btn--active' : ''}" data-value="${g.id}" type="button">${g.name}</button>`).join('')}
        </div>
      </div>
      ${showRate ? `
      <div class="field">
        <span class="field__label">Темп</span>
        <div class="chips" data-rate>
          ${[0.25, 0.5, 0.75].map((r) => `
            <button class="chip ${p.rate === r ? 'chip--active' : ''}" data-value="${r}" type="button">
              ${String(r).replace('.', ',')} кг в неделю
            </button>`).join('')}
        </div>
        <span class="field__hint">Безопасный темп — примерно 0,5 кг в неделю.</span>
      </div>` : ''}
      <label class="field">
        <span class="field__label">Активность</span>
        <select class="select" data-activity>
          ${ACTIVITIES.map((a) => `<option value="${a.value}" ${Number(p.activity) === a.value ? 'selected' : ''}>${a.label}</option>`).join('')}
        </select>
      </label>`,
    footer: '<button class="btn btn--primary btn--block" data-next type="button">Рассчитать норму</button>',
  });

  container.querySelectorAll('[data-goal] [data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.goal = btn.dataset.value;
      paint(container);
    });
  });

  container.querySelectorAll('[data-rate] [data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.rate = Number(btn.dataset.value);
      paint(container);
    });
  });

  const activity = qs('[data-activity]', container);
  activity.addEventListener('change', () => { draft.activity = Number(activity.value); });

  qs('[data-next]', container).addEventListener('click', () => {
    step = 3;
    paint(container);
  });
}

function stepResult(container) {
  const targets = computeTargets(draft);
  const goalLabel = { lose: 'похудение', maintain: 'поддержание веса', gain: 'набор массы' }[draft.goal];

  shell(container, {
    showBack: true,
    content: `
      <h1>Ваша норма</h1>
      <p class="onb__lead">${fmt(targets.kcal)} ккал в день — ${goalLabel}. Всё можно изменить позже в профиле.</p>
      <div class="card" style="padding:20px 16px">
        <div class="ring-card" style="padding:0">
          <div class="ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs>
                <linearGradient id="res-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#4ade80"/>
                  <stop offset="100%" stop-color="#0f9d58"/>
                </linearGradient>
              </defs>
              <circle class="ring__track" cx="60" cy="60" r="50"/>
              <circle cx="60" cy="60" r="50" pathLength="100" fill="none" stroke="url(#res-grad)"
                      stroke-width="11" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="0"/>
            </svg>
            <div class="ring__center">
              <div class="ring__num">${fmt(targets.kcal)}</div>
              <div class="ring__caption">ккал в день</div>
            </div>
          </div>
          <div class="macros">
            ${macroRow('Белки', targets.protein, '#3b7cf6')}
            ${macroRow('Жиры', targets.fat, '#e39a0b')}
            ${macroRow('Углеводы', targets.carb, '#8b5cf6')}
          </div>
        </div>
      </div>
      <p class="tiny muted center">Расчёт по формуле Миффлина — Сан Жеора. Это ориентир, а не медицинская рекомендация.</p>`,
    footer: '<button class="btn btn--primary btn--block" data-next type="button">Открыть дневник</button>',
  });

  qs('[data-next]', container).addEventListener('click', () => {
    const profile = {
      ...draft,
      age: Math.round(draft.age),
      height: Math.round(draft.height),
      weight: Math.round(draft.weight * 10) / 10,
      createdAt: new Date().toISOString(),
    };
    const targets = computeTargets(profile);
    location.hash = '#/diary';
    update((s) => {
      s.profile = profile;
      s.targets = { ...targets, manual: false };
    });
    draft = null;
  });
}

function macroRow(name, grams, color) {
  return `
    <div class="macro">
      <div class="macro__top">
        <span class="macro__name">${name}</span>
        <span class="macro__nums"><b>${grams}</b> г</span>
      </div>
      <div class="macro__bar"><div class="macro__fill" style="width:100%;background:${color}"></div></div>
    </div>`;
}

function paint(container) {
  if (!draft) draft = makeDraft();
  window.scrollTo(0, 0);
  container.classList.add('view--onb');
  const steps = [stepIntro, stepBody, stepGoal, stepResult];
  steps[Math.min(step, steps.length - 1)](container);
}

export function render(container) {
  if (!draft) {
    draft = makeDraft();
    step = 0;
  }
  paint(container);
}
