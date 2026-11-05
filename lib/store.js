// Key-value JSON storage: private Vercel Blob in production, a local folder in development.
import { get, put, del, list, BlobPreconditionFailedError } from '@vercel/blob';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const localDir = () => (!process.env.VERCEL ? process.env.DATA_DIR || 'data' : null);
export const storageReady = () => !!(localDir() || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

const valid = path => {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(path) || path.includes('..')) throw new AppError('Некорректный путь');
  return path;
};
const sha = data => createHash('sha256').update(data).digest('hex');

async function readRaw(path) {
  valid(path);
  if (!storageReady()) throw new AppError('Хранилище ещё не подключено.', 503);
  const dir = localDir();
  if (dir) {
    try { const data = await readFile(join(dir, path)); return { data, etag: sha(data) }; }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  const result = await get(path, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } });
  if (!result?.stream) return null;
  return { data: Buffer.from(await new Response(result.stream).arrayBuffer()), etag: result.blob.etag };
}

export async function readJSON(path) {
  const raw = await readRaw(path);
  return raw ? { value: JSON.parse(raw.data.toString()), etag: raw.etag } : null;
}

// options.etag: write only if unchanged; options.createOnly: write only if absent. Conflicts throw 409.
export async function writeJSON(path, value, options = {}) {
  valid(path);
  const bytes = Buffer.from(JSON.stringify(value));
  const dir = localDir();
  if (dir) {
    const old = await readRaw(path);
    if ((options.createOnly && old) || (options.etag && old?.etag !== options.etag)) throw new AppError('Конфликт изменений', 409);
    const target = join(dir, path);
    await mkdir(dirname(target), { recursive: true });
    const tmp = target + '.' + randomUUID();
    await writeFile(tmp, bytes, { mode: 0o600 });
    await rename(tmp, target);
    return;
  }
  try {
    await put(path, bytes, {
      access: 'private', addRandomSuffix: false, allowOverwrite: !options.createOnly,
      ifMatch: options.etag, contentType: 'application/json', cacheControlMaxAge: 60
    });
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError || /already exists/i.test(String(e))) throw new AppError('Конфликт изменений', 409);
    throw e;
  }
}

export async function remove(path) {
  valid(path);
  const dir = localDir();
  if (dir) { await unlink(join(dir, path)).catch(e => { if (e.code !== 'ENOENT') throw e; }); return; }
  await del(path).catch(() => {});
}

// Read-modify-write with optimistic locking.
export async function mutate(path, fn, fallback) {
  for (let i = 0; i < 5; i++) {
    const old = await readJSON(path);
    const value = old ? old.value : structuredClone(fallback);
    const result = fn(value);
    try {
      await writeJSON(path, value, old ? { etag: old.etag } : { createOnly: true });
      return result === undefined ? value : result;
    } catch (e) { if (e.status !== 409) throw e; }
  }
  throw new AppError('Данные изменились в другой вкладке. Повторите.', 409);
}

// Keys under a prefix (used by the daily reminder and /stats).
export async function listKeys(prefix) {
  const dir = localDir();
  if (dir) {
    const files = await readdir(join(dir, prefix)).catch(() => []);
    return files.filter(f => f.endsWith('.json')).map(f => prefix + f);
  }
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs.map(b => b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}
