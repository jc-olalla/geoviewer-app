import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Adjust the hostname below to match your Render URL.
// You can include more hosts if you deploy to multiple domains.
const RENDER_HOST = 'geoviewer-app.onrender.com'

export default defineConfig({
  plugins: [react()],

  // Local dev (vite serve)
  server: {
    host: true,                                  // listen on 0.0.0.0
    port: Number(process.env.PORT) || 5173,      // useful if you ever run on a platform that sets PORT
  },

  // Production preview server (vite preview)
  preview: {
    host: true,                                  // listen on 0.0.0.0
    port: Number(process.env.PORT) || 4173,      // Render provides PORT; fall back locally
    allowedHosts: [RENDER_HOST],                 // allow your Render hostname
  },
})

