import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const directory = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: resolve(directory, 'preview'),
  base: './',
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'copy-preview-public-assets',
      closeBundle() {
        const source = resolve(directory, 'public')
        const destination = resolve(directory, '../docs')
        for (const filename of [
          'favicon-32x32.png',
          'favicon.ico',
          'apple-touch-icon.png',
          'default-avatar.jpeg',
          'alipay-support.jpeg',
          'five-education-labor-guide.svg',
        ]) {
          copyFileSync(resolve(source, filename), resolve(destination, filename))
        }
      },
    },
  ],
  build: {
    outDir: resolve(directory, '../docs'),
    emptyOutDir: false,
  },
})
