/* Карточка orvo ID в профиле: вход, облако, тариф и лимит ИИ, другие сервисы orvo. */

import { cloud } from '../cloud.js';
import { esc, icon, toast, confirmAction } from '../ui.js';

const ORVO_MARK = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M81.6 45A32 32 0 1 1 55 18.4"/><circle cx="72.6" cy="27.4" r="9"/></svg>`;
const PLUS_MARK = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M81.6 45A32 32 0 1 1 55 18.4"/><path d="M72.6 19v17M64 27.4h17"/></svg>`;
const PLAN_AI = { free: 5, plus: 40, premium: 150 };

const SYNC = {
  synced: 'Дневник сохранён в облаке',
  syncing: 'Сохраняем…',
  offline: 'Нет сети — сохраним позже',
  error: 'Не удалось сохранить, попробуем ещё',
  idle: 'Облако подключено',
};

export function orvoButton(label = 'Войти с orvo ID') {
  return `<button class="orvo-btn" type="button" data-orvo-login><span class="orvo-mark">${ORVO_MARK}</span><span>${esc(label)}</span></button>`;
}

export function accountCard() {
  const me = cloud.me;
  if (!me) {
    return `
    <section class="card account account--out">
      <div class="account__head">
        <span class="orvo-mark orvo-mark--lg">${ORVO_MARK}</span>
        <div class="grow">
          <div class="account__title">Норма в облаке</div>
          <div class="small muted">Один аккаунт orvo ID для Нормы, Сквозь и Полки</div>
        </div>
      </div>
      <ul class="account__perks">
        <li>${icon('check')}<span>Дневник на всех устройствах и не пропадёт с телефоном</span></li>
        <li>${icon('check')}<span>ИИ без своего ключа: ${PLAN_AI.free} запросов в день, с orvo plus — ${PLAN_AI.plus}</span></li>
        <li>${icon('check')}<span>Вход кнопкой в Telegram, пароль не нужен</span></li>
      </ul>
      ${orvoButton()}
    </section>`;
  }

  const plan = me.plan || 'free';
  const ai = me.ai || { used: 0, limit: PLAN_AI.free };
  const left = Math.max(0, ai.limit - ai.used);
  const pct = ai.limit ? Math.min(100, (ai.used / ai.limit) * 100) : 0;
  const orvo = (me.orvoUrl || 'https://orvo-id.vercel.app').replace(/\/$/, '');

  return `
    <section class="card account account--in account--${plan}">
      <div class="account__head">
        <span class="orvo-mark orvo-mark--lg">${ORVO_MARK}</span>
        <div class="grow">
          <div class="account__title">orvo ID${me.username ? ` <span class="muted account__nick">@${esc(me.username)}</span>` : ''}</div>
          <div class="small muted account__sync" data-sync="${cloud.status}">${SYNC[cloud.status] || SYNC.idle}</div>
        </div>
        ${plan !== 'free' ? `<span class="plus-chip plus-chip--${plan}">${plan}</span>` : ''}
      </div>
      ${ai.shared ? `
      <div class="account__ai">
        <div class="row" style="justify-content:space-between">
          <span class="small">${icon('sparkles')} ИИ сегодня</span>
          <span class="small nums">осталось <b>${left}</b> из ${ai.limit}</span>
        </div>
        <div class="account__meter"><i style="width:${pct}%"></i></div>
      </div>` : ''}
      <a class="account__plus" href="${esc(orvo)}/me#plus" target="_blank" rel="noopener">
        <span class="plus-mark">${PLUS_MARK}</span>
        <span class="grow">
          <b>${plan === 'free' ? 'orvo plus' : `orvo ${plan} подключён`}</b>
          <small>${plan === 'free' ? `${PLAN_AI.plus} запросов к ИИ в день, Сквозь без оплаты` : plan === 'plus' ? `${PLAN_AI.plus} запросов к ИИ в день. В premium — ${PLAN_AI.premium}` : `${PLAN_AI.premium} запросов к ИИ в день`}</small>
        </span>
        ${icon('chevronRight')}
      </a>
      <div class="btn-row mt-12">
        <button class="btn btn--sm" type="button" data-cloud-sync>Синхронизировать</button>
        <button class="btn btn--sm btn--ghost" type="button" data-orvo-logout>Выйти</button>
      </div>
    </section>`;
}

export function servicesCard() {
  return `
    <section class="card">
      <div class="card__head"><span class="card__title">Сервисы orvo</span></div>
      <a class="svc-row" href="https://skvoz-vpn.vercel.app" target="_blank" rel="noopener">
        <span class="svc-dot" style="--c:#b39cff">С</span>
        <span class="grow"><b>Сквозь</b><small>VPN, который не видно</small></span>${icon('chevronRight')}
      </a>
      <a class="svc-row" href="https://study-shelf-three.vercel.app" target="_blank" rel="noopener">
        <span class="svc-dot" style="--c:#e8b04b">П</span>
        <span class="grow"><b>Полка</b><small>Конспекты, файлы и ИИ для учёбы</small></span>${icon('chevronRight')}
      </a>
    </section>`;
}

export function bindAccount(root) {
  root.querySelectorAll('[data-orvo-login]').forEach((b) => b.addEventListener('click', () => {
    b.classList.add('is-busy');
    cloud.login();
  }));
  root.querySelector('[data-cloud-sync]')?.addEventListener('click', async () => {
    await cloud.refresh();
    await cloud.syncNow();
    toast(cloud.status === 'synced' ? 'Всё сохранено' : 'Нет связи с облаком');
  });
  root.querySelector('[data-orvo-logout]')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Выйти из orvo ID?',
      text: 'Дневник останется на этом устройстве и в облаке. ИИ без своего ключа станет недоступен.',
      confirmText: 'Выйти',
      danger: false,
    });
    if (!ok) return;
    await cloud.logout();
    toast('Вы вышли');
  });
}
