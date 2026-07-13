import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
};

export type StaticFileHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

/**
 * Serves the built client bundle from `rootDir`. Returns a handler that
 * resolves to `true` when it produced a response, `false` when the request
 * should fall through to other handlers (non-GET/HEAD or unknown path).
 */
export function createStaticFileHandler(rootDir: string): StaticFileHandler {
  const root = path.resolve(rootDir);

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return false;
    }

    const requestPath = decodeRequestPath(req.url ?? '/');
    if (requestPath === null) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return true;
    }

    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return true;
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return false;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers: Record<string, string | number> = {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'Content-Length': fileStat.size,
      // Vite emits content-hashed filenames under assets/; everything else
      // (index.html, manifest JSON) must revalidate so new deploys show up.
      'Cache-Control': relativePath.startsWith('assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache'
    };

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
    stream.pipe(res);
    return true;
  };
}

function decodeRequestPath(url: string): string | null {
  const queryIndex = url.indexOf('?');
  const rawPath = queryIndex === -1 ? url : url.slice(0, queryIndex);
  try {
    const decoded = decodeURIComponent(rawPath);
    if (decoded.includes('\0')) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
