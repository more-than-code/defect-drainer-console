import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    // 5173 collides with tutored/ttd-webapp on this machine (it binds [::1]:5173,
    // so both start and `localhost:5173` resolves to whichever the OS prefers).
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8788', changeOrigin: true },
      '/evidence': { target: 'http://127.0.0.1:8788', changeOrigin: true },
    },
  },
});
