import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /mtg/; dev stays at the root.
  base: command === 'build' ? '/mtg/' : '/',
  plugins: [react()],
  server: { port: 5173 },
}));
