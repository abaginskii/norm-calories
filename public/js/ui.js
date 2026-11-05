/* Мелкие UI-примитивы: иконки, нижние листы, тосты, форматирование. */

const ICONS = {
  diary: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v20H7.5A2.5 2.5 0 0 1 5 19.5z"/><path d="M9 2v20"/><path d="M12.5 7.5h3M12.5 11h3"/>',
  progress: '<path d="M3 20h18"/><rect x="5" y="11" width="3.2" height="6" rx="1"/><rect x="10.4" y="6" width="3.2" height="11" rx="1"/><rect x="15.8" y="9" width="3.2" height="8" rx="1"/>',
  products: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-2 1.5-3 3-3M12 4c0 2-1 3-2 4"/>',
  profile: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.6-3.6 3.6-5.8 7.5-5.8s6.9 2.2 7.5 5.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  sunrise: '<path d="M12 2.5v3.5"/><path d="M4.5 8.5L6.8 10M19.5 8.5L17.2 10"/><path d="M3 14h4M17 14h4"/><path d="M6.5 21h11"/><path d="M8 18a4 4 0 0 1 8 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.3A8.7 8.7 0 1 1 9.7 3.5a7 7 0 0 0 10.8 10.8z"/>',
  apple: '<path d="M12 8.2c-3.4 0-5.8 2.5-5.8 5.8 0 3 2 5.7 4 5.7.9 0 1.3-.5 1.8-.5s.9.5 1.8.5c2 0 4-2.7 4-5.7 0-3.3-2.4-5.8-5.8-5.8z"/><path d="M12 8.2c0-2.2 1-3.9 3-4.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>',
  flame: '<path d="M12 3.2c3.2 3.2 4.7 5.6 4.7 8.5a4.7 4.7 0 0 1-9.4 0c0-1.6.7-3 1.8-4.4.4.8.9 1.4 1.6 1.9.2-2 .8-4.1 1.3-6z"/>',
  scale: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M7.5 11.5a5 5 0 0 1 9 0"/><path d="M12 9v2.2"/>',
  download: '<path d="M12 3v11"/><path d="M8 10.5l4 4 4-4"/><path d="M4 19.5h16"/>',
  upload: '<path d="M12 14.5v-11"/><path d="M8 7.5l4-4 4 4"/><path d="M4 19.5h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 7.5v5"/><path d="M9.5 10.5l2.5 2.5 2.5-2.5"/>',
  leaf: '<path d="M4 20c0-8 5-14 15-15-1 10-6.5 15-15 15z"/><path d="M4 20c3-6 7-9 11-10.5"/>',
  barcode: '<path d="M3 5v14M6 5v14M9 5v9M12 5v14M15 5v11M18 5v14M21 5v9"/>',
  camera: '<path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>',
  sparkles: '<path d="M12 3l1.7 4.6L18.3 9l-4.6 1.4L12 15l-1.7-4.6L5.7 9l4.6-1.4z"/><path d="M18.5 14.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
  key: '<circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H21M18.4 12v3M15.2 12v2"/>',
  text: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4.5V11h-6.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l4.5-4.5 3.5 3.5 2.5-2.5L20 18"/>',
};

export function icon(name, cls = '') {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function fmt(n, digits = 0) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n) || 0);
}

export function fmt1(n) {
  return fmt(n, 1).replace('.', ',');
}

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

/* ---------- Тосты ---------- */

export function toast(message, duration = 2200) {
  const root = qs('#toast-root');
  const node = el(`<div class="toast">${esc(message)}</div>`);
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('toast--show'));
  setTimeout(() => {
    node.classList.remove('toast--show');
    setTimeout(() => node.remove(), 250);
  }, duration);
}

/* ---------- Нижний лист ---------- */

let activeSheet = null;

export function openSheet({ title, subtitle = '', body = '', footer = '', onClose = null }) {
  // Предыдущий лист убираем сразу: новый всё равно перекрывает его.
  if (activeSheet) activeSheet.close({ silent: true, immediate: true });

  const root = qs('#sheet-root');
  const backdrop = el('<div class="sheet-backdrop"></div>');
  const sheet = el(`
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet__grabber"></div>
      <header class="sheet__head">
        <div class="grow">
          <h2 class="sheet__title">${esc(title)}</h2>
          ${subtitle ? `<p class="sheet__sub">${esc(subtitle)}</p>` : ''}
        </div>
        <button class="sheet__close" type="button" aria-label="Закрыть">${icon('x')}</button>
      </header>
      <div class="sheet__body"></div>
      <footer class="sheet__foot" hidden></footer>
    </section>
  `);

  const bodyNode = qs('.sheet__body', sheet);
  const footNode = qs('.sheet__foot', sheet);

  if (typeof body === 'string') bodyNode.innerHTML = body;
  else if (body) bodyNode.appendChild(body);

  if (footer) {
    footNode.hidden = false;
    if (typeof footer === 'string') footNode.innerHTML = footer;
    else footNode.appendChild(footer);
  }

  root.append(backdrop, sheet);
  document.body.style.overflow = 'hidden';

  const previousFocus = document.activeElement;

  const close = ({ silent = false, immediate = false } = {}) => {
    if (!sheet.isConnected) return;
    sheet.classList.remove('sheet--open');
    backdrop.classList.remove('sheet-backdrop--open');
    sheet.classList.add('sheet--closing');
    backdrop.classList.add('sheet-backdrop--closing');
    document.body.style.overflow = '';
    if (activeSheet && activeSheet.el === sheet) activeSheet = null;
    if (immediate) {
      sheet.remove();
      backdrop.remove();
    } else {
      setTimeout(() => {
        sheet.remove();
        backdrop.remove();
      }, 260);
    }
    if (previousFocus && previousFocus.focus) setTimeout(() => previousFocus.focus(), 60);
    if (!silent) onClose?.();
  };

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  backdrop.addEventListener('click', () => close());
  qs('.sheet__close', sheet).addEventListener('click', () => close());
  document.addEventListener('keydown', onKey);

  const controller = {
    el: sheet,
    body: bodyNode,
    footer: footNode,
    close,
    setTitle(text, sub = '') {
      qs('.sheet__title', sheet).textContent = text;
      const subNode = qs('.sheet__sub', sheet);
      if (subNode) subNode.textContent = sub;
      sheet.setAttribute('aria-label', text);
    },
    setBody(content) {
      bodyNode.innerHTML = '';
      if (typeof content === 'string') bodyNode.innerHTML = content;
      else if (content) bodyNode.appendChild(content);
      bodyNode.scrollTop = 0;
    },
    setFooter(content) {
      footNode.innerHTML = '';
      if (!content) {
        footNode.hidden = true;
        return;
      }
      footNode.hidden = false;
      if (typeof content === 'string') footNode.innerHTML = content;
      else footNode.appendChild(content);
    },
  };

  activeSheet = controller;
  requestAnimationFrame(() => {
    sheet.classList.add('sheet--open');
    backdrop.classList.add('sheet-backdrop--open');
    const autofocus = sheet.querySelector('[data-autofocus]');
    if (autofocus) setTimeout(() => autofocus.focus(), 320);
  });

  return controller;
}

