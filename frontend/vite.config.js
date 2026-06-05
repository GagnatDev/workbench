var _a;
/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
var apiProxyTarget = (_a = process.env.VITE_API_PROXY) !== null && _a !== void 0 ? _a : 'http://localhost:8080';
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
            includeAssets: ['favicon.ico', 'pwa-icon.svg', 'apple-touch-icon-180x180.png'],
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
                    { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'maskable-icon-512x512.png',
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
                navigateFallbackDenylist: [/^\/api\//],
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
            '/api': { target: apiProxyTarget, changeOrigin: true },
            '/auth': { target: apiProxyTarget, changeOrigin: true },
        },
    },
});
