import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const base = process.env.PUBLIC_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budget - Suivi personnel',
        short_name: 'Budget',
        description: "Suivi du budget mensuel par enveloppes (Vie, Réinvestissement, Fond d'urgence, Divertissement)",
        theme_color: '#166534',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Précache l'app shell pour un chargement hors-ligne.
        // Les appels réseau vers Supabase ne sont volontairement PAS mis en cache
        // ici : la saisie hors-ligne passe par la file d'attente locale (IndexedDB),
        // pas par le cache HTTP.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
