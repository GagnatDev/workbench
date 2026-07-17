/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const apiProxyTarget = process.env.VITE_API_PROXY ?? 'http://localhost:8080'

export default defineConfig({
  // The whole stack shares one .env at the monorepo root (the backend loads it
  // too), so point Vite at the root instead of frontend/.env.
  envDir: path.resolve(__dirname, '..'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // All PWA discovery assets live under /static/, which the auth-proxy
      // sidecar serves without a session cookie — the OS fetches the manifest
      // and icons anonymously when installing to the Home Screen.
      includeAssets: [
        'static/favicon.ico',
        'static/pwa-icon.svg',
        'static/apple-touch-icon-180x180.png',
      ],
      manifestFilename: 'static/manifest.webmanifest',
      manifest: {
        name: 'Workbench',
        short_name: 'Workbench',
        description: 'En personlig kreativ arbeidsbenk for skapere — fang idéer, driv prosjekter, loggfør prosessen.',
        // Oatmeal — the matte base tone (docs/visual-identity.md).
        theme_color: '#F4F1EA',
        background_color: '#F4F1EA',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        lang: 'nb',
        icons: [
          { src: '/static/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/static/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/static/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/static/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell + self-hosted fonts so typography and UI work
        // fully offline (offline is the normal case in the workshop).
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        navigateFallback: 'index.html',
        // /auth/* must reach the network: the sidecar owns the OAuth callback
        // and logout, and a precached SPA response for /auth/callback?code=…
        // breaks login with OAuth state errors (see
        // unforked docs/auth-sidecar-migration.md → PWA pitfalls).
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    port: 3000,
    proxy: {
      // Proxy the API to the backend in local dev. Under the sidecar model the
      // SPA is auth-agnostic (no /authorize, /refresh, /logout, or callback
      // handling of its own — the auth-proxy owns all of that in the cluster), so
      // there's nothing auth-related to route here.
      '/api': { target: apiProxyTarget, changeOrigin: true },
    },
  },
})
