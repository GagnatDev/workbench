/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const apiProxyTarget = process.env.VITE_API_PROXY ?? 'http://localhost:8080'

export default defineConfig({
  // The whole stack shares one .env at the monorepo root (the backend loads it
  // too). Without this, Vite would only read frontend/.env and miss
  // VITE_DISABLE_AUTH, silently re-enabling the auth redirect in local dev.
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
        // Pre-migration this is equally safe: the backend's SPA fallback serves
        // index.html for /auth/callback, so the client-side callback still runs.
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
      // Only the API is proxied to the backend. The OAuth `/auth/callback` is
      // handled client-side (see src/auth/Callback.tsx): login is SPA-initiated,
      // so the callback must land in the SPA, not the backend client lib (which
      // expects a server-set state cookie it never wrote). The SPA talks to the
      // auth service directly for /authorize, /refresh and /logout.
      '/api': { target: apiProxyTarget, changeOrigin: true },
    },
  },
})
