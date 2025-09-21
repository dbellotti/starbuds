const DEFAULT_PORT = '7777';
const DEFAULT_ORIGIN = `ws://localhost:${DEFAULT_PORT}`;

export function getServerUrl(): string {
  const rawOrigin = resolveOrigin();
  const rawPath = import.meta.env.VITE_SERVER_PATH ?? '/';

  try {
    const url = new URL(rawPath, normaliseOrigin(rawOrigin));
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      url.protocol = 'ws:';
    }
    return url.toString();
  } catch (error) {
    console.warn('Invalid server origin/path, falling back to default', error);
    return DEFAULT_ORIGIN;
  }
}

function resolveOrigin(): string {
  const envOrigin = import.meta.env.VITE_SERVER_ORIGIN;
  if (typeof envOrigin === 'string' && envOrigin.trim().length > 0) {
    return envOrigin.trim();
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname || 'localhost';
    const port = resolvePort();
    return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
  }

  return DEFAULT_ORIGIN;
}

function resolvePort(): string | null {
  const envPort = import.meta.env.VITE_SERVER_PORT;
  if (typeof envPort === 'string' && envPort.trim().length > 0) {
    return envPort.trim();
  }
  return DEFAULT_PORT;
}

function normaliseOrigin(origin: string): string {
  if (/^wss?:\/\//i.test(origin) || /^https?:\/\//i.test(origin)) {
    return origin;
  }
  if (origin.startsWith('//')) {
    return `ws:${origin}`;
  }
  return origin.includes('://') ? origin : `ws://${origin}`;
}
