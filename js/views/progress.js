import {
  state, todayISO, addDays, dayTotals, streak, update,
  weekdayShort, parseISO,
} from '../store.js';
import { computeTargets } from '../calc.js';
import { icon, fmt, fmt1, toast, openSheet, qs, segmented } from '../ui.js';

const local = { range: 7 };

function targetsFor() {
  return state.targets || computeTargets(state.profile || {});
}

function percent(value, target) {
  if (!target) return 0;
  return Math.round((value / target) * 100);
}

function kcalChart(dates, values, target) {
  const W = 340;
  const H = 158;
  const padTop = 16;
  const padBottom = 26;
  const plotH = H - padTop - padBottom;
  const maxValue = Math.max(target * 1.3, ...values, 100);
  const n = dates.length;
  const gap = n > 14 ? 3 : 6;
  const barW = (W - 8 - gap * (n - 1)) / n;
  const y = (value) => padTop + plotH - (value / maxValue) * plotH;

  const targetY = y(target);

  const bars = dates.map((iso, i) => {
    const value = values[i];
    const x = 4 + i * (barW + gap);
    const height = Math.max(value > 0 ? 3 : 2, (value / maxValue) * plotH);
    const over = value > target * 1.05;
    const color = value > 0 ? (over ? 'var(--fat)' : 'var(--primary)') : 'var(--surface-3)';
    return `<rect x="${x.toFixed(1)}" y="${(padTop + plotH - height).toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" rx="${Math.min(4, barW / 2).toFixed(1)}" fill="${color}" opacity="${value > 0 ? 1 : 0.9}"/>`;
  }).join('');

  const labelStep = n > 14 ? 5 : 1;
  const labels = dates.map((iso, i) => {
    if (i % labelStep !== 0 && i !== n - 1) return '';
    const x = 4 + i * (barW + gap) + barW / 2;
    const text = n > 14 ? String(parseISO(iso).getDate()) : weekdayShort(iso);
    return `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="chart-label">${text}</text>`;
  }).join('');

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Калории по дням">
      <line x1="4" y1="${padTop + plotH}" x2="${W - 4}" y2="${padTop + plotH}" stroke="var(--line)" stroke-width="1"/>
      ${bars}
      <line x1="4" y1="${targetY.toFixed(1)}" x2="${W - 4}" y2="${targetY.toFixed(1)}" stroke="var(--text)" stroke-width="1.2" stroke-dasharray="3 4" opacity=".5"/>
      <text x="6" y="11" text-anchor="start" class="chart-label chart-label--target">норма ${fmt(target)} ккал</text>
      ${labels}
    </svg>`;
}

function weightChart(points) {
  const W = 340;
  const H = 96;
  const pad = 10;
  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = Math.max(0.5, max - min);
  const x = (i) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = (w) => H - pad - ((w - min) / span) * (H - pad * 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const dots = points.map((p, i) => {
    if (i !== points.length - 1) return '';
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.weight).toFixed(1)}" r="4" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>`;
  }).join('');

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Динамика веса">
      <defs>
        <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--primary)" stop-opacity=".22"/>
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#weight-fill)"/>
      <path d="${line}" fill="none" stroke="var(--primary)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
}

function openWeightSheet() {
  const last = state.days[todayISO()]?.weight || state.profile?.weight || 70;
  const sheet = openSheet({
    title: 'Записать вес',
    subtitle: 'Раз в несколько дней достаточно',
    body: `
      <div class="amount-row">
        <div class="stepper">
          <button class="stepper__btn" type="button" data-minus aria-label="Меньше">−</button>
          <input class="stepper__input" type="number" inputmode="decimal" step="0.1" min="30" max="300" value="${last}" data-weight aria-label="Вес в килограммах" data-autofocus>
          <button class="stepper__btn" type="button" data-plus aria-label="Больше">+</button>
        </div>
      </div>
      <div class="amount-unit">килограммов</div>`,
    footer: '<button class="btn btn--primary btn--block" type="button" data-save>Сохранить</button>',
  });

  const input = qs('[data-weight]', sheet.body);
  const step = (delta) => {
    const value = Math.max(30, Math.min(300, (Number(input.value) || 0) + delta));
    input.value = String(Math.round(value * 10) / 10);
  };
  qs('[data-minus]', sheet.body).addEventListener('click', () => step(-0.1));
  qs('[data-plus]', sheet.body).addEventListener('click', () => step(0.1));

  qs('[data-save]', sheet.footer).addEventListener('click', () => {
    const value = Number(input.value);
    if (!(value >= 30 && value <= 300)) return toast('Проверьте вес');
    const weight = Math.round(value * 10) / 10;
    update((s) => {
      s.days[todayISO()] = s.days[todayISO()] || { meals: {} };
      s.days[todayISO()].weight = weight;
      if (s.profile) {
        s.profile.weight = weight;
        if (!s.targets || !s.targets.manual) s.targets = { ...computeTargets(s.profile), manual: false };
      }
    });
    sheet.close();
    toast('Вес сохранён');
  });
}

export function header() {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.style.gap = '10px';
  wrap.innerHTML = `
    <span class="grow">
      <span class="topbar__title" style="display:block">Прогресс</span>
      <span class="topbar__sub">как идут дела</span>
    </span>
    <button class="topbar__action" type="button" data-weight>${icon('scale')} Вес</button>`;
  wrap.querySelector('[data-weight]').addEventListener('click', openWeightSheet);
  return wrap;
}

