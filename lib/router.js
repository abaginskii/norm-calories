// Norma's small server: orvo ID sign-in, a cloud copy of the diary, shared Gemini with a daily limit.
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { AppError, readJSON, writeJSON, mutate, storageReady } from './store.js';
import { config, baseUrl } from './config.js';

const SESSION = 'nm_session';
const STATE = 'nm_orvo';
const secure = () => (config.isProd ? '; Secure' : '');
const cookie = (name, value, maxAge, path = '/') => `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure()}`;
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const sign = body => createHmac('sha256', config.secret).update(body).digest('base64url');
const safeSub = s => /^[A-Za-z0-9_-]{4,64}$/.test(String(s || '')) ? String(s) : null;
// The AI day starts at midnight Moscow time.
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (typeof body === 'string' || Buffer.isBuffer(body)) return res.end(body);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
const redirect = (res, to, setCookie) => send(res, 303, '', { location: to, ...(setCookie ? { 'set-cookie': setCookie } : {}) });

async function readRaw(req, limit) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString();
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new AppError('Слишком большой запрос.', 413); chunks.push(c); }
  return Buffer.concat(chunks).toString();
}
const readJsonBody = async (req, limit = 1e5) => { try { return JSON.parse(await readRaw(req, limit) || '{}'); } catch { throw new AppError('Некорректный запрос.'); } };

function sameOrigin(req, base) {
  const origin = req.headers.origin;
  if (origin && origin !== base && !(!config.isProd && origin.startsWith('http://localhost'))) throw new AppError('Запрос с другого сайта отклонён.', 403);
}

// ---------- people ----------
const userPath = sub => `users/${sub}.json`;
const statePath = sub => `state/${sub}.json`;
const usagePath = sub => `usage/${sub}.json`;

export function planOf(u) {
  const p = u?.plan;
  if ((p === 'plus' || p === 'premium') && (!u.planUntil || u.planUntil > Date.now())) return p;
  return 'free';
}
const aiLimit = u => config.aiPerDay[planOf(u)] ?? config.aiPerDay.free;

async function getUser(sub) { return (await readJSON(userPath(sub)))?.value || null; }

async function upsertUser(p) {
  const sub = safeSub(p.sub);
  if (!sub) throw new AppError('orvo ID прислал странный профиль.');
  return mutate(userPath(sub), u => {
    if (!u.sub) { u.sub = sub; u.createdAt = Date.now(); }
    Object.assign(u, {
      telegramId: p.telegram_id || u.telegramId || null,
      name: p.name || p.first_name || u.name || 'Без имени',
      username: p.username || null,
      avatar: p.avatar || p.photo_url || null,
      lastSeen: Date.now()
    });
    if ('plan' in p) { u.plan = p.plan || 'free'; u.planUntil = p.plan_until ?? null; u.planCheckedAt = Date.now(); }
    return { ...u };
  }, {});
}

async function setPlan(sub, plan, until) {
  if (!(await getUser(sub))) return;
  await mutate(userPath(sub), u => { u.plan = plan || 'free'; u.planUntil = until ?? null; u.planCheckedAt = Date.now(); }, {});
}

// Webhooks are the main channel. This is the safety net if one was missed.
async function refreshPlan(u) {
  if (!config.orvo.secret || Date.now() - (u.planCheckedAt || 0) < 6 * 3600_000) return u;
  try {
    const r = await fetch(config.orvo.url + '/api/oauth/plan', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ client_id: config.orvo.clientId, client_secret: config.orvo.secret, sub: u.sub })
    });
    if (!r.ok) return u;
    const d = await r.json();
    await setPlan(u.sub, d.plan, d.until);
    return { ...u, plan: d.plan, planUntil: d.until ?? null };
  } catch { return u; }
}

function sessionCookie(sub) {
  if ((config.secret || '').length < 32) throw new AppError('Сервер Нормы ещё не настроен.', 503);
  const body = Buffer.from(JSON.stringify({ sub, exp: Date.now() + 180 * 86400_000 })).toString('base64url');
  return body + '.' + sign(body);
}
function sessionSub(req) {
  const value = cookies(req)[SESSION];
  if (!value || (config.secret || '').length < 32) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig || !same(sig, sign(body))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.exp > Date.now() ? safeSub(d.sub) : null; }
  catch { return null; }
}
async function requireUser(req) {
  const sub = sessionSub(req);
  const u = sub && await getUser(sub);
  if (!u) throw new AppError('Войдите через orvo ID.', 401);
  return u;
}

async function usage(sub) {
  const r = await readJSON(usagePath(sub));
  return r?.value?.day === today() ? r.value.used : 0;
}

function publicMe(u, used) {
  return {
    sub: u.sub, name: u.name, username: u.username, avatar: u.avatar,
    plan: planOf(u), planUntil: planOf(u) === 'free' ? null : u.planUntil ?? null,
    ai: { used, limit: aiLimit(u), shared: !!config.gemini.key },
    orvoUrl: config.orvo.url
  };
}

