import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  const apiTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/backend': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/backend/, ''),
        },
      },
    },
    test: { exclude: ['e2e/**', 'e2e-live/**', '**/node_modules/**', '**/dist/**'] },
  };
});
