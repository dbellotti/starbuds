import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@farsight/shared': fileURLToPath(new URL('../shared/src', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: 'esnext'
  }
});
