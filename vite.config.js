import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' permite publicar en la raíz de un dominio o en una subcarpeta (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Pinturas Liz',
        short_name: 'Pinturas Liz',
        description: 'Pedidos, cobranzas, producción y almacén de Pinturas Liz',
        lang: 'es-PE',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F2F3F8',
        theme_color: '#1A1D38',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}']
      }
    })
  ]
});
