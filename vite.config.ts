/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves this repo from /the-data-app-v3/. Getting this wrong
// produces a blank page with 404s on every asset — see CLAUDE.md §2.
export default defineConfig({
  base: '/the-data-app-v3/',
  plugins: [react(), tailwindcss()],
  // Deliberately no manual chunking yet. Firebase and Recharts aren't imported
  // anywhere until Phases 2 and 4, so splitting them now would configure empty
  // chunks against a bundler API that has moved. Code splitting is a Phase 15
  // task, where it can actually be measured against the Lighthouse target.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
