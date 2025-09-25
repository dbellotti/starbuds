import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

function bundleBudgetPlugin(options: { entryLimit: number; chunkLimit: number }) {
  return {
    name: 'bundle-budget',
    apply: 'build' as const,
    generateBundle(_: unknown, bundle: Record<string, { type: string; isEntry?: boolean; code?: string; fileName: string }>) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || typeof output.code !== 'string') {
          continue;
        }
        const size = Buffer.byteLength(output.code, 'utf8');
        const limit = output.isEntry ? options.entryLimit : options.chunkLimit;
        if (size > limit) {
          const sizeKb = (size / 1024).toFixed(1);
          const limitKb = (limit / 1024).toFixed(1);
          throw new Error(`Bundle budget exceeded for ${output.fileName}: ${sizeKb}kb > ${limitKb}kb`);
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [bundleBudgetPlugin({ entryLimit: 950 * 1024, chunkLimit: 600 * 1024 })],
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
    target: 'esnext',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        styleguide: fileURLToPath(new URL('./styleguide.html', import.meta.url))
      }
    }
  }
});
