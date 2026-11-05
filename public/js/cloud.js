/* Облако Нормы: вход через orvo ID, копия дневника на сервере, общий ИИ.
   Без входа всё работает как раньше, только на этом устройстве. */

import { state, replaceState, setChangeHook } from './store.js';

const KEY = 'norm.cloud';
const ME_KEY = 'norm.me';

let me = readJSON(ME_KEY);
let meta = readJSON(KEY) || { rev: 0, sub: null };
let timer = null;
let busy = false;
let again = null;
let lastPull = 0;
let status = me ? 'idle' : 'off';

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* приватный режим */ }
}
function announce(next) {
  if (next) status = next;
  window.dispatchEvent(new CustomEvent('norma:cloud', { detail: { status, me } }));
}

export const cloud = {
  get on() { return !!me; },
  get me() { return me; },
  get status() { return status; },
  get sharedAI() { return !!(me && me.ai && me.ai.shared); },
  login() { location.href = '/api/auth/orvo/start'; },
  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    me = null; meta = { rev: 0, sub: meta.sub }; writeJSON(ME_KEY, null); writeJSON(KEY, meta);
    setChangeHook(null);
    announce('off');
  },
  /** Ответ общего ИИ сообщает, сколько запросов осталось на сегодня. */
  noteAI(left, limit) {
    if (!me || !Number.isFinite(left)) return;
    me = { ...me, ai: { ...me.ai, limit: limit || me.ai.limit, used: Math.max(0, (limit || me.ai.limit) - left) } };
    writeJSON(ME_KEY, me);
    announce();
  },
  refresh: () => loadMe().then(() => announce()),
  syncNow: () => pull(),
};

/* ---------- Слияние двух копий ---------- */

// Что не уезжает в облако: ключ Gemini, кеш штрихкодов, режим браузера.
function syncable(s) {
  const { ai, barcodeCache, ...rest } = s;
  return { ...rest, settings: { theme: (s.settings && s.settings.theme) || 'auto' } };
}

const ts = (s) => (s && s.meta && s.meta.updatedAt) || 0;

export function merge(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const newer = ts(local) >= ts(remote) ? local : remote;
  const older = newer === local ? remote : local;
  // Всё удалили после последней правки на другом устройстве: старую копию не воскрешаем.
  if (((newer.meta && newer.meta.resetAt) || 0) > ts(older)) return newer;

  const deleted = { ...((older.meta && older.meta.deleted) || {}) };
  for (const [id, at] of Object.entries((newer.meta && newer.meta.deleted) || {})) deleted[id] = Math.max(deleted[id] || 0, at);

  const days = {};
  for (const iso of new Set([...Object.keys(older.days || {}), ...Object.keys(newer.days || {})])) {
    const n = (newer.days || {})[iso];
    const o = (older.days || {})[iso];
    const day = { ...(o || {}), ...(n || {}), meals: {} };
    const seen = new Set();
    for (const src of [n, o]) {
      if (!src || !src.meals) continue;
      for (const [meal, list] of Object.entries(src.meals)) {
        for (const e of list || []) {
          if (!e || seen.has(e.id) || deleted[e.id]) continue;
          seen.add(e.id);
          (day.meals[meal] || (day.meals[meal] = [])).push(e);
        }
      }
    }
    for (const list of Object.values(day.meals)) list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    days[iso] = day;
  }

  const foods = new Map();
  for (const f of [...(newer.customFoods || []), ...(older.customFoods || [])]) {
    if (f && !foods.has(f.id) && !deleted[f.id]) foods.set(f.id, f);
  }

  return {
    ...older,
    ...newer,
    days,
    customFoods: [...foods.values()],
    meta: {
      ...(older.meta || {}),
      ...(newer.meta || {}),
      updatedAt: Math.max(ts(local), ts(remote)),
      deleted,
    },
  };
}

/* ---------- Сеть ---------- */

async function loadMe() {
  try {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (r.status === 401) { me = null; writeJSON(ME_KEY, null); return null; }
    if (!r.ok) return me;
    me = await r.json();
    writeJSON(ME_KEY, me);
    return me;
  } catch {
    return me; // офлайн: работаем с тем, что помним
  }
}

function adopt(next) {
  replaceState(next, { fromCloud: true });
}

async function pull() {
  if (!me) return;
  announce('syncing');
  let server;
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.status === 401) { await cloud.logout(); return; }
    if (!r.ok) throw new Error(String(r.status));
    server = await r.json();
  } catch {
    announce('offline');
    return;
  }
  lastPull = Date.now();

  const local = syncable(state);
  const otherAccount = meta.sub && meta.sub !== me.sub;
  meta.sub = me.sub;
  meta.rev = server.rev || 0;
  writeJSON(KEY, meta);

  if (otherAccount) {
    // На устройстве были данные другого аккаунта: не смешиваем.
    adopt(server.state || {});
    announce('synced');
    return;
  }
  if (!server.state) {
    if (state.profile) await push();
    else announce('synced');
    return;
  }
  if (!state.profile && !ts(state)) {
    adopt(server.state);
    announce('synced');
    return;
  }
  const merged = merge(local, server.state);
  adopt(merged);
  if (JSON.stringify(merged) !== JSON.stringify(server.state)) await push();
  else announce('synced');
}

async function push({ reset = false } = {}) {
  if (!me) return;
  if (busy) { again = { reset: again?.reset || reset }; return; }
  busy = true;
  announce('syncing');
  try {
    for (let i = 0; i < 4; i += 1) {
      const body = JSON.stringify({ state: syncable(state), rev: meta.rev, updatedAt: ts(state) });
      const r = await fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
      if (r.status === 401) { await cloud.logout(); return; }
      if (r.status === 409) {
        const server = await r.json();
        meta.rev = server.rev || 0;
        if (!reset) adopt(merge(syncable(state), server.state));
        continue;
      }
      if (!r.ok) throw new Error(String(r.status));
      const saved = await r.json();
      meta.rev = saved.rev;
      writeJSON(KEY, meta);
      announce('synced');
      return;
    }
    announce('error');
  } catch {
    announce('offline');
  } finally {
    busy = false;
    if (again) { const next = again; again = null; push(next); }
  }
}

function schedule(opts = {}) {
  clearTimeout(timer);
  if (opts.reset) { push({ reset: true }); return; }
  timer = setTimeout(() => { timer = null; push(); }, 1500);
}

/** Запуск: узнаём, кто вошёл, и сверяем копии. Не блокирует первый экран. */
export async function initCloud() {
  const params = new URLSearchParams(location.search);
  const justLoggedIn = params.has('cloud');
  const loginError = params.get('login');
  if (justLoggedIn || loginError) history.replaceState(null, '', location.pathname + location.hash);

  await loadMe();
  if (!me) { announce('off'); return { justLoggedIn: false, loginError }; }
  setChangeHook(schedule);
  await pull();

  addEventListener('online', () => push());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); timer = null; push(); }
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 60_000) { loadMe().then(pull); }
  });
  return { justLoggedIn, loginError };
}