// ---------- requests ----------
export async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.searchParams.get('__path') || url.pathname;
  const method = req.method || 'GET';
  const base = baseUrl(req);

  try {
    if (path === '/api/health') return send(res, 200, { ok: true, storage: storageReady(), orvo: !!config.orvo.secret, ai: !!config.gemini.key });

    // ----- sign in with orvo ID -----
    if (path === '/api/auth/orvo/start') {
      if (!config.orvo.secret) return redirect(res, '/app?login=off');
      const state = randomBytes(18).toString('base64url');
      const target = new URL(config.orvo.url + '/authorize');
      target.searchParams.set('client_id', config.orvo.clientId);
      target.searchParams.set('redirect_uri', base + '/api/auth/orvo/callback');
      target.searchParams.set('state', state);
      return redirect(res, target.toString(), cookie(STATE, state, 600, '/api/auth/orvo'));
    }
    if (path === '/api/auth/orvo/callback') {
      const clear = cookie(STATE, '', 0, '/api/auth/orvo');
      const expected = cookies(req)[STATE] || '';
      const state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '';
      if (!code || !expected || !same(expected, state)) return redirect(res, '/app?login=expired', clear);
      try {
        const r = await fetch(config.orvo.url + '/api/oauth/token', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ client_id: config.orvo.clientId, client_secret: config.orvo.secret, code, redirect_uri: base + '/api/auth/orvo/callback' })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.user) throw new AppError(data.error || 'orvo ID не подтвердил вход');
        const u = await upsertUser({ ...data.user, plan: data.plan ?? data.user.plan ?? 'free', plan_until: data.plan_until ?? data.user.plan_until ?? null });
        return redirect(res, '/app?cloud=1', [clear, cookie(SESSION, sessionCookie(u.sub), 180 * 86400)]);
      } catch (e) {
        console.error('orvo', e.message);
        return redirect(res, '/app?login=failed', clear);
      }
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      sameOrigin(req, base);
      return send(res, 200, { ok: true }, { 'set-cookie': cookie(SESSION, '', 0) });
    }

    // ----- orvo ID tells us a plan changed (signed with our client secret) -----
    if (path === '/api/orvo/webhook' && method === 'POST') {
      const raw = await readRaw(req, 1e4);
      const ts = String(req.headers['x-orvo-timestamp'] || ''), sig = String(req.headers['x-orvo-signature'] || '');
      const expected = createHmac('sha256', config.orvo.secret || '-').update(`${ts}.${raw}`).digest('hex');
      if (!config.orvo.secret || !same(sig, expected) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return send(res, 401, { ok: false });
      const ev = JSON.parse(raw);
      const sub = safeSub(ev.sub);
      if (ev.type === 'plan' && sub) await setPlan(sub, ev.plan, ev.until);
      return send(res, 200, { ok: true });
    }

    // ----- who am I -----
    if (path === '/api/me') {
      const u = await refreshPlan(await requireUser(req));
      return send(res, 200, publicMe(u, await usage(u.sub)));
    }

    // ----- cloud copy of the diary -----
    if (path === '/api/state' && method === 'GET') {
      const u = await requireUser(req);
      const r = await readJSON(statePath(u.sub));
      return send(res, 200, r ? r.value : { rev: 0, updatedAt: 0, state: null });
    }
    if (path === '/api/state' && method === 'PUT') {
      sameOrigin(req, base);
      const u = await requireUser(req);
      const body = await readJsonBody(req, config.maxState);
      if (!body.state || typeof body.state !== 'object') throw new AppError('Нет данных для сохранения.');
      const baseRev = Number(body.rev) || 0;
      const saved = await mutate(statePath(u.sub), s => {
        // Someone else saved first: hand back their copy so the device can merge.
        if ((s.rev || 0) !== baseRev) return { conflict: true, ...s };
        s.rev = (s.rev || 0) + 1;
        s.updatedAt = Number(body.updatedAt) || Date.now();
        s.state = body.state;
        return { rev: s.rev, updatedAt: s.updatedAt };
      }, { rev: 0, updatedAt: 0, state: null });
      return saved.conflict ? send(res, 409, { rev: saved.rev, updatedAt: saved.updatedAt, state: saved.state }) : send(res, 200, saved);
    }

    // ----- shared Gemini: same URL shape as Google's API, so the app only swaps the base -----
    const gm = path.match(/^\/api\/gemini\/v1beta\/models\/([\w.-]+):generateContent$/);
    if (gm && method === 'POST') {
      sameOrigin(req, base);
      const u = await requireUser(req);
      if (!config.gemini.key) throw new AppError('Общий ИИ ещё не подключён. Добавьте свой ключ Gemini в настройках.', 503);
      const limit = aiLimit(u), used = await usage(u.sub);
      if (used >= limit) {
        return send(res, 429, { error: { status: 'NORMA_LIMIT', message: `NORMA_LIMIT ${used}/${limit} ${planOf(u)}` } });
      }
      const model = config.gemini.models.includes(gm[1]) ? gm[1] : config.gemini.fallback;
      const raw = await readRaw(req, 4_400_000);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.key },
        body: raw, signal: AbortSignal.timeout(55000)
      });
      const text = await r.text();
      // Проблема с общим ключом — не вина человека, и про «ваш ключ» ему говорить нельзя.
      if (!r.ok && /API key not valid|API_KEY_INVALID|SERVICE_DISABLED|location is not supported|PERMISSION_DENIED/.test(text)) {
        console.error('gemini shared key', r.status, text.slice(0, 300));
        return send(res, 503, { error: { status: 'NORMA_AI_DOWN', message: 'Общий ИИ Нормы временно недоступен. Попробуйте позже или укажите свой ключ Gemini.' } });
      }
      let left = limit - used;
      // Only answers that worked count against the day.
      if (r.ok) {
        const n = await mutate(usagePath(u.sub), x => { if (x.day !== today()) { x.day = today(); x.used = 0; } x.used += 1; return x.used; }, { day: today(), used: 0 });
        left = Math.max(0, limit - n);
      }
      return send(res, r.status, text, { 'content-type': 'application/json; charset=utf-8', 'x-norma-ai-left': String(left), 'x-norma-ai-limit': String(limit) });
    }

    return send(res, 404, { error: 'Не найдено' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return send(res, status, { error: status >= 500 && !(e instanceof AppError) ? 'Ошибка сервера' : e.message });
  }
}
