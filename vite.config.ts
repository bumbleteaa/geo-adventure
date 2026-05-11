import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        chunkSizeWarningLimit: 2000, // naikin limit warning-nya
    }
})