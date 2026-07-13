const DEFAULT_PORT = '7777';
const DEFAULT_ORIGIN = `ws://localhost:${DEFAULT_PORT}`;

export function getServerUrl(): string {
  const rawOrigin = resolveOrigin();
  const envPathValue = import.meta.env.VITE_SERVER_PATH as unknown;
  const rawPath = typeof envPathValue === 'string' && envPathValue.trim().length > 0 ? envPathValue : '/';

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
  const envOriginValue = import.meta.env.VITE_SERVER_ORIGIN as unknown;
  if (typeof envOriginValue === 'string' && envOriginValue.trim().length > 0) {
    return envOriginValue.trim();
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
  const envPortValue = import.meta.env.VITE_SERVER_PORT as unknown;
  if (typeof envPortValue === 'string') {
    const trimmed = envPortValue.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
    // An explicitly-empty VITE_SERVER_PORT means "same origin as the page":
    // use the page's own port, which is blank on default 80/443.
    return typeof window !== 'undefined' && window.location.port ? window.location.port : null;
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
