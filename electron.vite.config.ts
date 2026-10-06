import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // MSA_CLIENT_ID and friends from .env are inlined at build time (see src/main/env.d.ts).
    envPrefix: ['MAIN_VITE_', 'MSA_', 'SHARD_', 'MODRINTH_'],
    resolve: {
      alias: { '@shared': shared, '@main': resolve('src/main') }
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    resolve: {
      alias: { '@shared': shared }
    },
    build: {
      // The preload runs sandboxed and cannot require packages from node_modules,
      // so zod (used for input validation) must be bundled into it.
      externalizeDeps: false,
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@shared': shared, '@': resolve('src/renderer/src') }
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