export function render(root) {
  const target = targetsFor();
  const today = todayISO();
  const dates = [];
  for (let i = local.range - 1; i >= 0; i -= 1) dates.push(addDays(today, -i));

  const totals = dates.map((iso) => dayTotals(iso));
  const values = totals.map((t) => t.kcal);
  const logged = totals.filter((t) => t.kcal > 0);
  const avgKcal = logged.length ? logged.reduce((sum, t) => sum + t.kcal, 0) / logged.length : 0;
  const avgProtein = logged.length ? logged.reduce((sum, t) => sum + t.protein, 0) / logged.length : 0;
  const avgFat = logged.length ? logged.reduce((sum, t) => sum + t.fat, 0) / logged.length : 0;
  const avgCarb = logged.length ? logged.reduce((sum, t) => sum + t.carb, 0) / logged.length : 0;

  const weights = Object.keys(state.days)
    .filter((iso) => state.days[iso] && state.days[iso].weight)
    .sort()
    .map((iso) => ({ iso, weight: state.days[iso].weight }));
  const weightPoints = weights.slice(-30);
  const firstWeight = weightPoints[0];
  const lastWeight = weightPoints[weightPoints.length - 1];
  const delta = firstWeight && lastWeight ? lastWeight.weight - firstWeight.weight : 0;

  const hasData = logged.length > 0 || weights.length > 0;

  root.innerHTML = `
    <div class="card">
      <div class="card__head">
        <span class="card__title">Калории</span>
        <span class="card__aside">${avgKcal ? `в среднем ${fmt(Math.round(avgKcal))} ккал` : 'нет данных'}</span>
      </div>
      <div data-range class="mb-8"></div>
      <div class="bars-wrap" data-chart>${kcalChart(dates, values, target.kcal)}</div>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <div class="stat__value">${avgKcal ? fmt(Math.round(avgKcal)) : '—'}${avgKcal ? ' <small>ккал</small>' : ''}</div>
        <div class="stat__label">среднее за ${logged.length || 0} ${plural(logged.length, 'день', 'дня', 'дней')} с записями</div>
      </div>
      <div class="stat">
        <div class="stat__value">${streak()} <small>${plural(streak(), 'день', 'дня', 'дней')}</small></div>
        <div class="stat__label">серия без пропусков</div>
      </div>
      <div class="stat">
        <div class="stat__value">${logged.length ? Math.round(avgProtein) : '—'}${logged.length ? ' <small>г</small>' : ''}</div>
        <div class="stat__label">белка в среднем · норма ${target.protein} г</div>
      </div>
      <div class="stat">
        <div class="stat__value">${logged.length ? `${percent(avgProtein, target.protein)}%` : '—'}</div>
        <div class="stat__label">выполнение нормы белка</div>
      </div>
    </div>

    <section class="card">
      <div class="card__head">
        <span class="card__title">Вес</span>
        <span class="card__aside">${lastWeight ? `${fmt1(lastWeight.weight)} кг` : 'не записан'}</span>
      </div>
      ${weightPoints.length
        ? `${weightPoints.length > 1 ? weightChart(weightPoints) : ''}
           <div class="row" style="justify-content:space-between;margin-top:6px">
             <span class="tiny muted">${firstWeight ? `с ${fmtDateShort(firstWeight.iso)}` : ''}</span>
             <span class="badge ${delta > 0 ? 'badge--warn' : ''}">${delta === 0 ? 'без изменений' : `${delta > 0 ? '+' : '−'}${fmt1(Math.abs(delta))} кг`}</span>
           </div>`
        : `<p class="small muted" style="line-height:1.5">Записывайте вес раз в несколько дней — покажем динамику и посчитаем норму точнее.</p>`}
      <button class="btn btn--block mt-16" type="button" data-add-weight>${icon('scale')} Записать вес</button>
    </section>

    <section class="card">
      <div class="card__head">
        <span class="card__title">Средние БЖУ</span>
        <span class="card__aside">${logged.length ? `за ${logged.length} ${plural(logged.length, 'день', 'дня', 'дней')}` : '—'}</span>
      </div>
      <div class="macros">
        ${macroStat('Белки', avgProtein, target.protein, 'protein')}
        ${macroStat('Жиры', avgFat, target.fat, 'fat')}
        ${macroStat('Углеводы', avgCarb, target.carb, 'carb')}
      </div>
    </section>

    ${!hasData ? `
      <div class="empty">
        <div class="empty__icon">${icon('progress')}</div>
        <div class="empty__title">Пока нечего показывать</div>
        <div class="empty__text">Запишите пару приёмов пищи — здесь появится статистика.</div>
      </div>` : ''}
    <p class="tiny muted center mt-16">Средние считаются по дням, где есть записи</p>
  `;

  const rangeNode = qs('[data-range]', root);
  rangeNode.appendChild(segmented(
    [{ id: 7, name: '7 дней' }, { id: 30, name: '30 дней' }],
    local.range,
    (value) => {
      local.range = value;
      render(root);
    },
    { name: 'Период' },
  ));

  root.querySelector('[data-add-weight]').addEventListener('click', openWeightSheet);
}

function macroStat(name, value, target, cls) {
  const pct = percent(value, target);
  return `
    <div class="macro macro--${cls}">
      <div class="macro__top">
        <span class="macro__name">${name}</span>
        <span class="macro__nums"><b>${Math.round(value)}</b> / ${Math.round(target)} г</span>
      </div>
      <div class="macro__bar"><div class="macro__fill" style="width:${Math.min(100, pct)}%"></div></div>
    </div>`;
}

function fmtDateShort(iso) {
  const d = parseISO(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function plural(n, one, few, many) {
  const value = Math.abs(n) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}
