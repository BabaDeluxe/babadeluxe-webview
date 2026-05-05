import { fileURLToPath } from 'node:url'
import uno from 'unocss/vite'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
// Import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      uno(),
      vue(),
      vueDevTools(),
      // Visualizer({
      //   Filename: 'bundle-analysis.html',
      //   Open: true,
      // }),
    ],
    appType: 'spa',
    // './' for VS Code webview (vscode-webview:// scheme needs relative paths)
    // '/' for web deployments (absolute paths required for SPA routing)
    base: env.VITE_BASE_URL ?? '/',
    server: {
      host: '127.0.0.1', // Force IPv4
      port: 5100,
      strictPort: true, // Fail if port occupied instead of auto-incrementing
      cors: true,
    },
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
  }
})
