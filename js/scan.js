/* Сканер штрихкодов и поиск продуктов в Open Food Facts.
   Камера: BarcodeDetector там, где он есть, иначе ZXing (vendor/zxing.min.js). */

import { addEntry, cachedBarcode, cacheBarcode, MEALS } from './store.js';
import { openSheet, icon, esc, fmt, fmt1, toast, qs, qsa } from './ui.js';

const OFF_API = 'https://world.openfoodfacts.org/api/v2/product/';
const OFF_FIELDS = [
  'product_name', 'product_name_ru', 'generic_name', 'brands', 'nutriments',
  'quantity', 'image_front_small_url', 'code',
].join(',');

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];

export function normalizeCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14);
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function parseProduct(raw, code) {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw.nutriments || {};
  let kcal = Number(n['energy-kcal_100g']);
  if (!(kcal > 0)) {
    const kj = Number(n['energy-kj_100g'] || n['energy_100g']);
    if (kj > 0) kcal = kj / 4.184;
  }
  const name = String(raw.product_name_ru || raw.product_name || raw.generic_name || '').trim();
  if (!name || !(kcal > 0)) return null;
  const brand = String(raw.brands || '').split(',')[0].trim();
  return {
    barcode: code,
    name: name.slice(0, 120),
    brand,
    quantity: String(raw.quantity || '').slice(0, 40),
    kcal: Math.round(kcal),
    protein: round1(n.proteins_100g),
    fat: round1(n.fat_100g),
    carb: round1(n.carbohydrates_100g),
    image: typeof raw.image_front_small_url === 'string' ? raw.image_front_small_url : '',
    source: 'off',
  };
}

