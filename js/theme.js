import { state } from './store.js';

const DARK_BG = '#0d0a15';
const LIGHT_BG = '#f7f5fc';
const DARK_BAR = '#0d0a15';
const LIGHT_BAR = '#6d5dfc';

export function isDark() {
  const pref = state.settings.theme || 'auto';
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';

  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? DARK_BAR : LIGHT_BAR;
  document.head.appendChild(meta);

  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.content = dark ? 'dark' : 'light';
}

export function watchTheme() {
  const query = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if ((state.settings.theme || 'auto') === 'auto') applyTheme();
  };
  if (query.addEventListener) query.addEventListener('change', onChange);
  else query.addListener(onChange);
}
