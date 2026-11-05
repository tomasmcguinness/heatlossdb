import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the network so a phone on the same Wi-Fi can open survey links.
    host: true,
    // Vite rejects unknown host names; allow this Mac's Bonjour name (e.g. Tomass-Mac-Studio.local).
    allowedHosts: ['.local'],
    port: 5179,
    strictPort: true,
    // The API (heatlossdb/Api) runs separately; serve it from the same origin.
    proxy: { '/api': 'http://localhost:5080' },
  },
})
