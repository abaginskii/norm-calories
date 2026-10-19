/**
 * Простой CORS-прокси к Gemini API для Cloudflare Workers.
 * Нужен, если Google блокирует Gemini в вашей стране.
 *
 * Как развернуть:
 * 1. dash.cloudflare.com → Workers & Pages → Create → Worker.
 * 2. Вставьте этот файл целиком, нажмите Deploy.
 * 3. Скопируйте адрес вида https://имя.ник.workers.dev (без /v1beta).
 * 4. В приложении: Профиль → AI-помощник → «Прокси» → вставьте адрес.
 *
 * Ключ по-прежнему передаётся из приложения в query-параметре key.
 */

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, 'https://generativelanguage.googleapis.com');

    const response = await fetch(target, {
      method: request.method,
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
      },
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    });

    const headers = new Headers(cors);
    headers.set('content-type', response.headers.get('content-type') || 'application/json');
    return new Response(response.body, { status: response.status, headers });
  },
};
