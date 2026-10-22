import fs from 'node:fs/promises';
import path from 'node:path';
import { get, put } from '@vercel/blob';

/**
 * Tiny JSON store. On Vercel it uses Vercel Blob (connect a Blob store to the project);
 * on your own computer it falls back to a local .data/ folder. On Vercel without Blob it uses /tmp,
 * which works but is wiped whenever Vercel recycles the server, so connect Blob to keep your data.
 */

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
const access = () => (process.env.BLOB_ACCESS === 'public' ? 'public' : 'private') as 'public' | 'private';
const LOCAL_DIR = process.env.VERCEL ? '/tmp/.data' : path.join(process.cwd(), '.data');

export async function readJson<T>(name: string): Promise<T | null> {
  if (!useBlob()) {
    try {
      return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, name), 'utf8')) as T;
    } catch {
      return null;
    }
  }
  try {
    const res = await get(name, { access: access(), useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return JSON.parse(await new Response(res.stream).text()) as T;
  } catch {
    return null;
  }
}

export async function writeJson(name: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data);
  if (!useBlob()) {
    const file = path.join(LOCAL_DIR, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return;
  }
  await put(name, body, {
    access: access(),
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

export const storageKind = () => (useBlob() ? 'vercel-blob' : 'local');
