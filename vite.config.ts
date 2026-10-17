import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    // Generated HTML reports must not reload an open live dashboard.
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**', '**/dist/**'] },
    proxy: {
      '/api/v1': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      ...(process.env.DEMO_CONTROL_URL && process.env.DEMO_CONTROL_TOKEN
        ? {
            '/__demo': {
              target: process.env.DEMO_CONTROL_URL,
              rewrite: (path: string) => path.replace(/^\/__demo/, ''),
              headers: { Authorization: `Bearer ${process.env.DEMO_CONTROL_TOKEN}` },
            },
          }
        : {}),
    },
  },
  test: {
    env: { VITE_DATA_MODE: 'fixtures' },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
