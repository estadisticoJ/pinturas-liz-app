import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// base './' permite publicar en la raíz de un dominio o en una subcarpeta (GitHub Pages).
export default defineConfig({
  base: './',
  define: { __VERSION__: JSON.stringify(version) },
  plugins: [
    VitePWA({
      // La app se actualiza sola: main.js registra el service worker, revisa si hay versión nueva
      // cada vez que se vuelve a la app (y cada 30 minutos) y recarga la página al instalarla.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'logo.png'],
      manifest: {
        name: 'Pinturas Liz',
        short_name: 'Pinturas Liz',
        description: 'Pedidos, cobranzas, producción y almacén de Pinturas Liz',
        lang: 'es-PE',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F4F6FB',
        theme_color: '#0E3A8C',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Las fotos de productos no se descargan todas al instalar: se guardan al verlas por primera vez
        globPatterns: ['**/*.{js,css,html,svg}', '*.png'],
        runtimeCaching: [{
          urlPattern: /\/assets\/.*\.(webp|png|jpe?g)$/i,
          handler: 'CacheFirst',
          options: { cacheName: 'fotos-productos', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 } }
        }],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ]
});
