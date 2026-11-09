import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    outDir: mode === 'mobile' ? 'dist-mobile' : 'dist',
    rollupOptions: {
      input: mode === 'mobile' ? fileURLToPath(new URL('./index.html', import.meta.url)) : {
        arcana: fileURLToPath(new URL('./index.html', import.meta.url)),
        arcade: fileURLToPath(new URL('./arcade.html', import.meta.url)),
        models: fileURLToPath(new URL('./model-lab.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/three/')) return;
          if (id.includes('/build/three.core')) return 'three-core';
          if (id.includes('/examples/')) return 'three-tools';
          return 'three-renderer';
        },
      },
    },
  },
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../math_speed/functions/src', import.meta.url)),
      ],
    },
  },
}));
