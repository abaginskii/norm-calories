/* Регистрация service worker и установка приложения на телефон. */

import { icon, openSheet } from './ui.js';

let deferredPrompt = null;

export function initPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service worker не зарегистрирован', err);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('norm:installable'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
}

export function canInstall() {
  return Boolean(deferredPrompt);
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  try {
    prompt.prompt();
    const result = await Promise.race([
      prompt.userChoice,
      new Promise((resolve) => setTimeout(() => resolve({ outcome: 'unavailable' }), 2500)),
    ]);
    return (result && result.outcome) || 'unavailable';
  } catch (err) {
    return 'unavailable';
  }
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function openInstallHelp() {
  const ios = isIOS();
  const sheet = openSheet({
    title: 'Установить «Норму»',
    subtitle: 'Приложение на домашнем экране',
    body: `
      <ol class="install-steps">
        ${ios ? `
          <li><b>Откройте сайт в Safari.</b><span>Если ссылка открыта в другом браузере, скопируйте её в Safari.</span></li>
          <li><b>Нажмите «Поделиться».</b><span>Квадрат со стрелкой внизу экрана.</span></li>
          <li><b>Выберите «На экран „Домой“».</b><span>Подтвердите — иконка появится на домашнем экране.</span></li>
        ` : `
          <li><b>Откройте меню браузера.</b><span>Три точки или «…» в правом верхнем углу.</span></li>
          <li><b>Выберите «Установить приложение».</b><span>В некоторых браузерах — «Добавить на главный экран».</span></li>
          <li><b>Подтвердите установку.</b><span>Приложение откроется в отдельном окне.</span></li>
        `}
      </ol>
      <p class="small muted" style="line-height:1.5">После установки приложение работает офлайн, а данные остаются на устройстве.</p>
    `,
    footer: '<button class="btn btn--primary btn--block" type="button" data-close>Понятно</button>',
  });
  sheet.footer.querySelector('[data-close]').addEventListener('click', () => sheet.close());
  return sheet;
}