export function closeSheet() {
  if (activeSheet) activeSheet.close();
}

/* ---------- Подтверждение ---------- */

export function confirmAction({ title, text, confirmText = 'Удалить', cancelText = 'Отмена', danger = true }) {
  return new Promise((resolve) => {
    let settled = false;
    const sheet = openSheet({
      title,
      body: `<p class="small muted" style="line-height:1.5">${esc(text)}</p>`,
      footer: `
        <div class="btn-row">
          <button class="btn" data-cancel type="button">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm type="button">${esc(confirmText)}</button>
        </div>`,
      onClose: () => { if (!settled) { settled = true; resolve(false); } },
    });

    qs('[data-cancel]', sheet.footer).addEventListener('click', () => {
      settled = true;
      resolve(false);
      sheet.close();
    });
    qs('[data-confirm]', sheet.footer).addEventListener('click', () => {
      settled = true;
      resolve(true);
      sheet.close();
    });
  });
}

/* ---------- Переключатель ---------- */

export function segmented(options, value, onSelect, { name = '' } = {}) {
  const wrap = el(`<div class="segmented" role="tablist" aria-label="${esc(name)}"></div>`);
  options.forEach((option) => {
    const btn = el(`<button class="segmented__btn ${option.id === value ? 'segmented__btn--active' : ''}" type="button" role="tab" aria-selected="${option.id === value}">${esc(option.name)}</button>`);
    btn.addEventListener('click', () => {
      qsa('.segmented__btn', wrap).forEach((b) => {
        b.classList.remove('segmented__btn--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('segmented__btn--active');
      btn.setAttribute('aria-selected', 'true');
      onSelect(option.id);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

/* ---------- Кольцо калорий ---------- */

export function calorieRing({ consumed, target, over = false }) {
  const percent = target ? Math.min(1.2, consumed / target) : 0;
  const dash = Math.min(100, percent * 100);
  return `
    <div class="ring ${over ? 'ring--over' : ''}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#4ade80"/>
            <stop offset="100%" stop-color="#0f9d58"/>
          </linearGradient>
        </defs>
        <circle class="ring__track" cx="60" cy="60" r="50"/>
        <circle class="ring__value-arc" cx="60" cy="60" r="50" pathLength="100"
                stroke-dasharray="100" stroke-dashoffset="${(100 - dash).toFixed(2)}"/>
      </svg>
      <div class="ring__center">
        <div class="ring__num" data-consumed>${fmt(Math.round(consumed))}</div>
        <div class="ring__caption">${over ? `перебор ${fmt(Math.round(consumed - target))} ккал` : `из ${fmt(target)} ккал`}</div>
      </div>
    </div>`;
}

/* ---------- Навигация по датам ---------- */

export function dayNav({ iso, title, sub, onPrev, onNext, onToday }) {
  const wrap = el(`
    <div class="day-nav">
      <button class="icon-btn" type="button" data-prev aria-label="Предыдущий день">${icon('chevronLeft')}</button>
      <div class="day-nav__label">${esc(title)}<span>${esc(sub)}</span></div>
      <button class="icon-btn" type="button" data-next aria-label="Следующий день">${icon('chevronRight')}</button>
    </div>`);
  wrap.querySelector('[data-prev]').addEventListener('click', onPrev);
  wrap.querySelector('[data-next]').addEventListener('click', onNext);
  if (onToday) wrap.querySelector('.day-nav__label').addEventListener('click', onToday);
  return wrap;
}

/* ---------- Анимация чисел ---------- */

export function countUp(node, to, { duration = 600, digits = 0 } = {}) {
  const from = Number(node.dataset.value || 0);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    const value = from + (to - from) * eased;
    node.textContent = fmt(value, digits);
    if (t < 1) requestAnimationFrame(tick);
    else node.dataset.value = String(to);
  };
  node.dataset.value = String(from);
  requestAnimationFrame(tick);
}
