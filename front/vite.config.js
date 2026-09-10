import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    /**
     * Installable, and able to open with no network (12.1).
     *
     * `registerType: 'prompt'` — not `autoUpdate`. This is a platform
     * where somebody may be halfway through a timed assessment, and a
     * service worker that swaps the app out from under them on the next
     * navigation is a lost attempt. The new version is announced and the
     * person decides when to take it (see `usePwaUpdate`).
     */
    VitePWA({
      registerType: 'prompt',
      /**
       * We write the service worker; workbox only injects the precache
       * manifest into it (`injectManifest`).
       *
       * Not a preference — `generateSW` **cannot build in this
       * repository**: it emits the worker by string-concatenating absolute
       * import paths inside single quotes, and this checkout lives in a
       * directory whose name contains an apostrophe (`qo'llanma`), which
       * closes the string and produces a syntactically broken worker. The
       * error surfaces as an unreadable parse failure inside
       * `write-sw-using-default-template`.
       *
       * It also happens to be the better shape for what comes next: the
       * offline queue in 12.3 needs a worker we control rather than one
       * assembled from configuration.
       */
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        /**
         * What is *not* precached, and why.
         *
         * `mediapipe` and `pdfjs` are tens of megabytes of face models and
         * a PDF renderer in `public/`. The four named chunks are the
         * document and spreadsheet viewers (pdf.js, pptx, exceljs,
         * mammoth) — together about 4 MB of the 6.8 MB build, all of them
         * lazily imported by one screen each.
         *
         * Precaching them would make installing the app a 6.8 MB download
         * before anybody opens anything, on phones that are frequently on
         * a metered connection — to make offline-viewable something the
         * offline features (12.2) do not cover anyway. They stay
         * network-loaded and are cached the first time they are used.
         */
        globIgnores: [
          '**/mediapipe/**',
          '**/pdfjs/**',
          '**/node_modules/**',
          '**/assets/pdf.worker.min-*.js',
          '**/assets/pdf-*.js',
          '**/assets/pptx-preview*.js',
          '**/assets/exceljs.min-*.js',
          '**/assets/mammoth.browser-*.js',
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      // Off in dev on purpose: a service worker caching a dev server is
      // an afternoon of debugging a stale bundle nobody can explain.
      devOptions: { enabled: false },
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-64.png'],
      manifest: {
        name: "Qo'llanma — korporativ o'quv platformasi",
        short_name: "Qo'llanma",
        description: "Kurslar, testlar, sertifikatlar va xodimlar o'quv jarayoni.",
        // The interface language of the deployment. A manifest carries one
        // language, so this is the majority language rather than a
        // per-user choice — the app itself still switches (uz/ru/en).
        lang: 'uz',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        // The brand blue (`--color-primary`), which is what colours the
        // status bar of an installed app.
        theme_color: '#007bff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // Maskable is a separate icon, not the same file relabelled:
          // Android crops it to whatever shape the launcher uses, so the
          // artwork has to sit inside the safe zone or the edges are cut.
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
