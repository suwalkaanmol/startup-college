import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Reads VITE_* variables from the project root .env and then from this app's own .env (the app's wins).
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, '../..', 'VITE_'), ...loadEnv(mode, process.cwd(), 'VITE_') };
  return { base: './', plugins: [react()], define: Object.fromEntries(Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])) };
});
