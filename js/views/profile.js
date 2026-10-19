import {
  state, update, replaceState, resetState, ACTIVITY, todayISO, exportPayload,
} from '../store.js';
import { computeTargets, bmi, bmiLabel } from '../calc.js';
import { icon, esc, fmt, fmt1, toast, openSheet, confirmAction, qs, qsa, segmented } from '../ui.js';
import { applyTheme } from '../theme.js';
import { canInstall, promptInstall, isStandalone, openInstallHelp } from '../pwa.js';
import { APP_VERSION, REPO_URL } from '../config.js';
import { openAISettings, hasKey } from '../ai.js';

const GOALS = [
  { id: 'lose', name: 'Похудеть' },
  { id: 'maintain', name: 'Держать' },
  { id: 'gain', name: 'Набрать' },
];

function targetsFor() {
  return state.targets || computeTargets(state.profile || {});
}

function targetRow(label, value, unit = 'г') {
  return `<div class="row" style="justify-content:space-between;padding:7px 0">
    <span class="small muted">${label}</span>
    <span class="small nums"><b>${fmt(value)}</b> ${unit}</span>
  </div>`;
}

export function header() {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.style.gap = '10px';
  wrap.innerHTML = `
    <span class="grow">
      <span class="topbar__title" style="display:block">Профиль</span>
      <span class="topbar__sub">параметры и настройки</span>
    </span>`;
  return wrap;
}

export function render(root) {
  const p = state.profile;
  const t = targetsFor();
  const bmiValue = bmi(p);
  const name = p.name ? p.name : 'Без имени';
  const goalName = { lose: 'похудение', maintain: 'поддержание', gain: 'набор' }[p.goal] || 'поддержание';

  root.innerHTML = `
    <section class="card">
      <div class="row" style="gap:14px">
        <div class="avatar">${esc(name.slice(0, 1).toUpperCase())}</div>
        <div class="grow">
          <div style="font-size:18px;font-weight:700;letter-spacing:-.01em">${esc(name)}</div>
          <div class="small muted">${p.age} лет · ${p.height} см · ${fmt1(p.weight)} кг</div>
        </div>
        <span class="badge">${esc(goalName)}</span>
      </div>
      <div class="divider"></div>
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="stat__value">${fmt(t.kcal)} <small>ккал</small></div>
          <div class="stat__label">норма в день</div>
        </div>
        <div class="center">
          <div class="stat__value" style="font-size:17px">${bmiValue ? fmt1(bmiValue) : '—'}</div>
          <div class="stat__label">ИМТ · ${bmiLabel(bmiValue)}</div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card__head"><span class="card__title">Параметры</span></div>
      <label class="field">
        <span class="field__label">Имя</span>
        <input class="input" data-name value="${esc(p.name || '')}" placeholder="Как к вам обращаться" autocomplete="off">
      </label>
      <div class="field">
        <span class="field__label">Пол</span>
        <div class="segmented" data-sex>
          <button class="segmented__btn ${p.sex === 'female' ? 'segmented__btn--active' : ''}" type="button" data-value="female">Женский</button>
          <button class="segmented__btn ${p.sex === 'male' ? 'segmented__btn--active' : ''}" type="button" data-value="male">Мужской</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="field"><span class="field__label">Возраст</span><input class="input" type="number" inputmode="numeric" data-age value="${p.age}"></label>
        <label class="field"><span class="field__label">Рост, см</span><input class="input" type="number" inputmode="numeric" data-height value="${p.height}"></label>
      </div>
      <label class="field"><span class="field__label">Вес, кг</span><input class="input" type="number" inputmode="decimal" step="0.1" data-weight value="${p.weight}"></label>
      <label class="field">
        <span class="field__label">Активность</span>
        <select class="select" data-activity>
          ${ACTIVITY.map((a) => `<option value="${a.id}" ${Number(p.activity) === a.id ? 'selected' : ''}>${a.name} — ${a.hint}</option>`).join('')}
        </select>
      </label>
      <div class="field">
        <span class="field__label">Цель</span>
        <div class="segmented" data-goal>
          ${GOALS.map((g) => `<button class="segmented__btn ${p.goal === g.id ? 'segmented__btn--active' : ''}" type="button" data-value="${g.id}">${g.name}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="field__label">Темп</span>
        <div class="chips" data-rate>
          ${[0.25, 0.5, 0.75].map((r) => `<button class="chip ${Number(p.rate) === r ? 'chip--active' : ''}" type="button" data-value="${r}">${String(r).replace('.', ',')} кг/нед</button>`).join('')}
        </div>
        <span class="field__hint">Не влияет на цель «держать вес».</span>
      </div>
      <button class="btn btn--primary btn--block mt-8" type="button" data-save>Сохранить изменения</button>
    </section>

    <section class="card">
      <div class="card__head">
        <span class="card__title">Норма и БЖУ</span>
        <span class="card__aside">${state.targets && state.targets.manual ? 'задано вручную' : 'рассчитано'}</span>
      </div>
      ${targetRow('Калории', t.kcal, 'ккал')}
      ${targetRow('Белки', t.protein)}
      ${targetRow('Жиры', t.fat)}
      ${targetRow('Углеводы', t.carb)}
      <div class="btn-row mt-16">
        <button class="btn btn--sm" type="button" data-edit-targets>Изменить вручную</button>
        ${state.targets && state.targets.manual ? '<button class="btn btn--sm btn--ghost" type="button" data-auto-targets>Вернуть расчёт</button>' : ''}
      </div>
    </section>

    <section class="card">
      <div class="card__head">
        <span class="card__title">AI-помощник</span>
        <span class="card__aside">${hasKey() ? 'ключ добавлен' : 'не подключён'}</span>
      </div>
      <p class="small muted" style="line-height:1.5">Оценка блюда по фото или описанию и подсказки по БЖУ. Работает на вашем ключе Google Gemini — он хранится только на этом устройстве.</p>
      <button class="btn btn--block mt-16" type="button" data-ai>${icon('sparkles')} ${hasKey() ? 'Настроить ключ' : 'Добавить ключ'}</button>
    </section>

    <section class="card">
      <div class="card__head"><span class="card__title">Оформление</span></div>
      <div data-theme></div>
    </section>

    <section class="card">
      <div class="card__head"><span class="card__title">Данные</span></div>
      <button class="list-row" type="button" data-export>
        <span class="list-row__icon">${icon('download')}</span>
        <span class="list-row__body">
          <span class="list-row__title">Экспорт в файл</span>
          <span class="list-row__sub">резервная копия JSON</span>
        </span>
      </button>
      <button class="list-row" type="button" data-import>
        <span class="list-row__icon">${icon('upload')}</span>
        <span class="list-row__body">
          <span class="list-row__title">Импорт из файла</span>
          <span class="list-row__sub">заменит текущие данные</span>
        </span>
      </button>
      <button class="list-row" type="button" data-reset>
        <span class="list-row__icon" style="color:var(--danger)">${icon('trash')}</span>
        <span class="list-row__body">
          <span class="list-row__title" style="color:var(--danger)">Удалить все данные</span>
          <span class="list-row__sub">профиль, дневник и продукты</span>
        </span>
      </button>
      <input type="file" accept="application/json,.json" data-file hidden>
    </section>

    <section class="card">
      <div class="card__head"><span class="card__title">Приложение</span></div>
      <button class="list-row" type="button" data-install>
        <span class="list-row__icon">${icon('install')}</span>
        <span class="list-row__body">
          <span class="list-row__title">${isStandalone() ? 'Установлено на устройство' : 'Установить на телефон'}</span>
          <span class="list-row__sub">${isStandalone() ? 'открывается с домашнего экрана' : 'ярлык на домашнем экране, работа офлайн'}</span>
        </span>
        <span class="list-row__value">${isStandalone() ? '✓' : '→'}</span>
      </button>
      <a class="list-row" href="${REPO_URL}" target="_blank" rel="noopener">
        <span class="list-row__icon">${icon('info')}</span>
        <span class="list-row__body">
          <span class="list-row__title">Исходный код</span>
          <span class="list-row__sub">github.com/abaginskii/norm-calories</span>
        </span>
        <span class="list-row__value">↗</span>
      </a>
      <div class="row" style="justify-content:space-between;padding-top:10px">
        <span class="tiny muted">Версия ${APP_VERSION}</span>
        <span class="tiny muted">данные не покидают устройство</span>
      </div>
    </section>

    <p class="tiny muted center">«Норма» — помощник, а не медицинская рекомендация. При заболеваниях сверьтесь с врачом.</p>
  `;

  // Пол
  root.querySelectorAll('[data-sex] [data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-sex] [data-value]').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
    });
  });

  // Цель
  root.querySelectorAll('[data-goal] [data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-goal] [data-value]').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
    });
  });

  // Темп
  root.querySelectorAll('[data-rate] [data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-rate] [data-value]').forEach((b) => b.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
  });

  root.querySelector('[data-save]').addEventListener('click', () => {
    const sexBtn = root.querySelector('[data-sex] .segmented__btn--active');
    const goalBtn = root.querySelector('[data-goal] .segmented__btn--active');
    const rateBtn = root.querySelector('[data-rate] .chip--active');
    const age = Math.round(Number(qs('[data-age]', root).value));
    const height = Math.round(Number(qs('[data-height]', root).value));
    const weight = Math.round(Number(qs('[data-weight]', root).value) * 10) / 10;

    if (!(age >= 14 && age <= 100)) return toast('Возраст — от 14 до 100 лет');
    if (!(height >= 120 && height <= 230)) return toast('Рост — от 120 до 230 см');
    if (!(weight >= 35 && weight <= 250)) return toast('Вес — от 35 до 250 кг');

    const profile = {
      ...p,
      name: qs('[data-name]', root).value.trim(),
      sex: sexBtn ? sexBtn.dataset.value : p.sex,
      goal: goalBtn ? goalBtn.dataset.value : p.goal,
      rate: rateBtn ? Number(rateBtn.dataset.value) : Number(p.rate) || 0.5,
      activity: Number(qs('[data-activity]', root).value),
      age,
      height,
      weight,
    };

    update((s) => {
      s.profile = profile;
      if (!s.targets || !s.targets.manual) s.targets = { ...computeTargets(profile), manual: false };
      s.days[todayISO()] = s.days[todayISO()] || { meals: {} };
      s.days[todayISO()].weight = weight;
    });
    toast('Сохранено');
  });

  // Ручные цели
  root.querySelector('[data-edit-targets]').addEventListener('click', () => {
    const sheet = openSheet({
      title: 'Свои цели',
      subtitle: 'Значения в граммах, калории в ккал',
      body: `
        <label class="field"><span class="field__label">Калории</span><input class="input" type="number" inputmode="numeric" data-t-kcal value="${t.kcal}"></label>
        <div class="form-grid">
          <label class="field"><span class="field__label">Белки, г</span><input class="input" type="number" inputmode="numeric" data-t-protein value="${t.protein}"></label>
          <label class="field"><span class="field__label">Жиры, г</span><input class="input" type="number" inputmode="numeric" data-t-fat value="${t.fat}"></label>
        </div>
        <label class="field"><span class="field__label">Углеводы, г</span><input class="input" type="number" inputmode="numeric" data-t-carb value="${t.carb}"></label>
        <p class="field__hint">Ручные цели не пересчитываются при изменении веса.</p>`,
      footer: '<button class="btn btn--primary btn--block" type="button" data-save-targets>Сохранить цели</button>',
    });

    qs('[data-save-targets]', sheet.footer).addEventListener('click', () => {
      const kcal = Math.round(Number(qs('[data-t-kcal]', sheet.body).value));
      if (!(kcal >= 800 && kcal <= 6000)) return toast('Калории — от 800 до 6000');
      update((s) => {
        s.targets = {
          kcal,
          protein: Math.max(0, Math.round(Number(qs('[data-t-protein]', sheet.body).value) || 0)),
          fat: Math.max(0, Math.round(Number(qs('[data-t-fat]', sheet.body).value) || 0)),
          carb: Math.max(0, Math.round(Number(qs('[data-t-carb]', sheet.body).value) || 0)),
          manual: true,
        };
      });
      sheet.close();
      toast('Цели обновлены');
    });
  });

  const autoBtn = root.querySelector('[data-auto-targets]');
  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      update((s) => { s.targets = { ...computeTargets(s.profile), manual: false }; });
      toast('Норма пересчитана');
    });
  }

  // Тема
  const themeNode = root.querySelector('[data-theme]');
  themeNode.appendChild(segmented(
    [{ id: 'auto', name: 'Как в системе' }, { id: 'light', name: 'Светлая' }, { id: 'dark', name: 'Тёмная' }],
    state.settings.theme || 'auto',
    (value) => {
      update((s) => { s.settings.theme = value; });
      applyTheme();
      toast('Тема обновлена');
    },
    { name: 'Тема оформления' },
  ));

  // AI
  root.querySelector('[data-ai]').addEventListener('click', () => {
    openAISettings();
  });

  // Экспорт
  root.querySelector('[data-export]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `norm-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Резервная копия сохранена');
  });

  // Импорт
  const fileInput = root.querySelector('[data-file]');
  root.querySelector('[data-import]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.days) throw new Error('bad file');
      const ok = await confirmAction({
        title: 'Импортировать данные?',
        text: 'Текущий профиль и записи дневника будут заменены содержимым файла.',
        confirmText: 'Импортировать',
        danger: false,
      });
      if (!ok) return;
      replaceState(data);
      toast('Данные импортированы');
    } catch (err) {
      console.warn(err);
      toast('Не удалось прочитать файл');
    } finally {
      fileInput.value = '';
    }
  });

  // Сброс
  root.querySelector('[data-reset]').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Удалить все данные?',
      text: 'Профиль, дневник, вес и свои продукты будут удалены с этого устройства. Отменить это будет нельзя.',
      confirmText: 'Удалить всё',
    });
    if (!ok) return;
    resetState();
    location.hash = '#/diary';
    toast('Данные удалены');
  });

  // Установка
  root.querySelector('[data-install]').addEventListener('click', async () => {
    if (isStandalone()) return toast('Приложение уже установлено');
    if (canInstall()) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') toast('Устанавливаем…');
      else toast('Установка отменена');
      return;
    }
    openInstallHelp();
  });
}
