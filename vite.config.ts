import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// SPA: статика в dist/. Алиас @ → src (сохраняем импорты вида @/lib/api).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 3040 },
  // Полифилл modulepreload не нужен (один бандл, современные браузеры) — без него
  // в бандл не попадает лишний код, а CSP script-src остаётся строгим 'self'.
  build: { modulePreload: { polyfill: false } },
});
