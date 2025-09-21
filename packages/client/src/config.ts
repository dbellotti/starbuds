const DEFAULT_ORIGIN = 'ws://localhost:7777';
const rawOrigin = import.meta.env.VITE_SERVER_ORIGIN ?? DEFAULT_ORIGIN;
const rawPath = import.meta.env.VITE_SERVER_PATH ?? '/';

export function getServerUrl(): string {
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

function normaliseOrigin(origin: string): string {
  if (/^wss?:\/\//i.test(origin) || /^https?:\/\//i.test(origin)) {
    return origin;
  }
  if (origin.startsWith('//')) {
    return `ws:${origin}`;
  }
  return origin.includes('://') ? origin : `ws://${origin}`;
}
