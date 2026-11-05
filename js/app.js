import { state, subscribe, update, todayISO } from './store.js';
import { icon, qs } from './ui.js';
import { applyTheme, watchTheme } from './theme.js';
import { initPWA, isStandalone } from './pwa.js';
import { openAddMenu } from './addMenu.js';
import * as install from './views/install.js';
import * as diary from './views/diary.js';
import * as products from './views/products.js';
import * as progress from './views/progress.js';
import * as nutrition from './views/nutrition.js';
import * as profile from './views/profile.js';
import * as onboarding from './views/onboarding.js';

const TABS = [
  { id: 'diary', label: 'Дневник', icon: 'diary' },
  { id: 'progress', label: 'Прогресс', icon: 'progress' },
  { id: 'products', label: 'Продукты', icon: 'products' },
  { id: 'profile', label: 'Профиль', icon: 'profile' },
];

const VIEWS = { diary, nutrition, progress, products, profile };

const appEl = qs('.app');
const topbarEl = qs('#topbar');
const viewEl = qs('#view');
const tabbarEl = qs('#tabbar');

let lastRoute = null;
let scheduled = false;

function currentRoute() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  return VIEWS[raw] ? raw : 'diary';
}

function tabButton(tab) {
  return `
    <button class="tab" type="button" data-tab="${tab.id}" aria-label="${tab.label}">
      <span class="tab__icon">${icon(tab.icon)}</span>
      <span class="tab__label">${tab.label}</span>
    </button>`;
}

function buildTabbar() {
  tabbarEl.innerHTML = `
    ${tabButton(TABS[0])}
    ${tabButton(TABS[1])}
    <button class="fab" type="button" data-fab aria-label="Добавить еду">${icon('plus')}</button>
    ${tabButton(TABS[2])}
    ${tabButton(TABS[3])}
  `;

  tabbarEl.addEventListener('click', (event) => {
    const fab = event.target.closest('[data-fab]');
    if (fab) {
      const iso = currentRoute() === 'diary' ? diary.getIso() : todayISO();
      openAddMenu({ iso });
      return;
    }
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    const route = button.dataset.tab;
    if (currentRoute() === route) return;
    location.hash = `#/${route}`;
  });
}

function markActiveTab(route) {
  tabbarEl.querySelectorAll('[data-tab]').forEach((tab) => {
    const active = tab.dataset.tab === route;
    tab.classList.toggle('tab--active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

function render() {
  scheduled = false;

  // Сначала установка: в браузере показываем экран установки,
  // в установленном PWA сразу открывается приложение.
  if (!isStandalone() && !(state.settings && state.settings.browserMode)) {
    appEl.classList.add('app--bare');
    topbarEl.hidden = true;
    tabbarEl.hidden = true;
    lastRoute = 'install';
    viewEl.classList.remove('view--onb');
    viewEl.classList.add('view--bare');
    install.render(viewEl, {
      onContinue: () => update((s) => { s.settings.browserMode = true; }),
    });
    return;
  }

  if (!state.profile) {
    appEl.classList.add('app--bare');
    topbarEl.hidden = true;
    tabbarEl.hidden = true;
    lastRoute = null;
    viewEl.classList.remove('view--bare');
    onboarding.render(viewEl);
    return;
  }

  const route = currentRoute();
  const mod = VIEWS[route];
  const changed = lastRoute !== route;

  appEl.classList.remove('app--bare');
  appEl.classList.toggle('app--norm', route === 'diary' || route === 'nutrition');
  viewEl.classList.remove('view--bare', 'view--onb');
  tabbarEl.hidden = route === 'diary' || route === 'nutrition';

  if (changed) window.scrollTo(0, 0);
  const scrollY = window.scrollY;

  try {
    const head = mod.header ? mod.header() : null;
    if (head) {
      topbarEl.hidden = false;
      topbarEl.replaceChildren(head);
    } else {
      topbarEl.hidden = true;
      topbarEl.replaceChildren();
    }
    mod.render(viewEl, { route });
    requestAnimationFrame(() => window.scrollTo(0, changed ? 0 : scrollY));
  } catch (err) {
    console.error(err);
    topbarEl.hidden = true;
    viewEl.innerHTML = `
      <div class="empty">
        <div class="empty__icon">${icon('info')}</div>
        <div class="empty__title">Что-то пошло не так</div>
        <div class="empty__text">Попробуйте обновить страницу. Данные сохранены на устройстве.</div>
      </div>`;
  }

  markActiveTab(route);
  lastRoute = route;
}

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(render);
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

window.addEventListener('hashchange', () => {
  lastRoute = null;
  render();
});

window.addEventListener('norm:installable', scheduleRender);

subscribe(scheduleRender);

buildTabbar();
applyTheme();
watchTheme();
initPWA();
if (window.visualViewport) {
  const updateKeyboard = () => {
    const viewport = window.visualViewport;
    const occlusion = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--keyboard-offset', `${Math.round(occlusion)}px`);
  };
  visualViewport.addEventListener('resize', updateKeyboard);
  visualViewport.addEventListener('scroll', updateKeyboard);
  updateKeyboard();
}
render();

// Полезно для отладки из консоли.
window.__norm = { state };