export async function fetchProduct(code) {
  const cached = cachedBarcode(code);
  if (cached) return cached;

  const url = `${OFF_API}${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`off-${res.status}`);
  const data = await res.json();
  if (!data || data.status === 0 || !data.product) return null;
  const product = parseProduct(data.product, code);
  if (product) cacheBarcode(product);
  return product;
}

function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('vendor/zxing.min.js', document.baseURI).href;
    script.async = true;
    script.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error('zxing-empty')));
    script.onerror = () => reject(new Error('zxing-load'));
    document.head.appendChild(script);
  });
}

function spinner(label) {
  return `
    <div class="scan-wait">
      <span class="spinner" aria-hidden="true"></span>
      <p class="small muted">${esc(label)}</p>
    </div>`;
}

export function openScanner({ iso, meal = 'breakfast', createProduct = null, onDone = null }) {
  let stream = null;
  let timer = null;
  let reader = null;
  let stopped = false;
  let busy = false;
  let currentMeal = meal;
  let grams = 100;
  let lastCode = '';

  const sheet = openSheet({
    title: 'Сканер штрихкода',
    subtitle: 'Наведите камеру на штрихкод',
    body: '',
    footer: '',
    onClose: () => stop(),
  });

  function status(text) {
    const node = sheet.body.querySelector('[data-status]');
    if (node) node.textContent = text;
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    timer = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (reader) {
      try { reader.reset(); } catch (err) { /* noop */ }
      reader = null;
    }
    const video = sheet.body.querySelector('video');
    if (video) {
      try { video.srcObject = null; } catch (err) { /* noop */ }
    }
  }

  function manualFooter() {
    return `<button class="btn btn--ghost btn--block" type="button" data-manual>${icon('text')} Ввести цифры вручную</button>`;
  }

  function bindManual() {
    const btn = sheet.footer.querySelector('[data-manual]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      stop();
      showManual();
    });
  }

  function mountStage() {
    busy = false;
    stopped = false;
    sheet.setTitle('Сканер штрихкода', 'Наведите камеру на штрихкод');
    sheet.setBody(`
      <div class="scanner">
        <div class="scanner__stage">
          <video class="scanner__video" playsinline muted autoplay></video>
          <div class="scanner__overlay">
            <div class="scanner__frame"><span class="scanner__beam"></span></div>
          </div>
          <div class="scanner__status" data-status>Запускаем камеру…</div>
        </div>
        <p class="tiny muted center mt-8">EAN-13, EAN-8, UPC, Code 128</p>
        <p class="tiny muted center">Данные о продуктах: Open Food Facts</p>
      </div>`);
    sheet.setFooter(manualFooter());
    bindManual();
    startCamera();
  }

  async function startCamera() {
    const video = sheet.body.querySelector('video');
    if (!video) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status('Камера недоступна');
      showManual();
      return;
    }

    status('Запускаем камеру…');

    try {
      if ('BarcodeDetector' in window) {
        await startNative(video);
      } else {
        await startZXing(video);
      }
    } catch (err) {
      console.warn('Камера/сканер не запустились', err);
      status('Не удалось включить камеру');
      showManual();
    }
  }

  async function startNative(video) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    status('Наведите камеру на штрихкод');

    let formats = FORMATS;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const filtered = FORMATS.filter((f) => supported.includes(f));
      if (filtered.length) formats = filtered;
    } catch (err) { /* используем список по умолчанию */ }

    const detector = new window.BarcodeDetector({ formats });
    const tick = async () => {
      if (stopped || busy) return;
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          onDetect(codes[0].rawValue);
          return;
        }
      } catch (err) { /* пропускаем сбойный кадр */ }
      timer = setTimeout(tick, 220);
    };
    tick();
  }

  async function startZXing(video) {
    status('Загружаем декодер…');
    const ZXing = await loadZXing();
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.CODE_128,
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    reader = new ZXing.BrowserMultiFormatReader(hints);

    status('Наведите камеру на штрихкод');
    await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      video,
      (result) => {
        if (result && !busy && !stopped) onDetect(result.getText());
      },
    );
  }

  function onDetect(raw) {
    if (busy) return;
    const code = normalizeCode(raw);
    if (code.length < 8) return;
    busy = true;
    stop();
    if (navigator.vibrate) navigator.vibrate(40);
    lastCode = code;
    lookup(code);
  }

  async function lookup(code) {
    sheet.setTitle('Ищем продукт', `Штрихкод ${code}`);
    sheet.setFooter('');
    sheet.setBody(spinner('Запрашиваем Open Food Facts…'));

    try {
      const product = await fetchProduct(code);
      if (product) showProduct(product);
      else showNotFound(code);
    } catch (err) {
      console.warn(err);
      showError(code, err);
    }
  }

  function showProduct(product) {
    grams = 100;
    busy = true;
    const subtitle = [product.brand, product.quantity].filter(Boolean).join(' · ') || product.barcode;

    sheet.setTitle(product.name, subtitle);
    sheet.setBody(`
      <div class="scan-product">
        ${product.image ? `<img class="scan-product__img" src="${esc(product.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '<div class="scan-product__img scan-product__img--empty">' + icon('products') + '</div>'}
        <div class="scan-product__text">
          <span class="badge">${Math.round(product.kcal)} ккал / 100 г</span>
          <span class="scan-product__brand">${esc(product.brand || 'Без бренда')}</span>
          <span class="tiny muted">Б ${fmt1(product.protein)} · Ж ${fmt1(product.fat)} · У ${fmt1(product.carb)} на 100 г</span>
        </div>
      </div>

      <div class="amount-row">
        <div class="stepper">
          <button class="stepper__btn" type="button" data-minus aria-label="Меньше">−</button>
          <input class="stepper__input" type="number" inputmode="numeric" min="1" max="3000" value="${grams}" data-grams aria-label="Граммы">
          <button class="stepper__btn" type="button" data-plus aria-label="Больше">+</button>
        </div>
      </div>
      <div class="amount-unit">граммов</div>

      <div class="chips mt-16" data-quick style="justify-content:center">
        ${[50, 100, 150, 200, 250].map((g) => `<button class="chip ${g === grams ? 'chip--active' : ''}" type="button" data-g="${g}">${g} г</button>`).join('')}
      </div>

      <div data-preview>${scanPreview(product, grams)}</div>

      <div class="field mt-16">
        <span class="field__label">Приём пищи</span>
        <div class="segmented" data-meals>
          ${MEALS.map((m) => `<button class="segmented__btn ${m.id === currentMeal ? 'segmented__btn--active' : ''}" type="button" data-meal="${m.id}">${m.name}</button>`).join('')}
        </div>
      </div>

      <p class="tiny muted mt-16">Источник: Open Food Facts · значения могут отличаться от упаковки</p>
    `);
    sheet.setFooter(`
      <div class="btn-row">
        <button class="btn" type="button" data-again>${icon('refresh')}</button>
        <button class="btn btn--primary" type="button" data-add>Добавить</button>
      </div>`);

    const body = sheet.body;
    const input = qs('[data-grams]', body);
    const preview = qs('[data-preview]', body);
    const addBtn = qs('[data-add]', sheet.footer);

    const sync = () => {
      grams = Math.min(3000, Math.max(1, Math.round(Number(input.value) || 1)));
      preview.innerHTML = scanPreview(product, grams);
      addBtn.textContent = `Добавить · ${Math.round((product.kcal * grams) / 100)}`;
      qsa('[data-g]', body).forEach((chip) => {
        chip.classList.toggle('chip--active', Number(chip.dataset.g) === grams);
      });
    };

    input.addEventListener('input', sync);
    input.addEventListener('blur', () => {
      input.value = String(Math.min(3000, Math.max(1, Math.round(Number(input.value) || 1))));
      sync();
    });
    qs('[data-minus]', body).addEventListener('click', () => {
      input.value = String(Math.max(1, grams - 10));
      sync();
    });
    qs('[data-plus]', body).addEventListener('click', () => {
      input.value = String(Math.min(3000, grams + 10));
      sync();
    });
    qsa('[data-g]', body).forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.g;
        sync();
      });
    });
    qsa('[data-meal]', body).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentMeal = btn.dataset.meal;
        qsa('[data-meal]', body).forEach((b) => b.classList.remove('segmented__btn--active'));
        btn.classList.add('segmented__btn--active');
      });
    });

    qs('[data-again]', sheet.footer).addEventListener('click', () => {
      busy = false;
      mountStage();
    });

    addBtn.addEventListener('click', () => {
      addEntry(iso, currentMeal, product, grams);
      sheet.close();
      toast(`Добавлено: ${product.name}`);
      onDone?.();
    });

    sync();
  }

  function scanPreview(product, value) {
    const factor = value / 100;
    return `
      <div class="preview">
        <div class="preview__cell"><div class="preview__val">${Math.round(product.kcal * factor)}</div><div class="preview__key">ккал</div></div>
        <div class="preview__cell"><div class="preview__val">${fmt1(product.protein * factor)}</div><div class="preview__key">белки</div></div>
        <div class="preview__cell"><div class="preview__val">${fmt1(product.fat * factor)}</div><div class="preview__key">жиры</div></div>
        <div class="preview__cell"><div class="preview__val">${fmt1(product.carb * factor)}</div><div class="preview__key">углев.</div></div>
      </div>`;
  }

  function showNotFound(code) {
    sheet.setTitle('Продукт не найден', `Штрихкод ${code}`);
    sheet.setBody(`
      <div class="empty">
        <div class="empty__icon">${icon('barcode')}</div>
        <div class="empty__title">В Open Food Facts его нет</div>
        <div class="empty__text">Можно создать свой продукт: он сохранится на устройстве, и в следующий раз штрихкод найдётся без интернета.</div>
      </div>`);
    sheet.setFooter(`
      <div class="btn-row">
        <button class="btn" type="button" data-again>${icon('refresh')} Снова</button>
        <button class="btn btn--primary" type="button" data-create>Создать продукт</button>
      </div>`);
    qs('[data-again]', sheet.footer).addEventListener('click', () => {
      busy = false;
      mountStage();
    });
    qs('[data-create]', sheet.footer).addEventListener('click', () => {
      sheet.close();
      if (createProduct) createProduct(code);
      else toast('Создание продукта недоступно');
    });
  }

  function showError(code, err) {
    const offline = !navigator.onLine;
    sheet.setTitle('Не удалось найти', `Штрихкод ${code}`);
    sheet.setBody(`
      <div class="empty">
        <div class="empty__icon">${icon('info')}</div>
        <div class="empty__title">${offline ? 'Нет интернета' : 'База не ответила'}</div>
        <div class="empty__text">${offline
          ? 'Open Food Facts работает онлайн. Проверьте соединение или создайте продукт вручную.'
          : 'Проверьте связь и попробуйте ещё раз. Можно ввести штрихкод вручную или создать продукт.'}</div>
      </div>`);
    sheet.setFooter(`
      <div class="btn-row">
        <button class="btn" type="button" data-manual>Вручную</button>
        <button class="btn btn--primary" type="button" data-retry>Повторить</button>
      </div>`);
    qs('[data-manual]', sheet.footer).addEventListener('click', () => showManual());
    qs('[data-retry]', sheet.footer).addEventListener('click', () => {
      busy = true;
      lookup(code);
    });
    console.warn('lookup failed', err);
  }

  function showManual() {
    stop();
    sheet.setTitle('Введите штрихкод', '8–13 цифр под штрихкодом');
    sheet.setBody(`
      <label class="field">
        <span class="field__label">Штрихкод</span>
        <input class="input" type="text" inputmode="numeric" autocomplete="off" data-code value="${esc(lastCode)}" placeholder="4600000000000" data-autofocus>
      </label>
      <p class="tiny muted">Например, 4601234567890. Если продукта нет в базе, его можно создать.</p>`);
    sheet.setFooter(`
      <div class="btn-row">
        <button class="btn" type="button" data-camera>${icon('camera')} Камера</button>
        <button class="btn btn--primary" type="button" data-lookup>Найти</button>
      </div>`);

    const input = qs('[data-code]', sheet.body);
    const find = () => {
      const code = normalizeCode(input.value);
      if (code.length < 8) return toast('Введите 8–13 цифр');
      busy = true;
      lastCode = code;
      lookup(code);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        find();
      }
    });
    qs('[data-lookup]', sheet.footer).addEventListener('click', find);
    qs('[data-camera]', sheet.footer).addEventListener('click', () => mountStage());
  }

  mountStage();
  return sheet;
}
