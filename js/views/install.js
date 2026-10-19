/* Первый экран в браузере: предложение установить приложение.
   В установленном PWA этот экран не показывается. */

import { icon, esc, toast } from '../ui.js';
import { canInstall, promptInstall, isIOS, openInstallHelp } from '../pwa.js';

const WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function weekStrip() {
  const labels = WEEK.map((name, index) => {
    const day = 14 + index;
    const active = index === 2;
    return `<span class="mini-day ${active ? 'mini-day--active' : ''}"><span>${name}</span><b>${day}</b></span>`;
  }).join('');
  return `<div class="mini-week">${labels}</div>`;
}

function preview() {
  return `
    <div class="preview-stack" aria-hidden="true">
      <div class="preview-card preview-card--back">
        <div class="preview-card__row">
          <span class="preview-dot"></span>
          <span class="preview-line" style="width:38%"></span>
          <span class="preview-kcal">421</span>
        </div>
        <div class="preview-card__row">
          <span class="preview-dot preview-dot--lime"></span>
          <span class="preview-line" style="width:52%"></span>
          <span class="preview-kcal">237</span>
        </div>
      </div>

      <div class="preview-card preview-card--hero">
        ${weekStrip()}
        <div class="preview-num">1 286</div>
        <div class="preview-caption">ккал осталось</div>
        <div class="preview-bar"><i></i></div>
        <div class="preview-macros">
          <span><b>32%</b> белки</span>
          <span><b>44%</b> углеводы</span>
          <span><b>28%</b> жиры</span>
        </div>
      </div>
    </div>`;
}

export function render(root, { onContinue } = {}) {
  const installable = canInstall();
  const ios = isIOS();
  const cta = installable ? 'Установить приложение' : ios ? 'Как установить на iPhone' : 'Как установить';

  root.innerHTML = `
    <div class="install">
      <div class="install__top">
        <span class="brand-mark">${icon('leaf')}</span>
        <span class="install__brand">Норма</span>
      </div>

      <h1 class="install__title">Дневник калорий,<br>который <span class="install__accent">всегда</span> с собой</h1>
      <p class="install__lead">Сканер штрихкодов, AI-оценка блюда по фото и офлайн-режим — в одном приложении на вашем телефоне.</p>

      ${preview()}

      <div class="install__features">
        <span class="install__feature">${icon('barcode')} Штрихкоды</span>
        <span class="install__feature">${icon('sparkles')} AI по фото</span>
        <span class="install__feature">${icon('download')} Офлайн</span>
      </div>

      <div class="install__points">
        <span class="install__point">${icon('check')} Без регистрации и рекламы</span>
        <span class="install__point">${icon('check')} Данные остаются на вашем телефоне</span>
      </div>

      <div class="install__actions">
        <button class="btn btn--dark btn--block" type="button" data-install>${esc(cta)} ${icon('chevronRight')}</button>
        <button class="link-btn install__skip" type="button" data-continue>Продолжить в браузере</button>
      </div>

      <p class="install__note">Открывается как обычное приложение, без App Store.</p>
    </div>`;


  root.querySelector('[data-continue]').addEventListener('click', () => onContinue?.());

  root.querySelector('[data-install]').addEventListener('click', async () => {
    if (canInstall()) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        toast('Устанавливаем приложение…', 3000);
        setTimeout(() => location.reload(), 1200);
      } else if (outcome === 'dismissed') {
        toast('Установка отменена — можно попробовать снова');
      } else {
        openInstallHelp();
      }
      return;
    }
    openInstallHelp();
  });
}
