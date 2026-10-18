import { state, subscribe } from './store.js';
import { icon, qs } from './ui.js';
import { applyTheme, watchTheme } from './theme.js';
import { initPWA } from './pwa.js';
import * as diary from './views/diary.js';
import * as products from './views/products.js';
import * as progress from './views/progress.js';
import * as profile from './views/profile.js';
import * as onboarding from './views/onboarding.js';

const TABS = [
  { id: 'diary', label: 'Дневник', icon: 'diary' },
  { id: 'progress', label: 'Прогресс', icon: 'progress' },
  { id: 'products', label: 'Продукты', icon: 'products' },
  { id: 'profile', label: 'Профиль', icon: 'profile' },
];

const VIEWS = { diary, progress, products, profile };

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

function buildTabbar() {
  tabbarEl.innerHTML = TABS.map((tab) => `
    <button class="tab" type="button" data-tab="${tab.id}" aria-label="${tab.label}">
      <span class="tab__icon">${icon(tab.icon)}</span>
      <span class="tab__label">${tab.label}</span>
    </button>`).join('');

  tabbarEl.addEventListener('click', (event) => {
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

  if (!state.profile) {
    appEl.classList.add('app--bare');
    topbarEl.hidden = true;
    tabbarEl.hidden = true;
    lastRoute = null;
    onboarding.render(viewEl);
    return;
  }

  const route = currentRoute();
  const mod = VIEWS[route];
  const changed = lastRoute !== route;

  appEl.classList.remove('app--bare');
  topbarEl.hidden = false;
  tabbarEl.hidden = false;

  if (changed) window.scrollTo(0, 0);
  const scrollY = window.scrollY;

  try {
    viewEl.classList.remove('view--onb');
    topbarEl.replaceChildren(mod.header());
    mod.render(viewEl, { route });
    requestAnimationFrame(() => window.scrollTo(0, changed ? 0 : scrollY));
  } catch (err) {
    console.error(err);
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

subscribe(scheduleRender);

buildTabbar();
applyTheme();
watchTheme();
initPWA();
render();

// Полезно для отладки из консоли.
window.__norm = { state };
