import { state, todayISO, addDays, dayTotals, parseISO, isoDate } from '../store.js';
import { computeTargets } from '../calc.js';
import { icon, fmt, fmt1, qs } from '../ui.js';

let period = '1w';
let selected = null;
const PERIODS = [['1d', '1 день'], ['1w', 'Неделя'], ['1m', 'Месяц'], ['1y', 'Год'], ['all', 'Всё']];
const month = (d) => new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(d);

function points() {
  const now = todayISO();
  if (period === '1d') return [{ id: now, label: 'Сегодня', dates: [now] }];
  if (period === '1w' || period === '1m') {
    const n = period === '1w' ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const id = addDays(now, i - n + 1);
      const d = parseISO(id);
      return { id, label: period === '1w' ? new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(d) : String(d.getDate()), dates: [id] };
    });
  }
  const allDates = Object.keys(state.days).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const start = period === '1y' ? addDays(now, -365) : (allDates[0] || now);
  const startDate = parseISO(start);
  const current = parseISO(now);
  const span = (current.getFullYear() - startDate.getFullYear()) * 12 + current.getMonth() - startDate.getMonth();
  const byYear = period === 'all' && span > 18;
  const output = [];
  if (byYear) {
    for (let y = startDate.getFullYear(); y <= current.getFullYear(); y++) output.push({ id: String(y), label: String(y), dates: allDates.filter((d) => d.startsWith(String(y))) });
  } else {
    const count = period === '1y' ? 12 : Math.max(1, span + 1);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      const key = isoDate(d).slice(0, 7);
      output.push({ id: key, label: month(d), dates: allDates.filter((date) => date.startsWith(key)) });
    }
  }
  return output;
}

function aggregate(point) {
  return point.dates.reduce((sum, iso) => {
    const d = dayTotals(iso);
    for (const key of ['kcal', 'protein', 'carb', 'fat', 'fiber']) sum[key] += d[key] || 0;
    sum.fiberKnown ||= d.fiberKnown;
    return sum;
  }, { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0, fiberKnown: false });
}

function score(iso) {
  const t = dayTotals(iso);
  if (!t.kcal) return null;
  const target = state.targets || computeTargets(state.profile || {});
  const ratios = [
    Math.abs(t.kcal - target.kcal) / Math.max(1, target.kcal),
    Math.abs(t.protein - target.protein) / Math.max(1, target.protein),
    Math.abs(t.carb - target.carb) / Math.max(1, target.carb),
    Math.abs(t.fat - target.fat) / Math.max(1, target.fat),
  ];
  let value = Math.max(0, 100 - ratios.reduce((a, b) => a + Math.min(b, 2), 0) * 20);
  if (t.fiberKnown) value = value * .9 + Math.min(1, t.fiber / 25) * 10;
  return Math.round(value * 10) / 10;
}

export function header() { return null; }
export function render(root) {
  const all = points().map((point) => ({ ...point, total: aggregate(point) }));
  const max = Math.max(100, ...all.map((p) => p.total.kcal));
  const chart = all.map((p, i) => {
    const total = p.total;
    const macroKcal = total.protein * 4 + total.carb * 4 + total.fat * 9;
    const scale = macroKcal > 0 ? Math.min(1, total.kcal / macroKcal) : 0;
    const h = Math.min(100, Math.max(total.kcal ? 2 : 0, total.kcal / max * 100));
    const portions = macroKcal ? [total.protein * 4, total.carb * 4, total.fat * 9].map((v) => v / macroKcal * 100) : [0, 0, 0];
    return `<button class="nutri-column ${selected === p.id ? 'nutri-column--selected' : ''}" type="button" data-point="${p.id}" aria-label="${p.label}: ${fmt(Math.round(total.kcal))} ккал">
      <span class="nutri-bar-track"><span class="nutri-bar" style="height:${h}%"><i style="height:${portions[2]}%"></i><b style="height:${portions[1]}%"></b><em style="height:${portions[0]}%"></em></span></span>
      <small>${p.label}</small></button>`;
  }).join('');
  const active = all.find((p) => p.id === selected) || all.at(-1);
  const currentScore = score(todayISO());
  const previous = score(addDays(todayISO(), -7));
  const trend = currentScore != null && previous != null ? currentScore - previous : null;
  root.innerHTML = `<div class="norm-nutrition">
    <header class="norm-header"><button class="norm-icon-button" type="button" data-back aria-label="Назад">${icon('chevronLeft')}</button><span class="norm-header-actions"><button class="norm-icon-button" type="button" data-profile aria-label="Настройки">${icon('settings')}</button></span></header>
    <section class="nutri-score"><span class="nutri-score-icon">${icon('leaf')}</span><div class="nutri-score-number">${currentScore == null ? '—' : fmt1(currentScore)}</div><h1>Индекс питания</h1><p>${currentScore == null ? 'Добавьте первый приём пищи' : trend == null ? 'На основе записей за сегодня' : `${trend >= 0 ? '▲ +' : '▼ '}${fmt1(trend)} за неделю`}</p></section>
    <div class="nutri-period" role="tablist" aria-label="Период">${PERIODS.map(([id, label]) => `<button role="tab" aria-selected="${period === id}" class="${period === id ? 'is-active' : ''}" type="button" data-period="${id}">${label}</button>`).join('')}</div>
    <section class="nutri-card"><div class="nutri-card-head"><h2>Нутриенты</h2><span>ккал</span></div>
      <div class="nutri-chart"><div class="nutri-grid"><span>${fmt(Math.round(max))}</span><span>${fmt(Math.round(max / 2))}</span><span>0</span></div><div class="nutri-columns">${chart}</div></div>
      <div class="nutri-legend"><span><i class="protein"></i>Белки</span><span><i class="carb"></i>Углеводы</span><span><i class="fat"></i>Жиры</span></div>
      ${active ? `<div class="nutri-tooltip"><b>${active.label} · ${fmt(Math.round(active.total.kcal))} ккал</b><span>Б ${fmt1(active.total.protein)} г · У ${fmt1(active.total.carb)} г · Ж ${fmt1(active.total.fat)} г</span></div>` : ''}
    </section>
    <section class="nutri-card nutri-fiber"><div><h2>Клетчатка сегодня</h2><strong>${dayTotals(todayISO()).fiberKnown ? `${fmt1(dayTotals(todayISO()).fiber)} г` : 'Нет данных'}</strong><p>Показывается, когда в продукте указана клетчатка.</p></div>${icon('leaf')}</section>
    <p class="nutri-footnote">Индекс — ориентир по калориям и БЖУ относительно вашей цели, а не медицинская оценка. Сегменты графика отражают долю энергии из БЖУ.</p>
    <button class="nutri-log" type="button" data-log>+ Добавить еду</button>
  </div>`;
  qs('[data-back]', root).addEventListener('click', () => { location.hash = '#/diary'; });
  qs('[data-profile]', root).addEventListener('click', () => { location.hash = '#/profile'; });
  qs('[data-log]', root).addEventListener('click', () => { location.hash = '#/diary'; requestAnimationFrame(() => document.querySelector('[data-composer-input]')?.focus()); });
  root.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => { period = button.dataset.period; selected = null; render(root); }));
  root.querySelectorAll('[data-point]').forEach((button) => button.addEventListener('click', () => { selected = button.dataset.point; render(root); }));
}
