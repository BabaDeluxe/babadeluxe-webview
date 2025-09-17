import { fileURLToPath } from 'node:url'
import uno from 'unocss/vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
// Import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    uno(),
    vue(),
    vueDevTools(),
    // Visualizer({
    //   Filename: 'bundle-analysis.html',
    //   Open: true,
    // }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.jpg', '**/*.jpeg', '**/*.png'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  base: './',
})
