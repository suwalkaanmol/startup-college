import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// In development the API runs on :4000; /api is proxied so cookies stay same-origin.
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } } });
