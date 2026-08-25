import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: usamos nuestro propio SW (src/sw.ts) que incluye
      // el handler push para notificaciones nativas aunque la app esté cerrada.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      includeAssets: ['icono.png'],
      manifest: {
        name: 'SIMAC — Sistema de Ordenamiento de la Producción y Comercialización del Maíz en México',
        short_name: 'SIMAC',
        description: 'Sistema de Ordenamiento de la Producción y Comercialización del Maíz en México — Módulo Bodega',
        start_url: '/',
        display: 'standalone',
        background_color: '#1A5C38',
        theme_color: '#1A5C38',
        lang: 'es',
        icons: [
          { src: '/icono.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icono.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icono.png', sizes: '1024x1024', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true, port: Number(process.env.PORT) || 5174 },
})
