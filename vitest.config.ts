/**
 * Config de test séparée : vitest embarque sa propre copie de vite, et
 * mélanger les deux dans un seul fichier fait diverger les types des
 * plugins. Les tests ne portent que sur le domaine pur — aucun JSX,
 * aucun plugin nécessaire.
 */
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
