import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const apiTarget = process.env.LUNA_API_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@luna/shared/types', replacement: fileURLToPath(new URL('../../packages/shared/src/types/index.ts', import.meta.url)) },
      { find: '@luna/shared', replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
    ],
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Luna AI',
        short_name: 'Luna',
        description: 'Sua assistente pessoal inteligente com voz e automação residencial',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#07080c',
        theme_color: '#07080c',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        // Dados da API nunca são cacheados pelo service worker (privacidade e estado real)
        runtimeCaching: [],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  build: {
    // Limita arquivos abertos simultaneamente (sistemas com ulimit baixo, ex.: ZimaOS sob sudo)
    rollupOptions: { maxParallelFileOps: 32 },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    environment: 'jsdom',
  },
} as never);
