import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server runs on 5173 and talks to the API at VITE_API_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
