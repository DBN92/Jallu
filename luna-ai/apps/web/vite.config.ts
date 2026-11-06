import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync } from 'node:fs';

/** Copia os arquivos WebAssembly do reconhecedor de gestos para public/mediapipe (dev e build). */
function mediapipeAssets() {
  return {
    name: 'luna-mediapipe-assets',
    buildStart() {
      const src = fileURLToPath(new URL('../../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url));
      if (existsSync(src)) cpSync(src, fileURLToPath(new URL('./public/mediapipe', import.meta.url)), { recursive: true });
    },
  };
}

const apiTarget = process.env.LUNA_API_URL ?? 'http://127.0.0.1:8787';

const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  define: { __LUNA_BUILD__: JSON.stringify(buildTime) },
  resolve: {
    alias: [
      { find: '@luna/shared/types', replacement: fileURLToPath(new URL('../../packages/shared/src/types/index.ts', import.meta.url)) },
      { find: '@luna/shared', replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
    ],
  },
  plugins: [
    mediapipeAssets(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'DIA',
        short_name: 'DIA',
        description: 'Sua assistente pessoal inteligente com voz e automação residencial',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any', // permite girar (Android deitado na parede/tablet)
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
        // O player de vídeo (hls.js) só é baixado quando uma câmera é aberta
        globIgnores: ['**/hls-*.js', 'mediapipe/**', 'models/**', '**/vision_bundle*.js', '**/gestures-*.js'],
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
