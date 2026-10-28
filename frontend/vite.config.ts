/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // MapLibre's worker is bundled as an ES module worker (see features/map/maplibreWorker.ts).
  worker: { format: 'es' },
  build: {
    // MapLibre alone is ~1.1 MB minified; it is split out and loaded lazily with the map.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep each group to its own packages (e.g. the calendar must not absorb React).
          includeDependenciesRecursively: false,
          groups: [
            { name: 'maplibre', test: /node_modules[\/]maplibre-gl[\/]/, priority: 40 },
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/, priority: 30 },
            {
              name: 'motion',
              test: /node_modules[\/](gsap|@gsap|motion|motion-dom|motion-utils|framer-motion|lenis|@number-flow|number-flow)[\/]/,
              priority: 30,
            },
            // Only needed once the driver opens the calendar.
            { name: 'calendar', test: /node_modules[\/]react-day-picker[\/]/, priority: 35 },
            { name: 'vendor', test: /node_modules[\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    // The Django API runs on :8000 in development; in production both share one origin.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
