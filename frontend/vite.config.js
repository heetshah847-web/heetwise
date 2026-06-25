import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Frontend dev server runs on 5173 and talks to the API at VITE_API_URL.
// Tailwind v4 is wired via its official Vite plugin (no postcss/tailwind.config).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
